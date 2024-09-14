import { Schema, model } from "mongoose";
import { IChainedAction } from "../types/ChainedAction";

const ChainedActionUiSchema = new Schema<IChainedAction>({
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
        type: String,
        required: true,
    },
    chain_id: {
        type: String,
        required: true,
    },
    post_action: {
        type: {
            transaction: {
                type: String,
                required: true,
            },
            message: {
                type: String,
                required: false,
            },
            links: {
                type: {
                    next: {
                        type: {
                            type: String,
                            required: true,
                        },
                        href: {
                            // only for NextActionLink's of type "post"
                            type: String,
                            required: false,
                        },
                        action: {
                            // only for NextActionLink's of type "inline"
                            type: {
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
                                type: Boolean,
                                required: false,
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
                            error: {
                                type: {
                                    message: {
                                        type: String,
                                        required: true,
                                    }
                                },
                                required: false,
                                _id: false,
                            }
                        }
                    },
                },
                required: true,
                _id: false,
            },
        },
        required: false,
        _id: false,
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
        required: false,
        _id: false,
    },
});

export const ChainedAction = model("ChainedAction", ChainedActionUiSchema, "chained_actions");