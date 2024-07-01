import { Schema, model } from "mongoose";

const PrivateKeySchema = new Schema({
    user_id: {
        type: String,
        required: true,
    },
    wallet_id: {
        // unique for each user
        type: String,
        required: true,
    },
    encrypted_private_key: {
        type: String,
        required: true,
    },
    key_exported: {
        type: Boolean,
        default: false,
    },
    wallet_address: {
        type: String,
        required: true,
    },
    iv: {
        type: String,
        required: true,
    },
}, { timestamps: true });

export const PrivateKey = model("PrivateKey", PrivateKeySchema, "private_keys");