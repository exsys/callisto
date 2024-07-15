import { Schema, model } from "mongoose";

const ReferralSchema = new Schema({
    user_id: {
        type: String,
        required: true,
    },
    referrer: {
        type: String,
        required: true,
    },
    ref_code: {
        type: String,
        required: true,
    },
    number_of_referral: {
        type: Number,
        required: true,
    },
    ref_fee: {
        type: Number,
        required: true,
    },
    timestamp: {
        type: Number,
        default: Date.now(),
    },
});

export const Referral = model("Referral", ReferralSchema, "referrals");