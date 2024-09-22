import {
    ChatInputCommandInteraction,
    InteractionReplyOptions,
    ModalBuilder,
    SlashCommandBuilder
} from "discord.js";
import { createAdminUI, createUnlockWalletModal } from "../lib/discord-ui";
import { DEFAULT_ERROR } from "../config/errors";
import { checkWalletLockStatus } from "../lib/db-controller";
import { Wallet } from "../models/wallet";

const command = {
    data: new SlashCommandBuilder()
        .setName("admin")
        .setDescription("Displays the Admin Settings UI."),
    onlyAdmin: true,
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
            const walletIsLocked: boolean | string = await checkWalletLockStatus(interaction.user.id, wallet);
            if (typeof walletIsLocked === "string") return await interaction.reply({ content: walletIsLocked, ephemeral: true });
            if (walletIsLocked) {
                const calledInsideGuild: boolean = interaction.inGuild();
                if (!calledInsideGuild) {
                    return await interaction.reply({ content: "Command can only be used inside a Server.", ephemeral: true });
                }
                const guildId: string | null = interaction.guildId;
                if (!guildId) {
                    return await interaction.reply({ content: "Couldn't retrieve Server information. Please try again later.", ephemeral: true });
                }
                const modal: ModalBuilder = createUnlockWalletModal("admin", guildId);
                return await interaction.showModal(modal);
            } else {
                await interaction.deferReply({ ephemeral: true });
            }

            const calledInsideGuild: boolean = interaction.inGuild();
            if (!calledInsideGuild) {
                return await interaction.editReply("Command can only be used inside a Server.");
            }
            const guildId: string | null = interaction.guildId;
            if (!guildId) {
                return await interaction.editReply("Couldn't retrieve Server information. Please try again later.");
            }
            const ui: InteractionReplyOptions = await createAdminUI(guildId);
            return await interaction.editReply(ui);
        } catch (error) {
            return interaction.editReply(DEFAULT_ERROR);
        }
    }
}

export default command;