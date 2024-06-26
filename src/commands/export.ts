// show private key in DMs

import { SlashCommandBuilder } from "discord.js";
import { Wallet } from "../models/wallet";

const command = {
    data: new SlashCommandBuilder()
        .setName("export")
        .setDescription("Show the private key of a given wallet."),
    async execute(interaction: any) {
        try {
            await interaction.deferReply({ ephemeral: true });

            await interaction.editReply("not implemented yet");
        } catch (error) {
            await interaction.editReply("Server error. Please try again later.");
        }
    }
}
export default command;