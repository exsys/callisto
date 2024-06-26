import { SlashCommandBuilder } from "discord.js";
import { createNewWallet } from "../lib/util";

const command = {
    data: new SlashCommandBuilder()
        .setName("create")
        .setDescription("Creates a new solana wallet."),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const solanaWallet = await createNewWallet(interaction.user.id);
            if (!solanaWallet) {
                await interaction.editReply("Server error. If this issue persists please contact Support. Error code: 0005");
                return;
            }
            await interaction.editReply(`Your new wallet has been created.\nWallet address: ${solanaWallet}\n\nYou can export the private key by using the command /export.`);
        } catch (error) {
            console.log(error);
            await interaction.editReply("Server error. Please try again later.");
        }
    }
}
export default command;