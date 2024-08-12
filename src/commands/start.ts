import { ChatInputCommandInteraction, InteractionEditReplyOptions, InteractionReplyOptions, ModalBuilder, SlashCommandBuilder } from "discord.js";
import { createRefCodeModal, createStartUI } from "../lib/discord-ui";
import { REFCODE_MODAL_STRING } from "../config/constants";
import { DEFAULT_ERROR } from "../config/errors";

const command = {
    data: new SlashCommandBuilder()
        .setName("start")
        .setDescription("Displays the Callisto UI."),
    async execute(interaction: ChatInputCommandInteraction) {
        // NOTE: deferReply cannot be used here because of showModal
        try {
            const startUI: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
            if (startUI.content === REFCODE_MODAL_STRING) {
                try {
                    const refCodeModal: ModalBuilder = createRefCodeModal();
                    await interaction.showModal(refCodeModal);
                    return;
                } catch (error) {
                    await interaction.reply(DEFAULT_ERROR);
                    return;
                }
            }

            await interaction.reply({ ...startUI as InteractionReplyOptions, ephemeral: true });
        } catch (error) {
            await interaction.reply(DEFAULT_ERROR);
        }
    }
}

export default command;