import { ChatInputCommandInteraction, ModalBuilder, SlashCommandBuilder } from "discord.js";
import { createPreBuyUI, createUnlockWalletModal } from "../lib/discord-ui";
import { UIResponse } from "../types/uiResponse";
import { DEFAULT_ERROR } from "../config/errors";
import { parseTokenAddress } from "../lib/util";
import { Wallet } from "../models/wallet";
import { checkWalletLockStatus } from "../lib/db-controller";

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
            const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
            const walletIsLocked: boolean | string = await checkWalletLockStatus(interaction.user.id, wallet);
            if (typeof walletIsLocked === "string") return await interaction.reply({ content: walletIsLocked, ephemeral: true });
            if (walletIsLocked) {
                const contractAddress: string | null = interaction.options.getString("ca");
                const tokenAddress: string | null = parseTokenAddress(contractAddress);
                if (!tokenAddress) return await interaction.reply({ content: "Invalid contract address.", ephemeral: true });
                const modal: ModalBuilder = createUnlockWalletModal("start", tokenAddress);
                return await interaction.showModal(modal);
            } else {
                await interaction.deferReply({ ephemeral: true });
            }
            const contractAddress: string | null = interaction.options.getString("ca");
            const tokenAddress: string | null = parseTokenAddress(contractAddress);
            if (!tokenAddress) return await interaction.editReply({ content: "Invalid contract address." });

            const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, tokenAddress);
            await interaction.editReply(uiResponse.ui);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    }
}
export default command;