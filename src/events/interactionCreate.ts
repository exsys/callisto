import { Events, PermissionFlagsBits } from "discord.js";
import { MODAL_COMMANDS } from "../lib/modalCommands";
import { postDiscordErrorWebhook } from "../lib/util";
import { BUTTON_COMMANDS } from "../lib/buttonCommands";
import { MENU_COMMANDS } from "../lib/menuCommands";

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
                if (!interaction.inGuild()) {
                    return await interaction.reply({ content: "This command can only be executed inside Servers.", ephemeral: true });
                }

                const guildMember = interaction.member;
                if (!guildMember) {
                    return await interaction.reply({ content: "This command can only be executed by Admins.", ephemeral: true });
                }
                if (!guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
                    return await interaction.reply({ content: "This command can be executed only by Admins.", ephemeral: true });
                }
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                await postDiscordErrorWebhook("app", error, "interactionCreate.ts isCommand()");
            }
        } else if (interaction.isButton()) {
            const buttonId = interaction.customId;
            if (!buttonId) {
                await interaction.reply({ content: 'Invalid button.', ephemeral: true });
                return;
            }

            try {
                const values: string[] = buttonId.split(":");
                if (values.length > 1) {
                    const buttonCommand = BUTTON_COMMANDS[values[0] as keyof typeof BUTTON_COMMANDS];
                    await buttonCommand(interaction, ...values.slice(1));
                } else {
                    const buttonCommand = BUTTON_COMMANDS[buttonId as keyof typeof BUTTON_COMMANDS];
                    await buttonCommand(interaction);
                }
            } catch (error) {
                await postDiscordErrorWebhook("app", error, "interactionCreate.ts isButton()");
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
            // so it's possible that, for example, value4 is undefined but value5 is defined
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

            try {
                const values: string[] = modalId.split(":");
                if (modalId.includes("blinkCustomValues")) {
                    // for executing a blink with a button that requires custom values
                    const modalCommand = MODAL_COMMANDS[values[0] as keyof typeof MODAL_COMMANDS];
                    await modalCommand(interaction, [values[1], values[2], blinkValuesOrdered] as any[]);
                } else {
                    // allValues order: 1: values from split(":"), 2: inputValues from modal
                    const allValues: string[] = [...values.slice(1), ...inputValues];
                    const modalCommand = MODAL_COMMANDS[(values.length > 1 ? values[0] : modalId) as keyof typeof MODAL_COMMANDS];
                    await modalCommand(interaction, allValues);
                }
            } catch (error) {
                await postDiscordErrorWebhook("app", error, "interactionCreate.ts isModalSubmit()");
            }
        } else if (interaction.isStringSelectMenu()) {
            const menuId: string | undefined = interaction.customId;
            const value = interaction.values[0];
            if (!menuId) {
                await interaction.reply({ content: 'Invalid select menu.', ephemeral: true });
                return;
            }

            try {
                let values: string[] = menuId.split(":");
                const menuCommand = MENU_COMMANDS[(values.length > 1 ? values[0] : menuId) as keyof typeof MENU_COMMANDS];
                await menuCommand(interaction, value);
            } catch (error) {
                await postDiscordErrorWebhook("app", error, "interactionCreate.ts isStringSelectMenu()");
            }
        }
    },
}

export default event;