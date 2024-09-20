import { TxResponse } from "../types/txResponse";

export const DEFAULT_ERROR: string = "Server error. Please try again later.";
export const DEFAULT_ERROR_REPLY = { content: DEFAULT_ERROR };
export const DEFAULT_ERROR_REPLY_EPHEM = { content: DEFAULT_ERROR, ephemeral: true };

export const ERROR_CODES = {
    "0000": {
        code: "0000",
        message: DEFAULT_ERROR,
        context: "Generic error message. Unknown Issue or just a simple server error.",
        short: "Generic error message.",
    },
    "0001": {
        code: "0001",
        message: "Server error. Please try again later. Error code: 0001",
        context: "Empty input values in interactionCreate",
        short: "Empty input values",
    },
    "0002": {
        code: "0002",
        message: "Server error. Please try again later. Error code: 0002",
        context: "Couldn't find recipient wallet eventhough it was checked already. Check DB connection",
        short: "Couldn't find recipient wallet.",
    },
    "0003": {
        code: "0003",
        message: "Server Error. If the issue persists please contact support. Error code: 0003",
        context: "Couldn't find default wallet in database.",
        short: "Couldn't find default wallet",
    },
    "0004": {
        code: "0004",
        message: "An error occurred while transferring funds. If the issue persists please contact support. Error code: 0004",
        context: "Failed to transfer funds to another wallet. Problem is most likely the connection (rpc) to the Solana network.",
        short: "Failed to transfer funds",
    },
    "0005": {
        code: "0005",
        message: "Server error. If this issue persists please contact support. Error code: 0005",
        context: "Failed to create a new wallet. Check the connection to the database.",
        short: "Failed to create wallet",
    },
    "0006": {
        code: "0006",
        message: "Contract address not found. If the issue persists please contact support. Error code: 0006",
        context: "Failed to find contract address from message. (the one from the discord message to which the bot replies)",
        short: "Failed to get CA from message",
    },
    "0007": {
        code: "0007",
        message: "Coin not found. If the issue persists please contact support. Error code: 0007",
        context: "Couldn't find given coin after selecting it through the sell & manage UI.",
        short: "Failed to find coin with CA",
    },
    "0008": {
        code: "0008",
        message: "Server error. If the issue persists please contact support. Error code: 0008",
        context: "Couldn't find corresponding token account of wallet address. Maybe the RPC is down.",
        short: "Couldn't find token account",
    },
    "0009": {
        code: "0009",
        message: "Server error. If the issue persists please contact support. Error code: 0009",
        context: "Couldn't get coin metadata. Maybe the RPC is down.",
        short: "Failed to get coin metadata.",
    },
    "0010": {
        code: "0010",
        message: "Server error. If the issue persists please contact support. Error code: 0010",
        context: "Couldn't decrypt private key.",
        short: "Couldn't decrypt private key.",
    },
    "0011": {
        code: "0011",
        message: "Server error. Please try again later. Error code: 0011",
        context: "Could not find user in DB.",
        short: "Couldn't find user in DB.",
    },
    "0012": {
        code: "0012",
        message: "Server error. If the issue persists please contact support. Error code: 0012",
        context: "Couldn't get coin stats. Maybe the RPC is down.",
        short: "Failed to get coin stats.",
    },
    "0013": {
        code: "0013",
        message: "Server error. Please contact support for more information. Error code: 0013",
        context: "Couldn't find user in DB after using referral code.",
        short: "Couldn't find user after using ref code",
    },
    "0014": {
        code: "0014",
        message: "The submitted referral code does not exist. Please contact support if you believe there was a mistake.",
        context: "Couldn't find user of corresponding referral code.",
        short: "Couldn't find user with ref code",
    },
    "0015": {
        code: "0015",
        message: "Server error. Please try again later. Error code: 0015",
        context: "Error while trying to get wallet balance. Check RPC",
        short: "Got null for wallet balance",
    },
    "0016": {
        code: "0016",
        message: "Server error. If the issue persists please contact support. Error code: 0016",
        context: "Failed to claim unpaid ref fees.",
        short: "Failed to claim unpaid ref fees.",
    },
    "0017": {
        code: "0017",
        message: "Couldn't find Blink. If the issue persists please contact support.",
        context: "Couldn't find corresponding user Blink in database",
        short: "Couldn't find user Blink.",
    }
}

export function customError({
    user_id,
    wallet_address,
    tx_type,
    contract_address,
    destination_address,
    token_amount,
    response,
    error,
}: TxResponse): TxResponse {
    return {
        user_id,
        wallet_address,
        tx_type,
        success: false,
        token_amount,
        contract_address,
        destination_address,
        response,
        error,
    }
}

export function walletNotFoundError({ user_id, tx_type, contract_address }: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        response: ERROR_CODES["0003"].message,
        success: false,
        contract_address,
        error: ERROR_CODES["0003"].context,
    };
}

export function decryptError({ user_id, tx_type, wallet_address, contract_address, token_stats }: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: ERROR_CODES["0010"].message,
        success: false,
        contract_address,
        token_stats,
        error: ERROR_CODES["0010"].context,
    };
}

export function txExpiredError({
    user_id,
    tx_type,
    wallet_address,
    contract_address,
    tx_signature,
    token_amount,
    sell_amount,
    token_stats,
    include_retry_button = false
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Transaction expired. Consider increasing the Transaction Priority in the Settings.",
        success: false,
        contract_address,
        tx_signature,
        token_amount,
        sell_amount,
        token_stats,
        include_retry_button,
        error: "Transaction expired.",
    };
}

export function txMetaError({
    user_id,
    tx_type,
    wallet_address,
    destination_address,
    contract_address,
    tx_signature,
    token_amount,
    sell_amount,
    token_stats,
    include_retry_button = false,
    error,
    response,
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        destination_address,
        response: response ? response : "Transaction failed. Please try again.",
        success: false,
        contract_address,
        tx_signature,
        token_amount,
        sell_amount,
        token_stats,
        include_retry_button,
        error: "Transaction meta error: " + JSON.stringify(error),
    };
}

export function notSignedError({
    user_id,
    tx_type,
    wallet_address,
    contract_address,
    token_amount,
    sell_amount,
    token_stats,
    include_retry_button = false
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Failed to sign transaction. If the issue persists please contact support.",
        success: false,
        contract_address,
        token_amount,
        sell_amount,
        token_stats,
        include_retry_button,
        error: "Failed to sign transaction.",
    };
}

export function unknownError({
    user_id,
    tx_type,
    wallet_address,
    contract_address,
    token_amount,
    sell_amount,
    token_stats,
    include_retry_button = false,
    processing_time_function,
    error
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: ERROR_CODES["0000"].message,
        success: false,
        contract_address,
        token_amount,
        sell_amount,
        token_stats,
        include_retry_button,
        processing_time_function,
        error,
    }
}

export function invalidNumberError({ user_id, tx_type, wallet_address, contract_address }: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Please enter a valid number and try again.",
        success: false,
        contract_address,
        error: "Invalid number for SOL transfer submitted",
    };
}

export function insufficientBalanceError({
    user_id,
    tx_type,
    wallet_address,
    contract_address,
    token_stats,
    token_amount,
    sell_amount,
    include_retry_button = false
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Insufficient balance. Please check your balance and try again.",
        success: false,
        contract_address,
        token_stats,
        token_amount,
        sell_amount,
        include_retry_button,
        error: "Insufficient wallet balance for SOL transfer",
    };
}

export function tokenAccountNotFoundError({ user_id, tx_type, wallet_address }: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: ERROR_CODES["0008"].message,
        success: false,
        error: "Source token account not found. This should not be possible. " + ERROR_CODES["0008"].context,
    }
}

export function destinationTokenAccountError({ user_id, tx_type, wallet_address }: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: ERROR_CODES["0008"].message,
        success: false,
        error: "Destination token account not found. Maybe it failed to create associated token account or RPC is down. ",
    }
}

export function coinstatsNotFoundError({
    user_id,
    tx_type,
    wallet_address,
    contract_address,
    sell_amount,
    include_retry_button = false
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Coin not found. Please try again later.",
        success: false,
        contract_address,
        sell_amount,
        include_retry_button,
        error: `Error when getting coin stats of ${contract_address}`
    };
}

export function invalidAmountError({ user_id, tx_type, wallet_address, contract_address }: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Invalid amount. Please enter a number above 0.",
        success: false,
        contract_address,
        error: "Invalid amount for token buy submitted."
    };
}

export function coinMetadataError({
    user_id,
    tx_type,
    wallet_address,
    contract_address,
    token_amount,
    include_retry_button = false
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Coin not tradeable. Please try again later.",
        success: false,
        contract_address,
        token_amount,
        include_retry_button,
        error: "Error when getting coin metadata"
    };
}

export function quoteResponseError({
    user_id,
    tx_type,
    wallet_address,
    contract_address,
    token_amount,
    sell_amount,
    error
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Failed to swap. Please try again.",
        success: false,
        contract_address,
        include_retry_button: true,
        token_amount,
        sell_amount,
        error: "Quote response error: " + JSON.stringify(error),
    };
}

export function postSwapTxError({
    user_id,
    tx_type,
    wallet_address,
    contract_address,
    token_amount,
    sell_amount,
    token_stats,
    error
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Failed to swap. Please try again.",
        success: false,
        contract_address,
        token_amount,
        sell_amount,
        token_stats,
        include_retry_button: true,
        error: "Post swap tx error: " + JSON.stringify(error),
    };
}

export function userNotFoundError({
    user_id,
    tx_type,
    wallet_address,
    contract_address,
    token_amount,
    sell_amount
}: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: ERROR_CODES["0011"].message,
        success: false,
        contract_address,
        token_amount,
        sell_amount,
        error: ERROR_CODES["0011"].context,
    }
}

export function walletBalanceError({ user_id, tx_type, wallet_address, contract_address }: TxResponse): TxResponse {
    return {
        user_id,
        tx_type,
        wallet_address,
        response: "Server error. Please try again later.",
        success: false,
        contract_address,
        error: "Failed to get wallet balance.",
    }
}