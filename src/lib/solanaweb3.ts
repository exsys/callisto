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
    errorResponse,
    formatNumber,
    getFeeInPercentFromFeeLevel,
    getKeypairFromEncryptedPKey,
    isPositiveNumber,
    saveError,
    successResponse
} from './util';
import { SwapTx } from "../types/swaptx";
import {
    BASE_SWAP_FEE,
    FEE_TOKEN_ACCOUNT,
    FEE_ACCOUNT_OWNER,
    FEE_REDUCTION_PERIOD,
    FEE_REDUCTION_WITH_REF_CODE,
    TOKEN_PROGRAM,
    CALLISTO_FEE_WALLET,
    DEFAULT_RPC_URL,
    WRAPPED_SOL_ADDRESS
} from "../config/constants";
import { ParsedTokenInfo } from "../types/parsedtokeninfo";
import { CoinInfo } from "../types/coininfo";
import { CoinStats } from "../types/coinstats";
import {
    getAssociatedTokenAddress,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    createTransferInstruction,
    getOrCreateAssociatedTokenAccount,
    Account
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
    notSignedError,
} from "../config/errors";
import bs58 from "bs58";
import { transactionSenderAndConfirmationWaiter } from "./transaction-sender";
import { QuoteResponse } from "../types/quoteresponse";
import { CAWithAmount } from "../types/cawithamount";
import { User } from "../models/user";
import { TxResponse } from "../types/tx-response";
import { CaAmount } from "../types/caamount";
import { PROMO_REF_MAPPING } from "../config/promo_ref_mapping";
import { CoinPriceQuote } from "../types/coinPriceQuote";
import { ParsedProgramAccountWrittenOut } from "../types/parsedprogramaccount";


/*jitoConn: Connection = new Connection("https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/transactions", {
    commitment: "confirmed",
    httpAgent: new Agent({
        keepAlive: true,
        keepAliveMsecs: 60000,
    }),
});*/
const connection: Connection = new Connection(DEFAULT_RPC_URL);
const BPS_PER_PERCENT: number = 100;
const CU_TOKEN_TRANSFER: number = 27695;
const CU_SOL_TRANSFER: number = 300;
const RENT_FEE: number = 2000000;
const GAS_FEE_FOR_SOL_TRANSFER: number = 5000;

export function createNewWallet() {
    const solanaWallet = Keypair.generate();
    return solanaWallet;
}

export async function transferAllSol(user_id: string, recipientAddress: string): Promise<TxResponse> {
    const txResponse: TxResponse = {
        user_id,
        tx_type: "transfer_all",
    }
    let wallet: any;
    try {
        wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return walletNotFoundError(txResponse);
    } catch (error) {
        return unknownError({ ...txResponse, error });
    }
    const wallet_address: string = wallet.wallet_address;
    txResponse.wallet_address = wallet_address;

    try {
        const balanceInLamports: number | undefined = await getBalanceOfWalletInLamports(wallet_address);
        if (!balanceInLamports) return walletBalanceError(txResponse);
        if (balanceInLamports === 0) return insufficientBalanceError(txResponse);
        const signer: Keypair | undefined = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
        if (!signer) return decryptError(txResponse);

        const maxSolAmountToSend: number = balanceInLamports - GAS_FEE_FOR_SOL_TRANSFER;
        txResponse.token_amount = maxSolAmountToSend;
        const tx: Transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: signer.publicKey,
                toPubkey: new PublicKey(recipientAddress),
                lamports: maxSolAmountToSend,
            })
        );

        const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash();
        tx.feePayer = signer.publicKey;
        tx.recentBlockhash = blockhash;
        tx.sign(signer);
        const serializedTx: Buffer = Buffer.from(tx.serialize());
        const signature: string | undefined = getSignature(tx);
        if (!signature) return notSignedError(txResponse);
        txResponse.tx_signature = signature;
        const result: VersionedTransactionResponse | null = await transactionSenderAndConfirmationWaiter({
            connection: getConnection(),
            serializedTransaction: serializedTx,
            blockhashWithExpiryBlockHeight: {
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight,
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

// amount in decimal
export async function transferXSol(user_id: string, amount: string, recipientAddress: string): Promise<TxResponse> {
    const tx_type: string = "transfer_x";
    const txResponse: TxResponse = {
        user_id,
        tx_type,
    };
    let wallet: any;
    try {
        wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return walletNotFoundError(txResponse);
    } catch (error) {
        return unknownError({ ...txResponse, error });
    }
    const wallet_address: string = wallet.wallet_address;
    txResponse.wallet_address = wallet_address;

    try {
        if (!isPositiveNumber(amount)) return invalidNumberError(txResponse);
        const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash("finalized");
        const signer: Keypair | undefined = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
        if (!signer) return decryptError(txResponse);
        const amountToSend: number = (Number(amount) * LAMPORTS_PER_SOL) - GAS_FEE_FOR_SOL_TRANSFER;
        txResponse.token_amount = amountToSend;

        const tx: Transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: signer.publicKey,
                toPubkey: new PublicKey(recipientAddress),
                lamports: amountToSend,
            })
        );
        tx.feePayer = signer.publicKey;
        tx.recentBlockhash = blockhash;

        // check if the user has enough balance to transfer the amount
        const estimatedFeeInLamports: number | null = await tx.getEstimatedFee(getConnection());
        const balanceInLamports: number | undefined = await getBalanceOfWalletInLamports(wallet_address);
        if (!balanceInLamports) return walletBalanceError(txResponse);
        if (balanceInLamports === 0) return insufficientBalanceError(txResponse);
        if (!estimatedFeeInLamports) {
            // get default fee if the estimated fee is not available
            if (balanceInLamports < amountToSend + GAS_FEE_FOR_SOL_TRANSFER) {
                return insufficientBalanceError(txResponse);
            }
        } else if (balanceInLamports < amountToSend + estimatedFeeInLamports) {
            return insufficientBalanceError(txResponse);
        }

        tx.sign(signer);
        const serializedTx: Buffer = Buffer.from(tx.serialize());
        const signature: string | undefined = getSignature(tx);
        if (!signature) return notSignedError(txResponse);
        txResponse.tx_signature = signature;
        const result: VersionedTransactionResponse | null = await transactionSenderAndConfirmationWaiter({
            connection: getConnection(),
            serializedTransaction: serializedTx,
            blockhashWithExpiryBlockHeight: {
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight,
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

export async function sendXPercentOfCoin(user_id: string, contract_address: string, percent: string, recipient: string): Promise<TxResponse> {
    const tx_type: string = "transfer_token_percent";
    const txResponse: TxResponse = {
        user_id,
        contract_address,
        tx_type,
    }
    let wallet: any;
    try {
        wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return walletNotFoundError(txResponse);
    } catch (error) {
        return unknownError({ ...txResponse, error });
    }
    const wallet_address: string = wallet.wallet_address;
    txResponse.wallet_address = wallet_address;

    try {
        if (percent.includes("%")) percent = percent.replace("%", "");
        if (!isPositiveNumber(percent)) return invalidNumberError(txResponse);
        if (Number(percent) < 0) return invalidNumberError(txResponse);

        const signer: Keypair | undefined = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
        if (!signer) return decryptError({ user_id, tx_type });
        const walletTokenAccount: PublicKey | null = await getTokenAccountOfWallet(wallet_address, contract_address);
        if (!walletTokenAccount) return tokenAccountNotFoundError(txResponse);

        const destinationTokenAccount: Account = await getOrCreateAssociatedTokenAccount(
            getConnection(),
            signer,
            new PublicKey(contract_address),
            new PublicKey(recipient),
        );
        if (!destinationTokenAccount) return destinationTokenAccountError(txResponse);

        const coinStats: CoinStats | null = await getCoinStatsFromWallet(wallet_address, contract_address);
        if (!coinStats) return coinstatsNotFoundError(txResponse);

        const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash();

        let amountToSend: number = Math.floor(Number(coinStats.tokenAmount!.amount) * (Number(percent) / 100));
        if (amountToSend > Number(coinStats.tokenAmount?.amount)) return insufficientBalanceError(txResponse);
        const tx: Transaction = new Transaction().add(
            createTransferInstruction(
                walletTokenAccount, // source token account
                destinationTokenAccount.address, // receiver token account
                signer.publicKey, // source wallet address
                amountToSend, // amount to transfer
            )
        );

        tx.feePayer = signer.publicKey;
        tx.recentBlockhash = blockhash;
        tx.sign(signer);
        const serializedTx: Buffer = Buffer.from(tx.serialize());
        const signature: string | undefined = getSignature(tx);
        if (!signature) return notSignedError(txResponse);
        txResponse.tx_signature = signature;
        const result = await transactionSenderAndConfirmationWaiter({
            connection: getConnection(),
            serializedTransaction: serializedTx,
            blockhashWithExpiryBlockHeight: {
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight,
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

export async function sendCoin(user_id: string, contract_address: string, amount: string, recipient: string): Promise<TxResponse> {
    const tx_type: string = "transfer_token_amount";
    const txResponse: TxResponse = {
        user_id,
        contract_address,
        tx_type,
    };
    let wallet: any;
    try {
        wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return walletNotFoundError(txResponse);
    } catch (error) {
        return unknownError({ ...txResponse, error });
    }
    const wallet_address: string = wallet.wallet_address;
    txResponse.wallet_address = wallet_address;

    try {
        if (!isPositiveNumber(amount)) return invalidNumberError(txResponse);

        const signer: Keypair | undefined = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
        if (!signer) return decryptError({ user_id, tx_type });
        const walletTokenAccount: PublicKey | null = await getTokenAccountOfWallet(wallet_address, contract_address);
        if (!walletTokenAccount) return tokenAccountNotFoundError(txResponse);

        const destinationTokenAccount: Account = await getOrCreateAssociatedTokenAccount(
            getConnection(),
            signer,
            new PublicKey(contract_address),
            new PublicKey(recipient),
        );
        if (!destinationTokenAccount) return destinationTokenAccountError(txResponse);

        const coinStats: CoinStats | null = await getCoinStatsFromWallet(wallet_address, contract_address);
        if (!coinStats) return coinstatsNotFoundError(txResponse);
        if (!coinStats.tokenAmount) return coinstatsNotFoundError(txResponse);

        const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash();
        let amountToSend: number = Number(amount) * Math.pow(10, coinStats.tokenAmount.decimals);
        // handle js floating point precision problem
        const fractionalPart: number = amountToSend % 1;
        if (fractionalPart > 0.99) {
            amountToSend = Math.ceil(amountToSend);
        } else {
            amountToSend = Math.floor(amountToSend);
        }
        txResponse.token_amount = amountToSend;
        if (amountToSend > Number(coinStats.tokenAmount?.amount)) return insufficientBalanceError(txResponse);
        const tx: Transaction = new Transaction().add(
            createTransferInstruction(
                walletTokenAccount, // source token account
                destinationTokenAccount.address, // receiver token account
                signer.publicKey, // source wallet address
                amountToSend, // amount to transfer
            )
        );

        tx.feePayer = signer.publicKey;
        tx.recentBlockhash = blockhash;
        tx.sign(signer);
        const serializedTx: Buffer = Buffer.from(tx.serialize());
        const signature: string | undefined = getSignature(tx);
        if (!signature) return notSignedError(txResponse);
        txResponse.tx_signature = signature;
        const result: VersionedTransactionResponse | null = await transactionSenderAndConfirmationWaiter({
            connection: getConnection(),
            serializedTransaction: serializedTx,
            blockhashWithExpiryBlockHeight: {
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight,
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

export async function buyCoinViaAPI(user_id: string, contract_address: string, amountToSwap: string): Promise<TxResponse> {
    const startTimeFunction: number = Date.now();
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
        if (!wallet) return walletNotFoundError(txResponse);
        user = await User.findOne({ user_id });
        if (!user) return userNotFoundError(txResponse);
    } catch (error) {
        return unknownError({ ...txResponse, error });
    }
    const wallet_address: string = wallet.wallet_address;
    txResponse.wallet_address = wallet_address;

    try {
        const conn: Connection = getConnection();
        const balanceInLamports: number | undefined = await getBalanceOfWalletInLamports(wallet_address);
        if (!balanceInLamports) return walletBalanceError(txResponse);
        if (balanceInLamports === 0) return insufficientBalanceError(txResponse);

        if (amountToSwap.includes("buy_button_")) {
            amountToSwap = wallet.settings[amountToSwap as string];
        }

        const txPrio: number = wallet.settings.tx_priority_value;
        if (!isPositiveNumber(amountToSwap)) return invalidNumberError(txResponse);
        if (Number(amountToSwap) <= 0) return invalidAmountError(txResponse);
        if (balanceInLamports < Number(amountToSwap) * LAMPORTS_PER_SOL + txPrio) {
            return insufficientBalanceError({ ...txResponse, include_retry_button: true });
        }

        const signer: Keypair | undefined = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
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
        const slippage: number = wallet.settings.buy_slippage * BPS_PER_PERCENT;
        let refFeesInLamports: number = 0;
        if (user.referral) {
            // calculate how much of the fee will be sent to the referrer
            const referrer: any = await User.findOne({ user_id: user.referral.referrer_user_id });
            if (referrer) {
                let feeAmountInPercent: number = 0;
                const promoLevel: string = user.referral.promo_level; // special collab for increased ref fees
                if (promoLevel) {
                    feeAmountInPercent = PROMO_REF_MAPPING[promoLevel as keyof typeof PROMO_REF_MAPPING].getPercent(user.referral.number_of_referral);
                } else {
                    feeAmountInPercent = getFeeInPercentFromFeeLevel(user.referral.fee_level);
                }
                refFeesInLamports = Math.floor(totalFeesInLamports * (feeAmountInPercent / 100));
                txResponse.ref_fee = refFeesInLamports;
                referrer.unclaimed_ref_fees += refFeesInLamports;
                // TODO: proper error handling. maybe rabbitmq so it will be stored later?
                // TODO: move referrer.save() to after interaction.editReply
                try {
                    await referrer.save();
                } catch (error) {
                    console.log(`Failed to store ${refFeesInLamports} Lamports for user: ${referrer.user_id}`);
                }
            }
        }
        const callistoFeesInLamports: number = totalFeesInLamports - refFeesInLamports;
        const amountInLamportsMinusFees: number = amountInLamports - totalFeesInLamports;
        txResponse.total_fee = totalFeesInLamports;
        txResponse.callisto_fee = callistoFeesInLamports;
        const quoteResponse: QuoteResponse = await (
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
        const addressLookupTableAccounts: AddressLookupTableAccount[] = await Promise.all(
            tx.message.addressTableLookups.map(async (lookup: MessageAddressTableLookup) => {
                return new AddressLookupTableAccount({
                    key: lookup.accountKey,
                    state: AddressLookupTableAccount.deserialize(await conn.getAccountInfo(lookup.accountKey).then((res: any) => res.data)),
                });
            })
        );
        const txMessage: TransactionMessage = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: addressLookupTableAccounts });
        txMessage.instructions.push(callistoFeeInstruction);
        tx.message = txMessage.compileToV0Message(addressLookupTableAccounts);
        tx.sign([signer]);
        const signature: string | undefined = getSignature(tx);
        txResponse.tx_signature = signature;
        const serializedTx: Buffer = Buffer.from(tx.serialize());
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

export async function sellCoinViaAPI(user_id: string, contract_address: string, amountToSellInPercentString: string): Promise<TxResponse> {
    const startTimeFunction: number = Date.now();
    const conn: Connection = getConnection();
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
    if (!isPositiveNumber(amountToSellInPercentString)) return invalidNumberError(txResponse);

    const amountToSellInPercent: number = Number(amountToSellInPercentString);
    if (amountToSellInPercent < 0.01 || amountToSellInPercent > 100) return invalidAmountError(txResponse);
    txResponse.sell_amount = amountToSellInPercent;

    const coinStats: CoinStats | null = await getCoinStatsFromWallet(wallet_address, contract_address);
    if (!coinStats) return coinstatsNotFoundError(txResponse);
    txResponse.token_stats = coinStats;
    if (Number(coinStats.tokenAmount!.amount) == 0) return insufficientBalanceError({ ...txResponse, include_retry_button: true });

    try {
        const signer: Keypair | undefined = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
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
        const slippage: number = wallet.settings.sell_slippage * BPS_PER_PERCENT;
        const feeAmountInBPS: number = Math.ceil(wallet.swap_fee * BPS_PER_PERCENT);
        const quoteResponse: QuoteResponse = await (
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
        const signature: string | undefined = getSignature(tx);
        txResponse.tx_signature = signature;
        const serializedTx: Buffer = Buffer.from(tx.serialize());
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
        const endTimeFunction: number = Date.now();
        const functionProcessingTime: number = (endTimeFunction - startTimeFunction) / 1000;
        txResponse.processing_time_function = functionProcessingTime;
        txResponse.error = `sellCoinViaAPI unknown error: ${error}`;
        return unknownError(txResponse);
    }
}

export async function createBuyLimitOrder(
    user_id: string, contract_address: string, buyEntry: number, amount: number, validFor: number, isPercentOrder: boolean
): Promise<TxResponse> {
    const tx_type: string = `buy_limit`;
    const txResponse: TxResponse = {
        user_id,
        tx_type,
        contract_address,
        token_amount: amount,
    };

    let wallet: any;
    let user: any;
    try {
        wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return walletNotFoundError(txResponse);
        user = await User.findOne({ user_id }).lean();
        if (!user) return userNotFoundError(txResponse);
    } catch (error) {
        return unknownError({ ...txResponse, error });
    }
    const wallet_address: string = wallet.wallet_address;
    txResponse.wallet_address = wallet_address;

    try {
        const conn: Connection = getConnection();
        const coinInfo: CoinStats | null = await getCoinPriceStats(contract_address);
        if (!coinInfo) return coinstatsNotFoundError(txResponse);

        let entryPrice: number;
        if (isPercentOrder) {
            entryPrice = Number(coinInfo.price) * (1 - buyEntry / 100);
        } else {
            entryPrice = buyEntry;
        }

        if (entryPrice >= Number(coinInfo.price)) {
            txResponse.response = "Entry price can't be higher than current price.";
            txResponse.error = "Entry price can't be higher than current price.";
            return errorResponse(txResponse);
        }

        const amountToBuyInLamports: number = Number(amount) * LAMPORTS_PER_SOL;

        // TODO: use pool formula to calculate exact inAmount & outAmount for specific price

        // TODO: calculate epxiration timestamp

        const base: Keypair = Keypair.generate();
        const { tx } = await (
            await fetch('https://jup.ag/api/limit/v1/createOrder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    owner: wallet.publicKey.toString(),
                    inAmount: 100000,
                    outAmount: 100000,
                    inputMint: WRAPPED_SOL_ADDRESS,
                    outputMint: contract_address,
                    expiredAt: null,
                    base: base.publicKey.toString(),
                })
            })
        ).json();

        const txBuffer: Buffer = Buffer.from(tx, "base64");
        const limitTx: VersionedTransaction = VersionedTransaction.deserialize(txBuffer);
        limitTx.sign([wallet.payer, base]);
        const signature: string | undefined = getSignature(limitTx);
        txResponse.tx_signature = signature;
        const serializedTx: Buffer = Buffer.from(limitTx.serialize());
        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
        const result: VersionedTransactionResponse | null = await transactionSenderAndConfirmationWaiter({
            connection: conn,
            serializedTransaction: serializedTx,
            blockhashWithExpiryBlockHeight: {
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight,
            },
        });
        if (!result) return txExpiredError(txResponse);
        if (result.meta?.err) return txMetaError({ ...txResponse, error: result.meta?.err });

        txResponse.success = true;
        txResponse.response = "Successfully set buy limit order.";
        return successResponse(txResponse);
    } catch (error) {
        return unknownError({ ...txResponse, error });
    }
}

export async function createSellLimitOrder(
    user_id: string, contract_address: string, sellEntry: number, amount: number, validFor: number
): Promise<TxResponse> {
    const tx_type: string = `sell_limit`;
    const txResponse: TxResponse = {
        user_id,
        tx_type,
        contract_address,
        token_amount: amount,
    };

    try {
        // TODO: implement

        txResponse.success = true;
        txResponse.response = "Successfully set sell limit order.";
        return successResponse(txResponse);
    } catch (error) {
        return unknownError({ ...txResponse, error });
    }
}

// amount in lamports
export async function payRefFees(user_id: string, amount: number): Promise<TxResponse> {
    const tx_type: string = "transfer_ref_fee";
    const txResponse: TxResponse = {
        user_id,
        tx_type,
    };
    let amountToPayInLamports: number = amount - GAS_FEE_FOR_SOL_TRANSFER;
    try {
        // TODO: ref fees should sit in another wallet, and not the main calli fee wallet
        // maybe create a script which transfers ref fees every 24h to it?

        const callistoWallet: Keypair | null = Keypair.fromSecretKey(bs58.decode(String(process.env.CALLISTO_FEE_WALLET_PKEY)));
        if (!callistoWallet) return decryptError(txResponse);
        const wallet = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return walletNotFoundError(txResponse);
        const wallet_address: string = wallet.wallet_address;
        txResponse.wallet_address = wallet_address;
        // callisto fee wallet balance
        const balanceInLamportsFeeWallet: number | undefined = await getBalanceOfWalletInLamports(CALLISTO_FEE_WALLET);
        if (!balanceInLamportsFeeWallet) return walletBalanceError(txResponse);
        if (balanceInLamportsFeeWallet === 0) return unknownError({ ...txResponse, error: "Callisto fee wallet balance is 0." });
        if (balanceInLamportsFeeWallet < amount) {
            return unknownError({ ...txResponse, error: "Callisto fee wallet doesn't have enough SOL to pay ref fees." });
        }
        const balanceInLamportsUser: number | undefined = await getBalanceOfWalletInLamports(wallet.wallet_address);
        if (balanceInLamportsUser === 0) {
            amountToPayInLamports -= RENT_FEE;
        }
        txResponse.token_amount = amountToPayInLamports;

        if (amountToPayInLamports < 0) {
            txResponse.response = "You don't have enough fees collected yet to claim them. Min amount is 0.0021 SOL.";
            txResponse.error = "You don't have enough fees collected yet to claim them.";
            txResponse.success = false;
            return successResponse(txResponse);
        }

        const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash("finalized");
        const tx: Transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: callistoWallet.publicKey,
                toPubkey: new PublicKey(wallet_address),
                lamports: amountToPayInLamports,
            })
        );
        tx.feePayer = callistoWallet.publicKey;
        tx.recentBlockhash = blockhash;

        tx.sign(callistoWallet);
        const serializedTx: Buffer = Buffer.from(tx.serialize());
        const signature: string | undefined = getSignature(tx);
        if (!signature) return unknownError(txResponse);
        txResponse.tx_signature = signature;
        const result: VersionedTransactionResponse | null = await transactionSenderAndConfirmationWaiter({
            connection: getConnection(),
            serializedTransaction: serializedTx,
            blockhashWithExpiryBlockHeight: {
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight,
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

export async function getBalanceOfWalletInDecimal(wallet_address: string): Promise<number | undefined> {
    try {
        const conn: Connection = getConnection();
        const publicKey: PublicKey = new PublicKey(wallet_address);
        const balance: number = await conn.getBalance(publicKey, { commitment: "confirmed" });
        return balance / LAMPORTS_PER_SOL;
    } catch (error) {
        await saveError({ wallet_address, function_name: "getBalanceOfWalletInDecimal", error });
        return undefined;
    }
}

export async function getBalanceOfWalletInLamports(wallet_address: string): Promise<number | undefined> {
    try {
        const conn: Connection = getConnection();
        const publicKey: PublicKey = new PublicKey(wallet_address);
        const balance: number = await conn.getBalance(publicKey, { commitment: "confirmed" });
        return balance;
    } catch (error) {
        await saveError({ wallet_address, function_name: "getBalanceOfWalletInLamports", error });
        return undefined;
    }
}

export async function getAllCoinStatsFromWallet(wallet_address: string, minPositionValue: number): Promise<CoinStats[] | null> {
    try {
        const conn: Connection = getConnection();
        const filters: GetProgramAccountsFilter[] = [
            { dataSize: 165 }, // size of account (bytes)
            { memcmp: { offset: 32, bytes: wallet_address } }
        ];
        const coins: ParsedProgramAccountWrittenOut[] = await conn.getParsedProgramAccounts(
            TOKEN_PROGRAM, { filters, commitment: "confirmed" }
        ) as ParsedProgramAccountWrittenOut[];

        // only get tokenInfos where the amount is higher than 0
        const tokenInfos: ParsedTokenInfo[] = (coins.map((coin: ParsedProgramAccountWrittenOut) => coin.account.data.parsed.info))
            .filter((coinStats: any) => coinStats.tokenAmount.uiAmount !== 0);
        const contractAddresses: string[] = tokenInfos.map((tokenInfo: ParsedTokenInfo) => tokenInfo.mint);
        const caObjects: CAWithAmount[] = contractAddresses.map((contract_address: string, index: number) => {
            return { contract_address, amount: tokenInfos[index].tokenAmount.amount }
        });
        // get coin infos and coin prices
        const results = await Promise.all([getCoinPriceStatsAll(contractAddresses), getCoinValuesOfHoldings(caObjects)]);
        const coinInfos: CoinStats[] | null = results[0];
        if (!coinInfos) return null;
        const priceInfos: CoinPriceQuote[] | null = results[1];
        const allCoins: CoinStats[] = [];

        // this will iterate through each coin in users wallet with an amount of more than 0
        // it assigns the coin amount and assigns the up-to-date price (or use fallback price which might be a few minutes old in case of an error)
        coinInfos.forEach(async (coinInfo: CoinStats, index: number) => {
            const correspondingTokenInfo: ParsedTokenInfo | undefined = tokenInfos.find((tokenInfo: ParsedTokenInfo) => {
                return tokenInfo.mint === coinInfo.address;
            });
            if (!correspondingTokenInfo) return null;
            coinInfo.tokenAmount = correspondingTokenInfo.tokenAmount;
            const priceInfo: CoinPriceQuote | undefined = priceInfos?.find((priceQuote: CoinPriceQuote) => {
                return priceQuote.contract_address === coinInfo.address;
            });
            const coinValueInUsd: number = Number(coinInfo.price) * Number(correspondingTokenInfo.tokenAmount.uiAmount);
            if (!priceInfo) {
                // in case quote response returned an error
                const currentSolPrice: number = await getCurrentSolPrice();
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

export async function getCurrentSolPrice(): Promise<number> {
    try {
        // TODO: change this to a more reliable source
        const quoteResponse: QuoteResponse = await (
            await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${LAMPORTS_PER_SOL}&slippageBps=100`)
        ).json();
        if (!quoteResponse) return 0;

        const solPrice: number = Number(quoteResponse.outAmount) / Math.pow(10, 6);
        return solPrice;
    } catch (error) {
        await saveError({ function_name: "getCurrentSolPrice", error });
        return 0;
    }
}

export async function getCurrentTokenPriceInSol(contract_address: string, amount: string): Promise<number | null> {
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

export async function getCurrentTokenPriceInSolAll(casAndAmounts: CaAmount[]): Promise<number[]> {
    try {
        const requests: Promise<Response>[] = casAndAmounts.map((caAndAmount: CaAmount) => {
            return fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${caAndAmount.contractAddress}&outputMint=So11111111111111111111111111111111111111112&amount=${caAndAmount.amount}&slippageBps=100`);
        });
        const quoteResponsesRaw: Response[] = await Promise.all(requests);
        const quoteResponses: QuoteResponse[] = await Promise.all(quoteResponsesRaw.map((response) => response.json()));
        if (!quoteResponses) return [];

        const prices: number[] = quoteResponses.map((quoteResponse) => Number(quoteResponse.outAmount) / LAMPORTS_PER_SOL);
        return prices;
    } catch (error) {
        await saveError({ function_name: "getCurrentTokenPriceInSolAll", error });
        return [];
    }
}

export async function getCoinStatsFromWallet(wallet_address: string, contract_address: string): Promise<CoinStats | null> {
    try {
        const conn: Connection = getConnection();
        const filters: GetProgramAccountsFilter[] = [
            { dataSize: 165 }, // size of account (bytes)
            { memcmp: { offset: 32, bytes: wallet_address } }
        ];
        const coins: ParsedProgramAccountWrittenOut[] = await conn.getParsedProgramAccounts(TOKEN_PROGRAM, { filters, commitment: "confirmed" }) as ParsedProgramAccountWrittenOut[];
        const selectedCoin: ParsedProgramAccountWrittenOut | undefined = coins.find((coin: ParsedProgramAccountWrittenOut) => {
            return coin.account.data.parsed.info.mint === contract_address
        });
        if (!selectedCoin) return null;

        const priceInfo: CoinStats | null = await getCoinPriceStats(contract_address);
        if (!priceInfo) return null;
        const tokenInfo: ParsedTokenInfo = selectedCoin.account.data.parsed.info;
        priceInfo.tokenAmount = tokenInfo.tokenAmount;
        if (!priceInfo.tokenAmount) return null;
        const currentSolPrice: number = await getCurrentSolPrice();
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

export async function getTokenAccountOfWallet(wallet_address: string, contract_address: string): Promise<PublicKey | null> {
    try {
        const associatedTokenAddress: PublicKey = await getAssociatedTokenAddress(
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

// NOTE: for both wallet and contract addresses
export async function checkIfValidAddress(address: string | null): Promise<boolean> {
    try {
        if (!address) return false;
        const ca: PublicKey = new PublicKey(address);
        const isValid: boolean = PublicKey.isOnCurve(ca.toBuffer()) && PublicKey.isOnCurve(ca.toString());
        return isValid;
    } catch (error) {
        return false;
    }
}

export async function getCoinPriceStatsAll(contract_addresses: string[]): Promise<CoinStats[] | null> {
    try {
        const coinInfos: Promise<Response>[] = contract_addresses.map((contract_address: string) => {
            return fetch(`https://api.dexscreener.io/latest/dex/tokens/${contract_address}`);
        });

        const responses: Response[] = await Promise.all(coinInfos);
        const statsData: Promise<any>[] = responses.map((response: Response) => response.json());
        const coinStats: any[] = await Promise.all(statsData);
        const stats: CoinStats[] = coinStats.map((coin: any) => {
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

export async function getCoinPriceStats(contract_address: string): Promise<CoinStats | null> {
    try {
        const pairInfo: any = await (
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

export async function getCoinValueOfHolding(caWithAmount: CAWithAmount): Promise<CoinPriceQuote | null> {
    const contract_address: string = caWithAmount.contract_address;
    try {
        const quoteResponse: QuoteResponse = await (
            await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${contract_address}&outputMint=So11111111111111111111111111111111111111112&amount=${caWithAmount.amount}`)
        ).json();
        const priceInSol: number = Number(quoteResponse.outAmount) / LAMPORTS_PER_SOL;
        const currentSolPrice: number = await getCurrentSolPrice();

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

export async function getCoinValuesOfHoldings(casWithAmount: CAWithAmount[]): Promise<CoinPriceQuote[] | null> {
    try {
        const currentSolPrice: number = await getCurrentSolPrice();
        const quotes: Promise<Response>[] = casWithAmount.map((caObj: CAWithAmount) => {
            return fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${caObj.contract_address}&outputMint=So11111111111111111111111111111111111111112&amount=${caObj.amount}`);
        });
        const responses: Response[] = await Promise.all(quotes);
        const quoteResponsesJson: any[] = responses.map((response: any) => response.json());
        const quoteResponses: QuoteResponse[] = await Promise.all(quoteResponsesJson);
        return quoteResponses.map((quote: QuoteResponse) => {
            const priceInSol: number = Number(quote.outAmount) / LAMPORTS_PER_SOL;
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

export async function getCoinInfo(contract_address: string): Promise<CoinInfo | null> {
    try {
        const pairInfo: any = await (
            await fetch(`https://api.dexscreener.io/latest/dex/tokens/${contract_address},So11111111111111111111111111111111111111112`)
        ).json();
        const coinInfo: CoinInfo = pairInfo.pairs[0].baseToken;
        return coinInfo;
    } catch (error) {
        await saveError({ contract_address, function_name: "getCoinInfo", error });
        return null;
    }
}

export async function getAllCoinInfos(
    { user_id, walletAddress, minPos }: { user_id?: string, walletAddress?: string, minPos?: number }
): Promise<CoinInfo[] | null> {
    try {
        let wallet_address: string | undefined = walletAddress;
        let min_position_value: number | undefined = minPos;
        if (!wallet_address) {
            const wallet: any = await Wallet.findOne({ user_id: user_id, is_default_wallet: true }).lean();
            if (!wallet) return null;
            wallet_address = wallet.wallet_address;
            min_position_value = wallet.settings.min_position_value;
        }

        if (!wallet_address || !min_position_value) return null;
        const coinStats: CoinStats[] | null = await getAllCoinStatsFromWallet(wallet_address, min_position_value);
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

export function getConnection(): Connection {
    if (!connection) return new Connection(DEFAULT_RPC_URL);
    return connection;
}

export function getSignature(transaction: Transaction | VersionedTransaction): string | undefined {
    const signature: Buffer | Uint8Array | null = "signature" in transaction ? transaction.signature : transaction.signatures[0];
    if (!signature) {
        console.log("Missing transaction signature, the transaction was not signed by the fee payer");
        return undefined;
    }
    return bs58.encode(signature);
}

export async function getTransactionInfo(signature?: string): Promise<VersionedTransactionResponse | null> {
    if (!signature) return null;
    try {
        // TODO: wait until it is finalized. just using finalized as commitment might miss it
        const conn: Connection = getConnection();
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