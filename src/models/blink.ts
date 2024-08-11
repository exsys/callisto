import { Schema, model } from "mongoose";

const BlinkSchema = new Schema({
    user_id: {
        type: String,
        required: true,
    },
    blink_id: {
        type: String,
        required: true,
    },
    icon: {
        type: String,
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    label: {
        type: String,
        required: true,
    },
    disabled: {
        type: String,
        default: false,
    },
    links: {
        actions: {
            type: [{
                href: String,
                label: String,
                parameters: {
                    type: [{
                        name: String,
                        label: String,
                        required: Boolean,
                    }]
                },
            }],
        },
    },
    error: {
        message: String,
    }
});

export const Blink = model("Blink", BlinkSchema, "blinks");