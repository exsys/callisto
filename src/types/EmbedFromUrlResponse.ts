import { AttachmentBuilder, EmbedBuilder } from "discord.js";

export interface EmbedFromUrlResponse {
    embed: EmbedBuilder,
    attachment: AttachmentBuilder[] | undefined,
}