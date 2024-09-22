import { createStartUI, createUnlockWalletModal } from "../lib/discord-ui";
import {
    ChatInputCommandInteraction,
    InteractionEditReplyOptions,
    ModalBuilder,
    SlashCommandBuilder
} from "discord.js";
import { DEFAULT_ERROR_REPLY_EPHEM } from "../config/errors";
import { checkWalletLockStatus } from "../lib/db-controller";
import { Wallet } from "../models/wallet";

const command = {
    data: new SlashCommandBuilder()
        .setName("start")
        .setDescription("Displays the Callisto UI."),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
            const walletIsLocked: boolean | string = await checkWalletLockStatus(interaction.user.id, wallet);
            if (typeof walletIsLocked === "string") return await interaction.reply({ content: walletIsLocked, ephemeral: true });
            if (walletIsLocked) {
                const modal: ModalBuilder = createUnlockWalletModal("start");
                return await interaction.showModal(modal);
            } else {
                await interaction.deferReply({ ephemeral: true });
            }

            const startUI: InteractionEditReplyOptions = await createStartUI(interaction.user.id, wallet);
            await interaction.editReply(startUI);
        } catch (error) {
            await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
        }
    }
}

export default command;