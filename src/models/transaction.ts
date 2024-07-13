import { Schema, model } from "mongoose";

const TransactionSchema = new Schema({
    buy_or_sell: {
        type: String,
        required: true,
    },
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
    success: {
        type: Boolean,
        required: true,
    },
    processing_time_function: {
        type: Number,
        required: true,
    },
    processing_time_tx: {
        type: Number,
        required: false,
    },
    utc_date: {
        type: String,
        required: false,
    },
    unix_timestamp: {
        type: String,
        required: false,
    },
    token_amount: {
        // this will be SOL for buys
        type: Number,
        required: false,
    },
    usd_volume: {
        type: Number,
        required: false,
    },
    fees_in_sol: {
        type: Number,
        required: false,
    },
    error: {
        type: Schema.Types.Mixed,
        required: false,
    },
});

export const Transaction = model("Transaction", TransactionSchema, "transactions");