import { ChatInputCommandInteraction, CommandInteractionOption, InteractionEditReplyOptions, ModalBuilder, SlashCommandBuilder } from "discord.js";
import { createTokenSelectionUI, createUnlockWalletModal } from "../lib/discord-ui";
import { Wallet } from "../models/wallet";
import { DEFAULT_ERROR, DEFAULT_ERROR_REPLY_EPHEM } from "../config/errors";
import { checkWalletLockStatus } from "../lib/db-controller";

const command = {
    data: new SlashCommandBuilder()
        .setName("send")
        .setDescription("Send SOL or a token to another user by their username (@ handle).")
        .addUserOption(option => option.setName("username").setRequired(true).setDescription("The Discord handle of the user")),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
            const walletIsLocked: boolean | string = await checkWalletLockStatus(interaction.user.id, wallet);
            if (typeof walletIsLocked === "string") return await interaction.reply({ content: walletIsLocked, ephemeral: true });
            if (walletIsLocked) {
                const userOption: CommandInteractionOption | null = interaction.options.get("username");
                if (!userOption || !userOption.user) {
                    return await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
                }
                if (userOption.user.bot) {
                    return await interaction.reply({ content: "You can't select bots.", ephemeral: true });
                }
                if (interaction.user.id === userOption.user.id) {
                    return await interaction.reply({ content: "You can't select yourself.", ephemeral: true });
                }
                const modal: ModalBuilder = createUnlockWalletModal("send", userOption.user.id);
                return await interaction.showModal(modal);
            } else {
                await interaction.deferReply({ ephemeral: true });
            }

            const userOption: CommandInteractionOption | null = interaction.options.get("username");
            if (!userOption || !userOption.user) {
                await interaction.editReply(DEFAULT_ERROR);
                return;
            }
            if (userOption.user.bot) {
                await interaction.editReply("You can't select bots.");
                return;
            }
            if (interaction.user.id === userOption.user.id) {
                await interaction.editReply("You can't select yourself.");
                return;
            }

            const recipientWallet: any = await Wallet.findOne({ user_id: userOption.user.id, is_default_wallet: true }).lean();
            if (!recipientWallet) {
                return await interaction.editReply("The given user doesn't have a Callisto wallet yet.");
            }

            const ui: InteractionEditReplyOptions = await createTokenSelectionUI(interaction.user.id, userOption.user.id);
            await interaction.editReply(ui);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    }
}

export default command;