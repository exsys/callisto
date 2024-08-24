import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { createPreBuyUI } from "../lib/discord-ui";
import { UIResponse } from "../types/uiResponse";
import { DEFAULT_ERROR } from "../config/errors";
import { parseTokenAddress } from "../lib/util";

const command = {
    data: new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy a coin with the given contract address.")
        .addStringOption(option => option
            .setName('ca')
            .setRequired(true)
            .setDescription('The contract address or symbol of the Solana Token')),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            const contractAddress: string | null = interaction.options.getString("ca");
            const tokenAddress: string | null = parseTokenAddress(contractAddress);
            if (!tokenAddress) return await interaction.editReply({ content: "Invalid contract address." });

            const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, tokenAddress as string);
            await interaction.editReply(uiResponse.ui);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    }
}
export default command;