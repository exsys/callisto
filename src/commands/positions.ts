import { ChatInputCommandInteraction, InteractionEditReplyOptions, ModalBuilder, SlashCommandBuilder } from "discord.js";
import { createSellAndManageUI, createUnlockWalletModal } from "../lib/discord-ui";
import { Wallet } from "../models/wallet";
import { checkWalletLockStatus } from "../lib/db-controller";

const command = {
    data: new SlashCommandBuilder()
        .setName("positions")
        .setDescription("Displays your open positions."),
    async execute(interaction: ChatInputCommandInteraction) {
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        const walletIsLocked: boolean | string = await checkWalletLockStatus(interaction.user.id, wallet);
        if (typeof walletIsLocked === "string") {
            return await interaction.reply({ content: walletIsLocked, ephemeral: true });
        }
        
        if (walletIsLocked) {
            const modal: ModalBuilder = createUnlockWalletModal("positions");
            return await interaction.showModal(modal);
        } else {
            await interaction.deferReply({ ephemeral: true });
        }
        const ui: InteractionEditReplyOptions = await createSellAndManageUI({ user_id: interaction.user.id });
        await interaction.editReply(ui);
    }
}

export default command;