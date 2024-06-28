import { Events } from "discord.js";
import { BUTTON_COMMANDS, MENU_COMMANDS, MODAL_COMMANDS } from "../lib/ui-commands";

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
                interaction.member.roles.cache.forEach((role: any, i: number) => {
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
                //console.log(error);
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
                console.log(error);
                await interaction.reply({ content: 'Server error. Please try again later.', ephemeral: true });
            }
        } else if (interaction.isModalSubmit()) {
            const modalId = interaction.customId;
            if (!modalId) {
                await interaction.reply({ content: 'Invalid modal.', ephemeral: true });
                return;
            }

            let inputValues: string | string[] | null = null;
            switch (modalId) {
                case "withdrawXSol":
                    const amountToWithdraw = interaction.fields.getTextInputValue("value1");
                    const destinationAddressX = interaction.fields.getTextInputValue("value2");
                    inputValues = [amountToWithdraw, destinationAddressX];
                    break;
                case "sendCoin": 
                    const amountToSend = interaction.fields.getTextInputValue("value1");
                    const destinationAddress = interaction.fields.getTextInputValue("value2");
                    inputValues = [amountToSend, destinationAddress];
                    break;
                default:
                    inputValues = interaction.fields.getTextInputValue("value1");
                    break;
            }

            if (inputValues === null) {
                await interaction.reply({ content: 'Server error. Please try again later. Error code: 0001', ephemeral: true });
                return;
            }

            try {
                const modalCommand = MODAL_COMMANDS[modalId as keyof typeof MODAL_COMMANDS];
                await modalCommand(interaction, inputValues as string & string[]);
            } catch (error) {
                console.log(error);
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
                console.log(error);
                await interaction.reply({ content: 'Server error. Please try again later.', ephemeral: true });
            }
        }
    },
}

export default event;