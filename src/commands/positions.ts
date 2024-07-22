import { SlashCommandBuilder } from "discord.js";
import { createSellAndManageUI } from "../lib/discord-ui";
import { UI } from "../interfaces/ui";

const command = {
    data: new SlashCommandBuilder()
        .setName("positions")
        .setDescription("Displays your open positions."),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: true });
        const ui: UI = await createSellAndManageUI({ userId: interaction.user.id });
        await interaction.editReply(ui);
    }
}

export default command;