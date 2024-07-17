import { Schema, model } from "mongoose";
import { DBTransaction } from "../interfaces/db-tx";

const TransactionSchema = new Schema<DBTransaction>({
    user_id: {
        type: String,
        required: true,
    },
    wallet_address: {
        type: String,
        required: true,
    },
    token_address: {
        type: String,
        required: true,
    },
    buy_or_sell: {
        type: String,
        required: true,
    },
    success: {
        type: Boolean,
        required: true,
    },
    token_amount: {
        type: Number,
        required: false,
    },
    sell_amount: {
        type: Number,
        required: false,
    },
    usd_volume: {
        type: Number,
        required: false,
    },
    // fees are in SOL
    total_fees: {
        type: Number,
        required: false,
    },
    callisto_fees: {
        type: Number,
        required: false,
    },
    ref_fees: {
        type: Number,
        required: false,
    },
    processing_time_function: {
        type: Number,
        required: true,
    },
    processing_time_tx: {
        type: Number,
        required: false,
    },
    utc_timestamp: {
        type: String,
        required: false,
    },
    unix_timestamp: {
        type: String,
        required: false,
    },
    error: {
        type: Schema.Types.Mixed,
        required: false,
    },
});

export const Transaction = model("Transaction", TransactionSchema, "transactions");