import { SlashCommandBuilder } from "discord.js";
import { createRefCodeModal, createStartUI } from "../lib/discord-ui";
import { REFCODE_MODAL_STRING } from "../config/constants";

const command = {
    data: new SlashCommandBuilder()
        .setName("start")
        .setDescription("Displays the Callisto UI."),
    async execute(interaction: any) {
        try {
            const startUI = await createStartUI(interaction.user.id);
            if (startUI.content === REFCODE_MODAL_STRING) {
                try {
                    const refCodeModal = createRefCodeModal();
                    await interaction.showModal(refCodeModal);
                    return;
                } catch (error) {
                    await interaction.reply("Server error. Please try again later.");
                    return;
                }
            }
            await interaction.reply(startUI);
        } catch (error) {
            await interaction.reply("Server error. Please try again later.");
        }
    }
}

export default command;