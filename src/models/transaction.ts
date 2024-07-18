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
    contract_address: {
        type: String,
        required: false,
    },
    tx_type: {
        type: String,
        required: false,
    },
    success: {
        type: Boolean,
        required: true,
    },
    tx_signature: {
        type: String,
        required: false,
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
    // fees are in lamports
    total_fee: {
        type: Number,
        required: false,
    },
    callisto_fee: {
        type: Number,
        required: false,
    },
    ref_fee: {
        type: Number,
        required: false,
    },
    processing_time_function: {
        type: Number,
        required: false,
    },
    processing_time_tx: {
        type: Number,
        required: false,
    },
    timestamp: {
        type: Number,
        required: false,
    },
    error: {
        type: Schema.Types.Mixed,
        required: false,
    },
});

export const Transaction = model("Transaction", TransactionSchema, "transactions");