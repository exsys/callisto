import { Schema, model } from "mongoose";

const GuildSettingsSchema = new Schema({
    guild_id: {
        type: String,
        required: true,
    },
    blinks_conversion: {
        type: Boolean,
        default: true,
    },
});

export const GuildSettings = model("GuildSettings", GuildSettingsSchema, "guild_settings");