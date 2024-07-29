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
import { ERROR_CODES } from "../config/errors";
import { addStartButton, createAfterSwapUI } from "./discord-ui";
import { Transaction } from "../models/transaction";
import {
    FEE_TOKEN_ACCOUNT,
    LEVEL1_FEE_IN_PERCENT,
    LEVEL2_FEE_IN_PERCENT,
    LEVEL3_FEE_IN_PERCENT,
    REFCODE_MODAL_STRING
} from "../config/constants";
import { TxResponse } from "../types/tx-response";
import { UIResponse } from "../types/ui-response";
import { DBError } from "../types/db-error";
import { Error } from "../models/errors";
import { InteractionEditReplyOptions } from "discord.js";
import { checkIfValidAddress, buyCoinViaAPI, sellCoinViaAPI, getTransactionInfo, payRefFees, createNewWallet } from "./solanaweb3";

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

export async function saveError({ user_id, contract_address, wallet_address, function_name, error }: DBError): Promise<boolean> {
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
        return true;
    } catch (error) {
        return false;
    }
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

// this will only be called for sell transactions. so only checking for FEE_TOKEN_ACCOUNT for the balances is correct.
export async function storeUnpaidRefFee(txResponse: TxResponse): Promise<boolean> {
    if (!txResponse) return false;
    // TODO: proper error handling, with returning error message
    if (!txResponse.referral) return false;
    try {
        const tx: VersionedTransactionResponse | null = await getTransactionInfo(txResponse.tx_signature);
        if (!tx) return false;
        const txInfo: ConfirmedTransactionMeta | null = tx.meta;
        const txMsg: { message: VersionedMessage; signatures: string[]; } = tx.transaction;
        if (!txInfo) return false;

        // how much the user paid in fees. this is checking how much the calli fee wallet received from this tx
        const solPreBalance: number = txInfo.preBalances[txMsg.message.staticAccountKeys.findIndex((key: PublicKey) => key.toBase58() === FEE_TOKEN_ACCOUNT)];
        const solPostBalance: number = txInfo.postBalances[txMsg.message.staticAccountKeys.findIndex((key: PublicKey) => key.toBase58() === FEE_TOKEN_ACCOUNT)];
        const solReceivedInLamports: number = solPostBalance - solPreBalance;
        // TODO: proper error handling
        if (!solReceivedInLamports) return false;
        const referrer: any = await User.findOne({ user_id: txResponse.referral?.referrer_user_id });
        if (!referrer) return false;

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
    if (payoutAmount < 2100000) {
        // 2100000 = 0.0021 SOL. 0.002 SOL is needed for rent fee, in case the user doesn't have deposited any SOL yet
        return { ui: { content: "You need to have at least 0.0021 SOL accumulated to claim your fees." } };
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