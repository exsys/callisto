import { Schema, model } from "mongoose";

const ChainedActionUiSchema = new Schema({
    user_id: {
        type: String,
        required: true,
    },
    wallet_address: {
        type: String,
        required: true,
    },
    posted_url: {
        type: String,
        required: true,
    },
    action_id: {
        type: Number,
        required: true,
    },
    chain_id: {
        type: Number,
        required: true,
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
        required: true,
        _id: false,
    },
});

export const ActionUI = model("ChainedAction", ChainedActionUiSchema, "chained_actions");