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
    TransactionInstruction,
} from '@solana/web3.js';
import { Wallet } from '../models/wallet';
import {
    formatNumber,
    getCurrentSolPrice,
    getFeeInPercentFromFeeLevel,
    getKeypairFromEncryptedPKey,
    isNumber,
    saveDbTransaction
} from './util';
import { CoinMetadata } from "../interfaces/coinmetadata";
import { SwapTx } from "../interfaces/swaptx";
import { UIResponse } from "../interfaces/uiresponse";
import {
    BASE_SWAP_FEE,
    FEE_TOKEN_ACCOUNT,
    FEE_ACCOUNT_OWNER,
    FEE_REDUCTION_PERIOD,
    FEE_REDUCTION_WITH_REF_CODE,
    TOKEN_PROGRAM
} from "../config/constants";
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
import {
    ERROR_CODES,
    invalidNumberError,
    decryptError,
    txExpiredError,
    txMetaError,
    unknownError,
    walletNotFoundError,
    insufficientBalanceError,
    tokenAccountNotFoundError,
    destinationTokenAccountError,
    coinstatsNotFoundError,
    invalidAmountError,
    insufficientBalanceErrorRetry,
    coinMetadataError,
    quoteResponseError,
    postSwapTxError,
    txExpiredErrorRetry,
    txMetaErrorRetry,
    unknownErrorRetry,
    userNotFoundError
} from "../config/errors";
import bs58 from "bs58";
import { transactionSenderAndConfirmationWaiter } from "./transaction-sender";
import { QuoteResponse } from "../interfaces/quoteresponse";
import { CAWithAmount } from "../interfaces/cawithamount";
import { User } from "../models/user";

type CoinPriceQuote = {
    contractAddress: string;
    priceInSol: string;
    priceInUsd: string;
}

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
            if (!wallet) return walletNotFoundError(userId);

            const balanceInLamports = await this.getBalanceOfWalletInLamports(wallet.wallet_address);
            const signer: Keypair | null = getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) return decryptError(userId);

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

            if (!result) return txExpiredError(userId);
            if (result.meta?.err) return txMetaError(userId, result.meta?.err);

            return {
                user_id: userId,
                content: `Successfully transferred funds. Transaction ID: ${signature}`,
                success: true,
            };
        } catch (error) {
            return unknownError(userId, error);
        }
    }

    static async transferXSol(userId: any, amount: string, recipientAddress: string): Promise<UIResponse> {
        try {
            const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
            if (!wallet) return walletNotFoundError(userId);
            if (!isNumber(amount)) return invalidNumberError(userId);

            const blockhash = await this.getConnection().getLatestBlockhash("finalized");
            const signer: Keypair | null = getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) return decryptError(userId);

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
                    return insufficientBalanceError(userId);
                }
            } else if (balanceInLamports < (Number(amount) * LAMPORTS_PER_SOL) + estimatedFeeInLamports) {
                return insufficientBalanceError(userId);
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

            if (!result) return txExpiredError(userId);
            if (result.meta?.err) return txMetaError(userId, result.meta?.err);

            return { user_id: userId, content: `Successfully transferred funds. Transaction ID: ${signature}`, success: true };
        } catch (error) {
            return unknownError(userId, error);
        }
    }

    static async sendCoin(userId: any, contractAddress: string, amount: string, destinationAddress: string): Promise<UIResponse> {
        try {
            const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
            if (!wallet) return walletNotFoundError(userId);
            if (!isNumber(amount)) return invalidNumberError(userId);

            const signer: Keypair | null = getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) return decryptError(userId);
            const walletTokenAccount = await this.getTokenAccountOfWallet(wallet.wallet_address, contractAddress);
            if (!walletTokenAccount) return tokenAccountNotFoundError(userId);

            const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
                this.getConnection(),
                signer,
                new PublicKey(contractAddress),
                new PublicKey(destinationAddress),
            );
            if (!destinationTokenAccount) return destinationTokenAccountError(userId);

            const coinStats: CoinStats | null = await this.getCoinStats(contractAddress, wallet.wallet_address);
            if (!coinStats) return coinstatsNotFoundError(userId, contractAddress);

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

            if (!result) return txExpiredError(userId);
            if (result.meta?.err) return txMetaError(userId, result.meta?.err);

            return { user_id: userId, content: `Successfully transferred funds. Transaction ID: ${signature}`, success: true };
        } catch (error) {
            return unknownError(userId, error);
        }
    }

    static async buyCoinViaAPI(userId: string, contractAddress: string, amountToSwap: string): Promise<UIResponse> {
        const startTimeFunction = Date.now();
        let wallet: any;
        let user: any;
        try {
            wallet = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
            user = await User.findOne({ user_id: userId });
        } catch (error) {
            return unknownError(userId, error, contractAddress);
        }
        if (!wallet) return walletNotFoundError(userId, contractAddress);
        if (!user) return userNotFoundError(userId, contractAddress, amountToSwap);
        try {
            const conn = this.getConnection();
            const balanceInLamports = await this.getBalanceOfWalletInLamports(wallet.wallet_address);
            if (typeof balanceInLamports !== "number") {
                return {
                    user_id: userId,
                    content: "Server error. Please try again later",
                    success: false,
                    ca: contractAddress,
                    error: "Failed to get wallet balance",
                };
            }

            if (amountToSwap.includes("buy_button_")) {
                amountToSwap = wallet.settings[amountToSwap as string];
            }

            const txPrio: number = wallet.settings.tx_priority_value;

            if (!isNumber(amountToSwap)) {
                return invalidNumberError(userId, contractAddress);
            }
            if (Number(amountToSwap) <= 0) {
                return invalidAmountError(userId, contractAddress);
            }
            if (balanceInLamports < Number(amountToSwap) * LAMPORTS_PER_SOL + txPrio) {
                return insufficientBalanceErrorRetry(userId, contractAddress, amountToSwap);
            }

            // TODO: get metadata from another source if this one doesn't work
            const coinMetadata: CoinMetadata | null = await this.getCoinMetadata(contractAddress);
            if (!coinMetadata) return coinMetadataError(userId, contractAddress, amountToSwap);
            const signer: Keypair | null = getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) return decryptError(userId, contractAddress);
            const userHasReducedFeesFromRef: boolean = wallet.swap_fee === BASE_SWAP_FEE * (1 - FEE_REDUCTION_WITH_REF_CODE);
            if (userHasReducedFeesFromRef) {
                // reset the reduced swap fees from using a ref code after 1 month
                if (user.referrer!.timestamp! >= user.referrer!.timestamp! + FEE_REDUCTION_PERIOD) {
                    user.swap_fee = BASE_SWAP_FEE;
                    await user.save();
                    await Wallet.updateMany({ user_id: userId }, { swap_fee: BASE_SWAP_FEE });
                    wallet.swap_fee = BASE_SWAP_FEE;
                }
            }
            const amountInLamports: number = Number(amountToSwap) * LAMPORTS_PER_SOL;
            const totalFeesInLamports: number = amountInLamports * (wallet.swap_fee / 100);
            const totalFeesInSol: number = Number(amountToSwap) * (wallet.swap_fee / 100);
            const slippage: number = wallet.settings.buy_slippage * this.BPS_PER_PERCENT;
            let refFeesInLamports: number = 0;
            let refFeesInSol: number = 0;
            if (user.referrer) {
                const feeAmountInPercent: number = getFeeInPercentFromFeeLevel(user.referrer.fee_level);
                refFeesInLamports = totalFeesInLamports * (1 - feeAmountInPercent / 100);
                refFeesInSol = refFeesInLamports / LAMPORTS_PER_SOL;
            }
            const callistoFeesInLamports: number = totalFeesInLamports - refFeesInLamports;
            const callistoFeesInSol: number = callistoFeesInLamports / LAMPORTS_PER_SOL;
            const amountInLamportsMinusFees: number = amountInLamports - totalFeesInLamports;
            const quoteResponse = await (
                await fetch(
                    `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${contractAddress}&amount=${amountInLamportsMinusFees}&slippageBps=${slippage}`
                )
            ).json();
            if (quoteResponse.error) {
                return quoteResponseError(userId, contractAddress, amountToSwap, quoteResponse);
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
                return postSwapTxError(userId, contractAddress, amountToSwap, swapTx);
            }

            const swapTxBuf: Buffer = Buffer.from(swapTx.swapTransaction!, 'base64');
            const tx: VersionedTransaction = VersionedTransaction.deserialize(swapTxBuf);
            const callistoFeeInstruction: TransactionInstruction = SystemProgram.transfer({
                fromPubkey: new PublicKey(wallet.wallet_address),
                toPubkey: new PublicKey(FEE_ACCOUNT_OWNER),
                lamports: callistoFeesInLamports,
            });
            let refFeeInstruction: TransactionInstruction | null = null;
            if (refFeesInLamports > 0) {
                refFeeInstruction = SystemProgram.transfer({
                    fromPubkey: new PublicKey(wallet.wallet_address),
                    toPubkey: new PublicKey(user.referrer.referrer_wallet),
                    lamports: refFeesInLamports,
                });
            }
            // TODO: handle error from Promise.all
            const addressLookupTableAccounts = await Promise.all(
                tx.message.addressTableLookups.map(async (lookup: MessageAddressTableLookup) => {
                    return new AddressLookupTableAccount({
                        key: lookup.accountKey,
                        state: AddressLookupTableAccount.deserialize(await conn.getAccountInfo(lookup.accountKey).then((res: any) => res.data)),
                    });
                })
            );
            const txMessage = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: addressLookupTableAccounts });
            txMessage.instructions.push(callistoFeeInstruction);
            if (refFeesInLamports > 0 && refFeeInstruction) {
                txMessage.instructions.push(refFeeInstruction)
            }
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

            if (!result) return txExpiredErrorRetry(userId, contractAddress, amountToSwap);
            if (result.meta?.err) return txMetaErrorRetry(userId, contractAddress, amountToSwap, result.meta?.err);

            const endTimeTx: number = Date.now();
            const txProcessingTime: number = (endTimeTx - startTimeTx) / 1000;
            const currentSolPrice = await getCurrentSolPrice();
            const functionProcessingTime: number = (endTimeTx - startTimeFunction) / 1000;
            await saveDbTransaction({
                user_id: userId,
                wallet_address: wallet.wallet_address,
                buy_or_sell: "buy",
                token_address: contractAddress,
                success: true,
                processing_time_function: functionProcessingTime,
                processing_time_tx: txProcessingTime,
                token_amount: amountInLamports,
                usd_volume: currentSolPrice ? currentSolPrice * Number(amountToSwap) : undefined,
                total_fees: totalFeesInSol,
                callisto_fees: callistoFeesInSol,
                ref_fees: refFeesInSol,
            });
            return { user_id: userId, content: "Successfully swapped. Transaction ID: " + sig, success: true, ca: contractAddress };
        } catch (error) {
            const endTimeFunction = Date.now();
            const functionProcessingTime: number = (endTimeFunction - startTimeFunction) / 1000;
            await saveDbTransaction({
                user_id: userId,
                wallet_address: wallet.wallet_address,
                buy_or_sell: "buy",
                token_address: contractAddress,
                success: false,
                processing_time_function: functionProcessingTime,
                error,
            });
            return unknownErrorRetry(userId, contractAddress, amountToSwap, error);
        }
    }

    static async sellCoinViaAPI(userId: string, contractAddress: string, amountToSellInPercent: string): Promise<UIResponse> {
        const startTimeFunction = Date.now();
        const conn = this.getConnection();
        const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
        if (!wallet) return walletNotFoundError(userId, contractAddress);
        const user = await User.findOne({ user_id: userId });
        if (!user) {
            return {
                user_id: userId,
                content: ERROR_CODES["0011"].message,
                success: false,
                error: ERROR_CODES["0011"].context
            }
        }

        if (amountToSellInPercent.includes("sell_button_")) {
            amountToSellInPercent = wallet.settings[amountToSellInPercent as string];
        }

        if (!isNumber(amountToSellInPercent)) {
            return invalidNumberError(userId, contractAddress);
        }
        if (Number(amountToSellInPercent) < 0.01 || Number(amountToSellInPercent) > 100) {
            return invalidAmountError(userId, contractAddress);
        }

        const coinStats: CoinStats | null = await this.getCoinStats(contractAddress, wallet.wallet_address);
        if (!coinStats) {
            return {
                user_id: userId,
                content: ERROR_CODES["0012"].message,
                success: false,
                amount: amountToSellInPercent + "%",
                ca: contractAddress,
                includeRetryButton: true,
                error: "Failed to get coin stats",
            };
        }
        if (Number(coinStats.tokenAmount!.amount) == 0) {
            return {
                user_id: userId,
                content: "Insufficient holdings. Please check your balance and try again.",
                success: false,
                token: coinStats,
                amount: amountToSellInPercent + "%",
                includeRetryButton: true,
                error: "Insufficient wallet balance."
            };
        }

        try {
            const signer: Keypair | null = getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) {
                return {
                    user_id: userId,
                    content: ERROR_CODES["0010"].message,
                    success: false,
                    token: coinStats,
                    error: ERROR_CODES["0010"].context
                };
            }
            const userHasReducedFeesFromRef: boolean = wallet.swap_fee === BASE_SWAP_FEE * (1 - FEE_REDUCTION_WITH_REF_CODE);
            if (userHasReducedFeesFromRef) {
                // reset the reduced swap fees from using a ref code after 1 month
                if (user.referrer!.timestamp! >= user.referrer!.timestamp! + FEE_REDUCTION_PERIOD) {
                    user.swap_fee = BASE_SWAP_FEE;
                    await user.save();
                    await Wallet.updateMany({ user_id: userId }, { swap_fee: BASE_SWAP_FEE });
                    wallet.swap_fee = BASE_SWAP_FEE;
                }
            }
            const amountInLamports: number = (Number(coinStats.tokenAmount!.amount) * (Number(amountToSellInPercent) / 100));
            const slippage: number = wallet.settings.sell_slippage * this.BPS_PER_PERCENT;
            const feeAmountInBPS: number = wallet.swap_fee * this.BPS_PER_PERCENT;
            const quoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${contractAddress}&outputMint=So11111111111111111111111111111111111111112&amount=${amountInLamports}&slippageBps=${slippage}&platformFeeBps=${feeAmountInBPS}`)
            ).json();

            if (quoteResponse.error) {
                return {
                    user_id: userId,
                    content: "Failed to swap. Please try again.",
                    success: false,
                    token: coinStats,
                    amount: amountToSellInPercent + "%",
                    includeRetryButton: true,
                    error: "Quote response error: " + quoteResponse,
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
                        feeAccount: FEE_TOKEN_ACCOUNT,
                    })
                })
            ).json();

            if (swapTx.error) {
                return {
                    user_id: userId,
                    content: "Failed to swap. Please try again.",
                    success: false,
                    token: coinStats,
                    amount: amountToSellInPercent + "%",
                    includeRetryButton: true,
                    error: "Post swap tx error: " + swapTx
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
                    user_id: userId,
                    content: "Failed to swap. Please try again.",
                    success: false,
                    token: coinStats,
                    amount: amountToSellInPercent + "%",
                    includeRetryButton: true,
                    error: "Transaction expired",
                };
            }
            if (result.meta?.err) {
                return {
                    user_id: userId,
                    content: "Failed to swap. Please try again.",
                    success: false,
                    token: coinStats,
                    amount: amountToSellInPercent + "%",
                    includeRetryButton: true,
                    error: "Transaction meta error: " + result.meta?.err,
                };
            }

            const endTimeTx: number = Date.now();
            const txProcessingTime: number = (endTimeTx - startTimeTx) / 1000;
            //const currentSolPrice = await getCurrentSolPrice();
            //const minReceivedValueInSol = Number(quoteResponse.otherAmountThreshold) / LAMPORTS_PER_SOL;
            //const usdVolume = currentSolPrice ? currentSolPrice * minReceivedValueInSol : undefined;
            const functionProcessingTime: number = (endTimeTx - startTimeFunction) / 1000;
            await saveDbTransaction({
                user_id: userId,
                wallet_address: wallet.wallet_address,
                buy_or_sell: "sell",
                token_address: contractAddress,
                success: true,
                processing_time_function: functionProcessingTime,
                processing_time_tx: txProcessingTime,
                token_amount: amountInLamports,
                //usd_volume: usdVolume,
            });
            return { user_id: userId, content: "Successfully swapped. Transaction ID: " + sig, success: true, token: coinStats };
        } catch (error) {
            const endTimeFunction = Date.now();
            const functionProcessingTime: number = (endTimeFunction - startTimeFunction) / 1000;
            await saveDbTransaction({
                user_id: userId,
                wallet_address: wallet.wallet_address,
                buy_or_sell: "sell",
                token_address: contractAddress,
                success: false,
                processing_time_function: functionProcessingTime,
                error
            });
            return {
                user_id: userId,
                content: "Failed to swap. Please try again.",
                success: false,
                token: coinStats,
                amount: amountToSellInPercent + "%",
                includeRetryButton: true,
                error,
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

        // only get tokenInfos where the amount is higher than 0
        const tokenInfos: ParsedTokenInfo[] = (coins.map((coin: any) => coin.account.data.parsed.info)).filter((coinStats: any) => coinStats.tokenAmount.uiAmount !== 0);
        const contractAddresses: string[] = tokenInfos.map((tokenInfo: ParsedTokenInfo) => tokenInfo.mint);
        const caObjects: CAWithAmount[] = contractAddresses.map((ca: string, index: number) => {
            return { contractAddress: ca, amount: tokenInfos[index].tokenAmount.amount }
        });
        // get coin infos and coin prices
        const results = await Promise.all([this.getCoinPriceStatsAll(contractAddresses), this.getCoinValuesOfHoldings(caObjects)]);
        const coinInfos: CoinStats[] | null = results[0];
        if (!coinInfos) return [];
        const priceInfos: CoinPriceQuote[] | null = results[1];
        const allCoins: CoinStats[] = [];

        // this will iterate through each coin in users wallet with an amount of more than 0
        // it assigns the coin amount and assigns the up-to-date price (or use fallback price which might be a few minutes old in case of an error)
        coinInfos.forEach(async (coinInfo: CoinStats, index: number) => {
            const correspondingTokenInfo: ParsedTokenInfo | undefined = tokenInfos.find((tokenInfo: ParsedTokenInfo) => tokenInfo.mint === coinInfo.address);
            if (!correspondingTokenInfo) return null;
            coinInfo.tokenAmount = correspondingTokenInfo.tokenAmount;
            const priceInfo: CoinPriceQuote | undefined = priceInfos?.find((priceQuote: CoinPriceQuote) => priceQuote.contractAddress === coinInfo.address);
            const coinValueInUsd: number = Number(coinInfo.price) * Number(correspondingTokenInfo.tokenAmount.uiAmount);
            if (!priceInfo) {
                // in case quote response returned an error
                const currentSolPrice = await getCurrentSolPrice();
                coinInfo.value = {
                    inUSD: coinValueInUsd.toFixed(2),
                    inSOL: currentSolPrice ? (coinValueInUsd / currentSolPrice).toFixed(4) : "0",
                }
            } else {
                coinInfo.value = {
                    inUSD: priceInfo.priceInUsd ? priceInfo.priceInUsd : coinValueInUsd.toFixed(2), // use fallback usd price in case quote for sol price returned an error
                    inSOL: priceInfo.priceInSol,
                }
            }

            // only show coins that have a higher price than the minPositionValue in wallet settings
            if (Number(coinInfo.value!.inUSD) >= minPositionValue) allCoins.push(coinInfo);
        });

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
            const coinInfos = contractAddresses.map((contractAddress: string) => {
                return fetch(`https://api.dexscreener.io/latest/dex/tokens/${contractAddress}`);
            });

            const responses = await Promise.all(coinInfos);
            const statsData = responses.map((response: any) => response.json());
            const coinStats = await Promise.all(statsData);
            const stats = coinStats.map((coin: any) => {
                return {
                    ...coin.pairs[0].baseToken,
                    transactions: coin.pairs[0].txns,
                    volume: coin.pairs[0].volume,
                    priceChange: coin.pairs[0].priceChange,
                    price: formatNumber(coin.pairs[0].priceUsd), // this is not the most up-to-date price, but will be added here as a fallback price
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

    static async getCoinValueOfHolding(caWithAmount: CAWithAmount): Promise<CoinPriceQuote | null> {
        try {
            const quoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${caWithAmount.contractAddress}&outputMint=So11111111111111111111111111111111111111112&amount=${caWithAmount.amount}`)
            ).json();
            const priceInSol = Number(quoteResponse.outAmount) / LAMPORTS_PER_SOL;
            const currentSolPrice: number | null = await getCurrentSolPrice();

            return {
                contractAddress: caWithAmount.contractAddress,
                priceInSol: priceInSol.toFixed(4),
                priceInUsd: currentSolPrice ? (priceInSol * currentSolPrice).toFixed(2) : "0",
            };
        } catch (error) {
            console.log(error);
            // TODO: store error in db and remove log
            return null;
        }
    }

    static async getCoinValuesOfHoldings(casWithAmount: CAWithAmount[]): Promise<CoinPriceQuote[] | null> {
        try {
            const currentSolPrice: number | null = await getCurrentSolPrice();
            const quotes = casWithAmount.map((caObj: CAWithAmount) => {
                return fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${caObj.contractAddress}&outputMint=So11111111111111111111111111111111111111112&amount=${caObj.amount}`);
            });
            const responses = await Promise.all(quotes);
            const quoteResponsesJson = responses.map((response: any) => response.json());
            const quoteResponses = await Promise.all(quoteResponsesJson);
            return quoteResponses.map((quote: QuoteResponse) => {
                const priceInSol = Number(quote.outAmount) / LAMPORTS_PER_SOL;
                return {
                    contractAddress: quote.inputMint,
                    priceInSol: priceInSol.toFixed(4),
                    priceInUsd: currentSolPrice ? (currentSolPrice * priceInSol).toFixed(2) : "0",
                }
            });
        } catch (error) {
            console.log(error);
            // TODO: store error in db and remove log
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