import "dotenv/config";
import {
    ConfirmedTransactionMeta,
    Keypair,
    PublicKey,
    VersionedMessage,
    VersionedTransactionResponse
} from "@solana/web3.js";
import { User } from "../models/user";
import { Wallet } from "../models/wallet";
import bs58 from 'bs58';
import crypto from 'crypto';
import { DEFAULT_ERROR, DEFAULT_ERROR_REPLY, ERROR_CODES } from "../config/errors";
import { addStartButton, createAfterSwapUI } from "./discord-ui";
import { Transaction } from "../models/transaction";
import {
    BLINK_DEFAULT_IMAGE,
    ERRORS_WEBHOOK,
    FEE_TOKEN_ACCOUNT,
    LEVEL1_FEE_IN_PERCENT,
    LEVEL2_FEE_IN_PERCENT,
    LEVEL3_FEE_IN_PERCENT,
    REFCODE_MODAL_STRING
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
    checkIfValidAddress,
    buyCoinViaAPI,
    sellCoinViaAPI,
    getTransactionInfo,
    payRefFees,
    createNewWallet,
    executeBlinkTransaction
} from "./solanaweb3";
import { ActionUI } from "../models/actionui";
import { BlinkResponse } from "../types/blinkResponse";
import { BlinkCustomValue } from "../types/blinkCustomValue";
import { ActionPostResponse, ACTIONS_CORS_HEADERS } from "@solana/actions";
import { URLSearchParams } from "url";
import { get } from "https";
import { AppStats } from "../models/appstats";
import { Blink } from "../models/blink";
import { REQUIRED_SEARCH_PARAMS } from "../config/required_params_mapping";

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const REFCODE_CHARSET = 'a5W16LCbyxt2zmOdTgGveJ8co0uVkAMXZY74iQpBDrUwhFSRP9s3lKNInfHEjq';

export async function createWallet(userId: string): Promise<string | undefined> {
    // TODO: make it so if one db save fails, the other saves are reverted

    const solanaWallet: Keypair = createNewWallet();
    const solanaPrivateKey: string = bs58.encode(solanaWallet.secretKey);
    const encryption = await encryptPKey(solanaPrivateKey);
    if (!encryption) return undefined;

    try {
        const allWallets: any[] = await Wallet.find({ user_id: userId }).lean();
        const user: any = await User.findOneAndUpdate(
            { user_id: userId },
            { $inc: { wallets_created: 1 } },
            { new: true, upsert: true }
        ).lean();
        if (!user) return undefined;
        const walletCount: number = user.wallets_created;

        const newWallet: any = new Wallet({
            wallet_id: walletCount,
            user_id: userId,
            wallet_name: `Wallet ${walletCount}`,
            is_default_wallet: walletCount === 1 || !allWallets.length,
            wallet_address: solanaWallet.publicKey.toString(),
            swap_fee: user.swap_fee,
            encrypted_private_key: encryption.encryptedPrivateKey,
            iv: encryption?.iv,
        });

        await newWallet.save();

        if (walletCount === 1) {
            return REFCODE_MODAL_STRING;
        }

        return solanaWallet.publicKey.toString();
    } catch (error) {
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

export function extractCAFromMessage(message: string, line: number): string | null {
    const firstLine: string = message.split("\n")[line];
    const parts: string[] = firstLine.split(" | ");
    return parts[parts.length - 1];
}

export async function extractAndValidateCA(message: string, line?: number): Promise<string> {
    if (line) {
        const lineWithCa: string = message.split("\n")[line - 1];
        const caParts: string[] = lineWithCa.split(" | ");
        const ca: string = caParts[caParts.length - 1];
        if (ca === "SOL") return "SOL";
        const isValidAddress: boolean = await checkIfValidAddress(ca);
        if (!isValidAddress) return "";
        return ca;
    }
    const firstLine: string = message.split("\n")[0];
    const parts: string[] = firstLine.split(" | ");
    if (!parts.length) return "";

    const ca: string = parts[parts.length - 1];
    const isValidAddress: boolean = await checkIfValidAddress(ca);
    if (!isValidAddress) {
        // check if the address is in the 4th line (the case when user buys coin through the sell & manage UI)
        const fourthLine: string = message.split("\n")[3];
        const parts: string[] = fourthLine.split(" | ");
        if (!parts.length) return "";
        const ca2: string = parts[parts.length - 1];
        const isValidAddress2: boolean = await checkIfValidAddress(ca2);
        if (!isValidAddress2) return "";
        return ca2;
    }

    return ca;
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

export async function buyCoin(userId: string, msgContent: string, buttonNumber: string): Promise<UIResponse> {
    const contractAddress: string = await extractAndValidateCA(msgContent);
    if (!contractAddress) return { ui: { content: ERROR_CODES["0006"].message } };
    try {
        const response: TxResponse = await buyCoinViaAPI(userId, contractAddress, `buy_button_${buttonNumber}`);
        await saveDbTransaction(response);
        return createAfterSwapUI(response);
    } catch (error) {
        await saveDbTransaction({ user_id: userId, tx_type: "swap_buy", error });
        return { ui: { content: ERROR_CODES["0000"].message } };
    }
}

export async function buyCoinX(userId: string, msgContent: string, amount: string): Promise<UIResponse> {
    const contractAddress: string = await extractAndValidateCA(msgContent);
    if (!contractAddress) return { ui: { content: ERROR_CODES["0006"].message } };
    try {
        const response: TxResponse = await buyCoinViaAPI(userId, contractAddress, amount);
        await saveDbTransaction(response);
        return createAfterSwapUI(response);
    } catch (error) {
        await saveDbTransaction({ user_id: userId, tx_type: "swap_buy", error });
        return { ui: { content: ERROR_CODES["0000"].message } };
    }
}

export async function sellCoin(userId: string, msgContent: string, buttonNumber: string): Promise<UIResponse> {
    const contractAddress: string = await extractAndValidateCA(msgContent);
    if (!contractAddress) return { ui: { content: ERROR_CODES["0006"].message } };
    try {
        const response: TxResponse = await sellCoinViaAPI(userId, contractAddress, `sell_button_${buttonNumber}`);
        await saveDbTransaction(response);
        const storeFee = response.referral && (response.total_fee !== -1 ? true : false); // users who's swap fee is 0. this is so those swaps don't try to store unpaid ref fees in case such a user has used a ref code
        return createAfterSwapUI(response, storeFee);
    } catch (error) {
        await saveDbTransaction({ user_id: userId, tx_type: "swap_sell", error });
        return { ui: { content: ERROR_CODES["0000"].message } };
    }
}

export async function sellCoinX(userId: string, msgContent: string, amountInPercent: string): Promise<UIResponse> {
    const contractAddress: string = await extractAndValidateCA(msgContent);
    if (!contractAddress) return { ui: { content: ERROR_CODES["0006"].message } };
    try {
        const response: TxResponse = await sellCoinViaAPI(userId, contractAddress, amountInPercent);
        await saveDbTransaction(response);
        const storeFee = response.referral && (response.total_fee !== -1 ? true : false); // users who's swap fee is 0
        return createAfterSwapUI(response, storeFee);
    } catch (error) {
        await saveDbTransaction({ user_id: userId, tx_type: "swap_sell", error });
        return { ui: { content: ERROR_CODES["0000"].message } };
    }
}

export async function exportPrivateKeyOfUser(userId: string): Promise<any | null> {
    try {
        const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
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
        if (!user) return addStartButton(ERROR_CODES["0013"].message);
        const referrer = await User.findOne({ ref_code: refCode });
        if (!referrer) {
            // TODO: store error and submitted ref code in db
            return addStartButton(ERROR_CODES["0014"].message);
        }

        let refsWallet: string = "";
        const referrersDefaultWallet = await Wallet.findOne({ user_id: referrer.user_id, is_default_wallet: true }).lean();
        if (referrersDefaultWallet) refsWallet = referrersDefaultWallet.wallet_address;

        if (user.referral) return addStartButton("This user already used a referral code.");

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
        return addStartButton("Successfully used referral code. Your transaction fees are reduced by 10% for the next 30 days.\n\nUse the /start command to start trading.");
    } catch (error) {
        return addStartButton(ERROR_CODES["0000"].message);
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

export async function postDbErrorWebhook(error: any): Promise<void> {
    const embed: any = {
        title: "Database error",
        timestamp: new Date().toISOString(),
        color: 0x4F01EB,
        fields: [
            {
                name: "Error name",
                value: error.name || "undefined",
            },
            {
                name: "Message",
                value: error.message || "undefined",
            },
            {
                name: "Stack",
                value: error.stack || "undefined",
            },
        ],
    };
    const body: string = JSON.stringify({
        embeds: [embed],
    });
    await fetch(ERRORS_WEBHOOK, {
        method: "POST",
        body: body,
        headers: { "Content-Type": "application/json" },
    });
}

export function isPositiveNumber(numberToCheck: number | string): boolean {
    if (!isNumber(String(numberToCheck))) return false;
    return Number(numberToCheck) > 0;
}

// find the part of originalUrl which matches with pathPattern
export function replaceWildcards(originalUrl: string, apiPath: string, pathPattern: string): string | undefined {
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
export async function executeBlink(
    user_id: string, action_id: string, button_id: string, processed_values?: BlinkCustomValue[]
): Promise<BlinkResponse> {
    let wallet: any;
    let user: any;
    try {
        wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return { content: ERROR_CODES["0003"].message };
        user = await User.findOne({ user_id });
        if (!user) {
            const walletAddress: string | undefined = await createWallet(user_id);
            if (!walletAddress) {
                return { content: "No wallet found. Please create a wallet with the /start command first." };
            }
            return { content: `You have no SOL balance. Load up your wallet to use Blinks.\n\nYour wallet address: ${walletAddress}` };
        }
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }

    try {
        const actionUI: any = await ActionUI.findOne({ action_id }).lean();
        if (!actionUI) return { content: "The Blink magically disappeared. Please contact support for more information." };

        const button: any = actionUI.buttons.find((button: any) => Number(button.button_id) === Number(button_id));
        if (!button) {
            await saveError({
                user_id,
                wallet_address: wallet.wallet_address,
                function_name: "sendBlinkPostReq",
                error: `Couldn't find action button. ActionUI: ${JSON.stringify(actionUI)}`
            });
            return DEFAULT_ERROR_REPLY;
        }

        // if button has custom values and user didn't submit those values yet
        if (button.parameters?.length && !processed_values?.length) {
            return { custom_values: true, action_id, button_id, params: button.parameters };
        }

        // if button has custom values and user submitted them
        let url: string | undefined;
        if (button.parameters?.length && processed_values?.length) {
            try {
                let actionLink: URL;
                if (button.href.includes("https://")) {
                    actionLink = new URL(button.href);
                } else {
                    actionLink = new URL(actionUI.action_root_url + button.href);
                }

                const searchParams: URLSearchParams = actionLink.searchParams;
                if (searchParams.toString()) {
                    // this block is executed if the action url is in this format: /swap?amount=amount
                    let index: number = 0;
                    for (const [key, value] of searchParams) {
                        const correspondingValue: BlinkCustomValue | undefined = processed_values.find((orderedValue: BlinkCustomValue) => {
                            return orderedValue.index === index;
                        });
                        if (!correspondingValue) return { content: "Failed to process Blink. Please try again later." };
                        searchParams.set(key, correspondingValue.value);
                        index++;
                    }

                    url = actionLink.href;
                } else {
                    // this block is executed if the action url is in this format: /swap/{amount}
                    const parameterNames: string[] = button.parameters.map((param: any) => param.name);
                    parameterNames.forEach((paramName: string, index: number) => {
                        const correspondingValue: BlinkCustomValue | undefined = processed_values.find((value: BlinkCustomValue) => {
                            return value.index === index;
                        });
                        if (!correspondingValue) return { content: "Failed to process Blink. Please try again later." };
                        const regex: RegExp = new RegExp(`{${paramName}}`, 'g');
                        button.href = button.href.replace(regex, correspondingValue.value);
                    });

                    if (button.href.includes("https://")) {
                        url = button.href;
                    } else {
                        url = actionUI.action_root_url + button.href;
                    }
                }
            } catch (error) {
                await saveError({
                    user_id,
                    wallet_address: wallet.wallet_address,
                    function_name: "executeBlink",
                    error: `Error in blink id ${action_id}, button id ${button_id}: ${error}`,
                });
                return { content: "Failed to process Blink. Please try again later." };
            }
        } else {
            if (button.href.includes("https://")) {
                url = button.href;
            } else {
                url = actionUI.action_root_url + button.href;
            }
        }

        if (!url) return { content: "Couldn't process Blink URL. Please contact support for more information." };

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
            const result: TxResponse = await executeBlinkTransaction(wallet, blinkTx, actionUI.root_url);
            await saveDbTransaction(result);
            return { content: result.response };
        } else {
            // TODO: proper error handling
            return { content: `Blink provider returned an error: ${blinkTx.message}` };
        }
    } catch (error) {
        if (error instanceof SyntaxError) {
            return { content: "Blink returned unexpected values. Transaction cancelled." };
        } else {
            await saveError({
                user_id,
                wallet_address: wallet.wallet_address,
                function_name: "executeBlink",
                error,
            });
            return DEFAULT_ERROR_REPLY;
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

export async function validateCustomBlinkValues(embedDescription: string, actionUI: any, correspondingButton: any): Promise<string> {
    try {
        // TODO: currently this is checking if parameter.name is the same as the placeholder value, but there might be a case
        // where such a value is legit. change it so there will never be problems

        // find the corresponding placeholder (parameter.name) of each button parameter and check if the value has been changed
        const unchangedValues: string[] = [];
        const lines: string[] = embedDescription.split("\n");
        lines.forEach((line: string) => {
            const lineSplit: string[] = line.split(": ");
            const label: string = lineSplit[0].replaceAll("**", "");
            const value: string = lineSplit[1];
            const isRequired: boolean = label[label.length - 1] === "*";

            const correspondingParam: any = correspondingButton.parameters.find((param: any) => label.includes(param.label));
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

export function convertDescriptionToOrderedValues(embedDescription: string, actionUI: any, correspondingButton: any): BlinkCustomValue[] {
    const orderedValues: BlinkCustomValue[] = [];
    const lines: string[] = embedDescription.split("\n");
    lines.forEach((line: string, index: number) => {
        const inputName: string = line.split(": ")[0].replaceAll("**", "");
        const isRequired: boolean = inputName[inputName.length - 1] === "*";
        const value: string = line.split(": ")[1].replaceAll(" ", "_");
        if (!isRequired) {
            const correspondingParam: any = correspondingButton.parameters.find((param: any) => inputName.includes(param.label));
            if (!correspondingParam) return;
            if (correspondingParam.name === value) {
                orderedValues.push({ index, value: "" });
                return;
            }
        }
        orderedValues.push({ index, value });
    });

    return orderedValues;
}

export async function createNewBlink(user_id: string, blink_type: string, token_address?: string): Promise<any | null> {
    try {
        const stats: any = await AppStats.findOne({ stats_id: 1 });
        if (!stats) return null;
        const user: any = await User.findOne({ user_id });
        if (user) {
            user.blinks_created++;
            try {
                await user.save();
            } catch (error) { }
        }

        stats.blinks_created++;
        const newBlink: any = new Blink({
            user_id,
            blink_id: stats.blinks_created,
            blink_type,
            icon: BLINK_DEFAULT_IMAGE,
            required_parameters: REQUIRED_SEARCH_PARAMS[blink_type as keyof typeof REQUIRED_SEARCH_PARAMS],
            token_address,
        });

        if (blink_type === "blinkDonation") {
            newBlink.links = {
                actions: [
                    { href: `/blinks/${newBlink.blink_id}?token=SOL&amount=0.1`, label: "Tip 0.1 SOL", embed_field_value: "Amount: 0.1", token_amount: 0.1 },
                    { href: `/blinks/${newBlink.blink_id}?token=SOL&amount=0.5`, label: "Tip 0.5 SOL", embed_field_value: "Amount: 0.5", token_amount: 0.5 },
                    { href: `/blinks/${newBlink.blink_id}?token=SOL&amount=1`, label: "Tip 1 SOL", embed_field_value: "Amount: 1", token_amount: 1 },
                    { href: `/blinks/${newBlink.blink_id}?token=SOL&amount=amount`, label: "Custom amount", embed_field_value: "Amount: custom" },
                ]
            }
        }

        if (blink_type === "blinkTokenSwap") {
            newBlink.links = {
                actions: [
                    { href: `/blinks/${newBlink.blink_id}?token=${newBlink.token_address}&amount=0.1`, label: "Buy 0.1 SOL", embed_field_value: "Amount: 0.1", token_amount: 0.1 },
                    { href: `/blinks/${newBlink.blink_id}?token=${newBlink.token_address}&amount=0.5`, label: "Buy 0.5 SOL", embed_field_value: "Amount: 0.5", token_amount: 0.5 },
                    { href: `/blinks/${newBlink.blink_id}?token=${newBlink.token_address}&amount=1`, label: "Buy 1 SOL", embed_field_value: "Amount: 1", token_amount: 1 },
                    { href: `/blinks/${newBlink.blink_id}?token=${newBlink.token_address}&amount=amount`, label: "Buy custom amount", embed_field_value: "Amount: custom" },
                ]
            }
        }

        if (blink_type === "blinkVote") {
            // TODO: implement
        }

        await newBlink.save();
        await stats.save();
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