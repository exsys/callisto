import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { createPreBuyUI } from "../lib/discord-ui";
import { UIResponse } from "../types/uiResponse";
import { checkIfValidAddress } from "../lib/solanaweb3";
import { DEFAULT_ERROR } from "../config/errors";

const command = {
    data: new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy a coin with the given contract address.")
        .addStringOption(option => option
            .setName('ca')
            .setRequired(true)
            .setDescription('The contract address of the Solana Token')),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            const contractAddress: string | null = interaction.options.getString("ca");
            const isValidAddress: boolean = await checkIfValidAddress(contractAddress);
            if (!isValidAddress) {
                await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address." });
                return;
            }

            const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, contractAddress as string);
            await interaction.editReply(uiResponse.ui);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    }
}
export default command;