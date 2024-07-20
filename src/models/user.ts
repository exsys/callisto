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
        type: Number,
        default: 0, // total volume in usd traded by the user
    },
    ref_code: {
        type: String,
        required: false,
    },
    promo_level: {
        type: String, // special ref fee levels for collabs
        required: false,
    },
    total_refs: {
        type: Number,
        default: 0, // total number of people referred by the user
    },
    unclaimed_ref_fees: {
        type: Number,
        default: 0, // in lamports
    },
    last_fee_claim_timestamp: {
        type: Number,
        required: false,
    },
    claimed_ref_fees: {
        type: Number,
        default: 0, // in lamports
    },
    referral: {
        // the user who referred this user and some stats
        type: {
            code: String,
            promo_level: String,
            timestamp: Number,
            referrer_user_id: String,
            referrer_wallet: String,
            fee_level: Number, // will be ignored if promo_level is defined
            number_of_referral: Number,
        },
        required: false,
        _id: false,
    }
}, { timestamps: true });

export const User = model("User", UserSchema, "users");