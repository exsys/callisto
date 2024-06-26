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
    wallet_id: {
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
    timestamp: {
        type: String,
        required: false,
    },
    error: {
        type: Schema.Types.Mixed,
        required: false,
    },
    usd_volume: {
        type: Number,
        required: false,
    },
});

export const Transaction = model("Transaction", TransactionSchema, "transactions");