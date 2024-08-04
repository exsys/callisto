import { Events } from "discord.js";
import { BUTTON_COMMANDS, MENU_COMMANDS, MODAL_COMMANDS } from "../lib/ui-commands";
import { saveError } from "../lib/util";

const event = {
    name: Events.InteractionCreate,
    async execute(interaction: any) {
        if (interaction.isCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                console.log(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            if (command.onlyAdmin) {
                let userIsAdmin = false;
                interaction.member.roles.cache.forEach((role: any, index: number) => {
                    if (role.name === "Moderator" || role.name === "Admin" || role.name === "Team") {
                        userIsAdmin = true;
                    }
                });

                if (!userIsAdmin) {
                    await interaction.reply({ content: "Stop right there! This command is only for Moderators!", ephemeral: true });
                    return;
                }
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                await saveError({ function_name: "InteractionCreate interaction.isCommand()", error });
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        } else if (interaction.isButton()) {
            const buttonId = interaction.customId;
            if (!buttonId) {
                await interaction.reply({ content: 'Invalid button.', ephemeral: true });
                return;
            }

            try {
                const buttonCommand = BUTTON_COMMANDS[buttonId as keyof typeof BUTTON_COMMANDS];
                await buttonCommand(interaction);
            } catch (error) {
                await saveError({ function_name: "InteractionCreate interaction.isButton()", error });
                await interaction.reply({ content: 'Server error. Please try again later.', ephemeral: true });
            }
        } else if (interaction.isModalSubmit()) {
            const modalId = interaction.customId;
            if (!modalId) {
                await interaction.reply({ content: 'Invalid modal.', ephemeral: true });
                return;
            }

            let inputValues: string[] = [];
            const totalValues: string[] = ["value1", "value2", "value3"]; // max possible values from callisto modals
            for (const value of totalValues) {
                try {
                    inputValues.push(interaction.fields.getTextInputValue(value));
                } catch (error) {
                    break;
                }
            }

            if (!inputValues) {
                await interaction.reply({ content: 'Server error. Please try again later. Error code: 0001', ephemeral: true });
                return;
            }

            try {
                const modalCommand = MODAL_COMMANDS[modalId as keyof typeof MODAL_COMMANDS];
                await modalCommand(interaction, inputValues as string[]);
            } catch (error) {
                await saveError({ function_name: "InteractionCreate interaction.isModalSubmit()", error });
                await interaction.reply({ content: 'Server error. Please try again later.', ephemeral: true });
            }
        } else if (interaction.isStringSelectMenu()) {
            const menuId = interaction.customId;
            const value = interaction.values[0];
            if (!menuId) {
                await interaction.reply({ content: 'Invalid select menu.', ephemeral: true });
                return;
            }

            try {
                const menuCommand = MENU_COMMANDS[menuId as keyof typeof MENU_COMMANDS];
                await menuCommand(interaction, value);
            } catch (error) {
                await saveError({ function_name: "InteractionCreate interaction.isStringSelectMenu()", error });
                await interaction.reply({ content: 'Server error. Please try again later.', ephemeral: true });
            }
        }
    },
}

export default event;