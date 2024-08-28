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
    successful_blink_executions: {
        type: Number,
        default: 0,
    },
    expired_blink_executions: {
        type: Number,
        default: 0,
    },
    failed_blink_executions: {
        type: Number,
        default: 0,
    },
    successful_transactions: {
        type: Number,
        default: 0,
    },
    expired_transactions: {
        type: Number,
        default: 0,
    },
    failed_transactions: {
        type: Number,
        default: 0,
    },
    successful_token_transfers: {
        type: Number,
        default: 0,
    },
    expired_token_transfers: {
        type: Number,
        default: 0,
    },
    failed_token_transfers: {
        type: Number,
        default: 0,
    },
    claimed_ref_fees: {
        type: Number, // in lamports
        default: 0,
    }
});

export const AppStats = model("AppStats", AppStatsSchema, "app_stats");