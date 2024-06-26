import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from "discord.js";
import { createStartUI } from "../lib/discord-ui";

const command = {
    data: new SlashCommandBuilder()
        .setName("start")
        .setDescription("Display the Callisto UI."),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: true });
        try {
            // check if user created wallet already
            const userId = interaction.user.id;
            const startUI = await createStartUI(userId);
            await interaction.editReply(startUI);
        } catch (error) {
            console.log(error);
            await interaction.editReply("Server error. Please try again later.");
        }
    }
}

export default command;