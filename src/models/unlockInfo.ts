import { Schema, model } from "mongoose";
import { AUTOLOCK_DEFAULT } from "../config/constants";

const UnlockInfoSchema = new Schema({
    user_id: {
        type: String,
        required: true,
    },
    wallet_address: {
        type: String,
        required: true,
        unique: true,
    },
    last_unlock_time: {
        type: Number, // unix timestamp in ms
        required: true,
    },
    last_unlock_attempt: {
        type: Number, // unix timestamp in ms
        required: false,
    },
    unlock_attempts: {
        type: Number, // how many attempts in a short time frame
        required: false,
    },
    safety_lock: {
        type: Number, // if defined the wallet cannot be unlocked for <safety_lock> minutes
        required: false,
    },
    total_safety_locks: {
        type: Number, // how many times this wallet was safety locked
        default: 0,
    },
    autolock_timer: {
        type: Number, // in minutes. max 1440
        default: AUTOLOCK_DEFAULT,
    }
}, { timestamps: true });

export const UnlockInfo = model("UnlockInfo", UnlockInfoSchema, "unlock_infos");