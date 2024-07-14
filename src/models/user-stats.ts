import { Schema, model } from "mongoose";

const UserStatsSchema = new Schema({
    user_id: {
        type: String,
        required: true,
    },
    wallets_created: {
        type: Number,
        default: 0,
    },
    fee: {
        type: Number,
        default: 0.75, // fee in percent
    },
    total_volume: {
        // total volume in usd traded by the user
        type: Number,
        default: 0,
    },
    total_refs: {
        // total number of people referred by the user
        type: Number,
        default: 0,
    },
    ref_rewards_received: {
        type: Number,
        default: 0,
    },
    ref_link: {
        type: String,
        required: false,
    },
}, { timestamps: true });

export const UserStats = model("UserStats", UserStatsSchema, "user_stats");