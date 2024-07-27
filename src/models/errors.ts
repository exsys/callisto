import { Schema, model } from "mongoose";
import { DBError } from "../types/db-error";

const ErrorSchema = new Schema<DBError>({
    user_id: {
        type: String,
        required: false,
    },
    wallet_address: {
        type: String,
        required: false,
    },
    contract_address: {
        type: String,
        required: false,
    },
    tx_signature: {
        type: String,
        required: false,
    },
    timestamp: {
        type: Number,
        required: true,
    },
    function_name: {
        type: String,
        required: true,
    },
    error: {
        type: Schema.Types.Mixed,
        required: true,
    },
});

export const Error = model("Error", ErrorSchema, "errors");