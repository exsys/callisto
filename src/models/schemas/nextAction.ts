import { Schema } from "mongoose";
import { LinkedActionSchema } from "./linkedAction";

export const NextActionSchema = new Schema({
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
                type: [LinkedActionSchema],
                required: true,
                _id: false,
            },
        },
        required: false,
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
}, { _id: false });