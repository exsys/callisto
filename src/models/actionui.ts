import { Schema, model } from "mongoose";

const ActionUiSchema = new Schema({
    action_id: {
        type: Number,
        required: true,
        unique: true,
    },
    callisto_blink_id: {
        type: String, // only for blinks created with callisto
        required: false,
    },
    callisto_blink_type: {
        type: String, // only for blinks created with callisto
        required: false,
    },
    posted_url: {
        type: String,
        required: true,
    },
});

export const ActionUI = model("ActionUI", ActionUiSchema, "action_uis");