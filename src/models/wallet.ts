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
    },
    swap_fee: {
        type: Number,
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
    fees_paid_in_sol: {
        type: Number,
        default: 0,
    },
    settings: {
        type: SettingsSchema,
        default: DEFAULT_SETTINGS,
    },
}, { timestamps: true });

export const Wallet = model("Wallet", WalletSchema, "wallets");