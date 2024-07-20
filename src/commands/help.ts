import { SlashCommandBuilder } from "discord.js";
import { UI } from "../interfaces/ui";
import { createHelpUI } from "../lib/discord-ui";

const command = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show more information about the Callist Bot."),
    async execute(interaction: any) {
        const helpUI: UI = createHelpUI();
        await interaction.reply(helpUI);
    }
}
export default command;