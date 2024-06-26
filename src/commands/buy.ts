import { SlashCommandBuilder } from "discord.js";
import { Wallet } from "../models/wallet";

const command = {
    data: new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy a given coin. If no options are given, default exchange and coin are used."),
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