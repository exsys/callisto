export const ERROR_CODES = {
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
        message: "Server error. Please try again later.",
        context: "Generic error message. Unknown Issue or just a simple server error.",
        short: "Generic error message.",
    },
    "0012": {
        code: "0012",
        message: "Server error. If the issue persists please contact support. Error code: 0012",
        context: "Couldn't get coin stats. Maybe the RPC is down.",
        short: "Failed to get coin stats.",
    },
}