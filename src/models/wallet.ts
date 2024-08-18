import { Schema, model } from "mongoose";
import { DEFAULT_SETTINGS, SettingsSchema } from "./schemas/settings";

const WalletSchema = new Schema({
    wallet_id: {
        // unique for each user
        type: String,
        required: true,
    },
    user_id: {
        type: String,
        required: true,
    },
    user_id_deleted: {
        type: String,
        required: false,
    },
    is_default_wallet: {
        type: Boolean,
        required: true,
    },
    wallet_name: {
        type: String,
        required: false,
    },
    wallet_address: {
        type: String,
        required: true,
        unique: true,
    },
    swap_fee: {
        type: Number, // in percent. 0.75 = 0.75%
        required: true,
    },
    total_transactions: {
        type: Number,
        default: 0,
    },
    volume_in_usd: {
        type: Number,
        default: 0,
    },
    encrypted_private_key: {
        type: String,
        required: true,
    },
    key_exported: {
        type: Boolean,
        default: false,
    },
    iv: {
        type: String,
        required: true,
    },
    settings: {
        type: SettingsSchema,
        default: DEFAULT_SETTINGS,
    },
}, { timestamps: true });

export const Wallet = model("Wallet", WalletSchema, "wallets");