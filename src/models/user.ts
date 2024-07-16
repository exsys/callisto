import { Schema, model } from "mongoose";

const UserSchema = new Schema({
    user_id: {
        type: String,
        required: true,
    },
    wallets_created: {
        type: Number,
        default: 0,
    },
    swap_fee: {
        type: Number,
        default: 0.75, // fee in percent
    },
    total_volume: {
        // total volume in usd traded by the user
        type: Number,
        default: 0,
    },
    ref_code: {
        type: String,
        required: false,
    },
    total_refs: {
        // total number of people referred by the user
        type: Number,
        default: 0,
    },
    used_referral: {
        type: {
            code: String,
            timestamp: Number,
            referrer_user_id: String,
            refferer_wallet: String,
            fee_level: Number,
            number_of_referral: Number,
        },
        required: false,
    }
}, { timestamps: true });

export const User = model("User", UserSchema, "users");