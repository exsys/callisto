import "dotenv/config";
import {
    ConfirmedTransactionMeta,
    Keypair,
    PublicKey,
    VersionedMessage,
    VersionedTransactionResponse,
} from "@solana/web3.js";
import { User } from "../models/user";
import { Wallet } from "../models/wallet";
import bs58 from 'bs58';
import crypto from 'crypto';
import {
    DEFAULT_ERROR,
    DEFAULT_ERROR_REPLY,
    ERROR_CODES
} from "../config/errors";
import {
    createAfterSwapUI,
    createDepositEmbed,
    createEmbedFromBlinkUrlAndAction
} from "./discord-ui";
import { Transaction } from "../models/transaction";
import {
    API_ERRORS_WEBHOOK,
    BLINK_DEFAULT_IMAGE,
    APP_ERRORS_WEBHOOK,
    FEE_TOKEN_ACCOUNT,
    LEVEL1_FEE_IN_PERCENT,
    LEVEL2_FEE_IN_PERCENT,
    LEVEL3_FEE_IN_PERCENT,
    REFCODE_MODAL_STRING,
    WRAPPED_SOL_ADDRESS,
    BLINK_ERRORS_WEBHOOK,
    MAX_WALLETS_PER_USER,
    URL_REGEX,
} from "../config/constants";
import { TxResponse } from "../types/txResponse";
import { UIResponse } from "../types/uiResponse";
import { DBError } from "../types/dbError";
import { Error } from "../models/errors";
import {
    ActionRow,
    APIEmbed,
    Embed,
    EmbedBuilder,
    InteractionEditReplyOptions,
    InteractionReplyOptions,
    MessageActionRowComponent,
    MessageCreateOptions
} from "discord.js";
import {
    buyCoinViaAPI,
    sellCoinViaAPI,
    getTransactionInfo,
    payRefFees,
    createNewWallet,
    executeBlinkTransaction,
    getCoinInfo,
    getBalanceOfWalletInDecimal,
    getCoinStatsFromWallet,
} from "./solanaweb3";
import { ActionUI } from "../models/actionui";
import { BlinkResponse } from "../types/blinkResponse";
import { BlinkCustomValue } from "../types/blinkCustomValue";
import {
    ActionGetResponse,
    ActionPostResponse,
    ActionRuleObject,
    ACTIONS_CORS_HEADERS,
    LinkedAction,
    NextActionLink,
} from "@solana/actions";
import { URLSearchParams } from "url";
import { get } from "https";
import { AppStats } from "../models/appstats";
import { Blink } from "../models/blink";
import { REQUIRED_SEARCH_PARAMS } from "../config/required_params_mapping";
import { TOKEN_ADDRESS_STRICT_LIST, TOKEN_STRICT_LIST } from "../config/token_strict_list";
import { CoinInfo } from "../types/coinInfo";
import { SWAP_BLINKS } from "../config/swap_blinks";
import { CoinStats } from "../types/coinStats";
import { BLINKS_BLACKLIST } from "../config/blinks_blacklist";
import { ActionRule } from "../types/actionRule";
import { ActionAndUrlResponse } from "../types/ActionAndUrlResponse";
import { UrlAndBlinkMsg } from "../types/UrlAndBlinkMsg";
import { createChainedActionBlinkButtons, createChainedActionConfirmationButton, createDepositButton, createStartButton } from "./ui-buttons";
import { EmbedFromUrlResponse } from "../types/EmbedFromUrlResponse";
import { ChainedAction } from "../models/chainedAction";
import { IChainedAction } from "../types/ChainedAction";

const ENCRYPTION_ALGORITHM: string = 'aes-256-cbc';
const REFCODE_CHARSET: string = 'a5W16LCbyxt2zmOdTgGveJ8co0uVkAMXZY74iQpBDrUwhFSRP9s3lKNInfHEjq';

export async function createWallet(user_id: string, ignore_ref_code: boolean = false): Promise<string | undefined> {
    // TODO: make it so if one db save fails, the other saves are reverted
    try {
        const allWalletsOfUser: any[] = await Wallet.find({ user_id }).lean();
        if (allWalletsOfUser.length >= MAX_WALLETS_PER_USER) return "max_limit_reached";

        const appStats: any = await AppStats.findOne({ stats_id: 1 });
        appStats.wallets_created++;

        const solanaWallet: Keypair = createNewWallet();
        const solanaPrivateKey: string = bs58.encode(solanaWallet.secretKey);
        const encryption = await encryptPKey(solanaPrivateKey);
        if (!encryption) return undefined;

        const user: any = await User.findOneAndUpdate(
            { user_id },
            { $inc: { wallets_created: 1 } },
            { new: true, upsert: true }
        ).lean();
        if (!user) return undefined;
        const walletCount: number = user.wallets_created;
        if (walletCount === 1) appStats.registered_users++;

        const newWallet: any = new Wallet({
            wallet_id: walletCount,
            user_id,
            wallet_name: `Wallet ${walletCount}`,
            is_default_wallet: walletCount === 1 || !allWalletsOfUser.length,
            wallet_address: solanaWallet.publicKey.toString(),
            swap_fee: user.swap_fee,
            encrypted_private_key: encryption.encryptedPrivateKey,
            iv: encryption?.iv,
        });

        await newWallet.save();
        await appStats.save();

        if (walletCount === 1 && !ignore_ref_code) {
            return REFCODE_MODAL_STRING;
        }

        return solanaWallet.publicKey.toString();
    } catch (error) {
        await postDiscordErrorWebhook("app", error, "createWallet: failed to create a new wallet.");
        return undefined;
    }
}

export async function createOrUseRefCodeForUser(userId: string): Promise<string | null> {
    let msgContent: string = "Your referral code is: ";
    try {
        const user: any = await User.findOne({ user_id: userId });
        if (!user) return null;
        if (user.ref_code) {
            msgContent += user.ref_code;
            return msgContent;
        }

        // this block will only be executed if user doesn't have a ref code already
        let refCode: string = createNewRefCode();
        let userWithRefCodeExistsAlready: any = await User.findOne({ ref_code: refCode }).lean();
        while (userWithRefCodeExistsAlready) {
            refCode = createNewRefCode();
            userWithRefCodeExistsAlready = await User.findOne({ ref_code: refCode }).lean();
        }

        user.ref_code = refCode;
        await user.save();
        msgContent += user.ref_code;
        return msgContent;
    } catch (error) {
        return null;
    }
}

export function createNewRefCode(): string {
    let result: string = "";
    for (let i = 0; i < 8; i++) {
        const randomIndex: number = Math.floor(Math.random() * REFCODE_CHARSET.length);
        result += REFCODE_CHARSET[randomIndex];
    }
    return result;
}

export function isNumber(str: string): boolean {
    const num: number = Number(str);
    return !isNaN(num);
}

// extract and validate CA from exact text line. check secondLine if present and CA does not exist on "line"
export function extractAndValidateCA(message: string, line: number, secondLine?: number): string | null {
    const lineWithCa: string = message.split("\n")[line - 1];
    const caParts: string[] = lineWithCa.split(" | ");
    let ca: string = caParts[caParts.length - 1];
    if (ca.includes("**")) ca = ca.replaceAll("**", ""); // remove bold formatting
    if (ca === "SOL") return "SOL";
    const tokenAddress: string | null = parseTokenAddress(ca);
    if (!tokenAddress && secondLine) {
        return extractAndValidateCA(message, secondLine);
    }
    return tokenAddress;
}

export function extractAmountFromMessage(message: string): string {
    const firstLine: string = message.split("\n")[0];
    const parts: string[] = firstLine.split(" | ");
    if (!parts.length) return "";

    if (parts[0].includes("SOL")) {
        // buy (return just the number)
        return parts[0].split(" ")[0];
    }

    // sell (includes % after number)
    return parts[0];
}

export function extractUserIdFromMessage(message: string): string {
    const firstLine: string = message.split("\n")[0];
    const userIdFormatted: string = firstLine.split(" ")[3];
    const recipientUserId: string | undefined = userIdFormatted.match(/\d+/)?.[0];
    if (!recipientUserId) return "";
    return recipientUserId;
}

export function extractBalanceFromMessage(message: string, line: number): number {
    const lineWithBal: string = message.split("\n")[line - 1];
    const balance: string = lineWithBal.split(" ")[1];
    return Number(balance);
}

export function formatNumber(num: string): string {
    const number: number = Number(num);
    if (number >= 1000000) {
        return (number / 1000000).toFixed(2).replace(/\.0$/, '') + 'M';
    } else if (number >= 1000) {
        return (number / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return number.toString();
}

export async function getKeypairFromEncryptedPKey(encryptedPKey: string, iv: string): Promise<Keypair | undefined> {
    const pkey: string | undefined = await decryptPKey(encryptedPKey, iv);
    if (!pkey) return undefined;
    return Keypair.fromSecretKey(bs58.decode(pkey));
}

export async function encryptPKey(pKey: string): Promise<{ encryptedPrivateKey: string, iv: string } | undefined> {
    try {
        const secretKey: string | undefined = process.env.ENCRYPTION_SECRET_KEY;
        if (!secretKey) throw new Error("Encryption key not found.");
        const iv: Buffer = crypto.randomBytes(16);
        const cipher: crypto.Cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, secretKey, iv);
        let encrypted: string = cipher.update(pKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return { encryptedPrivateKey: encrypted, iv: iv.toString('hex') };
    } catch (error) {
        await saveError({ function_name: "encryptPKey", error });
        return undefined;
    }
}

export async function decryptPKey(encryptedPKey: string, iv: string): Promise<string | undefined> {
    try {
        const secretKey: string | undefined = process.env.ENCRYPTION_SECRET_KEY;
        if (!secretKey) return undefined;
        const decipher: crypto.Cipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, secretKey, Buffer.from(iv, 'hex'));
        let decrypted = decipher.update(encryptedPKey, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        await saveError({ function_name: "decryptPKey", error });
        return undefined;
    }
}

export async function buyCoin(user_id: string, msgContent: string, buttonNumber: string): Promise<UIResponse> {
    try {
        const contractAddress: string | null = extractAndValidateCA(msgContent, 1, 4);
        if (!contractAddress) return { ui: { content: ERROR_CODES["0006"].message } };
        const response: TxResponse = await buyCoinViaAPI(user_id, contractAddress, `buy_button_${buttonNumber}`);
        await saveDbTransaction(response);
        return createAfterSwapUI(response);
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `buyCoin | User: ${user_id} | Message: ${msgContent} | Button: ${buttonNumber}`);
        return { ui: { content: ERROR_CODES["0000"].message } };
    }
}

export async function buyCoinX(user_id: string, msgContent: string, amount: string): Promise<UIResponse> {
    try {
        const contractAddress: string | null = extractAndValidateCA(msgContent, 1, 4);
        if (!contractAddress) return { ui: { content: ERROR_CODES["0006"].message } };
        const response: TxResponse = await buyCoinViaAPI(user_id, contractAddress, amount);
        await saveDbTransaction(response);
        return createAfterSwapUI(response);
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `buyCoinX | User: ${user_id} | Message: ${msgContent} | Amount: ${amount}`);
        return { ui: { content: ERROR_CODES["0000"].message } };
    }
}

export async function sellCoin(user_id: string, msgContent: string, buttonNumber: string): Promise<UIResponse> {
    try {
        const contractAddress: string | null = extractAndValidateCA(msgContent, 1);
        if (!contractAddress) return { ui: { content: ERROR_CODES["0006"].message } };
        const response: TxResponse = await sellCoinViaAPI(user_id, contractAddress, `sell_button_${buttonNumber}`);
        await saveDbTransaction(response);
        const storeFee = response.referral && (response.total_fee !== -1 ? true : false); // users who's swap fee is 0. this is so those swaps don't try to store unpaid ref fees in case such a user has used a ref code
        return createAfterSwapUI(response, storeFee);
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `sellCoin | User: ${user_id} | Message: ${msgContent} | Button: ${buttonNumber}`);
        return { ui: { content: ERROR_CODES["0000"].message } };
    }
}

export async function sellCoinX(user_id: string, msgContent: string, amountInPercent: string): Promise<UIResponse> {
    try {
        const contractAddress: string | null = extractAndValidateCA(msgContent, 1);
        if (!contractAddress) return { ui: { content: ERROR_CODES["0006"].message } };
        const response: TxResponse = await sellCoinViaAPI(user_id, contractAddress, amountInPercent);
        await saveDbTransaction(response);
        const storeFee = response.referral && (response.total_fee !== -1 ? true : false); // users who's swap fee is 0
        return createAfterSwapUI(response, storeFee);
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `sellCoinX | User: ${user_id} | Message: ${msgContent} | Amount (%): ${amountInPercent}`);
        return { ui: { content: ERROR_CODES["0000"].message } };
    }
}

export async function exportPrivateKeyOfUser(user_id: string): Promise<any | null> {
    try {
        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true });
        if (!wallet) return null;
        wallet.key_exported = true;
        await wallet.save();
        return wallet;
    } catch (error) {
        return null;
    }
}

export async function saveDbTransaction({
    user_id,
    wallet_address,
    destination_address,
    contract_address,
    tx_type,
    tx_signature,
    success,
    processing_time_function,
    processing_time_tx,
    token_amount,
    sell_amount,
    usd_volume,
    total_fee,
    callisto_fee,
    ref_fee,
    error,
}: TxResponse): Promise<boolean> {
    try {
        const dbTx = new Transaction({
            user_id,
            wallet_address,
            destination_address,
            contract_address,
            tx_type,
            tx_signature,
            success,
            processing_time_function,
            processing_time_tx,
            timestamp: Date.now(),
            token_amount,
            sell_amount,
            usd_volume,
            total_fee,
            callisto_fee,
            ref_fee,
            error: error,
        });

        await dbTx.save();
        return true;
    } catch (error) {
        return false;
    }
}

export async function saveError({ user_id, contract_address, wallet_address, function_name, error }: DBError): Promise<void> {
    try {
        const newError = new Error({
            user_id,
            contract_address,
            wallet_address,
            function_name,
            timestamp: Date.now(),
            error,
        });

        await newError.save();
    } catch (error) { }
}

export const wait = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

export async function saveReferralAndUpdateFees(userId: string, refCode: string): Promise<InteractionEditReplyOptions> {
    try {
        const user = await User.findOne({ user_id: userId });
        if (!user) return createStartButton(ERROR_CODES["0013"].message);
        const referrer = await User.findOne({ ref_code: refCode });
        if (!referrer) {
            // TODO: store error and submitted ref code in db
            return createStartButton(ERROR_CODES["0014"].message);
        }

        let refsWallet: string = "";
        const referrersDefaultWallet = await Wallet.findOne({ user_id: referrer.user_id, is_default_wallet: true }).lean();
        if (referrersDefaultWallet) refsWallet = referrersDefaultWallet.wallet_address;

        if (user.referral) return createStartButton("This user already used a referral code.");

        referrer.total_refs++;
        user.swap_fee = user.swap_fee * 0.9; // 10% reduction for first month if using a ref code
        user.referral = {
            code: refCode,
            promo_level: referrer.promo_level, // has to be set manually in the DB for each user
            referrer_user_id: referrer.user_id,
            referrer_wallet: refsWallet,
            number_of_referral: referrer.total_refs,
            fee_level: getCorrectRefFeeLevel(referrer.total_refs),
            timestamp: Date.now(),
        };

        await Wallet.updateMany({ user_id: userId }, { swap_fee: user.swap_fee });
        await user.save();
        await referrer.save();
        return createStartButton("Successfully used referral code. Your transaction fees are reduced by 10% for the next 30 days.\n\nUse the /start command to start trading.");
    } catch (error) {
        return createStartButton(ERROR_CODES["0000"].message);
    }
}

export function getCorrectRefFeeLevel(numberOfRef: number): number {
    if (numberOfRef >= 1 && numberOfRef <= 10) return 1;
    if (numberOfRef >= 11 && numberOfRef <= 99) return 2;
    if (numberOfRef >= 100) return 3;
    return 0;
}

export function getFeeInPercentFromFeeLevel(feeLevel: number): number {
    if (feeLevel === 1) return LEVEL1_FEE_IN_PERCENT;
    if (feeLevel === 2) return LEVEL2_FEE_IN_PERCENT;
    if (feeLevel === 3) return LEVEL3_FEE_IN_PERCENT;
    return 0;
}

export function successResponse(txResponse: TxResponse): TxResponse {
    return { ...txResponse };
}

export function errorResponse(txResponse: TxResponse): TxResponse {
    return { ...txResponse };
}

// this will only be called for sell transactions. so only checking for FEE_TOKEN_ACCOUNT for the balances is correct.
export async function storeUnpaidRefFee(txResponse: TxResponse): Promise<boolean> {
    const user_id: string = txResponse.user_id;
    if (!txResponse) return false;
    if (!txResponse.referral) {
        await saveError({
            user_id,
            function_name: "storeUnpaidRefFee",
            error: `txResponse.referral is undefined. Tx Response: ${txResponse}`
        });
        return false;
    }

    try {
        const tx: VersionedTransactionResponse | null = await getTransactionInfo(txResponse.tx_signature);
        if (!tx) {
            await saveError({
                user_id,
                function_name: "storeUnpaidRefFee",
                error: `Couldn't find corresponding transaction. Tx Response: ${txResponse}`
            });
            return false;
        }
        const txInfo: ConfirmedTransactionMeta | null = tx.meta;
        const txMsg: { message: VersionedMessage; signatures: string[]; } = tx.transaction;
        if (!txInfo) {
            await saveError({
                user_id,
                function_name: "storeUnpaidRefFee",
                error: `txInfo (tx.meta) is undefined. Tx Response: ${txResponse}`
            });
            return false;
        }

        // how much the user paid in fees. this is checking how much the calli fee wallet received from this tx
        const solPreBalance: number = txInfo.preBalances[txMsg.message.staticAccountKeys.findIndex((key: PublicKey) => key.toBase58() === FEE_TOKEN_ACCOUNT)];
        const solPostBalance: number = txInfo.postBalances[txMsg.message.staticAccountKeys.findIndex((key: PublicKey) => key.toBase58() === FEE_TOKEN_ACCOUNT)];
        const solReceivedInLamports: number = solPostBalance - solPreBalance;
        if (!solReceivedInLamports) {
            await saveError({
                user_id,
                function_name: "storeUnpaidRefFee",
                error: `unexpected value in solReceivedInLamports: ${solReceivedInLamports} | Pre Balance: ${solPreBalance} | Post Balance: ${solPostBalance} | Tx Info: ${txInfo} | Tx Msg: ${txMsg} | Tx Response: ${txResponse}`
            });
            return false;
        }
        const referrer: any = await User.findOne({ user_id: txResponse.referral?.referrer_user_id });
        if (!referrer) {
            await saveError({
                user_id,
                function_name: "storeUnpaidRefFee",
                error: `Couldn't find referrer. Tx Response: ${txResponse}`
            });
            return false;
        }

        /* if any user ever has 0 swap fee, a check for this has to be done, or else the referrer receives fees anyways
        const user: any = await User.findOne({ user_id: txResponse.user_id });
        if (!user) return false;
        if (user.swap_fee === 0) return false; */

        const refFeeInPercent: number = getFeeInPercentFromFeeLevel(txResponse.referral.fee_level);
        const refFeeInDecimal: number = refFeeInPercent / 100;
        const refFee = Math.floor(solReceivedInLamports * refFeeInDecimal);
        referrer.unclaimed_ref_fees += refFee;

        await referrer.save();
        return true;
    } catch (error) {
        await saveError({
            user_id,
            function_name: "storeUnpaidRefFee",
            error: `Tx Response: ${txResponse} | Error: ${error}`
        });
        return false;
    }
}

export async function claimUnpaidRefFees(userId: string): Promise<UIResponse> {
    let user: any;
    try {
        user = await User.findOne({ user_id: userId });
        if (!user) return { ui: { content: ERROR_CODES["0011"].message } };
    } catch (error) {
        return { ui: { content: ERROR_CODES["0000"].message } };
    }

    const payoutAmount: number = user.unclaimed_ref_fees; // in lamports
    if (payoutAmount < 3000000) {
        // 3000000 = 0.003 SOL. 
        // 0.002 SOL is needed for rent (first time transfering SOL to a wallet).
        // so only allow users with min 0.003 SOL to claim in case they don't have any SOL yet
        return { ui: { content: "You need to have at least 0.003 SOL accumulated to claim your fees." } };
    }
    const unclaimed_ref_fees: number = user.unclaimed_ref_fees;
    const claimed_ref_fees: number = user.claimed_ref_fees;
    const lastClaimTimestamp: number = user.last_fee_claim_timestamp || 0;
    user.claimed_ref_fees += user.unclaimed_ref_fees;
    user.unclaimed_ref_fees = 0;
    user.last_fee_claim_timestamp = Date.now();
    let userUpdated: any;
    try {
        userUpdated = await user.save();
    } catch (error) {
        return { ui: { content: ERROR_CODES["0000"].message } };
    }

    try {
        if (userUpdated) {
            const txResponse: TxResponse = await payRefFees(userId, payoutAmount);
            if (!txResponse.success) {
                user.unclaimed_ref_fees = unclaimed_ref_fees;
                user.claimed_ref_fees = claimed_ref_fees;
                user.last_fee_claim_timestamp = lastClaimTimestamp;
                await user.save();
            }
            await saveDbTransaction(txResponse);
            if (!txResponse.response) {
                return {
                    ui: { content: `Claim request received. Your fees will arrive soon.${txResponse.tx_signature ? ` Transaction ID: ${txResponse.tx_signature}` : ""}` },
                    transaction: txResponse,
                };
            }
            return {
                ui: { content: txResponse.response },
                transaction: txResponse,
            };
        }
        return { ui: { content: ERROR_CODES["0000"].message } };
    } catch (error) {
        await saveDbTransaction({ user_id: userId, tx_type: "transfer_ref_fee", error: error, success: false, token_amount: payoutAmount });
        // revert db changes on error
        if (userUpdated) {
            user.unclaimed_ref_fees = unclaimed_ref_fees;
            user.claimed_ref_fees = claimed_ref_fees;
            user.last_fee_claim_timestamp = lastClaimTimestamp;
            await user.save();
        }
        return { ui: { content: ERROR_CODES["0016"].message } };
    }
}

export async function postDiscordErrorWebhook(errorType: "app" | "api" | "blinks", error: any, extraInfo?: string): Promise<void> {
    try {
        let title: string;
        let author: string;
        let webhookUrl: string;
        switch (errorType) {
            case "app": {
                title = "Application error";
                author = "App error webhook";
                webhookUrl = APP_ERRORS_WEBHOOK;
                break;
            }
            case "api": {
                title = "API error";
                author = "API error webhook";
                webhookUrl = API_ERRORS_WEBHOOK;
                break;
            }
            case "blinks": {
                title = "Blinks error";
                author = "Blinks error webhook";
                webhookUrl = BLINK_ERRORS_WEBHOOK;
                break;
            }
            default: {
                title = "Unknown error";
                author = "Unknown error";
                webhookUrl = APP_ERRORS_WEBHOOK;
                break;
            }
        }

        const errorStack: string = truncateString(error?.stack, 4096) || "undefined";
        const errorName: string = truncateString(error?.name, 1024) || "undefined";
        const errorMsg: string = truncateString(error?.message, 1024) || "undefined";
        let extraInfoString: string | undefined = extraInfo;
        if (errorStack === "undefined" && errorName === "undefined" && errorMsg === "undefined") {
            extraInfoString += `\n\n${JSON.stringify(error)}`;
        }
        if (!extraInfoString) extraInfoString = "undefined";
        extraInfo = truncateString(extraInfoString, 1024);

        const embed: EmbedBuilder = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setTitle(title)
            .setAuthor({ name: author })
            .setDescription(`**Error Stack:**\n${errorStack}`)
            .setTimestamp()
            .addFields(
                { name: "Extra Info", value: extraInfoString },
                { name: "Error Name", value: errorName },
                { name: "Error Message", value: errorMsg },
            );
        const body: string = JSON.stringify({
            embeds: [embed],
        });
        await fetch(webhookUrl, {
            method: "POST",
            body: body,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.log(error); // NOTE: this log is needed, so in case the error isn't posted we can still check what went wrong.
    }
}

export function extractUrls(input: string): string[] | null {
    try {
        const matches: RegExpMatchArray | null = input.match(URL_REGEX);
        return matches ? matches : null;
    } catch (error) {
        return null;
    }
}

export async function extractUrlAndMessageFromBlink(content: string): Promise<UrlAndBlinkMsg | null> {
    try {
        const urlMatch: RegExpMatchArray | null = content.match(URL_REGEX);
        if (urlMatch) {
            const url: string = urlMatch[0];
            const message: string = content.split(url)[1].trim();
            return { url, message };
        } else {
            return null;
        }
    } catch (error) {
        await postDiscordErrorWebhook("blinks", error, "extractUrlAndMessageFromBlink")
        return null;
    }
}

export function truncateString(str: string | undefined, maxLength: number): string | undefined {
    if (str && str.length > maxLength) {
        return str.substring(0, maxLength - 3) + "...";
    }
    return str;
}

export function isPositiveNumber(numberToCheck: number | string): boolean {
    if (!isNumber(String(numberToCheck))) return false;
    return Number(numberToCheck) > 0;
}

// find the part of originalUrl which matches with pathPattern
export function replaceWildcards(originalUrl: string, apiPath: string, pathPattern: string): string | undefined {
    if (!apiPath.includes("https://")) {
        // means it's a relative url
        const url: URL = new URL(originalUrl);
        apiPath = `${url.origin}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`;
    }
    let escapedPattern: string = pathPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // replace * with a regex group that matches a single segment and are not part of a double star "**"
    escapedPattern = escapedPattern.replace(/(?<!\*)\*(?!\*)/g, '([^/]+)');
    // replace ** with a regex group that matches multiple segments
    escapedPattern = escapedPattern.replace(/\*\*/g, '(.*)');
    const regex: RegExp = new RegExp(escapedPattern);
    const match: RegExpMatchArray | null = originalUrl.match(regex);
    if (!match) return undefined;

    let endResult: string = apiPath;
    let totalSegmentsToReplace: number = match.length - 1;
    let matchIndex: number = 1; // start from 1 because match[0] is the full match
    endResult = endResult.replace(/\*/g, () => {
        if (matchIndex > totalSegmentsToReplace) return "";
        return match[matchIndex++];
    });
    endResult = endResult.replace(/\*\*/g, () => {
        if (matchIndex > totalSegmentsToReplace) return "";
        return match[matchIndex++];
    });
    return endResult;
}

// processes_values will only be defined when user presses a button where custom values have to be submitted
// NOTE: button_id starts with 1
export async function executeBlink(
    user_id: string, action_id: string, button_id: string, processed_values?: BlinkCustomValue[]
): Promise<BlinkResponse> {
    try {
        let [user, wallet, actionAndUrl] = await Promise.all([
            User.findOne({ user_id }).lean(),
            Wallet.findOne({ user_id, is_default_wallet: true }).lean(),
            getActionAndActionRootUrl({ action_id })
        ]);
        if (!user) {
            const walletAddress: string | undefined = await createWallet(user_id, true);
            if (!walletAddress) {
                // NOTE: should only happen if database connection is down
                return defaultBlinkError("No wallet found. Please create a wallet with the /start command first.");
            }
            const ui: InteractionReplyOptions = await createDepositEmbed(
                user_id,
                "You don't have enough SOL to execute this Blink. Load up your wallet to use Blinks."
            );
            return { response_type: "error", reply_object: ui };
        }
        if (!wallet) {
            return defaultBlinkError(ERROR_CODES["0003"].message);
        }
        if (!actionAndUrl) {
            return defaultBlinkError("Error while fetching Blink data. Please try again later.");
        }

        const linkedActions: LinkedAction[] | undefined = actionAndUrl.action.links?.actions;
        let actionButton: LinkedAction | undefined = linkedActions?.find((linkedAction: LinkedAction, index: number) => {
            return index + 1 === Number(button_id);
        });
        if (!actionButton) {
            await postDiscordErrorWebhook(
                "blinks",
                undefined,
                `Failed to find Action Button on Blink. ActionGetResponse: ${JSON.stringify(actionAndUrl.action)}`
            );
            return defaultBlinkError();
        }

        // if button has custom values and user didn't submit those values yet
        if (actionButton.parameters?.length && !processed_values?.length) {
            return {
                response_type: "custom_input_required",
                action_id,
                button_id,
                action: actionAndUrl.action,
                reply_object: {
                    content: "placeholder"
                }
            };
        }

        const actionUI: any = await ActionUI.findOne({ action_id }).lean();
        if (!actionUI) {
            await postDiscordErrorWebhook("blinks", undefined, `Action UI disappeared from DB. Action id: ${action_id}`);
            return defaultBlinkError("The Blink magically disappeared. Please contact support for more information.");
        }
        const solBalanceInDecimal: number | undefined = await getBalanceOfWalletInDecimal(wallet.wallet_address);
        if (solBalanceInDecimal === 0) {
            const depositButton = createDepositButton();
            return {
                response_type: "error",
                reply_object: {
                    content: "Not enough SOL to execute this Blink.",
                    components: [depositButton],
                },
            };
        }

        let url: string | undefined;
        let actionValue: string | undefined; // how much of SOL or SPL token is needed for the tx
        if (actionButton.parameters?.length && processed_values?.length) {
            // if button has custom values and user submitted them
            const actionUrlAndValue: ActionUrlAndValue = await processCustomInputValues(
                actionButton,
                actionAndUrl.action_root_url,
                processed_values
            );
            if (actionUrlAndValue.error) return defaultBlinkError(actionUrlAndValue.error);
            url = actionUrlAndValue.url;
            actionValue = actionUrlAndValue.value;
        } else {
            if (actionButton.href.includes("https://")) {
                url = actionButton.href;
            } else {
                url = actionAndUrl.action_root_url + actionButton.href;
            }
            // NOTE: only applicable to jupiter, also if jupiter decides to change url schema this has to be adjusted too
            actionValue = url?.split("/")[7];
        }

        if (!url) {
            await postDiscordErrorWebhook(
                "blinks",
                undefined,
                `executeBlink util.ts | Action: ${action_id} | Button: ${button_id} | User: ${user_id} | Wallet: ${wallet.wallet_address}`
            );
            return defaultBlinkError("Couldn't process Blink URL. Please contact support for more information.");
        }
        // store the swap amount in case of a swap so the callisto fee's can be properly deducted
        let swapAmount: number | undefined;
        let baseToken: string | undefined;

        // TODO: do SOL balance check on all transactions where SOL is needed (not just gas fee)

        // TODO: current problem with adding swap fee to jupiter swap blinks: no way to add fee's to token sells
        // through sellViaAPI, which uses feeAccount, but that's not available in blinks
        const rootUrl: string = new URL(actionUI.posted_url).origin;
        if (SWAP_BLINKS.includes(rootUrl) && actionValue) {
            // TODO: check if there's another way to find out whether the blink is a swap
            // TODO: replace amount in url with swapAmountAfterFees
            // TODO: create instruction to send swap fee
            // TODO: store ref fee

            try {
                // TODO: überlegen wie es für tokens gemacht werden muss (es muss ja tortzdem zB 100% geselled werden)
                // example for url.split("/"): [ 'https:', '', 'worker.jup.ag', 'blinks', 'swap', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'So11111111111111111111111111111111111111112', '0.5' ]
                swapAmount = Number(actionValue);
                baseToken = url.split("/")[5];
                /*const swapFee: number = swapAmount * (wallet.swap_fee / 100);
                const swapAmountAfterFees: number = swapAmount - swapFee;
                const urlSplit = url.split("/");
                urlSplit[7] = String(swapAmountAfterFees);
                url = urlSplit.join();*/

                // check if wallet has enough balance to execute this blink action
                if (baseToken === WRAPPED_SOL_ADDRESS) {
                    // case of SOL
                    if (solBalanceInDecimal && solBalanceInDecimal < swapAmount) {
                        const depositButton = createDepositButton();
                        return {
                            response_type: "error",
                            reply_object: {
                                content: "Insufficient SOL balance.",
                                components: [depositButton],
                            },
                        };
                    }
                } else {
                    // case of SPL token
                    if (baseToken) {
                        const coinStats: CoinStats | null = await getCoinStatsFromWallet(wallet.wallet_address, baseToken);
                        if (coinStats?.tokenAmount && coinStats.tokenAmount.uiAmount && coinStats.tokenAmount.uiAmount < swapAmount) {
                            return defaultBlinkError(`Not enough ${coinStats.symbol} to execute this Blink.`);
                        }
                    }
                }
            } catch (error) {
                // NOTE: let user execute blink even if there was an error in this try-catch block.
                // they are lucky and have to pay no swap fee's if this error block is executed
                await postDiscordErrorWebhook("blinks", error, "executeBlink if(SWAP_BLINKS_MAPPING.includes(actionUI.root_url) && actionValue)");
            }
        }

        // TODO: retry few times if fetch fails
        const blinkTx: ActionPostResponse = await (
            await fetch(url, {
                method: "POST",
                headers: ACTIONS_CORS_HEADERS,
                body: JSON.stringify({
                    account: wallet.wallet_address
                }),
            })
        ).json();

        if (blinkTx.transaction) {
            const result: TxResponse = await executeBlinkTransaction(wallet, blinkTx);
            await saveDbTransaction(result);

            // handle chained action links
            if (blinkTx.links) {
                const actionRootUrl: string = new URL(url).origin;
                const nextAction: NextActionLink = blinkTx.links.next;
                // NOTE: this also handles the next action type check, and UI creation
                return await storeNextActionInChain(
                    user_id,
                    wallet.wallet_address,
                    nextAction,
                    action_id,
                    actionRootUrl,
                    actionUI.posted_url,
                    result.response
                );
            }

            // result.response is solscan link + blink message (if present)
            return {
                response_type: "success",
                reply_object: {
                    content: result.response,
                },
            };
        } else {
            return defaultBlinkError(`Blink provider returned an error: ${blinkTx.message}`);
        }
    } catch (error) {
        if (error instanceof SyntaxError) {
            return defaultBlinkError("Blink returned unexpected values. Transaction cancelled.");
        } else {
            await postDiscordErrorWebhook("blinks", error, `executeBlink util.ts | User: ${user_id}`);
            return defaultBlinkError();
        }
    }
}

export async function executeChainedAction(
    user_id: string, action_id: string, chain_id: string, button_id: string, processed_values?: BlinkCustomValue[]
): Promise<BlinkResponse> {
    try {
        let [user, wallet, chainedAction] = await Promise.all([
            User.findOne({ user_id }).lean(),
            Wallet.findOne({ user_id, is_default_wallet: true }).lean(),
            ChainedAction.findOne({ user_id, action_id, chain_id }),
        ]);
        if (!user || !wallet || !chainedAction) return defaultBlinkError(DEFAULT_ERROR);

        const solBalanceInDecimal: number | undefined = await getBalanceOfWalletInDecimal(wallet.wallet_address);
        if (solBalanceInDecimal === 0) {
            const depositButton = createDepositButton();
            return {
                response_type: "error",
                reply_object: {
                    content: "Not enough SOL to execute this Blink.",
                    components: [depositButton],
                },
            };
        }

        const actionRootUrlObj = await getActionAndActionRootUrl({ url: chainedAction.posted_url });
        if (!actionRootUrlObj) return defaultBlinkError(DEFAULT_ERROR);
        const actionRootUrl: string = actionRootUrlObj?.action_root_url;
        if (chainedAction.href) {
            // process: user confirmed to execute next PostNextActionLink of type "post" in chain (first time)
            // -> execute it -> response returns another action in chain -> store next action as post_action
            // -> ask user again for confirmation -> execute it here
            // so this means this block will only be executed if it's the 2nd+ PostNextActionLink of type "post" in a chain

            const nextBlinkTx: ActionPostResponse = await (
                await fetch(chainedAction.href, {
                    method: "POST",
                    headers: ACTIONS_CORS_HEADERS,
                    body: JSON.stringify({
                        account: wallet.wallet_address
                    }),
                })
            ).json();
            if (!nextBlinkTx.transaction) return defaultBlinkError("Blink Provider returned invalid data.");

            const result: TxResponse = await executeBlinkTransaction(wallet, nextBlinkTx);
            await saveDbTransaction(result);
            if (result.success) {
                await ChainedAction.deleteOne({ user_id, action_id, chain_id });

                if (nextBlinkTx.links) {
                    const nextAction: NextActionLink = nextBlinkTx.links.next;
                    // NOTE: this also handles the next action type check, and UI creation
                    return await storeNextActionInChain(
                        user_id,
                        wallet.wallet_address,
                        nextAction,
                        action_id,
                        actionRootUrl,
                        chainedAction.posted_url,
                        result.response
                    );
                }
            }

            // result.response is solscan link + blink message (if present)
            return {
                response_type: result.success ? "success" : "error",
                reply_object: {
                    content: result.response,
                },
            };
        }

        // NOTE: from here on out it can only be inline chained actions

        const linkedActions: LinkedAction[] | undefined = chainedAction.links?.actions as LinkedAction[];
        let actionButton: LinkedAction | undefined = linkedActions?.find((linkedAction: LinkedAction, index: number) => {
            return index + 1 === Number(button_id);
        });
        if (!actionButton) {
            await postDiscordErrorWebhook(
                "blinks",
                undefined,
                `Failed to find Action Button on Chained Action | User: ${user_id} | Wallet: ${wallet.wallet_address} | Chained Action: ${JSON.stringify(chainedAction)}`
            );
            return defaultBlinkError();
        }

        // if button has custom values and user didn't submit those values yet
        if (actionButton.parameters?.length && !processed_values?.length) {
            return {
                response_type: "custom_input_required",
                action_id,
                button_id,
                chained_action: chainedAction as IChainedAction,
                reply_object: {
                    content: "placeholder",
                },
            };
        }

        let url: string | undefined;
        if (actionButton.parameters?.length && processed_values?.length) {
            // this block means it was a button with custom inputs, and user submitted those
            const actionAndUrl: ActionAndUrlResponse | null = await getActionAndActionRootUrl({ action_id });
            if (!actionAndUrl) return defaultBlinkError();
            const actionUrlAndValue: ActionUrlAndValue = await processCustomInputValues(
                actionButton,
                actionAndUrl.action_root_url,
                processed_values
            );
            if (actionUrlAndValue.error) return defaultBlinkError(actionUrlAndValue.error);
            url = actionUrlAndValue.url;
        } else {
            // this block means it was a button with a fixed value
            if (actionButton.href.includes("https://")) {
                url = actionButton.href;
            } else {
                const actionAndUrl: ActionAndUrlResponse | null = await getActionAndActionRootUrl({ action_id });
                if (!actionAndUrl) return defaultBlinkError();
                url = actionAndUrl.action_root_url + actionButton.href;
            }
        }

        if (!url) {
            await postDiscordErrorWebhook(
                "blinks",
                undefined,
                `executeBlink util.ts | Action: ${action_id} | Button: ${button_id} | User: ${user_id} | Wallet: ${wallet.wallet_address}`
            );
            return defaultBlinkError("Couldn't process Blink URL. Please contact support for more information.");
        }

        // TODO: retry if response has error
        const blinkTx: ActionPostResponse = await (
            await fetch(url, {
                method: "POST",
                headers: ACTIONS_CORS_HEADERS,
                body: JSON.stringify({
                    account: wallet.wallet_address
                }),
            })
        ).json();

        if (blinkTx.transaction) {
            const result: TxResponse = await executeBlinkTransaction(wallet, blinkTx);
            await saveDbTransaction(result);

            if (result.success) {
                await ChainedAction.deleteOne({ user_id, action_id, chain_id });
                // handle chained action links
                if (blinkTx.links) {
                    const nextAction: NextActionLink = blinkTx.links.next;
                    // NOTE: this also handles the next action type check, and UI creation
                    return await storeNextActionInChain(
                        user_id,
                        wallet.wallet_address,
                        nextAction,
                        action_id,
                        actionRootUrl,
                        chainedAction.posted_url,
                        result.response
                    );
                }
            }

            // result.response is solscan link + blink message (if present)
            return {
                response_type: result.success ? "success" : "error",
                reply_object: {
                    content: result.response,
                },
            };
        } else {
            return defaultBlinkError(`Blink provider returned an error: ${blinkTx.message}`);
        }
    } catch (error) {
        if (error instanceof SyntaxError) {
            return defaultBlinkError("Blink returned unexpected values. Transaction cancelled.");
        } else {
            await postDiscordErrorWebhook(
                "blinks",
                error,
                `executeChainedAction util.ts | User: ${user_id} | Action: ${action_id} | Chain: ${chain_id} | Button: ${button_id} | Values?: ${JSON.stringify(processed_values)}`
            );
            return defaultBlinkError();
        }
    }
}

export async function storeNextActionInChain(
    user_id: string,
    wallet_address: string,
    nextAction: NextActionLink,
    action_id: string,
    rootUrl: string,
    posted_url: string,
    response?: string,
): Promise<BlinkResponse> {
    try {
        const actionId: string = action_id.includes(".") ? action_id.split(".")[0] : action_id;
        const chain_id: string = action_id.includes(".") ? action_id.split(".")[1] + 1 : "1";

        if (nextAction.type === "post") {
            const nextUrl: string = nextAction.href.includes("https://") ? nextAction.href : rootUrl + nextAction.href;
            const nextUrlObj: URL = new URL(nextUrl);
            if (rootUrl !== nextUrlObj.origin) {
                return {
                    response_type: "error",
                    reply_object: {
                        content: "Blink Provider returned an invalid root URL for the next Action."
                    },
                }
            }
            const newChainedAction = new ChainedAction({
                user_id,
                action_id: actionId,
                chain_id,
                wallet_address: wallet_address,
                posted_url: posted_url,
                href: nextUrl,
            });
            await newChainedAction.save();

            const confirmationButton = createChainedActionConfirmationButton(actionId, chain_id);
            return {
                response_type: "chained_action",
                reply_object: {
                    content: `${response}\n\nThere is another Action chained to this Blink with no further information. Do you want to execute it?`,
                    components: [confirmationButton],
                },
            }
        }

        if (nextAction.type === "inline") {
            // show next action in chain
            const embedAndAttachment: EmbedFromUrlResponse | null = await createEmbedFromBlinkUrlAndAction(
                posted_url,
                nextAction.action
            );

            if (embedAndAttachment) {
                const newChainedAction = new ChainedAction({
                    user_id,
                    action_id: actionId,
                    chain_id,
                    wallet_address: wallet_address,
                    posted_url: posted_url,
                    links: "links" in nextAction.action ? nextAction.action.links : undefined
                });
                await newChainedAction.save();

                if (nextAction.action.type === "action") {
                    // add buttons and show new embed
                    const buttons = await createChainedActionBlinkButtons(actionId, chain_id, user_id, nextAction.action);
                    return {
                        response_type: "chained_action",
                        reply_object: {
                            content: `${response}\n\nNext Action in chain:`,
                            components: buttons,
                            embeds: [embedAndAttachment.embed],
                            files: embedAndAttachment.attachment
                        },
                    }
                }

                if (nextAction.action.type === "completed") {
                    // don't add buttons, only show final action in chain (embed)
                    return {
                        response_type: "chained_action",
                        reply_object: {
                            content: response,
                            embeds: [embedAndAttachment.embed],
                            files: embedAndAttachment.attachment
                        },
                    }
                }
            }
        }

        return { response_type: "error", reply_object: DEFAULT_ERROR_REPLY };
    } catch (error) {
        await postDiscordErrorWebhook(
            "blinks",
            error,
            `storeNextActionInChain | User: ${user_id} | Wallet: ${wallet_address} | NextAction: ${JSON.stringify(nextAction)} | Action: ${action_id} | Root URL: ${rootUrl} | Posted URL: ${posted_url}`
        );
        return { response_type: "error", reply_object: DEFAULT_ERROR_REPLY };
    }
}

type ActionUrlAndValue = {
    url?: string, // not defined if error 
    value?: string, // not defined if error 
    error?: string,
}
export async function processCustomInputValues(
    actionButton: LinkedAction,
    rootUrl: string,
    processed_values: BlinkCustomValue[]
): Promise<ActionUrlAndValue> {
    try {
        let url: string | undefined;
        let actionValue: string | undefined; // how much of SOL or SPL token is needed for the tx
        let actionLink: URL;
        if (actionButton.href.includes("https://")) {
            actionLink = new URL(actionButton.href);
        } else {
            actionLink = new URL(rootUrl + actionButton.href);
        }

        const searchParams: URLSearchParams = actionLink.searchParams;
        if (searchParams.toString()) {
            // this block is executed if the action url is in this format: /swap?amount={amount}
            let index: number = 0;
            for (const [key, value] of searchParams) {
                const correspondingValue: BlinkCustomValue | undefined = processed_values.find((orderedValue: BlinkCustomValue) => {
                    return orderedValue.index === index;
                });
                if (!correspondingValue) return { error: "Failed to process Blink. Please try again later." };
                searchParams.set(key, correspondingValue.value);
                actionValue = correspondingValue.value;
                index++;
            }

            url = actionLink.href;
        } else {
            // this block is executed if the action url is in this format: /swap/{amount}
            if (!actionButton.parameters?.length) return { error: "Failed to process Blink. Please try again later." };
            const parameterNames: string[] = actionButton.parameters.map((param: any) => param.name);
            parameterNames.forEach((paramName: string, index: number) => {
                const correspondingValue: BlinkCustomValue | undefined = processed_values.find((value: BlinkCustomValue) => {
                    return value.index === index;
                });
                if (!correspondingValue) return { error: "Failed to process Blink. Please try again later." };
                actionValue = correspondingValue.value;
                const regex: RegExp = new RegExp(`{${paramName}}`, 'g');
                actionButton.href = actionButton.href.replace(regex, correspondingValue.value);
            });

            if (actionButton.href.includes("https://")) {
                url = actionButton.href;
            } else {
                url = rootUrl + actionButton.href;
            }
        }

        return { url, value: actionValue! };
    } catch (error) {
        await postDiscordErrorWebhook(
            "blinks",
            error,
            `processCustomInputValues | Button: ${actionButton} | Root URL: ${rootUrl} | Processed Values: ${processed_values}`
        );
        return { error: "Failed to process Blink. Please try again later." };
    }
}

export function defaultBlinkError(content?: string): BlinkResponse {
    return {
        response_type: "error",
        reply_object: {
            content: content ? content : DEFAULT_ERROR,
        }
    }
}

export async function urlToBuffer(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const data: Uint8Array[] = [];
        get(url, (res: any) => {
            res
                .on("data", (chunk: Uint8Array) => {
                    data.push(chunk);
                })
                .on("end", () => {
                    resolve(Buffer.concat(data));
                })
                .on("error", (error: any) => {
                    reject(error);
                });
        });
    });
}

export function changeBlinkEmbedModal(
    embed: Embed | undefined, components: ActionRow<MessageActionRowComponent>[] | undefined, lineToChange: number, newValue: string
): MessageCreateOptions {
    if (!embed) return DEFAULT_ERROR_REPLY;
    if (!components) return DEFAULT_ERROR_REPLY;

    let embedDescription: string | undefined = embed?.data.description;
    const lines: string[] | undefined = embedDescription?.split("\n");
    if (!lines) return DEFAULT_ERROR_REPLY;

    lines[lineToChange] = lines[lineToChange].split(": ")[0] + ": " + newValue;
    const joinedLines = lines.join("\n");
    const changedEmbed: EmbedBuilder = copyDiscordEmbed(embed.data, joinedLines);

    return { embeds: [changedEmbed], components: components };
}

export function copyDiscordEmbed(embed: Readonly<APIEmbed>, newDescription: string): EmbedBuilder {
    const copiedEmbed: EmbedBuilder = new EmbedBuilder()
        .setColor(0x4F01EB)
        .setURL(embed.url ? embed.url : null)
        .setTitle(embed.title ? embed.title : null)
        .setDescription(newDescription)
        .setTimestamp()
        .setAuthor(embed.author ? embed.author : null)
        .setThumbnail(embed.thumbnail ? embed.thumbnail.url : null);

    return copiedEmbed;
}

export async function validateCustomBlinkValues(embedDescription: string, correspondingLinkedAction: LinkedAction): Promise<string> {
    try {
        // TODO: currently this is checking if parameter.name is the same as the placeholder value, but there might be a case
        // where such a value is legit. change it so there will never be problems
        if (!correspondingLinkedAction.parameters) return DEFAULT_ERROR;

        // find the corresponding placeholder (parameter.name) of each button parameter and check if the value has been changed
        const unchangedValues: string[] = [];
        const lines: string[] = embedDescription.split("\n");
        lines.forEach((line: string) => {
            const lineSplit: string[] = line.split(": ");
            const label: string = lineSplit[0].replaceAll("**", "");
            const value: string = lineSplit[1];
            const isRequired: boolean = label[label.length - 1] === "*";

            const correspondingParam: any = correspondingLinkedAction.parameters!.find((param: any) => label.includes(param.label));
            if (!correspondingParam) return;
            if (value === correspondingParam.name && isRequired) unchangedValues.push(correspondingParam.label);
        });

        let response = "";
        unchangedValues.forEach((value: string) => {
            response += `"${value}" is required.\n`;
        });
        return response;
    } catch (error) {
        return DEFAULT_ERROR;
    }
}

export async function convertDescriptionToOrderedValues(
    embedDescription: string,
    correspondingLinkedAction: LinkedAction
): Promise<BlinkCustomValue[] | undefined> {
    try {
        if (!correspondingLinkedAction.parameters) return;
        const orderedValues: BlinkCustomValue[] = [];
        const lines: string[] = embedDescription.split("\n");
        lines.forEach((line: string, index: number) => {
            const inputName: string = line.split(": ")[0].replaceAll("**", "");
            const isRequired: boolean = inputName[inputName.length - 1] === "*";
            const value: string = line.split(": ")[1].replaceAll(" ", "_");
            if (!isRequired) {
                const correspondingParam: any = correspondingLinkedAction.parameters!.find((param: any) => inputName.includes(param.label));
                if (!correspondingParam) return;
                if (correspondingParam.name === value) {
                    orderedValues.push({ index, value: "" });
                    return;
                }
            }
            orderedValues.push({ index, value });
        });

        return orderedValues;
    } catch (error) {
        await postDiscordErrorWebhook(
            "blinks",
            error,
            `convertDescriptionToOrderedValues | Embed: ${JSON.stringify(embedDescription)} | LinkedActions: ${JSON.stringify(correspondingLinkedAction)}`
        );
        return undefined;
    }
}

// return type is typeof Blink (db model)
// TODO: create proper ts type for Blink and also return error message instead of null
export async function createNewBlink(user_id: string, blink_type: string, token_address?: string): Promise<any | null> {
    try {
        const appStats: any = await AppStats.findOne({ stats_id: 1 });
        if (!appStats) return null;
        const user: any = await User.findOne({ user_id });
        if (user) {
            user.blinks_created++;
            appStats.blinks_created++;
            try {
                await user.save();
            } catch (error) { }
        }

        const newBlink: any = new Blink({
            user_id,
            blink_id: appStats.blinks_created,
            blink_type,
            icon: BLINK_DEFAULT_IMAGE,
            required_parameters: REQUIRED_SEARCH_PARAMS[blink_type as keyof typeof REQUIRED_SEARCH_PARAMS],
            token_address,
        });

        let tokenSymbol: string | undefined;
        if (token_address) {
            // check if it's in strict list, if not check dexscreener for symbol. use token address if dexscreener fails
            tokenSymbol = TOKEN_ADDRESS_STRICT_LIST[token_address as keyof typeof TOKEN_ADDRESS_STRICT_LIST];
            if (!tokenSymbol) {
                const coinInfo: CoinInfo | null = await getCoinInfo(token_address!);
                if (coinInfo) tokenSymbol = coinInfo.symbol;
            }
            if (!tokenSymbol) tokenSymbol = token_address;
        } else {
            tokenSymbol = "SOL";
        }

        if (blink_type === "blinkDonation") {
            const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
            if (!wallet) return null;
            newBlink.wallet_address = wallet.wallet_address;
            newBlink.label = `Tip ${tokenSymbol}`;
            newBlink.title = `Tip ${tokenSymbol}`;
            newBlink.description = `Tip ${tokenSymbol}`;
            newBlink.links = {
                actions: [
                    { href: `/blinks/${newBlink.blink_id}?amount=0.1`, label: `Tip 0.1 ${tokenSymbol}`, embed_field_value: "Amount: 0.1", token_amount: 0.1 },
                    { href: `/blinks/${newBlink.blink_id}?amount=0.5`, label: `Tip 0.5 ${tokenSymbol}`, embed_field_value: "Amount: 0.5", token_amount: 0.5 },
                    { href: `/blinks/${newBlink.blink_id}?amount=1`, label: `Tip 1 ${tokenSymbol}`, embed_field_value: "Amount: 1", token_amount: 1 },
                    {
                        href: `/blinks/${newBlink.blink_id}?amount={amount}`, label: "Custom amount", embed_field_value: "Amount: custom", parameters: [
                            { name: "amount", label: "Tip custom amount", required: true },
                        ]
                    },
                ]
            }
        }

        if (blink_type === "blinkTokenSwap") {
            newBlink.label = `Buy ${tokenSymbol}`;
            newBlink.title = `Buy ${tokenSymbol}`;
            newBlink.description = `Buy ${tokenSymbol}`;
            newBlink.links = {
                actions: [
                    { href: `/blinks/${newBlink.blink_id}?amount=0.1`, label: "Buy 0.1 SOL", embed_field_value: "Amount: 0.1", token_amount: 0.1 },
                    { href: `/blinks/${newBlink.blink_id}?amount=0.5`, label: "Buy 0.5 SOL", embed_field_value: "Amount: 0.5", token_amount: 0.5 },
                    { href: `/blinks/${newBlink.blink_id}?amount=1`, label: "Buy 1 SOL", embed_field_value: "Amount: 1", token_amount: 1 },
                    {
                        href: `/blinks/${newBlink.blink_id}?amount={amount}`, label: "Buy custom amount", embed_field_value: "Amount: custom", parameters: [
                            { name: "amount", label: "Buy custom amount", required: true },
                        ]
                    },
                ]
            }
        }

        await newBlink.save();
        await appStats.save();
        return newBlink;
    } catch (error) {
        await saveError({
            function_name: "createNewBlink util.ts",
            error,
        });
        return null;
    }
}

export async function checkIfUrlReturnsImage(url: string): Promise<boolean> {
    return new Promise((resolve) => {
        const img: HTMLImageElement = new Image();

        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);

        // Start loading the image
        img.src = url;
    });
}

export async function getImageFormat(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const contentType = response.headers.get('Content-Type');
        if (contentType) {
            // NOTE: Content-Type might include additional information like charset
            return contentType.split('/').pop() || null;
        }
        return null;
    } catch (error) {
        return null;
    }
}

export async function checkImageAndFormat(url: string): Promise<string | null> {
    try {
        const response: Response = await fetch(url);
        // Check if the response is an image
        const contentType: string | null = response.headers.get('Content-Type');
        if (contentType && contentType.startsWith('image/')) {
            // Extract the image format from Content-Type if any
            return contentType.split('/').pop() || null;
        }

        return null; // Either it's not an image or content type is not available
    } catch (error) {
        return null;
    }
}

export function parseTokenAddress(tokenOrTokenAddress: string | null): string | null {
    if (!tokenOrTokenAddress) return null;
    // check if user has entered a valid token symbol
    const parsedAddress: string | undefined = TOKEN_STRICT_LIST[tokenOrTokenAddress.toUpperCase() as keyof typeof TOKEN_STRICT_LIST];
    if (parsedAddress) return parsedAddress;

    try {
        const tokenPublicKey: PublicKey = new PublicKey(tokenOrTokenAddress);
        return tokenPublicKey.toBase58();
    } catch (error) {
        return null;
    }
}

// url is the posted url
export async function getActionAndActionRootUrl({ action_id, url }: { action_id?: string, url?: string }
): Promise<ActionAndUrlResponse | null> {
    try {
        if (action_id && url) return null; // only one can be used for this function
        let urlObj: URL | undefined;
        let action_root_url: string;

        // NOTE: we have to store the action ui because else we don't have access to the posted blink url when a user presses a button

        if (action_id) {
            // if action_id defined it means this action ui is already stored in the DB
            const actionUi: any = await ActionUI.findOne({ action_id }).lean();
            if (!actionUi) return null;
            urlObj = new URL(actionUi.posted_url);
        }
        if (url) {
            // meaning it's not stored in the DB
            urlObj = new URL(url);
        }
        if (!urlObj) return null;
        let postedUrl: string = urlObj.href;
        if (postedUrl.endsWith("/")) postedUrl = postedUrl.slice(0, -1);

        if (urlObj.protocol !== "https:") return null;
        const isBlinkUrl: boolean = urlObj.href.includes("?action=solana-action:");

        let action: ActionGetResponse | null = null;
        if (isBlinkUrl) {
            // this block is executed if url has the "/?action=solana-action:" schema
            const reqUrl: string = urlObj.href.split("solana-action:")[1];
            const actionRootUrl: URL = new URL(reqUrl);
            action = await (
                await fetch(reqUrl, {
                    headers: ACTIONS_CORS_HEADERS,
                })
            ).json();

            action_root_url = actionRootUrl.origin;
        } else {
            // this block is executed if root url has an actions.json file
            const rootUrl: string | undefined = urlObj.origin;
            if (rootUrl === postedUrl) return null; // TODO: find out whether blink urls exist that have their blinks on root level
            if (!rootUrl) return null;
            const actionRule: ActionRule | any = await (
                await fetch(`${rootUrl}/actions.json`, {
                    headers: ACTIONS_CORS_HEADERS,
                })
            ).json();
            if (!actionRule) return null;

            let actionUrl: string | undefined;
            const actionRules: ActionRuleObject[] | undefined = actionRule?.rules;
            if (!actionRules) return null;
            let actionRuleObj: ActionRuleObject | undefined;
            for (const rule of actionRules) {
                if (actionUrl) break; // skip rest once we find a match
                if (postedUrl.endsWith(rule.pathPattern)) {
                    // try to find exact matches first
                    actionUrl = postedUrl.replace(rule.pathPattern, rule.apiPath);
                }
                if (!actionUrl) {
                    // afterwards try to replace wildcards "*" and "**"
                    actionUrl = replaceWildcards(postedUrl, rule.apiPath, rule.pathPattern);
                }
            }

            if (!actionUrl) {
                // NOTE: this will always be executed on urls that are not actual blinks, but have an actions.json file
                // for example because other parts of the websites have blinks. 
                // so we are not posting to the error webhook here because there will be too many false positives.
                return null;
            }
            action = await (
                await fetch(actionUrl, {
                    headers: ACTIONS_CORS_HEADERS,
                })
            ).json();

            let actionRootUrl: URL;
            if (actionRuleObj?.apiPath.includes("https://")) {
                // absolute api path urls
                actionRootUrl = new URL(actionRuleObj.apiPath);
            } else {
                // relative api path urls
                actionRootUrl = new URL(actionUrl);
            }
            action_root_url = actionRootUrl.origin;
        }

        if (!action) return null;
        return { action, action_root_url };
    } catch (error: any) {
        if (!(error instanceof SyntaxError) && error.message != "fetch failed") {
            await postDiscordErrorWebhook("blinks", error, `getActionAndActionRootUrl | action_id?: ${action_id} | url?: ${url}`);
        }
        return null;
    }
}

export function checkIfBlacklisted(urlObj: URL, isActionsSchema: boolean): boolean {
    try {
        if (isActionsSchema) {
            const reqUrl: string = urlObj.href.split("solana-action:")[1];
            const actionRootUrl: URL = new URL(reqUrl);
            return BLINKS_BLACKLIST.includes(actionRootUrl.origin);
        } else {
            const rootUrl: string | undefined = urlObj.origin;
            return BLINKS_BLACKLIST.includes(rootUrl);
        }
    } catch (error) {
        return false;
    }
}

export async function extractRootUrlFromBlink(urlObj: URL, isActionsSchema: boolean): Promise<string | null> {
    try {
        if (isActionsSchema) {
            const reqUrl: string = urlObj.href.split("solana-action:")[1];
            const actionRootUrl: URL = new URL(reqUrl);
            return actionRootUrl.origin
        } else {
            return urlObj.origin;
        }
    } catch (error) {
        await postDiscordErrorWebhook("app", error, "extractRootUrl");
        return null;
    }
}