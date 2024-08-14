import { Schema, model } from "mongoose";

const AppStatsSchema = new Schema({
    stats_id: {
        type: Number,
        required: true,
        unique: true,
    },
    registered_users: {
        type: Number,
        default: 0,
    },
    wallets_created: {
        type: Number,
        default: 0,
    },
    wallets_deleted: {
        type: Number,
        default: 0,
    },
    blinks_posted: {
        type: Number,
        default: 0,
    },
    blinks_created: {
        type: Number,
        default: 0,
    },
    transactions: {
        type: Number,
        default: 0,
    },
    token_transfers: {
        type: Number,
        default: 0,
    }
});

export const AppStats = model("AppStats", AppStatsSchema, "app_stats");