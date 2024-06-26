import {
    BlockhashWithExpiryBlockHeight,
    Connection,
    TransactionExpiredBlockheightExceededError,
    VersionedTransactionResponse,
} from "@solana/web3.js";
import promiseRetry from "promise-retry";
import { wait } from "./util";

type TransactionSenderAndConfirmationWaiterArgs = {
    connection: Connection;
    serializedTransaction: Buffer;
    blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight;
};

const SEND_OPTIONS = {
    skipPreflight: true,
};

export async function transactionSenderAndConfirmationWaiter({
    connection,
    serializedTransaction,
    blockhashWithExpiryBlockHeight,
}: TransactionSenderAndConfirmationWaiterArgs): Promise<VersionedTransactionResponse | null> {
    const txId = await connection.sendRawTransaction(serializedTransaction, SEND_OPTIONS);
    const controller = new AbortController();
    const abortSignal = controller.signal;

    const abortableResender = async () => {
        while (true) {
            await wait(2000);
            if (abortSignal.aborted) return;
            try {
                await connection.sendRawTransaction(serializedTransaction, SEND_OPTIONS);
            } catch (e) {
                console.warn(`Failed to resend transaction: ${e}`);
            }
        }
    };

    try {
        abortableResender();
        const lastValidBlockHeight = blockhashWithExpiryBlockHeight.lastValidBlockHeight - 150;

        // this would throw TransactionExpiredBlockheightExceededError
        await Promise.race([
            connection.confirmTransaction({
                ...blockhashWithExpiryBlockHeight,
                lastValidBlockHeight,
                signature: txId,
                abortSignal,
            }, "confirmed"),
            new Promise(async (resolve) => {
                // in case ws socket died
                while (!abortSignal.aborted) {
                    await wait(2000);
                    const tx = await connection.getSignatureStatus(txId, { searchTransactionHistory: false });
                    if (tx?.value?.confirmationStatus === "confirmed") {
                        resolve(tx);
                    }
                }
            }),
        ]);
    } catch (e) {
        if (e instanceof TransactionExpiredBlockheightExceededError) {
            // we consume this error and getTransaction would return null
            return null;
        } else {
            // invalid state from web3.js
            throw e;
        }
    } finally {
        controller.abort();
    }

    // in case rpc is not synced yet, we add some retries
    const response = promiseRetry(async (retry) => {
        const response = await connection.getTransaction(txId, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
        });

        if (!response) {
            retry(response);
        }
        return response;
    }, { retries: 5, minTimeout: 1e3 });

    return response;
}