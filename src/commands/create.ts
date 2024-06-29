import { SlashCommandBuilder } from "discord.js";
import { createNewWallet } from "../lib/util";
import { ERROR_CODES } from "../config/errors";

const command = {
    data: new SlashCommandBuilder()
        .setName("create")
        .setDescription("Creates a new solana wallet."),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const solanaWallet = await createNewWallet(interaction.user.id);
            if (!solanaWallet) {
                await interaction.editReply({ content: ERROR_CODES["0005"].message, ephemeral: true });
                return;
            }
            await interaction.editReply({ content: `Your new wallet has been created.\nWallet address: ${solanaWallet}`, ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.editReply("Server error. Please try again later.");
        }
    }
}
export default command;