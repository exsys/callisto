// import private key. do this in DMs

import { SlashCommandBuilder } from "discord.js";

const command = {
    data: new SlashCommandBuilder()
        .setName("import")
        .setDescription("Import a wallet with a private key or mnemonic."),
    async execute(interaction: any) {
        try {
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply("not implemented yet");
        } catch (error) {
            await interaction.editReply("Server error. Please try again later.");
        }
    }
}
export default command;