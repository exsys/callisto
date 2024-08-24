import { Schema, model } from "mongoose";

const BlinkSchema = new Schema({
    blink_id: {
        type: String,
        required: true,
        unique: true,
    },
    user_id: {
        type: String,
        required: true,
    },
    wallet_address: {
        // the receiving wallet for donations
        type: String,
        required: false,
    },
    blink_type: {
        type: String,
        required: true,
    },
    is_complete: {
        type: Boolean,
        default: false,
    },
    required_parameters: {
        // values that have to be submitted inside the url search params eg /:id?amount={amount}
        type: [String],
        required: false,
    },
    token_address: {
        // if not defined SOL will be used
        type: String,
        required: false,
    },
    title_url: {
        type: String,
        default: "https://callistobot.com"
    },
    icon: {
        type: String,
        required: false,
    },
    title: {
        type: String,
        default: "title",
    },
    description: {
        type: String,
        default: "description",
    },
    label: {
        type: String,
        default: "label",
    },
    disabled: {
        type: Boolean,
        default: true,
    },
    links: {
        type: {
            actions: {
                type: [{
                    href: {
                        type: String,
                        required: true
                    },
                    label: {
                        type: String,
                        required: true
                    },
                    embed_field_value: {
                        // NOTE: this is not from the Solana Blinks standard
                        type: String,
                        required: true,
                    },
                    token_amount: {
                        // NOTE: this is not from the Solana Blinks standard
                        type: Number,
                        required: false,
                    },
                    parameters: {
                        type: [{
                            name: {
                                type: String,
                                required: true,
                            },
                            label: String,
                            required: Boolean,
                        }],
                        required: false,
                        _id: false,
                    },
                }],
                required: true,
                _id: false,
            },
        },
        required: false,
        _id: false,
    },
});

export const Blink = model("Blink", BlinkSchema, "blinks");