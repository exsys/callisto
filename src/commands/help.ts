import { ChatInputCommandInteraction, InteractionReplyOptions, SlashCommandBuilder } from "discord.js";
import { createHelpUI } from "../lib/discord-ui";

const command = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show more information about the Callisto Bot."),
    async execute(interaction: ChatInputCommandInteraction) {
        const helpUI: InteractionReplyOptions = createHelpUI();
        await interaction.reply(helpUI);
    }
}
export default command;