import "dotenv/config";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { User } from "../models/user";
import { Wallet } from "../models/wallet";
import { SolanaWeb3 } from "./solanaweb3";
import bs58 from 'bs58';
import crypto from 'crypto';
import { ERROR_CODES } from "../config/errors";
import { UI } from "../interfaces/ui";
import { addStartButton, createAfterSwapUI, createAfterSwapUIWithRef } from "./discord-ui";
import { Transaction } from "../models/transaction";
import { QuoteResponse } from "../interfaces/quoteresponse";
import { CaAmount } from "../interfaces/caamount";
import { LEVEL1_FEE_IN_PERCENT, LEVEL2_FEE_IN_PERCENT, LEVEL3_FEE_IN_PERCENT, REFCODE_MODAL_STRING } from "../config/constants";
import { TxResponse } from "../interfaces/tx-response";
import { UIWithRef } from "../interfaces/ui-with-ref";

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const REFCODE_CHARSET = 'a5W16LCbyxt2zmOdTgGveJ8co0uVkAMXZY74iQpBDrUwhFSRP9s3lKNInfHEjq';

export async function createNewWallet(userId: string): Promise<string | null> {
    const solanaWallet = SolanaWeb3.createNewWallet();
    const solanaPrivateKey = bs58.encode(solanaWallet.secretKey);
    const encryption = encryptPKey(solanaPrivateKey);
    if (!encryption) return null;

    try {
        const allWallets = await Wallet.find({ user_id: userId }).lean();
        const user = await User.findOneAndUpdate(
            { user_id: userId },
            { $inc: { wallets_created: 1 } },
            { new: true, upsert: true }
        ).lean();
        if (!user) return null;
        const walletCount = user.wallets_created;

        const newWallet = new Wallet({
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
        console.log(error);
        return null;
    }
}

export async function createRefCodeForUser(userId: string): Promise<string | null> {
    let refCode = createNewRefCode();
    let msgContent = "Your referral code is: ";
    try {
        const user = await User.findOne({ user_id: userId });
        if (!user) return null;
        if (user.ref_code) {
            msgContent += user.ref_code;
            return msgContent;
        }

        let userWithRefCodeExistsAlready = await User.findOne({ ref_code: refCode });
        while (userWithRefCodeExistsAlready) {
            refCode = createNewRefCode();
            userWithRefCodeExistsAlready = await User.findOne({ ref_code: refCode });
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
    let result = "";
    for (let i = 0; i < 8; i++) {
        const randomIndex = Math.floor(Math.random() * REFCODE_CHARSET.length);
        result += REFCODE_CHARSET[randomIndex];
    }
    return result;
}

export function isNumber(str: string): boolean {
    const num = Number(str);
    return !isNaN(num);
}

export function extractCAFromMessage(message: string, line: number): string | null {
    const firstLine = message.split("\n")[line];
    const parts = firstLine.split(" | ");
    return parts[parts.length - 1];
}

export function extractAndValidateCA(message: string): string | null {
    const firstLine = message.split("\n")[0];
    const parts = firstLine.split(" | ");
    if (!parts.length) return null;

    const ca = parts[parts.length - 1];
    const isValidAddress = SolanaWeb3.checkIfValidAddress(ca);
    if (!isValidAddress) {
        // check if the address is in the 4th line (the case when user buys coin through the sell & manage UI)
        const fourthLine = message.split("\n")[3];
        const parts = fourthLine.split(" | ");
        if (!parts.length) return null;
        const ca2 = parts[parts.length - 1];
        const isValidAddress2 = SolanaWeb3.checkIfValidAddress(ca2);
        if (!isValidAddress2) return null;
        return ca2;
    }

    return ca;
}

export function extractAmountFromMessage(message: string): string | null {
    const firstLine = message.split("\n")[0];
    const parts = firstLine.split(" | ");
    if (!parts.length) return null;

    if (parts[0].includes("SOL")) {
        // buy (return just the number)
        return parts[0].split(" ")[0];
    }

    // sell (includes % after number)
    return parts[0];
}

export function formatNumber(num: string): string {
    const number = Number(num);
    if (number >= 1000000) {
        return (number / 1000000).toFixed(2).replace(/\.0$/, '') + 'M';
    } else if (number >= 1000) {
        return (number / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    } else {
        return number.toString();
    }
}

export function getKeypairFromEncryptedPKey(encryptedPKey: string, iv: string): Keypair | null {
    const pkey = decryptPKey(encryptedPKey, iv);
    if (!pkey) return null;
    return Keypair.fromSecretKey(bs58.decode(pkey));
}

export function encryptPKey(pKey: string): { encryptedPrivateKey: string, iv: string } | null {
    try {
        const secretKey = process.env.ENCRYPTION_SECRET_KEY;
        if (!secretKey) {
            throw new Error("Encryption key not found.");
        }
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, secretKey, iv);
        let encrypted = cipher.update(pKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return { encryptedPrivateKey: encrypted, iv: iv.toString('hex') };
    } catch (error) {
        console.log(error);
        return null;
    }
}

export function decryptPKey(encryptedPKey: string, iv: string): string | null {
    try {
        const secretKey = process.env.ENCRYPTION_SECRET_KEY;
        if (!secretKey) return null;

        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, secretKey, Buffer.from(iv, 'hex'));
        let decrypted = decipher.update(encryptedPKey, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.log(error);
        return null;
    }
}

export async function buyCoin(userId: string, msgContent: string, buttonNumber: string): Promise<UI> {
    const contractAddress = extractAndValidateCA(msgContent);
    if (!contractAddress) return { content: ERROR_CODES["0006"].message, ephemeral: true };
    try {
        const response: TxResponse = await SolanaWeb3.buyCoinViaAPI(userId, contractAddress, `buy_button_${buttonNumber}`);
        await saveDbTransaction(response);
        return createAfterSwapUI(response);
    } catch (error) {
        await saveDbTransaction({ user_id: userId, tx_type: "swap_buy", error });
        return { content: ERROR_CODES["0000"].message, ephemeral: true };
    }
}

export async function buyCoinX(userId: string, msgContent: string, amount: string): Promise<UI> {
    const contractAddress = extractAndValidateCA(msgContent);
    if (!contractAddress) return { content: ERROR_CODES["0006"].message, ephemeral: true };
    try {
        const response: TxResponse = await SolanaWeb3.buyCoinViaAPI(userId, contractAddress, amount);
        await saveDbTransaction(response);
        return createAfterSwapUI(response);
    } catch (error) {
        await saveDbTransaction({ user_id: userId, tx_type: "swap_buy", error });
        return { content: ERROR_CODES["0000"].message, ephemeral: true };
    }
}

export async function sellCoin(userId: string, msgContent: string, buttonNumber: string): Promise<UIWithRef> {
    const contractAddress = extractAndValidateCA(msgContent);
    if (!contractAddress) {
        return { ui: { content: ERROR_CODES["0006"].message, ephemeral: true } };
    }
    try {
        const response: TxResponse = await SolanaWeb3.sellCoinViaAPI(userId, contractAddress, `sell_button_${buttonNumber}`);
        await saveDbTransaction(response);
        return createAfterSwapUIWithRef(response);
    } catch (error) {
        await saveDbTransaction({ user_id: userId, tx_type: "swap_sell", error });
        return { ui: { content: ERROR_CODES["0000"].message, ephemeral: true } };
    }
}

export async function sellCoinX(userId: string, msgContent: string, amountInPercent: string): Promise<UIWithRef> {
    const contractAddress = extractAndValidateCA(msgContent);
    if (!contractAddress) return { ui: { content: ERROR_CODES["0006"].message, ephemeral: true } };
    try {
        const response: TxResponse = await SolanaWeb3.sellCoinViaAPI(userId, contractAddress, amountInPercent);
        await saveDbTransaction(response);
        return createAfterSwapUIWithRef(response);
    } catch (error) {
        await saveDbTransaction({ user_id: userId, tx_type: "swap_sell", error });
        return { ui: { content: ERROR_CODES["0000"].message, ephemeral: true } };
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
    total_fees,
    callisto_fees,
    ref_fees,
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
            total_fees,
            callisto_fees,
            ref_fees,
            error: error,
        });
        await dbTx.save();

        return true;
    } catch (error) {
        return false;
    }
}

export async function getCurrentSolPrice(): Promise<number | null> {
    try {
        // TODO: change this to a more reliable source
        const quoteResponse: QuoteResponse = await (
            await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${LAMPORTS_PER_SOL}&slippageBps=100`)
        ).json();
        if (!quoteResponse) return null;

        const solPrice: number = Number(quoteResponse.outAmount) / Math.pow(10, 6);
        return solPrice;
    } catch (error) {
        return null;
    }
}

export async function getCurrentTokenPriceInSol(ca: string, amount: string): Promise<number | null> {
    try {
        const quoteResponse: QuoteResponse = await (
            await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${ca}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=100`)
        ).json();
        if (!quoteResponse) return null;
        return Number(quoteResponse.outAmount) / LAMPORTS_PER_SOL;
    } catch (error) {
        return null;
    }
}

export async function getCurrentTokenPriceInSolAll(cas: CaAmount[]): Promise<number[] | null> {
    try {
        const requests = cas.map((ca: CaAmount) => {
            return fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${ca.contractAddress}&outputMint=So11111111111111111111111111111111111111112&amount=${ca.amount}&slippageBps=100`);
        });
        const quoteResponsesRaw = await Promise.all(requests);
        const quoteResponses: QuoteResponse[] = await Promise.all(quoteResponsesRaw.map((response) => response.json()));
        if (!quoteResponses) return null;

        const prices = quoteResponses.map((quoteResponse) => Number(quoteResponse.outAmount) / LAMPORTS_PER_SOL);
        return prices;
    } catch (error) {
        return null;
    }
}

export const wait = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

export async function saveReferralAndUpdateFees(userId: string, refCode: string): Promise<UI> {
    try {
        const user = await User.findOne({ user_id: userId });
        if (!user) {
            return addStartButton(ERROR_CODES["0013"].message);
        }
        const referrer = await User.findOne({ ref_code: refCode });
        if (!referrer) {
            // TODO: store error and submitted ref code in db
            return addStartButton(ERROR_CODES["0014"].message);
        }
        
        let refsWallet: string = "";
        const referrersDefaultWallet = await Wallet.findOne({ user_id: referrer.user_id, is_default_wallet: true }).lean();
        if (referrersDefaultWallet) refsWallet = referrersDefaultWallet.wallet_address;

        if (user.referrer) {
            return addStartButton("This user already used a referral code.");
        }

        user.referrer = {
            code: refCode,
            referrer_user_id: referrer.user_id,
            referrer_wallet: refsWallet,
            number_of_referral: referrer.total_refs,
            fee_level: getCorrectRefFeeLevel(referrer.total_refs),
            timestamp: Date.now(),
        };
        user.swap_fee = user.swap_fee * 0.9;
        referrer.total_refs++;

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