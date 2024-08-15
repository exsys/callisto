import { Events } from "discord.js";
import { MODAL_COMMANDS } from "../lib/modalCommands";
import { saveError } from "../lib/util";
import { DEFAULT_ERROR_REPLY, DEFAULT_ERROR_REPLY_EPHEM, ERROR_CODES } from "../config/errors";
import { BUTTON_COMMANDS } from "../lib/buttonCommands";
import { MENU_COMMANDS } from "../lib/menuCommands";

const event = {
    name: Events.InteractionCreate,
    async execute(interaction: any) {
        if (interaction.isCommand()) {
            // TODO: find out if deferReply is needed here, because in some cases it will probably take more than 3 seconds
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                console.log(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            if (command.onlyAdmin) {
                let userIsAdmin = false;
                // TODO: check if role actually has admin right
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
                // TODO: it seems like customId is inside interaction, check if I can just send interaction here
                // and get the values in the buttom command with split (instead of sending all values as param)
                // split still has to be used here, but the values don't have to be sent here, interaction
                // can be sent alone and split will be used again in the command to get the values.
                // benefit: no if-else is needed anymore, can just use a single buttonCommand()

                // TODO: make it so values is hand over as a single array instead of all values individually

                if (buttonId.includes("changeUserBlink")) {
                    const values: string[] = buttonId.split(":");
                    const buttonCommand = BUTTON_COMMANDS[values[0] as keyof typeof BUTTON_COMMANDS];
                    await buttonCommand(interaction, values[1], values[2]);
                } else if (buttonId.includes("addFixedAction") || buttonId.includes("addCustomAction")) {
                    const values: string[] = buttonId.split(":");
                    const buttonCommand = BUTTON_COMMANDS[values[0] as keyof typeof BUTTON_COMMANDS];
                    await buttonCommand(interaction, values[1]);
                } else if (buttonId.includes("blinkButton") || buttonId.includes("changeBlinkEmbedValue")) {
                    const values: string[] = buttonId.split(":");
                    const buttonCommand = BUTTON_COMMANDS[values[0] as keyof typeof BUTTON_COMMANDS];
                    await buttonCommand(interaction, values[1], values[2], values[3]);
                } else {
                    const buttonCommand = BUTTON_COMMANDS[buttonId as keyof typeof BUTTON_COMMANDS];
                    await buttonCommand(interaction);
                }
            } catch (error) {
                // NOTE: if inside a buttonCommand a deferReply or reply is used, and then this catch block is executed, 
                // the app will crash. keep that in mind
                await saveError({ function_name: "InteractionCreate interaction.isButton()", error });
                await interaction.reply(DEFAULT_ERROR_REPLY);
            }
        } else if (interaction.isModalSubmit()) {
            const modalId = interaction.customId;
            if (!modalId) {
                await interaction.reply({ content: 'Invalid modal.', ephemeral: true });
                return;
            }

            let inputValues: string[] = [];
            const blinkValuesOrdered: any[] = [];
            // NOTE: max rows per modal is 5 (discord limit), and it's possible to have optional fields between required fields
            // so it's possible that for example value4 is undefined but value5 is defined
            for (let i = 1; i <= 5; i++) {
                try {
                    inputValues.push(interaction.fields.getTextInputValue(`value${i}`));
                    if (modalId.includes("blinkCustomValues")) {
                        blinkValuesOrdered.push({
                            index: i - 1,
                            value: interaction.fields.getTextInputValue(`value${i}`)
                        });
                    }
                } catch (error) { }
            }

            if (!inputValues) {
                await interaction.reply({ content: ERROR_CODES["0001"].message, ephemeral: true });
                return;
            }

            try {
                // TODO: make it so for blinks it just uses the values as param, instead of every single element individually
                if (modalId.includes("blinkCustomValues")) {
                    // for executing a blink with a button that required custom values
                    const values = modalId.split(":");
                    const modalCommand = MODAL_COMMANDS[values[0] as keyof typeof MODAL_COMMANDS];
                    await modalCommand(interaction, [values[1], values[2], blinkValuesOrdered] as any[]);
                } else if (modalId.includes("changeUserBlink")) {
                    // for changing the blink embed  user creates their own blink
                    const values = modalId.split(":");
                    const modalCommand = MODAL_COMMANDS[values[0] as keyof typeof MODAL_COMMANDS];
                    await modalCommand(interaction, [values[1], values[2], inputValues[0]]);
                } else if (modalId.includes("changeBlinkEmbedValue")) {
                    // for changing custom values inside the embed that is acting as a modal (to execute a blink)
                    const values = modalId.split(":");
                    const modalCommand = MODAL_COMMANDS[values[0] as keyof typeof MODAL_COMMANDS];
                    await modalCommand(interaction, [values[1], inputValues[0]]);
                } else if (modalId.includes("addFixedAction") || modalId.includes("addCustomAction")) {
                    // for adding fixed button values to a blink
                    const values = modalId.split(":");
                    const modalCommand = MODAL_COMMANDS[values[0] as keyof typeof MODAL_COMMANDS];
                    await modalCommand(interaction, [values[1], ...inputValues]);
                } else {
                    const modalCommand = MODAL_COMMANDS[modalId as keyof typeof MODAL_COMMANDS];
                    await modalCommand(interaction, inputValues as string[]);
                }
            } catch (error) {
                await saveError({ function_name: "InteractionCreate interaction.isModalSubmit()", error });
                await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
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
                await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
            }
        }
    },
}

export default event;