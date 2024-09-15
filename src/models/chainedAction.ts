import { Schema, model } from "mongoose";
import { IChainedAction } from "../types/ChainedAction";
import { LinkedActionSchema } from "./schemas/linkedAction";

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
    href: {
        // only for NextActionLink of type "post"
        type: String,
        required: false,
    },
    links: {
        // only for NextActionLink of type "inline"
        type: {
            actions: {
                type: [LinkedActionSchema],
                required: true,
                _id: false,
            },
        },
        required: false,
        _id: false,
    },
}, { timestamps: true });

export const ChainedAction = model("ChainedAction", ChainedActionUiSchema, "chained_actions");