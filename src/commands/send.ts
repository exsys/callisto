import { ChatInputCommandInteraction, CommandInteractionOption, InteractionEditReplyOptions, SlashCommandBuilder } from "discord.js";
import { createTokenSelectionUI } from "../lib/discord-ui";
import { Wallet } from "../models/wallet";
import { DEFAULT_ERROR } from "../config/errors";

const command = {
    data: new SlashCommandBuilder()
        .setName("send")
        .setDescription("Send SOL or a token to another user by their username (@ handle).")
        .addUserOption(option => option.setName("username").setRequired(true).setDescription("The Discord handle of the user")),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });

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
                await interaction.editReply("The given user doesn't have a Callisto wallet yet.");
                return;
            }

            const ui: InteractionEditReplyOptions = await createTokenSelectionUI(interaction.user.id, userOption.user.id);
            await interaction.editReply(ui);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    }
}

export default command;