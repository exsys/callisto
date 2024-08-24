import { Schema, model } from "mongoose";

const BlinkVoteResultSchema = new Schema({
    blink_id: {
        type: String,
        required: true,
        unique: true,
    },
    blink_title: {
        type: String,
        required: true,
    },
    creator_user_id: {
        type: String,
        required: true,
    },
    results: {
        type: Object,
        required: false,
        _id: false,
    },
    created_at: {
        type: Number,
        required: true,
    }
});

export const BlinkVoteResult = model("BlinkVoteResult", BlinkVoteResultSchema, "blink_vote_results");