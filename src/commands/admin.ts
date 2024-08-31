import {
    ChatInputCommandInteraction,
    InteractionReplyOptions,
    SlashCommandBuilder
} from "discord.js";
import { createAdminUI } from "../lib/discord-ui";
import { DEFAULT_ERROR } from "../config/errors";

const command = {
    data: new SlashCommandBuilder()
        .setName("admin")
        .setDescription("Displays the Admin Settings UI."),
    onlyAdmin: true,
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });
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