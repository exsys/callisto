import { Schema } from "mongoose";

export const SettingsSchema = new Schema({
    min_position_value: {
        type: Number,
        required: true,
    },
    auto_buy_value: {
        type: Number,
        required: true,
    },
    tx_priority_value: {
        type: Number, // in lamports
        required: true,
    },
    mev_protection: {
        type: String, // off || on
        required: true,
    },
    buy_slippage: {
        type: Number,
        required: true,
    },
    sell_slippage: {
        type: Number,
        required: true,
    },
    buy_button_1: {
        type: Number,
        required: true,
    },
    buy_button_2: {
        type: Number,
        required: true,
    },
    buy_button_3: {
        type: Number,
        required: true,
    },
    buy_button_4: {
        type: Number,
        required: true,
    },
    sell_button_1: {
        type: Number,
        required: true,
    },
    sell_button_2: {
        type: Number,
        required: true,
    },
    sell_button_3: {
        type: Number,
        required: true,
    },
    sell_button_4: {
        type: Number,
        required: true,
    },
}, { _id: false });

export const DEFAULT_SETTINGS = {
    min_position_value: 0.1,
    auto_buy_value: 0,
    tx_priority_value: 300000, // in lamports
    mev_protection: "off",
    buy_slippage: 10,
    sell_slippage: 10,
    buy_button_1: 0.5,
    buy_button_2: 1.0,
    buy_button_3: 2.5,
    buy_button_4: 5.0,
    sell_button_1: 25,
    sell_button_2: 50,
    sell_button_3: 75,
    sell_button_4: 100,
};