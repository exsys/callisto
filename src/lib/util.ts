import "dotenv/config";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PrivateKey } from "../models/private-key";
import { UserStats } from "../models/user-stats";
import { Wallet } from "../models/wallet";
import { SolanaWeb3 } from "./solanaweb3";
import bs58 from 'bs58';
import crypto from 'crypto';
import { UIResponse } from "../interfaces/uiresponse";
import { ERROR_CODES } from "../config/errors";
import { UI } from "../interfaces/ui";
import { createAfterSwapUI } from "./discord-ui";
import { Transaction } from "../models/transaction";
import { QuoteResponse } from "../interfaces/quoteresponse";
import { CaAmount } from "../interfaces/caamount";
import { DBTransaction } from "../interfaces/db-tx";

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const REFCODE_CHARSET = 'a5W16LCbyxt2zmOdTgGveJ8co0uVkAMXZY74iQpBDrUwhFSRP9s3lKNInfHEjq';

export async function createNewWallet(userId: string): Promise<string | null> {
    const solanaWallet = SolanaWeb3.createNewWallet();
    const solanaPrivateKey = bs58.encode(solanaWallet.secretKey);
    const encryption = encryptPKey(solanaPrivateKey);
    if (!encryption) return null;

    try {
        const allWallets = await Wallet.find({ user_id: userId }).lean();
        const userStats = await UserStats.findOneAndUpdate(
            { user_id: userId },
            { $inc: { wallets_created: 1 } },
            { new: true, upsert: true }
        ).lean();
        if (!userStats) return null;
        const walletCount = userStats.wallets_created;

        const newWallet = new Wallet({
            wallet_id: walletCount,
            user_id: userId,
            wallet_name: `Wallet ${walletCount}`,
            is_default_wallet: walletCount === 1 || !allWallets.length,
            wallet_address: solanaWallet.publicKey.toString(),
            swap_fee: userStats.fee,
        });

        const privateKey = new PrivateKey({
            user_id: userId,
            wallet_id: walletCount,
            encrypted_private_key: encryption.encryptedPrivateKey,
            wallet_address: solanaWallet.publicKey.toString(),
            iv: encryption?.iv,
        });

        await newWallet.save();
        await privateKey.save();

        if (walletCount === 1) {

            // TODO: ask for ref code with modal
        }

        return solanaWallet.publicKey.toString();
    } catch (error) {
        console.log(error);
        return null;
    }
}

export async function createRefCodeForUser(userId: string): Promise<string | null> {
    let refLink = createNewRefLink();
    let msgContent = "Your referral code is: ";
    try {
        const user = await UserStats.findOne({ user_id: userId });
        if (!user) return null;
        if (user.ref_link) {
            msgContent += user.ref_link;
            return msgContent;
        }

        let userWithRefLinkExistsAlready = await UserStats.findOne({ ref_link: refLink });
        while (userWithRefLinkExistsAlready) {
            refLink = createNewRefLink();
            userWithRefLinkExistsAlready = await UserStats.findOne({ ref_link: refLink });
        }
    
        user.ref_link = refLink;
        await user.save();
        msgContent += user.ref_link;
        return msgContent;
    } catch (error) {
        return null;
    }
}

export function createNewRefLink(): string {
    let result = "";
    for (let i = 0; i < 8; i++) {
        const randomIndex = Math.floor(Math.random() * REFCODE_CHARSET.length);
        result += REFCODE_CHARSET[randomIndex];
    }
    return result;
}

export async function getPrivateKeyOfWallet(userId: string, walletAddress: string): Promise<string | null> {
    const privateKey = await PrivateKey.findOne({ user_id: userId, wallet_address: walletAddress }).lean();
    return privateKey ? privateKey.encrypted_private_key : null;
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
        const response: UIResponse = await SolanaWeb3.buyCoinViaAPI(userId, contractAddress, `buy_button_${buttonNumber}`);
        if (response.error) {
            // TODO NEXT: überlegen wie ich responses zurückerhalte. wahrscheinlich ein extra type erstellen dafür und dann für 
            // alle funktionsaufrufe benutzen und txs in db immer in util speichern, und nicht in solanaweb3
        }
        return createAfterSwapUI(response);
    } catch (error) {
        console.log(error);
        return { content: ERROR_CODES["0011"].message, ephemeral: true };
    }
}

export async function buyCoinX(userId: string, msgContent: string, amount: string): Promise<UI> {
    const contractAddress = extractAndValidateCA(msgContent);
    if (!contractAddress) return { content: ERROR_CODES["0006"].message, ephemeral: true };
    try {
        const response: UIResponse = await SolanaWeb3.buyCoinViaAPI(userId, contractAddress, amount);
        // TODO: if response.error save in DB
        return createAfterSwapUI(response);
    } catch (error) {
        console.log(error);
        return { content: ERROR_CODES["0011"].message, ephemeral: true };
    }
}

export async function sellCoin(userId: string, msgContent: string, buttonNumber: string): Promise<UI> {
    const contractAddress = extractAndValidateCA(msgContent);
    if (!contractAddress) return { content: ERROR_CODES["0006"].message, ephemeral: true };
    try {
        const response: UIResponse = await SolanaWeb3.sellCoinViaAPI(userId, contractAddress, `sell_button_${buttonNumber}`);
        // TODO: if response.error save in DB
        return createAfterSwapUI(response);
    } catch (error) {
        console.log(error);
        return { content: ERROR_CODES["0011"].message, ephemeral: true };
    }
}

export async function sellCoinX(userId: string, msgContent: string, amountInPercent: string): Promise<UI> {
    const contractAddress = extractAndValidateCA(msgContent);
    if (!contractAddress) return { content: ERROR_CODES["0006"].message, ephemeral: true };
    try {
        const response: UIResponse = await SolanaWeb3.sellCoinViaAPI(userId, contractAddress, amountInPercent);
        // TODO: if response.error save in DB
        return createAfterSwapUI(response);
    } catch (error) {
        console.log(error);
        return { content: ERROR_CODES["0011"].message, ephemeral: true };
    }
}

export async function exportPrivateKeyOfUser(userId: string): Promise<any | null> {

    try {
        const defaultWallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
        if (!defaultWallet) return null;
        const privateKey: any = await PrivateKey.findOne({ user_id: userId, wallet_id: defaultWallet.wallet_id });
        if (!privateKey) return null;

        privateKey.key_exported = true;
        await privateKey.save();
        return privateKey;
    } catch (error) {
        return null;
    }

}

export async function saveDbTransaction({
    user_id,
    wallet_address,
    buy_or_sell,
    token_address,
    success,
    processing_time_function,
    processing_time_tx,
    token_amount,
    usd_volume,
    fees_in_sol,
    error,
}: DBTransaction): Promise<boolean> {
    try {
        const date = new Date();
        const utcTime = date.toUTCString();
        const dbTx = new Transaction({
            buy_or_sell,
            user_id,
            wallet_address,
            token_address,
            success,
            processing_time_function,
            processing_time_tx,
            utcTime,
            unix_timestamp: Date.now(),
            token_amount,
            usd_volume,
            fees_in_sol,
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