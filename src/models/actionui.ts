import { Schema, model } from "mongoose";

const ActionUiSchema = new Schema({
    action_id: {
        type: Number,
        required: true,
        unique: true,
    },
    posted_url: {
        type: String, // original url that was initially posted
        required: true,
    },
    root_url: {
        type: String, // root url 
        required: true,
    },
    action_root_url: {
        type: String, // api path but without the "*"
        required: true,
    },
    action_url: {
        type: String, // where the GET ActionGetResponse is done
        required: true,
    },
    path_pattern: {
        type: String, // pathPattern from ActionRuleObject. Only defined if actions.json found
        required: false,
    },
    api_path: {
        type: String, // apiPath from ActionRuleObject. Only defined if actions.json found
        required: false,
    },
    action: {
        type: {
            icon: String,
            title: String,
            description: String,
            label: String,
            disabled: Boolean,
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
                            }],
                            required: false,
                            _id: false,
                        },
                    }],
                    required: true,
                    _id: false,
                },
            },
            error: {
                message: String,
            }
        },
        required: true,
        _id: false,
    },
    buttons: {
        type: [{
            button_id: Number,
            custom_id: String,
            label: String,
            href: String,
            parameters: {
                type: [{
                    name: String,
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
    embed: {
        type: Object,
        required: true,
    },
    rows: {
        type: [{
            type: Object,
        }],
        required: true,
        _id: false,
    },
    has_attachment: {
        type: Boolean,
        default: false,
    }
});

export const ActionUI = model("ActionUI", ActionUiSchema, "action_uis");