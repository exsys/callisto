export const ERROR_CODES = {
    "0000": {
        code: "0000",
        message: "Server error. Please try again later. Error code: 0000",
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
        message: "Server error. Please contact support for more information. Error code: 0002",
        context: "Couldn't find corresponding private key in database.",
        short: "Couldn't find private key",
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
        context: "Failed to find contract address from message. (the one from the bot to which the user replied)",
        short: "Failed to get CA",
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
        context: "Could not find user in UserStats collection.",
        short: "Couldn't find user.",
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
        short: "Couldn't find user",
    },
    "0014": {
        code: "0014",
        message: "Couldn't find referral code. Error code: 0014",
        context: "Couldn't find user of corresponding referral code.",
        short: "Couldn't find user with ref code",
    }
}

// TODO: make it more dynamic, use an object for example. so I can decided with one function wether it's for buy or sell, and if I want to retry etc

export function walletNotFoundError(userId: string, contractAddress?: string) {
    return {
        user_id: userId,
        content: ERROR_CODES["0003"].message,
        success: false,
        contractAddress: contractAddress ? contractAddress : undefined,
        error: ERROR_CODES["0003"].context,
    };
}

export function decryptError(userId: string, contractAddress?: string) {
    return {
        user_id: userId,
        content: ERROR_CODES["0010"].message,
        success: false,
        ca: contractAddress ? contractAddress : undefined,
        error: ERROR_CODES["0010"].context,
    };
}

export function txExpiredError(userId: string) {
    return {
        user_id: userId,
        content: "Failed to swap. Please try again.",
        success: false,
        error: "Transaction expired"
    };
}

export function txExpiredErrorRetry(userId: string, contractAddress: string, amountToSwap: string) {
    return {
        user_id: userId,
        content: "Failed to swap. Please try again.",
        success: false,
        ca: contractAddress,
        amount: amountToSwap,
        includeRetryButton: true,
        error: "Transaction expired.",
    };
}

export function txMetaError(userId: string, error: any) {
    return {
        user_id: userId,
        content: "Failed to swap. Please try again.",
        success: false,
        error
    };
}

export function txMetaErrorRetry(userId: string, contractAddress: string, amountToSwap: string, error: any) {
    return {
        user_id: userId,
        content: "Failed to swap. Please try again.",
        success: false,
        ca: contractAddress,
        amount: amountToSwap,
        includeRetryButton: true,
        error,
    };
}

export function unknownError(userId: string, error: any, contractAddress?: string) {
    return {
        user_id: userId,
        content: ERROR_CODES["0004"].message,
        success: false,
        contractAddress: contractAddress ? contractAddress : undefined,
        error
    }
}

export function unknownErrorRetry(userId: string, contractAddress: string, amountToSwap: string, error: any) {
    return {
        user_id: userId,
        content: "Failed to swap. Please try again.",
        success: false,
        ca: contractAddress,
        amount: amountToSwap,
        includeRetryButton: true,
        error,
    };
}

export function invalidNumberError(userId: string, contractAddress?: string) {
    return {
        user_id: userId,
        content: "Please enter a valid number and try again.",
        success: false,
        contractAddress: contractAddress ? contractAddress : undefined,
        error: "Invalid number for SOL transfer submitted",
    };
}

export function insufficientBalanceError(userId: string, contractAddress?: string) {
    return {
        user_id: userId,
        content: "Insufficient balance. Please check your balance and try again.",
        success: false,
        contractAddress: contractAddress ? contractAddress : undefined,
        error: "Insufficient wallet balance for SOL transfer",
    };
}

export function insufficientBalanceErrorRetry(userId: string, contractAddress: string, amountToSwap: string) {
    return {
        user_id: userId,
        content: "Insufficient balance. Please check your balance and try again.",
        success: false,
        ca: contractAddress,
        amount: amountToSwap,
        includeRetryButton: true,
        error: "Insufficient wallet balance."
    };
}

export function tokenAccountNotFoundError(userId: string) {
    return {
        user_id: userId,
        content: ERROR_CODES["0008"].message,
        success: false,
        error: "Source token account not found. This should not be possible. " + ERROR_CODES["0008"].context,
    }
}

export function destinationTokenAccountError(userId: string) {
    return {
        user_id: userId,
        content: ERROR_CODES["0008"].message,
        success: false,
        error: "Destination token account not found. Maybe it failed to create associated token account or RPC is down. ",
    }
}

export function coinstatsNotFoundError(userId: string, contractAddress: string) {
    return {
        user_id: userId,
        content: "Coin not found. Please try again later.",
        success: false,
        error: `Error when getting coin stats of ${contractAddress}`
    };
}

export function invalidAmountError(userId: string, contractAddress: string) {
    return {
        user_id: userId,
        content: "Invalid amount. Please enter a number above 0.",
        success: false,
        ca: contractAddress,
        error: "Invalid amount for token buy submitted."
    };
}

export function coinMetadataError(userId: string, contractAddress: string, amountToSwap: string) {
    return {
        user_id: userId,
        content: "Coin not tradeable. Please try again later.",
        success: false,
        ca: contractAddress,
        amount: amountToSwap,
        includeRetryButton: true,
        error: "Error when getting coin metadata"
    };
}

export function quoteResponseError(userId: string, contractAddress: string, amountToSwap: string, error: any) {
    return {
        user_id: userId,
        content: "Failed to swap. Please try again.",
        success: false,
        ca: contractAddress,
        includeRetryButton: true,
        amount: amountToSwap,
        error: "Quote response error: " + error
    };
}

export function postSwapTxError(userId: string, contractAddress: string, amountToSwap: string, error: any) {
    return {
        user_id: userId,
        content: "Failed to swap. Please try again.",
        success: false,
        ca: contractAddress,
        amount: amountToSwap,
        includeRetryButton: true,
        error: "Post swap tx error: " + error
    };
}

export function userNotFoundError(userId: string, contractAddress: string, amountToSwap: string) {
    return {
        user_id: userId,
        content: ERROR_CODES["0011"].message,
        success: false,
        ca: contractAddress,
        amount: amountToSwap,
        includeRetryButton: true,
        error: ERROR_CODES["0011"].context,
    }
}