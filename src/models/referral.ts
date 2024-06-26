import { Schema, model } from "mongoose";

const ReferralSchema = new Schema({
    user_id: {
        type: String,
        required: true,
    },
    ref_link_used: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Number,
        default: Date.now(),
    },
    referrer: {
        type: String,
        required: true,
    },
});

export const Referral = model("Referral", ReferralSchema, "referrals");