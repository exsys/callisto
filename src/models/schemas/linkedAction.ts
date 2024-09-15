import { Schema } from "mongoose";

export const LinkedActionSchema = new Schema({
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
}, { _id: false });