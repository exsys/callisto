import { SlashCommandBuilder } from "discord.js";
import { createPreBuyUI } from "../lib/discord-ui";
import { SolanaWeb3 } from "../lib/solanaweb3";
import { UIResponse } from "../types/ui-response";

const command = {
    data: new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy a coin with the given contract address.")
        .addStringOption(option => option
            .setName('ca')
            .setRequired(true)
            .setDescription('The contract address of the Solana Token')),
    async execute(interaction: any) {
        try {
            await interaction.deferReply({ ephemeral: true });
            const contractAddress: string = interaction.options.getString("ca");
            const isValidAddress: boolean = await SolanaWeb3.checkIfValidAddress(contractAddress);
            if (!isValidAddress) {
                await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address.", ephemeral: true });
                return;
            }

            const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, contractAddress);
            await interaction.editReply(uiResponse.ui);
        } catch (error) {
            await interaction.editReply("Server error. Please try again later.");
        }
    }
}
export default command;