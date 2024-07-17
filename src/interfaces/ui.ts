import { ActionRowBuilder } from "discord.js";
import { Referrer } from "./referrer";

export interface UI {
    content: string;
    components?: ActionRowBuilder[];
    ephemeral: boolean;
    signature?: string;
    referrer?: Referrer;
}