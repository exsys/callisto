import "dotenv/config";
import {
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    Keypair,
    Transaction,
    SystemProgram,
    VersionedTransaction,
    AddressLookupTableAccount,
    TransactionMessage,
    GetProgramAccountsFilter,
    MessageAddressTableLookup,
} from '@solana/web3.js';
import { Wallet } from '../models/wallet';
import { PrivateKey } from '../models/private-key';
import {
    formatNumber,
    getCurrentSolPrice,
    getKeypairFromEncryptedPKey,
    isNumber,
    saveDbTransaction
} from './util';
import { CoinMetadata } from "../interfaces/coinmetadata";
import { SwapTx } from "../interfaces/swaptx";
import { UIResponse } from "../interfaces/uiresponse";
import { FEE_ACCOUNT, FEE_OWNER, TOKEN_PROGRAM } from "../config/constants";
import { ParsedTokenInfo } from "../interfaces/parsedtokeninfo";
import { CoinInfo } from "../interfaces/coininfo";
import { CoinStats } from "../interfaces/coinstats";
import {
    getAssociatedTokenAddress,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    createTransferInstruction,
    getOrCreateAssociatedTokenAccount
} from "@solana/spl-token";
import { ERROR_CODES } from "../config/errors";
import bs58 from "bs58";
import { transactionSenderAndConfirmationWaiter } from "./transaction-sender";

export class SolanaWeb3 {
    /*static jitoConn: Connection = new Connection("https://mainnet.block-engine.jito.wtf/api/v1/transactions", {
        commitment: "confirmed",
        httpAgent: new Agent({
            keepAlive: true,
            keepAliveMsecs: 60000,
        }),
    });*/
    static connection: Connection = new Connection("https://quaint-practical-liquid.solana-mainnet.quiknode.pro/de215f4d6fabf6c4bb0cb0eab8aceb79e8567a27/");
    static BPS_PER_PERCENT: number = 100;
    static CU_TOKEN_TRANSFER: number = 27695;
    static CU_SOL_TRANSFER: number = 300;
    static GAS_FEE_FOR_SOL_TRANSFER: number = 5000;
    static INTERVAL_FOR_TXS_TO_SEND: number = 100;

    static createNewWallet() {
        const solanaWallet = Keypair.generate();
        return solanaWallet;
    }

    static async transferAllSol(userId: any, recipientAddress: string): Promise<UIResponse> {
        try {
            const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
            if (!wallet) {
                return {
                    content: ERROR_CODES["0003"].message,
                    success: false,
                };
            }

            const privateKey = await PrivateKey.findOne({ user_id: userId, wallet_id: wallet.wallet_id }).lean();
            if (!privateKey) {
                return {
                    content: ERROR_CODES["0002"].message,
                    success: false,
                };
            }

            const balanceInLamports = await this.getBalanceOfWalletInLamports(wallet.wallet_address);
            const signer: Keypair | null = getKeypairFromEncryptedPKey(privateKey.encrypted_private_key, privateKey.iv);
            if (!signer) return { content: ERROR_CODES["0010"].message, success: false };

            const maxSolAmountToSend = balanceInLamports - this.GAS_FEE_FOR_SOL_TRANSFER;
            const tx: Transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: signer.publicKey,
                    toPubkey: new PublicKey(recipientAddress),
                    lamports: maxSolAmountToSend,
                })
            );

            const blockhash = await this.getConnection().getLatestBlockhash();
            tx.feePayer = signer.publicKey;
            tx.recentBlockhash = blockhash.blockhash;
            tx.sign(signer);
            const serializedTx = Buffer.from(tx.serialize());
            const signature = this.getSignature(tx);
            const result = await transactionSenderAndConfirmationWaiter({
                connection: this.getConnection(),
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight,
                },
            });

            if (!result) {
                return { content: "Failed to swap. Please try again.", success: false };
            }
            if (result.meta?.err) {
                console.log(result.meta?.err);
                return { content: "Failed to swap. Please try again.", success: false };
            }

            return {
                content: `Successfully transferred funds. Transaction ID: ${signature}`,
                success: true,
            };
        } catch (error) {
            console.log(error);
            return {
                content: ERROR_CODES["0004"].message,
                success: false,
            }
        }
    }

    static async transferXSol(userId: any, amount: string, recipientAddress: string): Promise<UIResponse> {
        try {
            const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
            if (!wallet) return { content: ERROR_CODES["0003"].message, success: false };
            const privateKey = await PrivateKey.findOne({ user_id: userId, wallet_id: wallet.wallet_id }).lean();
            if (!privateKey) return { content: ERROR_CODES["0002"].message, success: false };
            if (!isNumber(amount)) return { content: "Please enter a valid number and try again.", success: false };

            const blockhash = await this.getConnection().getLatestBlockhash("finalized");
            const signer: Keypair | null = getKeypairFromEncryptedPKey(privateKey.encrypted_private_key, privateKey.iv);
            if (!signer) return { content: ERROR_CODES["0010"].message, success: false };

            const tx: Transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: signer.publicKey,
                    toPubkey: new PublicKey(recipientAddress),
                    lamports: Number(amount) * LAMPORTS_PER_SOL
                })
            );
            tx.feePayer = signer.publicKey;
            tx.recentBlockhash = blockhash.blockhash;

            // check if the user has enough balance to transfer the amount
            const estimatedFeeInLamports = await tx.getEstimatedFee(this.getConnection());
            const balanceInLamports = await this.getBalanceOfWalletInLamports(wallet.wallet_address);
            if (!estimatedFeeInLamports) {
                // get default fee if the estimated fee is not available
                if (balanceInLamports < (Number(amount) * LAMPORTS_PER_SOL) + this.GAS_FEE_FOR_SOL_TRANSFER) {
                    return { content: "Insufficient balance. Please check your balance and try again.", success: false };
                }
            } else if (balanceInLamports < (Number(amount) * LAMPORTS_PER_SOL) + estimatedFeeInLamports) {
                return { content: "Insufficient balance. Please check your balance and try again.", success: false };
            }

            tx.sign(signer);
            const serializedTx = Buffer.from(tx.serialize());
            const signature = this.getSignature(tx);
            const result = await transactionSenderAndConfirmationWaiter({
                connection: this.getConnection(),
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight,
                },
            });

            if (!result) return { content: "Failed to swap. Please try again.", success: false };
            if (result.meta?.err) {
                console.log(result.meta?.err);
                return { content: "Failed to swap. Please try again.", success: false };
            }

            return { content: `Successfully transferred funds. Transaction ID: ${signature}`, success: true };
        } catch (error) {
            return { content: ERROR_CODES["0004"].message, success: false };
        }
    }

    static async sendCoin(userId: any, contractAddress: string, amount: string, destinationAddress: string): Promise<UIResponse> {
        try {
            const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
            if (!wallet) return { content: ERROR_CODES["0003"].message, success: false };
            const privateKey = await PrivateKey.findOne({ user_id: userId, wallet_id: wallet.wallet_id }).lean();
            if (!privateKey) return { content: ERROR_CODES["0002"].message, success: false };
            if (!isNumber(amount)) return { content: "Please enter a valid number and try again.", success: false };

            const signer: Keypair | null = getKeypairFromEncryptedPKey(privateKey.encrypted_private_key, privateKey.iv);
            if (!signer) return { content: ERROR_CODES["0010"].message, success: false };
            const walletTokenAccount = await this.getTokenAccountOfWallet(wallet.wallet_address, contractAddress);
            if (!walletTokenAccount) return { content: ERROR_CODES["0008"].message, success: false };

            const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
                this.getConnection(),
                signer,
                new PublicKey(contractAddress),
                new PublicKey(destinationAddress),
            );
            if (!destinationTokenAccount) return { content: ERROR_CODES["0008"].message, success: false };

            const coinStats: CoinStats | null = await this.getCoinStats(contractAddress, wallet.wallet_address);
            if (!coinStats) return { content: "Coin not found. Please try again later.", success: false };

            const blockhash = await this.getConnection().getLatestBlockhash();
            const amountToSend = Number(coinStats.tokenAmount!.amount) * (Number(amount) / 100);
            const tx: Transaction = new Transaction().add(
                createTransferInstruction(
                    walletTokenAccount, // source token account
                    destinationTokenAccount.address, // receiver token account
                    signer.publicKey, // source wallet address
                    amountToSend, // amount to transfer
                )
            );

            tx.feePayer = signer.publicKey;
            tx.recentBlockhash = blockhash.blockhash;
            tx.sign(signer);
            const serializedTx = Buffer.from(tx.serialize());
            const signature = this.getSignature(tx);
            const result = await transactionSenderAndConfirmationWaiter({
                connection: this.getConnection(),
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight,
                },
            });

            if (!result) return { content: "Failed to swap. Please try again.", success: false };
            if (result.meta?.err) {
                console.log(result.meta?.err);
                return { content: "Failed to swap. Please try again.", success: false };
            }

            return { content: `Successfully transferred funds. Transaction ID: ${signature}`, success: true };
        } catch (error) {
            console.log(error);
            return { content: ERROR_CODES["0004"].message, success: false };
        }
    }

    static async buyCoinViaAPI(userId: string, contractAddress: string, amountToSwap: string): Promise<UIResponse> {
        const startTimeFunction = Date.now();
        let wallet: any = null;
        try {
            wallet = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
            if (!wallet) return { content: ERROR_CODES["0003"].message, success: false, ca: contractAddress };
        } catch (error) {
            return { content: ERROR_CODES["0011"].message, success: false, ca: contractAddress };
        }

        try {
            const conn = this.getConnection();
            const privateKey = await PrivateKey.findOne({ user_id: userId, wallet_id: wallet.wallet_id }).lean();
            if (!privateKey) return { content: ERROR_CODES["0002"].message, success: false, ca: contractAddress };
            const balanceInLamports = await this.getBalanceOfWalletInLamports(wallet.wallet_address);
            if (typeof balanceInLamports !== "number") {
                return { content: "Server error. Please try again later", success: false, ca: contractAddress };
            }

            if (amountToSwap.includes("buy_button_")) {
                amountToSwap = wallet.settings[amountToSwap as string];
            }

            const txPrio: number = wallet.settings.tx_priority_value;

            if (!isNumber(amountToSwap)) {
                return { content: "Invalid value. Please enter a valid number.", success: false, ca: contractAddress };
            }
            if (Number(amountToSwap) <= 0) {
                return { content: "Invalid amount. Please enter a number above 0.", success: false, ca: contractAddress };
            }
            if (balanceInLamports < Number(amountToSwap) * LAMPORTS_PER_SOL + txPrio) {
                return {
                    content: "Insufficient balance. Please check your balance and try again.",
                    success: false,
                    ca: contractAddress,
                    amount: amountToSwap,
                    includeRetryButton: true,
                };
            }

            // TODO: get metadata from another source if this one doesn't work
            const coinMetadata: CoinMetadata | null = await this.getCoinMetadata(contractAddress);
            if (!coinMetadata) {
                return {
                    content: "Coin not tradeable. Please try again later.",
                    success: false,
                    ca: contractAddress,
                    amount: amountToSwap,
                    includeRetryButton: true,
                };
            }

            const signer: Keypair | null = getKeypairFromEncryptedPKey(privateKey.encrypted_private_key, privateKey.iv);
            if (!signer) return { content: ERROR_CODES["0010"].message, success: false, ca: contractAddress };
            const amount: number = Number(amountToSwap) * LAMPORTS_PER_SOL;
            const slippage: number = wallet.settings.buy_slippage * this.BPS_PER_PERCENT;
            const feeToPayInLamports: number = amount * (wallet.swap_fee / 100);
            const amountMinusFee: number = amount - feeToPayInLamports;

            const quoteResponse = await (
                await fetch(
                    `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${contractAddress}&amount=${amountMinusFee}&slippageBps=${slippage}`
                )
            ).json();
            if (quoteResponse.error) {
                console.log(quoteResponse);
                return {
                    content: "Failed to swap. Please try again.",
                    success: false,
                    ca: contractAddress,
                    amount: amountToSwap,
                    includeRetryButton: true,
                };
            }

            const swapTx: SwapTx = await (
                await fetch('https://quote-api.jup.ag/v6/swap', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: wallet.wallet_address,
                        wrapAndUnwrapSol: true,
                        prioritizationFeeLamports: wallet.settings.tx_priority_value,
                        dynamicComputeUnitLimit: true,
                    })
                })
            ).json();
            if (swapTx.error) {
                console.log(swapTx);
                return {
                    content: "Failed to swap. Please try again.",
                    success: false,
                    ca: contractAddress,
                    amount: amountToSwap,
                    includeRetryButton: true,
                };
            }

            const swapTxBuf: Buffer = Buffer.from(swapTx.swapTransaction!, 'base64');
            const tx: VersionedTransaction = VersionedTransaction.deserialize(swapTxBuf);
            const feeInstruction = SystemProgram.transfer({
                fromPubkey: new PublicKey(wallet.wallet_address),
                toPubkey: new PublicKey(FEE_OWNER),
                lamports: feeToPayInLamports,
            });
            const addressLookupTableAccounts = await Promise.all(
                tx.message.addressTableLookups.map(async (lookup: MessageAddressTableLookup) => {
                    return new AddressLookupTableAccount({
                        key: lookup.accountKey,
                        state: AddressLookupTableAccount.deserialize(await conn.getAccountInfo(lookup.accountKey).then((res: any) => res.data)),
                    });
                })
            );
            const txMessage = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: addressLookupTableAccounts });
            txMessage.instructions.push(feeInstruction);
            tx.message = txMessage.compileToV0Message(addressLookupTableAccounts);
            tx.sign([signer]);
            const sig = this.getSignature(tx);
            const serializedTx = Buffer.from(tx.serialize());
            const startTimeTx: number = Date.now();
            const result = await transactionSenderAndConfirmationWaiter({
                connection: conn,
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: tx.message.recentBlockhash,
                    lastValidBlockHeight: swapTx.lastValidBlockHeight!,
                },
            });

            if (!result) return {
                content: "Failed to swap. Please try again.",
                success: false,
                ca: contractAddress,
                amount: amountToSwap,
                includeRetryButton: true,
            };
            if (result.meta?.err) {
                console.log(result.meta?.err);
                return {
                    content: "Failed to swap. Please try again.",
                    success: false,
                    ca: contractAddress,
                    amount: amountToSwap,
                    includeRetryButton: true,
                };
            }

            const endTimeTx: number = Date.now();
            const functionProcessingTime: number = (endTimeTx - startTimeFunction) / 1000;
            const txProcessingTime: number = (endTimeTx - startTimeTx) / 1000;
            await saveDbTransaction(wallet, "buy", contractAddress, true, functionProcessingTime, txProcessingTime);
            return { content: "Successfully swapped. Transaction ID: " + sig, success: true, ca: contractAddress };
        } catch (error) {
            console.log(error);
            const endTimeFunction = Date.now();
            const functionProcessingTime: number = (endTimeFunction - startTimeFunction) / 1000;
            await saveDbTransaction(wallet, "buy", contractAddress, false, functionProcessingTime);
            return {
                content: "Failed to swap. Please try again.",
                success: false,
                ca: contractAddress,
                amount: amountToSwap,
                includeRetryButton: true,
            };
        }
    }

    static async sellCoinViaAPI(userId: string, contractAddress: string, amountToSellInPercent: string): Promise<UIResponse> {
        const startTimeFunction = Date.now();
        const conn = this.getConnection();
        const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
        if (!wallet) return { content: ERROR_CODES["0003"].message, success: false, ca: contractAddress };
        const privateKey = await PrivateKey.findOne({ user_id: userId, wallet_id: wallet.wallet_id }).lean();
        if (!privateKey) return { content: ERROR_CODES["0002"].message, success: false, ca: contractAddress };

        if (amountToSellInPercent.includes("sell_button_")) {
            amountToSellInPercent = wallet.settings[amountToSellInPercent as string];
        }

        if (!isNumber(amountToSellInPercent)) {
            return { content: "Invalid amount. Please enter a valid number.", success: false, ca: contractAddress };
        }
        if (Number(amountToSellInPercent) < 0.01) {
            return { content: "Invalid amount. Please enter a number between 0.01 and 100.", success: false, ca: contractAddress };
        }
        if (Number(amountToSellInPercent) > 100) {
            return { content: "Invalid amount. Please enter a number between 0.01 and 100.", success: false, ca: contractAddress };
        }

        const coinStats: CoinStats | null = await this.getCoinStats(contractAddress, wallet.wallet_address);
        if (!coinStats) {
            return {
                content: ERROR_CODES["0012"].message,
                success: false,
                amount: amountToSellInPercent + "%",
                ca: contractAddress,
                includeRetryButton: true,
            };
        }
        if (Number(coinStats.tokenAmount!.amount) == 0) {
            return {
                content: "Insufficient holdings. Please check your balance and try again.",
                success: false,
                token: coinStats,
                amount: amountToSellInPercent + "%",
                includeRetryButton: true,
            };
        }

        try {
            const signer: Keypair | null = getKeypairFromEncryptedPKey(privateKey.encrypted_private_key, privateKey.iv);
            if (!signer) return { content: ERROR_CODES["0010"].message, success: false, token: coinStats };
            const amount: number = (Number(coinStats.tokenAmount!.amount) * (Number(amountToSellInPercent) / 100));
            const slippage: number = wallet.settings.sell_slippage * this.BPS_PER_PERCENT;
            const feeAmountInBPS: number = wallet.swap_fee * this.BPS_PER_PERCENT;

            const quoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${contractAddress}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=${slippage}&platformFeeBps=${feeAmountInBPS}`)
            ).json();

            if (quoteResponse.error) {
                console.log(quoteResponse);
                return {
                    content: "Failed to swap. Please try again.",
                    success: false,
                    token: coinStats,
                    amount: amountToSellInPercent + "%",
                    includeRetryButton: true,
                };
            }

            const swapTx: SwapTx = await (
                await fetch('https://quote-api.jup.ag/v6/swap', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: wallet.wallet_address,
                        wrapAndUnwrapSol: true,
                        prioritizationFeeLamports: wallet.settings.tx_priority_value,
                        dynamicComputeUnitLimit: true,
                        feeAccount: FEE_ACCOUNT,
                    })
                })
            ).json();

            if (swapTx.error) {
                console.log(swapTx);
                return {
                    content: "Failed to swap. Please try again.",
                    success: false,
                    token: coinStats,
                    amount: amountToSellInPercent + "%",
                    includeRetryButton: true,
                };
            }

            const swapTxBuf = Buffer.from(swapTx.swapTransaction!, 'base64');
            const tx: VersionedTransaction = VersionedTransaction.deserialize(swapTxBuf);
            tx.sign([signer]);
            const sig = this.getSignature(tx);
            const serializedTx = Buffer.from(tx.serialize());
            const startTimeTx: number = Date.now();
            const result = await transactionSenderAndConfirmationWaiter({
                connection: conn,
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: tx.message.recentBlockhash,
                    lastValidBlockHeight: swapTx.lastValidBlockHeight!,
                },
            });

            if (!result) {
                return {
                    content: "Failed to swap. Please try again.",
                    success: false,
                    token: coinStats,
                    amount: amountToSellInPercent + "%",
                    includeRetryButton: true,
                };
            }
            if (result.meta?.err) {
                console.log(result.meta?.err);
                return {
                    content: "Failed to swap. Please try again.",
                    success: false,
                    token: coinStats,
                    amount: amountToSellInPercent + "%",
                    includeRetryButton: true,
                };
            }

            const endTimeTx: number = Date.now();
            const functionProcessingTime: number = (endTimeTx - startTimeFunction) / 1000;
            const txProcessingTime: number = (endTimeTx - startTimeTx) / 1000;
            await saveDbTransaction(wallet, "sell", contractAddress, true, functionProcessingTime, txProcessingTime);
            return { content: "Successfully swapped. Transaction ID: " + sig, success: true, token: coinStats };
        } catch (error) {
            console.log(error);
            const endTimeFunction = Date.now();
            const functionProcessingTime: number = (endTimeFunction - startTimeFunction) / 1000;
            await saveDbTransaction(wallet, "sell", contractAddress, false, functionProcessingTime);
            return {
                content: "Failed to swap. Please try again.",
                success: false,
                token: coinStats,
                amount: amountToSellInPercent + "%",
                includeRetryButton: true,
            };
        }
    }

    static async getBalanceOfWalletInDecimal(walletAddress: string): Promise<number | null> {
        if (!this.connection) return null;

        try {
            const publicKey = new PublicKey(walletAddress);
            const balance = await this.connection.getBalance(publicKey, { commitment: "confirmed" });
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            return null;
        }
    }

    static async getBalanceOfWalletInLamports(walletAddress: string): Promise<number | any> {
        if (!this.connection) return null;

        try {
            const publicKey = new PublicKey(walletAddress);
            const balance = await this.connection.getBalance(publicKey, { commitment: "confirmed" });
            return balance;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    static async getAllCoinStatsFromWallet(walletAddress: string, minPositionValue: number): Promise<CoinStats[]> {
        const conn = this.getConnection();
        const filters: GetProgramAccountsFilter[] = [
            { dataSize: 165 }, // size of account (bytes)
            { memcmp: { offset: 32, bytes: walletAddress } }
        ];
        // type of coins is ParsedProgramAccountWrittenOut[]
        const coins: any = await conn.getParsedProgramAccounts(TOKEN_PROGRAM, { filters, commitment: "confirmed" });

        // TODO: make it so priceInfo is only fetched for the coin that will be shown first
        // need system for finding out which coin should be shown first

        const tokenInfos: ParsedTokenInfo[] = coins.map((coin: any) => coin.account.data.parsed.info);
        const contractAddresses: string[] = tokenInfos.map((tokenInfo: ParsedTokenInfo) => tokenInfo.mint);
        const priceInfos: CoinStats[] | null = await this.getCoinPriceStatsAll(contractAddresses);
        if (!priceInfos) return [];
        const currentSolPrice: number | null = await getCurrentSolPrice();

        const allCoins: CoinStats[] = [];
        for (let i = 0; i < priceInfos.length; i++) {
            priceInfos[i].tokenAmount = tokenInfos[i].tokenAmount;
            const coinValueInUsd: number = Number(priceInfos[i].price) * Number(tokenInfos[i].tokenAmount.uiAmount);
            priceInfos[i].value = {
                inUSD: coinValueInUsd.toFixed(2),
                inSOL: currentSolPrice ? (coinValueInUsd / currentSolPrice).toFixed(4) : "0",
            }
            if (Number(priceInfos[i].value!.inUSD) >= minPositionValue) allCoins.push(priceInfos[i]);
        }

        return allCoins;
    }

    static async getCoinStats(contractAddress: string, walletAddress: string): Promise<CoinStats | null> {
        try {
            const conn = this.getConnection();
            const filters: GetProgramAccountsFilter[] = [
                { dataSize: 165 }, // size of account (bytes)
                { memcmp: { offset: 32, bytes: walletAddress } }
            ];
            const coins: any = await conn.getParsedProgramAccounts(TOKEN_PROGRAM, { filters, commitment: "confirmed" });
            const selectedCoin = coins.find((coin: any) => coin.account.data.parsed.info.mint === contractAddress);
            if (!selectedCoin) return null;

            const priceInfo: CoinStats | null = await this.getCoinPriceStats(contractAddress);
            if (!priceInfo) return null;
            const tokenInfo = selectedCoin.account.data.parsed.info;
            priceInfo.tokenAmount = tokenInfo.tokenAmount;
            if (!priceInfo.tokenAmount) return null;
            const currentSolPrice: number | null = await getCurrentSolPrice();
            const coinValueInUsd: number = Number(priceInfo.price) * Number(priceInfo.tokenAmount.uiAmount);
            priceInfo.value = {
                inUSD: coinValueInUsd.toFixed(2),
                inSOL: currentSolPrice ? (coinValueInUsd / currentSolPrice).toFixed(4) : "0",
            }

            return priceInfo;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    static async getAllCoinSymbols(walletAddress: string): Promise<string[]> {
        const conn = this.getConnection();
        const filters: GetProgramAccountsFilter[] = [
            { dataSize: 165 }, // size of account (bytes)
            { memcmp: { offset: 32, bytes: walletAddress } }
        ];
        const coins: any = await conn.getParsedProgramAccounts(TOKEN_PROGRAM, { filters });

        const allCoins: string[] = [];
        for (let i = 0; i < coins.length; i++) {
            const tokenInfo: ParsedTokenInfo = coins[i].account.data.parsed.info;
            allCoins.push(coins[i].account.data.parsed.info.mint);
        }

        return allCoins;
    }

    static async getTokenAccountOfWallet(walletAddress: string, contractAddress: string): Promise<any> {
        try {
            const associatedTokenAddress = await getAssociatedTokenAddress(
                new PublicKey(contractAddress),
                new PublicKey(walletAddress),
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID,
            );
            return associatedTokenAddress;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    static checkIfValidAddress(address: string): boolean {
        try {
            const ca = new PublicKey(address);
            const isValid = PublicKey.isOnCurve(ca.toBuffer()) && PublicKey.isOnCurve(ca.toString());
            return isValid;
        } catch (error) {
            return false;
        }
    }

    static async getCoinPriceStatsAll(contractAddresses: string[]): Promise<CoinStats[] | null> {
        try {
            const requests = contractAddresses.map((contractAddress: string) => {
                return fetch(`https://api.dexscreener.io/latest/dex/tokens/${contractAddress},So11111111111111111111111111111111111111112`);
            });

            const responses = await Promise.all(requests);
            const statsData = responses.map((response: any) => response.json());
            const coinStats = await Promise.all(statsData);
            const stats = coinStats.map((coin: any) => {
                return {
                    ...coin.pairs[0].baseToken,
                    transactions: coin.pairs[0].txns,
                    volume: coin.pairs[0].volume,
                    priceChange: coin.pairs[0].priceChange,
                    price: formatNumber(coin.pairs[0].priceUsd),
                    fdv: formatNumber(coin.pairs[0].fdv),
                }
            });

            return stats;
        } catch (error) {
            return null;
        }
    }

    static async getCoinPriceStats(contractAddress: string): Promise<CoinStats | null> {
        try {
            const pairInfo = await (
                await fetch(`https://api.dexscreener.io/latest/dex/tokens/${contractAddress}`)
            ).json();
            const coinStats: CoinStats = {
                ...pairInfo.pairs[0].baseToken,
                transactions: pairInfo.pairs[0].txns,
                volume: pairInfo.pairs[0].volume,
                priceChange: pairInfo.pairs[0].priceChange,
                price: formatNumber(pairInfo.pairs[0].priceUsd),
                fdv: formatNumber(pairInfo.pairs[0].fdv),
            }

            return coinStats;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    static async getCoinInfo(contractAddress: string): Promise<CoinInfo | null> {
        try {
            const pairInfo = await (
                await fetch(`https://api.dexscreener.io/latest/dex/tokens/${contractAddress},So11111111111111111111111111111111111111112`)
            ).json();
            const coinInfo: CoinInfo = pairInfo.pairs[0].baseToken;
            return coinInfo;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    static async getAllCoinInfos(userId: string): Promise<CoinInfo[]> {
        const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
        if (!wallet) return [];

        const coinStats: CoinStats[] = await this.getAllCoinStatsFromWallet(wallet.wallet_address, wallet.settings.min_position_value);
        const coinInfos: CoinInfo[] = [];
        for (let i = 0; i < coinStats.length; i++) {
            const info: CoinInfo = {
                ...coinStats[i],
            }

            coinInfos.push(info);
        }

        return coinInfos;
    }

    static async getCoinMetadata(contractAddress: string): Promise<CoinMetadata | null> {
        const response: any = await this.connection.getParsedAccountInfo(new PublicKey(contractAddress));
        if (!response.value) return null;
        return response.value.data.parsed.info;
    }

    static getConnection() {
        return this.connection;
    }

    static getSignature(transaction: Transaction | VersionedTransaction): string | null {
        const signature = "signature" in transaction ? transaction.signature : transaction.signatures[0];
        if (!signature) {
            console.log("Missing transaction signature, the transaction was not signed by the fee payer");
            return null;
        }
        return bs58.encode(signature);
    }
}