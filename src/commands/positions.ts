import { ChatInputCommandInteraction, InteractionEditReplyOptions, SlashCommandBuilder } from "discord.js";
import { createSellAndManageUI } from "../lib/discord-ui";

const command = {
    data: new SlashCommandBuilder()
        .setName("positions")
        .setDescription("Displays your open positions."),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id });
        await interaction.editReply(ui);
    }
}

export default command;