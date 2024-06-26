import { ActionRowBuilder } from "discord.js";

export interface UI {
    content: string;
    components?: ActionRowBuilder[];
    ephemeral: boolean;
}