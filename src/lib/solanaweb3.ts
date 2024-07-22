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
    VersionedTransactionResponse,
} from '@solana/web3.js';
import { Wallet } from '../models/wallet';
import {
    formatNumber,
    getFeeInPercentFromFeeLevel,
    getKeypairFromEncryptedPKey,
    isNumber,
    saveError,
    successResponse
} from './util';
import { CoinMetadata } from "../interfaces/coinmetadata";
import { SwapTx } from "../interfaces/swaptx";
import {
    BASE_SWAP_FEE,
    FEE_TOKEN_ACCOUNT,
    FEE_ACCOUNT_OWNER,
    FEE_REDUCTION_PERIOD,
    FEE_REDUCTION_WITH_REF_CODE,
    TOKEN_PROGRAM,
    CALLISTO_FEE_WALLET
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
    quoteResponseError,
    postSwapTxError,
    userNotFoundError,
    walletBalanceError,
} from "../config/errors";
import bs58 from "bs58";
import { transactionSenderAndConfirmationWaiter } from "./transaction-sender";
import { QuoteResponse } from "../interfaces/quoteresponse";
import { CAWithAmount } from "../interfaces/cawithamount";
import { User } from "../models/user";
import { TxResponse } from "../interfaces/tx-response";
import { CaAmount } from "../interfaces/caamount";
import { PROMO_REF_MAPPING } from "../config/promo_ref_mapping";

type CoinPriceQuote = {
    contract_address: string;
    priceInSol: string;
    priceInUsd: string;
}

export class SolanaWeb3 {
    /*static jitoConn: Connection = new Connection("https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/transactions", {
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
    static RENT_FEE: number = 2000000;
    static GAS_FEE_FOR_SOL_TRANSFER: number = 5000;
    static INTERVAL_FOR_TXS_TO_SEND: number = 100;

    static createNewWallet() {
        const solanaWallet = Keypair.generate();
        return solanaWallet;
    }

    static async transferAllSol(user_id: string, recipientAddress: string): Promise<TxResponse> {
        let wallet: any;
        const txResponse: TxResponse = {
            user_id,
            tx_type: "transfer_all",
        }
        try {
            wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
            if (!wallet) return walletNotFoundError(txResponse);
        } catch (error) {
            return unknownError({ ...txResponse, error });
        }
        const wallet_address: string = wallet.wallet_address;
        txResponse.wallet_address = wallet_address;

        try {
            const balanceInLamports = await this.getBalanceOfWalletInLamports(wallet_address);
            if (balanceInLamports === 0) return insufficientBalanceError(txResponse);
            if (!balanceInLamports) return walletBalanceError(txResponse);
            const signer: Keypair | null = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) return decryptError(txResponse);

            const maxSolAmountToSend = balanceInLamports - this.GAS_FEE_FOR_SOL_TRANSFER;
            txResponse.token_amount = maxSolAmountToSend;
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
            txResponse.tx_signature = signature;
            const result = await transactionSenderAndConfirmationWaiter({
                connection: this.getConnection(),
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight,
                },
            });

            if (!result) return txExpiredError(txResponse);
            if (result.meta?.err) return txMetaError({ ...txResponse, error: result.meta?.err });

            txResponse.success = true;
            txResponse.response = `Successfully transferred funds. Transaction ID: ${signature}`;
            return successResponse(txResponse);
        } catch (error) {
            return unknownError({ ...txResponse, error });
        }
    }

    static async transferXSol(user_id: string, amount: string, recipientAddress: string): Promise<TxResponse> {
        let wallet: any;
        const tx_type: string = "transfer_x";
        const txResponse: TxResponse = {
            user_id,
            tx_type,
        }
        try {
            wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
            if (!wallet) return walletNotFoundError(txResponse);
        } catch (error) {
            return unknownError({ ...txResponse, error });
        }
        const wallet_address: string = wallet.wallet_address;
        txResponse.wallet_address = wallet_address;

        try {
            if (!isNumber(amount)) return invalidNumberError(txResponse);
            const blockhash = await this.getConnection().getLatestBlockhash("finalized");
            const signer: Keypair | null = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) return decryptError(txResponse);
            const amountToSend: number = Number(amount) * LAMPORTS_PER_SOL;
            txResponse.token_amount = amountToSend;

            const tx: Transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: signer.publicKey,
                    toPubkey: new PublicKey(recipientAddress),
                    lamports: amountToSend,
                })
            );
            tx.feePayer = signer.publicKey;
            tx.recentBlockhash = blockhash.blockhash;

            // check if the user has enough balance to transfer the amount
            const estimatedFeeInLamports = await tx.getEstimatedFee(this.getConnection());
            const balanceInLamports = await this.getBalanceOfWalletInLamports(wallet_address);
            if (balanceInLamports === 0) return insufficientBalanceError(txResponse);
            if (!balanceInLamports) return walletBalanceError(txResponse);
            if (!estimatedFeeInLamports) {
                // get default fee if the estimated fee is not available
                if (balanceInLamports < (Number(amount) * LAMPORTS_PER_SOL) + this.GAS_FEE_FOR_SOL_TRANSFER) {
                    return insufficientBalanceError(txResponse);
                }
            } else if (balanceInLamports < (Number(amount) * LAMPORTS_PER_SOL) + estimatedFeeInLamports) {
                return insufficientBalanceError(txResponse);
            }

            tx.sign(signer);
            const serializedTx = Buffer.from(tx.serialize());
            const signature = this.getSignature(tx);
            txResponse.tx_signature = signature;
            const result = await transactionSenderAndConfirmationWaiter({
                connection: this.getConnection(),
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight,
                },
            });

            if (!result) return txExpiredError(txResponse);
            if (result.meta?.err) return txMetaError({ ...txResponse, error: result.meta?.err });

            txResponse.success = true;
            txResponse.response = `Successfully transferred funds. Transaction ID: ${signature}`;
            return successResponse(txResponse);
        } catch (error) {
            return unknownError({ ...txResponse, error });
        }
    }

    static async sendCoin(user_id: string, contract_address: string, amount: string, destinationAddress: string): Promise<TxResponse> {
        const tx_type: string = "transfer_token";
        let wallet: any;
        const txResponse: TxResponse = {
            user_id,
            contract_address,
            tx_type,
        }
        try {
            wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
            if (!wallet) return walletNotFoundError(txResponse);
        } catch (error) {
            return unknownError({ ...txResponse, error });
        }
        const wallet_address: string = wallet.wallet_address;
        txResponse.wallet_address = wallet_address;

        try {
            if (!isNumber(amount)) return invalidNumberError(txResponse);

            const signer: Keypair | null = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) return decryptError({ user_id, tx_type });
            const walletTokenAccount = await this.getTokenAccountOfWallet(wallet_address, contract_address);
            if (!walletTokenAccount) return tokenAccountNotFoundError(txResponse);

            const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
                this.getConnection(),
                signer,
                new PublicKey(contract_address),
                new PublicKey(destinationAddress),
            );
            if (!destinationTokenAccount) return destinationTokenAccountError(txResponse);

            const coinStats: CoinStats | null = await this.getCoinStats(contract_address, wallet_address);
            if (!coinStats) return coinstatsNotFoundError(txResponse);

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
            txResponse.tx_signature = signature;
            const result = await transactionSenderAndConfirmationWaiter({
                connection: this.getConnection(),
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight,
                },
            });

            if (!result) return txExpiredError(txResponse);
            if (result.meta?.err) return txMetaError({ ...txResponse, error: result.meta?.err });

            txResponse.success = true;
            txResponse.response = `Successfully transferred funds. Transaction ID: ${signature}`;
            return successResponse(txResponse);
        } catch (error) {
            return unknownError({ ...txResponse, error });
        }
    }

    static async buyCoinViaAPI(user_id: string, contract_address: string, amountToSwap: string): Promise<TxResponse> {
        const startTimeFunction = Date.now();
        const tx_type: string = "swap_buy";
        const txResponse: TxResponse = {
            user_id,
            tx_type,
            contract_address,
            token_amount: Number(amountToSwap) * LAMPORTS_PER_SOL,
        };
        let wallet: any;
        let user: any;
        try {
            wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
            user = await User.findOne({ user_id });
        } catch (error) {
            return unknownError({ ...txResponse, error });
        }
        if (!wallet) return walletNotFoundError(txResponse);
        const wallet_address: string = wallet.wallet_address;
        txResponse.wallet_address = wallet_address;
        if (!user) return userNotFoundError(txResponse);

        try {
            const conn = this.getConnection();
            const balanceInLamports = await this.getBalanceOfWalletInLamports(wallet_address);
            if (balanceInLamports === 0) return insufficientBalanceError(txResponse);
            if (!balanceInLamports) return walletBalanceError(txResponse);

            if (amountToSwap.includes("buy_button_")) {
                amountToSwap = wallet.settings[amountToSwap as string];
            }

            const txPrio: number = wallet.settings.tx_priority_value;
            if (!isNumber(amountToSwap)) return invalidNumberError(txResponse);
            if (Number(amountToSwap) <= 0) return invalidAmountError(txResponse);
            if (balanceInLamports < Number(amountToSwap) * LAMPORTS_PER_SOL + txPrio) {
                return insufficientBalanceError({ ...txResponse, include_retry_button: true });
            }

            const signer: Keypair | null = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) return decryptError(txResponse);
            const userHasReducedFeesFromRef: boolean = wallet.swap_fee === BASE_SWAP_FEE * (1 - FEE_REDUCTION_WITH_REF_CODE);
            if (userHasReducedFeesFromRef) {
                // reset the reduced swap fees from using a ref code after 1 month
                if (user.referral!.timestamp! >= user.referral!.timestamp! + FEE_REDUCTION_PERIOD) {
                    user.swap_fee = BASE_SWAP_FEE;
                    wallet.swap_fee = BASE_SWAP_FEE;
                    await user.save();
                    await Wallet.updateMany({ user_id: user_id }, { swap_fee: BASE_SWAP_FEE });
                }
            }
            const amountInLamports: number = Number(amountToSwap) * LAMPORTS_PER_SOL;
            const totalFeesInLamports: number = Math.floor(amountInLamports * (wallet.swap_fee / 100));
            const slippage: number = wallet.settings.buy_slippage * this.BPS_PER_PERCENT;
            let refFeesInLamports: number = 0;
            if (user.referral) {
                // calculate how much of the fee will be sent to the referrer
                const referrer = await User.findOne({ user_id: user.referral.referrer_user_id });
                if (referrer) {
                    let feeAmountInPercent: number = 0;
                    const promoLevel: string = user.referral.promo_level;
                    if (promoLevel) {
                        feeAmountInPercent = PROMO_REF_MAPPING[promoLevel as keyof typeof PROMO_REF_MAPPING].getPercent(user.referral.number_of_referral);
                    } else {
                        feeAmountInPercent = getFeeInPercentFromFeeLevel(user.referral.fee_level);
                    }
                    refFeesInLamports = Math.floor(totalFeesInLamports * (feeAmountInPercent / 100));
                    txResponse.ref_fee = refFeesInLamports;
                    referrer.unclaimed_ref_fees += refFeesInLamports;
                    // TODO: error handling
                    // TODO: move referrer.save() to after interaction.editReply
                    await referrer.save();
                }
            }
            const callistoFeesInLamports: number = totalFeesInLamports - refFeesInLamports;
            const amountInLamportsMinusFees: number = amountInLamports - totalFeesInLamports;
            txResponse.total_fee = totalFeesInLamports;
            txResponse.callisto_fee = callistoFeesInLamports;
            const quoteResponse = await (
                await fetch(
                    `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${contract_address}&amount=${amountInLamportsMinusFees}&slippageBps=${slippage}`
                )
            ).json();
            if (quoteResponse.error) return quoteResponseError({ ...txResponse, error: quoteResponse });

            const swapTx: SwapTx = await (
                await fetch('https://quote-api.jup.ag/v6/swap', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: wallet_address,
                        wrapAndUnwrapSol: true,
                        prioritizationFeeLamports: wallet.settings.tx_priority_value,
                        dynamicComputeUnitLimit: true,
                    })
                })
            ).json();
            if (swapTx.error) return postSwapTxError({ ...txResponse, error: swapTx });

            const swapTxBuf: Buffer = Buffer.from(swapTx.swapTransaction!, 'base64');
            const tx: VersionedTransaction = VersionedTransaction.deserialize(swapTxBuf);
            const callistoFeeInstruction: TransactionInstruction = SystemProgram.transfer({
                fromPubkey: new PublicKey(wallet_address),
                toPubkey: new PublicKey(FEE_ACCOUNT_OWNER),
                lamports: totalFeesInLamports,
            });

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
            tx.message = txMessage.compileToV0Message(addressLookupTableAccounts);
            tx.sign([signer]);
            const signature: string | undefined = this.getSignature(tx);
            txResponse.tx_signature = signature;
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

            const endTimeTx: number = Date.now();
            const txProcessingTime: number = (endTimeTx - startTimeTx) / 1000;
            const functionProcessingTime: number = (endTimeTx - startTimeFunction) / 1000;
            txResponse.processing_time_function = functionProcessingTime;
            txResponse.processing_time_tx = txProcessingTime;
            if (!result) return txExpiredError({ ...txResponse, include_retry_button: true });
            if (result.meta?.err) return txMetaError({ ...txResponse, error: result.meta?.err, include_retry_button: true });

            txResponse.success = true;
            txResponse.response = "Successfully swapped. Transaction ID: " + signature;
            return successResponse(txResponse);
        } catch (error) {
            const endTimeFunction: number = Date.now();
            const functionProcessingTime: number = (endTimeFunction - startTimeFunction) / 1000;
            txResponse.processing_time_function = functionProcessingTime;
            txResponse.error = `buyCoinViaAPI unknown error: ${error}`;
            return unknownError(txResponse);
        }
    }

    static async sellCoinViaAPI(user_id: string, contract_address: string, amountToSellInPercentString: string): Promise<TxResponse> {
        const startTimeFunction: number = Date.now();
        const conn: Connection = this.getConnection();
        const tx_type: string = "swap_sell";
        const txResponse: TxResponse = {
            user_id,
            tx_type,
            contract_address,
        };
        let wallet: any;
        let user: any;
        try {
            wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
            if (!wallet) return walletNotFoundError(txResponse);
            user = await User.findOne({ user_id });
            if (!user) return userNotFoundError(txResponse);
        } catch (error) {
            return unknownError({ ...txResponse, error });
        }
        const wallet_address: string = wallet.wallet_address;
        txResponse.wallet_address = wallet_address;

        if (amountToSellInPercentString.includes("sell_button_")) {
            amountToSellInPercentString = wallet.settings[amountToSellInPercentString as string];
        }
        if (!isNumber(amountToSellInPercentString)) return invalidNumberError(txResponse);

        const amountToSellInPercent: number = Number(amountToSellInPercentString);
        if (amountToSellInPercent < 0.01 || amountToSellInPercent > 100) return invalidAmountError(txResponse);
        txResponse.sell_amount = amountToSellInPercent;

        const coinStats: CoinStats | null = await this.getCoinStats(contract_address, wallet_address);
        if (!coinStats) return coinstatsNotFoundError({ ...txResponse, include_retry_button: true });
        txResponse.token_stats = coinStats;
        if (Number(coinStats.tokenAmount!.amount) == 0) return insufficientBalanceError({ ...txResponse, include_retry_button: true });

        try {
            const signer: Keypair | null = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
            if (!signer) return decryptError(txResponse);
            const userHasReducedFeesFromRef: boolean = wallet.swap_fee === BASE_SWAP_FEE * (1 - FEE_REDUCTION_WITH_REF_CODE);
            if (userHasReducedFeesFromRef) {
                // reset the reduced swap fees from using a ref code after 1 month
                if (user.referral!.timestamp! >= user.referral!.timestamp! + FEE_REDUCTION_PERIOD) {
                    user.swap_fee = BASE_SWAP_FEE;
                    await user.save();
                    await Wallet.updateMany({ user_id: user_id }, { swap_fee: BASE_SWAP_FEE });
                    wallet.swap_fee = BASE_SWAP_FEE;
                }
            }
            const amountInLamports: number = Math.floor((Number(coinStats.tokenAmount!.amount) * (amountToSellInPercent / 100)));
            const slippage: number = wallet.settings.sell_slippage * this.BPS_PER_PERCENT;
            const feeAmountInBPS: number = Math.ceil(wallet.swap_fee * this.BPS_PER_PERCENT);
            const quoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${contract_address}&outputMint=So11111111111111111111111111111111111111112&amount=${amountInLamports}&slippageBps=${slippage}&platformFeeBps=${feeAmountInBPS}`)
            ).json();

            if (quoteResponse.error) return quoteResponseError({ ...txResponse, error: quoteResponse });

            const swapTx: SwapTx = await (
                await fetch('https://quote-api.jup.ag/v6/swap', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: wallet_address,
                        wrapAndUnwrapSol: true,
                        prioritizationFeeLamports: wallet.settings.tx_priority_value,
                        dynamicComputeUnitLimit: true,
                        feeAccount: FEE_TOKEN_ACCOUNT,
                    })
                })
            ).json();

            if (swapTx.error) return postSwapTxError({ ...txResponse, error: swapTx });

            const swapTxBuf: Buffer = Buffer.from(swapTx.swapTransaction!, 'base64');
            const tx: VersionedTransaction = VersionedTransaction.deserialize(swapTxBuf);
            tx.sign([signer]);
            const signature: string | undefined = this.getSignature(tx);
            txResponse.tx_signature = signature;
            const serializedTx = Buffer.from(tx.serialize());
            const startTimeTx: number = Date.now();
            const result: VersionedTransactionResponse | null = await transactionSenderAndConfirmationWaiter({
                connection: conn,
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: tx.message.recentBlockhash,
                    lastValidBlockHeight: swapTx.lastValidBlockHeight!,
                },
            });

            const endTimeTx: number = Date.now();
            const txProcessingTime: number = (endTimeTx - startTimeTx) / 1000;
            const functionProcessingTime: number = (endTimeTx - startTimeFunction) / 1000;
            txResponse.processing_time_function = functionProcessingTime;
            txResponse.processing_time_tx = txProcessingTime;
            if (!result) return txExpiredError({ ...txResponse, include_retry_button: true });
            if (result.meta?.err) return txMetaError({ ...txResponse, error: result.meta?.err, include_retry_button: true });

            txResponse.success = true;
            txResponse.referral = user.referral;
            txResponse.response = "Successfully swapped. Transaction ID: " + signature;
            if (wallet.swap_fee === 0) txResponse.total_fee = -1;
            return successResponse(txResponse);
        } catch (error) {
            const endTimeFunction = Date.now();
            const functionProcessingTime: number = (endTimeFunction - startTimeFunction) / 1000;
            txResponse.processing_time_function = functionProcessingTime;
            txResponse.error = `sellCoinViaAPI unknown error: ${error}`;
            return unknownError(txResponse);
        }
    }

    // amount in lamports
    static async payRefFees(user_id: string, amount: number): Promise<TxResponse> {
        const tx_type: string = "transfer_ref_fee";
        const txResponse: TxResponse = {
            user_id,
            tx_type,
        };
        let amountToPayInLamports: number = amount - this.GAS_FEE_FOR_SOL_TRANSFER;

        try {
            // TODO: ref fees should sit in another wallet, and not the main calli fee wallet
            // maybe create a script which transfers ref fees every 24h to it?

            const signer: Keypair | null = Keypair.fromSecretKey(bs58.decode(String(process.env.CALLISTO_FEE_WALLET_PKEY)));
            if (!signer) return decryptError(txResponse);
            const wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
            if (!wallet) return walletNotFoundError(txResponse);
            const wallet_address: string = wallet.wallet_address;
            txResponse.wallet_address = wallet_address;
            // callisto fee wallet balance
            const balanceInLamportsFeeWallet = await this.getBalanceOfWalletInLamports(CALLISTO_FEE_WALLET);
            if (balanceInLamportsFeeWallet === 0) return unknownError({ ...txResponse, error: "Callisto fee wallet balance is 0." });
            if (!balanceInLamportsFeeWallet) return walletBalanceError(txResponse);
            if (balanceInLamportsFeeWallet < amount) {
                return unknownError({ ...txResponse, error: "Callisto fee wallet doesn't have enough SOL to pay ref fees." });
            }
            const balanceInLamportsUser = await this.getBalanceOfWalletInLamports(wallet.wallet_address);
            if (balanceInLamportsUser === 0) {
                amountToPayInLamports -= this.RENT_FEE;
            }
            txResponse.token_amount = amountToPayInLamports;

            if (amountToPayInLamports < 0) {
                txResponse.response = "You don't have enough fees collected yet to claim them. Min amount is 0.0021 SOL.";
                txResponse.error = "You don't have enough fees collected yet to claim them.";
                txResponse.success = false;
                return successResponse(txResponse);
            }

            const blockhash = await this.getConnection().getLatestBlockhash("finalized");
            const tx: Transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: signer.publicKey,
                    toPubkey: new PublicKey(wallet_address),
                    lamports: amountToPayInLamports,
                })
            );
            tx.feePayer = signer.publicKey;
            tx.recentBlockhash = blockhash.blockhash;

            tx.sign(signer);
            const serializedTx = Buffer.from(tx.serialize());
            const signature = this.getSignature(tx);
            txResponse.tx_signature = signature;
            const result = await transactionSenderAndConfirmationWaiter({
                connection: this.getConnection(),
                serializedTransaction: serializedTx,
                blockhashWithExpiryBlockHeight: {
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight,
                },
            });

            if (!result) return txExpiredError(txResponse);
            if (result.meta?.err) return txMetaError({ ...txResponse, error: result.meta?.err });

            txResponse.success = true;
            txResponse.response = `Claim request received. Your fees will arrive soon. Transaction ID: ${signature}`;
            return successResponse(txResponse);
        } catch (error) {
            return unknownError({ ...txResponse, error });
        }
    }

    static async getBalanceOfWalletInDecimal(wallet_address: string): Promise<number | null> {
        if (!this.connection) return null;

        try {
            const publicKey = new PublicKey(wallet_address);
            const balance = await this.connection.getBalance(publicKey, { commitment: "confirmed" });
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            await saveError({ wallet_address, function_name: "getBalanceOfWalletInDecimal", error });
            return null;
        }
    }

    static async getBalanceOfWalletInLamports(wallet_address: string): Promise<number | null> {
        if (!this.connection) return null;

        try {
            const publicKey = new PublicKey(wallet_address);
            const balance = await this.connection.getBalance(publicKey, { commitment: "confirmed" });
            return balance;
        } catch (error) {
            await saveError({ wallet_address, function_name: "getBalanceOfWalletInLamports", error });
            return null;
        }
    }

    static async getAllCoinStatsFromWallet(wallet_address: string, minPositionValue: number): Promise<CoinStats[] | null> {
        try {
            const conn = this.getConnection();
            const filters: GetProgramAccountsFilter[] = [
                { dataSize: 165 }, // size of account (bytes)
                { memcmp: { offset: 32, bytes: wallet_address } }
            ];
            // type of coins is ParsedProgramAccountWrittenOut[]
            const coins: any = await conn.getParsedProgramAccounts(TOKEN_PROGRAM, { filters, commitment: "confirmed" });

            // TODO: make it so priceInfo is only fetched for the coin that will be shown first
            // need system for finding out which coin should be shown first

            // only get tokenInfos where the amount is higher than 0
            const tokenInfos: ParsedTokenInfo[] = (coins.map((coin: any) => coin.account.data.parsed.info)).filter((coinStats: any) => coinStats.tokenAmount.uiAmount !== 0);
            const contractAddresses: string[] = tokenInfos.map((tokenInfo: ParsedTokenInfo) => tokenInfo.mint);
            const caObjects: CAWithAmount[] = contractAddresses.map((contract_address: string, index: number) => {
                return { contract_address, amount: tokenInfos[index].tokenAmount.amount }
            });
            // get coin infos and coin prices
            const results = await Promise.all([this.getCoinPriceStatsAll(contractAddresses), this.getCoinValuesOfHoldings(caObjects)]);
            const coinInfos: CoinStats[] | null = results[0];
            if (!coinInfos) return null;
            const priceInfos: CoinPriceQuote[] | null = results[1];
            const allCoins: CoinStats[] = [];

            // this will iterate through each coin in users wallet with an amount of more than 0
            // it assigns the coin amount and assigns the up-to-date price (or use fallback price which might be a few minutes old in case of an error)
            coinInfos.forEach(async (coinInfo: CoinStats, index: number) => {
                const correspondingTokenInfo: ParsedTokenInfo | undefined = tokenInfos.find((tokenInfo: ParsedTokenInfo) => tokenInfo.mint === coinInfo.address);
                if (!correspondingTokenInfo) return null;
                coinInfo.tokenAmount = correspondingTokenInfo.tokenAmount;
                const priceInfo: CoinPriceQuote | undefined = priceInfos?.find((priceQuote: CoinPriceQuote) => priceQuote.contract_address === coinInfo.address);
                const coinValueInUsd: number = Number(coinInfo.price) * Number(correspondingTokenInfo.tokenAmount.uiAmount);
                if (!priceInfo) {
                    // in case quote response returned an error
                    const currentSolPrice = await this.getCurrentSolPrice();
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
        } catch (error) {
            await saveError({ wallet_address, function_name: "getAllCoinStatsFromWallet", error });
            return null;
        }
    }

    static async getCurrentSolPrice(): Promise<number | null> {
        try {
            // TODO: change this to a more reliable source
            const quoteResponse: QuoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${LAMPORTS_PER_SOL}&slippageBps=100`)
            ).json();
            if (!quoteResponse) return null;

            const solPrice: number = Number(quoteResponse.outAmount) / Math.pow(10, 6);
            return solPrice;
        } catch (error) {
            await saveError({ function_name: "getCurrentSolPrice", error });
            return null;
        }
    }

    static async getCurrentTokenPriceInSol(contract_address: string, amount: string): Promise<number | null> {
        try {
            const quoteResponse: QuoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${contract_address}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=100`)
            ).json();
            if (!quoteResponse) return null;
            return Number(quoteResponse.outAmount) / LAMPORTS_PER_SOL;
        } catch (error) {
            await saveError({ contract_address, function_name: "getCurrentTokenPriceInSol", error });
            return null;
        }
    }

    static async getCurrentTokenPriceInSolAll(casAndAmounts: CaAmount[]): Promise<number[] | null> {
        try {
            const requests = casAndAmounts.map((caAndAmount: CaAmount) => {
                return fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${caAndAmount.contractAddress}&outputMint=So11111111111111111111111111111111111111112&amount=${caAndAmount.amount}&slippageBps=100`);
            });
            const quoteResponsesRaw = await Promise.all(requests);
            const quoteResponses: QuoteResponse[] = await Promise.all(quoteResponsesRaw.map((response) => response.json()));
            if (!quoteResponses) return null;

            const prices = quoteResponses.map((quoteResponse) => Number(quoteResponse.outAmount) / LAMPORTS_PER_SOL);
            return prices;
        } catch (error) {
            await saveError({ function_name: "getCurrentTokenPriceInSolAll", error });
            return null;
        }
    }

    static async getCoinStats(contract_address: string, wallet_address: string): Promise<CoinStats | null> {
        try {
            const conn = this.getConnection();
            const filters: GetProgramAccountsFilter[] = [
                { dataSize: 165 }, // size of account (bytes)
                { memcmp: { offset: 32, bytes: wallet_address } }
            ];
            const coins: any = await conn.getParsedProgramAccounts(TOKEN_PROGRAM, { filters, commitment: "confirmed" });
            const selectedCoin = coins.find((coin: any) => coin.account.data.parsed.info.mint === contract_address);
            if (!selectedCoin) return null;

            const priceInfo: CoinStats | null = await this.getCoinPriceStats(contract_address);
            if (!priceInfo) return null;
            const tokenInfo = selectedCoin.account.data.parsed.info;
            priceInfo.tokenAmount = tokenInfo.tokenAmount;
            if (!priceInfo.tokenAmount) return null;
            const currentSolPrice: number | null = await this.getCurrentSolPrice();
            const coinValueInUsd: number = Number(priceInfo.price) * Number(priceInfo.tokenAmount.uiAmount);
            priceInfo.value = {
                inUSD: coinValueInUsd.toFixed(2),
                inSOL: currentSolPrice ? (coinValueInUsd / currentSolPrice).toFixed(4) : "0",
            }

            return priceInfo;
        } catch (error) {
            await saveError({ contract_address, wallet_address, function_name: "getCoinStats", error });
            return null;
        }
    }

    static async getAllCoinSymbols(wallet_address: string): Promise<string[] | null> {
        try {
            const conn = this.getConnection();
            const filters: GetProgramAccountsFilter[] = [
                { dataSize: 165 }, // size of account (bytes)
                { memcmp: { offset: 32, bytes: wallet_address } }
            ];
            const coins: any = await conn.getParsedProgramAccounts(TOKEN_PROGRAM, { filters });

            const allCoins: string[] = coins.map((coin: any) => coin.account.data.parsed.info.mint);
            return allCoins;
        } catch (error) {
            await saveError({ wallet_address, function_name: "getAllCoinSymbols", error });
            return null;
        }
    }

    static async getTokenAccountOfWallet(wallet_address: string, contract_address: string): Promise<PublicKey | null> {
        try {
            const associatedTokenAddress = await getAssociatedTokenAddress(
                new PublicKey(contract_address),
                new PublicKey(wallet_address),
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID,
            );
            return associatedTokenAddress;
        } catch (error) {
            await saveError({ wallet_address, contract_address, function_name: "getTokenAccountOfWallet", error });
            return null;
        }
    }

    // for wallet and contract addresses
    static async checkIfValidAddress(address: string): Promise<boolean> {
        try {
            const ca = new PublicKey(address);
            const isValid = PublicKey.isOnCurve(ca.toBuffer()) && PublicKey.isOnCurve(ca.toString());
            return isValid;
        } catch (error) {
            await saveError({ wallet_address: address, contract_address: address, function_name: "checkIfValidAddress", error });
            return false;
        }
    }

    static async getCoinPriceStatsAll(contract_addresses: string[]): Promise<CoinStats[] | null> {
        try {
            const coinInfos = contract_addresses.map((contract_address: string) => {
                return fetch(`https://api.dexscreener.io/latest/dex/tokens/${contract_address}`);
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
            await saveError({ function_name: "getCoinPriceStatsAll", error });
            return null;
        }
    }

    static async getCoinPriceStats(contract_address: string): Promise<CoinStats | null> {
        try {
            const pairInfo = await (
                await fetch(`https://api.dexscreener.io/latest/dex/tokens/${contract_address}`)
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
            await saveError({ contract_address, function_name: "getCoinPriceStats", error });
            return null;
        }
    }

    static async getCoinValueOfHolding(caWithAmount: CAWithAmount): Promise<CoinPriceQuote | null> {
        const contract_address: string = caWithAmount.contract_address;
        try {
            const quoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${contract_address}&outputMint=So11111111111111111111111111111111111111112&amount=${caWithAmount.amount}`)
            ).json();
            const priceInSol = Number(quoteResponse.outAmount) / LAMPORTS_PER_SOL;
            const currentSolPrice: number | null = await this.getCurrentSolPrice();

            return {
                contract_address: contract_address,
                priceInSol: priceInSol.toFixed(4),
                priceInUsd: currentSolPrice ? (priceInSol * currentSolPrice).toFixed(2) : "0",
            };
        } catch (error) {
            await saveError({ contract_address, function_name: "getCoinValueOfHolding", error });
            return null;
        }
    }

    static async getCoinValuesOfHoldings(casWithAmount: CAWithAmount[]): Promise<CoinPriceQuote[] | null> {
        try {
            const currentSolPrice: number | null = await this.getCurrentSolPrice();
            const quotes = casWithAmount.map((caObj: CAWithAmount) => {
                return fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${caObj.contract_address}&outputMint=So11111111111111111111111111111111111111112&amount=${caObj.amount}`);
            });
            const responses = await Promise.all(quotes);
            const quoteResponsesJson = responses.map((response: any) => response.json());
            const quoteResponses = await Promise.all(quoteResponsesJson);
            return quoteResponses.map((quote: QuoteResponse) => {
                const priceInSol = Number(quote.outAmount) / LAMPORTS_PER_SOL;
                return {
                    contract_address: quote.inputMint,
                    priceInSol: priceInSol.toFixed(4),
                    priceInUsd: currentSolPrice ? (currentSolPrice * priceInSol).toFixed(2) : "0",
                }
            });
        } catch (error) {
            await saveError({ function_name: "getCoinValuesOfHoldings", error });
            return null;
        }
    }

    static async getCoinInfo(contract_address: string): Promise<CoinInfo | null> {
        try {
            const pairInfo = await (
                await fetch(`https://api.dexscreener.io/latest/dex/tokens/${contract_address},So11111111111111111111111111111111111111112`)
            ).json();
            const coinInfo: CoinInfo = pairInfo.pairs[0].baseToken;
            return coinInfo;
        } catch (error) {
            await saveError({ contract_address, function_name: "getCoinInfo", error });
            return null;
        }
    }

    static async getAllCoinInfos(user_id: string): Promise<CoinInfo[] | null> {
        try {
            const wallet: any = await Wallet.findOne({ user_id: user_id, is_default_wallet: true }).lean();
            if (!wallet) return null;

            const coinStats: CoinStats[] | null = await this.getAllCoinStatsFromWallet(wallet.wallet_address, wallet.settings.min_position_value);
            if (!coinStats) return null;
            const coinInfos: CoinInfo[] = [];
            for (let i = 0; i < coinStats.length; i++) {
                const info: CoinInfo = {
                    ...coinStats[i],
                };
                coinInfos.push(info);
            }

            return coinInfos;
        } catch (error) {
            await saveError({ user_id, function_name: "getAllCoinInfos", error });
            return null;
        }
    }

    static async getCoinMetadata(contract_address: string): Promise<CoinMetadata | null> {
        try {
            const response: any = await this.connection.getParsedAccountInfo(new PublicKey(contract_address));
            if (!response.value) return null;
            return response.value.data.parsed.info;
        } catch (error) {
            await saveError({ contract_address, function_name: "getCoinMetadata", error });
            return null;
        }
    }

    static getConnection() {
        return this.connection;
    }

    static getSignature(transaction: Transaction | VersionedTransaction): string | undefined {
        const signature = "signature" in transaction ? transaction.signature : transaction.signatures[0];
        if (!signature) {
            console.log("Missing transaction signature, the transaction was not signed by the fee payer");
            return undefined;
        }
        return bs58.encode(signature);
    }

    static async getTransactionInfo(signature?: string): Promise<VersionedTransactionResponse | null> {
        if (!signature) return null;
        try {
            // TODO: wait until it is finalized. just using finalized as commitment might miss it
            const conn = this.getConnection();
            const tx: VersionedTransactionResponse | null = await conn.getTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
            });

            return tx;
        } catch (error) {
            await saveError({ tx_signature: signature, function_name: "getTransactionInfo", error });
            return null;
        }
    }
}