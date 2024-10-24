import { ActionGetResponse, LinkedAction, NextAction } from "@solana/actions";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionEditReplyOptions } from "discord.js";
import { ChainedAction } from "../models/chainedAction";
import { postDiscordErrorWebhook } from "./util";

export function createActionBlinkButtons(
    action_id: number, action: ActionGetResponse
): ActionRowBuilder<ButtonBuilder>[] {
    let buttons: ButtonBuilder[] = [];
    const actions: LinkedAction[] | undefined = action.links?.actions;
    actions?.forEach((linkedAction: LinkedAction, index: number) => {
        // NOTE: discord only allows up to 45 chars for customId, keep that in mind
        // index + 1 is the button_id / number of the button
        const customId: string = `executeBlinkButton:${action_id}:${index + 1}${linkedAction.parameters?.length ? ":custom" : ""}`;
        buttons.push(
            new ButtonBuilder()
                .setCustomId(customId)
                .setLabel(linkedAction.label)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(action.disabled ? true : false)
        );
    });

    if (!buttons.length) {
        // meaning this is a v1 blink (no links array present means it's using default button)
        const customId: string = `executeBlinkButton:${action_id}:${1}`;
        buttons.push(
            new ButtonBuilder()
                .setCustomId(customId)
                .setLabel(action.label)
                .setStyle(ButtonStyle.Primary)
        );
    }

    let rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let tempButtons: ButtonBuilder[] = [];
    for (let i = 0; i < buttons.length; i++) {
        // NOTE: 5 is the max amount of buttons per row (discord api limit)
        if (i !== 0 && i % 5 === 0) {
            rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...tempButtons));
            tempButtons = [buttons[i]];
        } else {
            tempButtons.push(buttons[i]);
        }
    }
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...tempButtons));
    return rows;
}

export async function createChainedActionBlinkButtons(
    action_id: string,
    chain_id: string,
    user_id: string,
    action?: NextAction
): Promise<ActionRowBuilder<ButtonBuilder>[] | undefined> {
    try {
        let linkedActions: LinkedAction[] | undefined;
        if (action) {
            // this block means the NextAction is available, no need to query DB (the case whenever this function is called from executeBlink)
            // this will not be the case if a user clicks a chained action embed
            if ("links" in action) {
                linkedActions = action.links?.actions;
            } else {
                return undefined;
            }
        } else {
            // when a user clicked on a chained action and we have to query it from DB
            const chainedAction: any = await ChainedAction.findOne({ action_id, chain_id, user_id }).lean();
            if (!chainedAction) return undefined;
            linkedActions = chainedAction.links;
        }

        if (linkedActions) {
            let buttons: any[] = [];
            let rows: ActionRowBuilder<ButtonBuilder>[] = [];
            for (let i = 0; i < linkedActions.length; i++) {
                // i + 1 is the button_id / number of the button
                const customId: string = `executeChainedAction:${action_id}.${chain_id}:${i + 1}${linkedActions[i].parameters?.length ? ":custom" : ""}`;
                let blinkDisabled: boolean = action ? (action.disabled !== undefined ? action.disabled : false) : false;
                if (i !== 0 && i % 5 === 0) {
                    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
                    buttons = [];
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId(customId)
                            .setLabel(linkedActions[i].label)
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(blinkDisabled)
                    );
                } else {
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId(customId)
                            .setLabel(linkedActions[i].label)
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(blinkDisabled)
                    );
                }
            }
            rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
            return rows;
        }
    } catch (error) {
        await postDiscordErrorWebhook(
            "blinks",
            error,
            `createChainedActionBlinkButtons | Action: ${action_id} | Chain: ${chain_id} | User: ${user_id} | NextAction?: ${action}`
        );
        return undefined;
    }
}

export function createChainedActionConfirmationButton(action_id: string, chain_id: string): ActionRowBuilder<ButtonBuilder> {
    const confirmationButton = new ButtonBuilder()
        .setCustomId(`executeChainedAction:${action_id}:${chain_id}`)
        .setLabel("Execute")
        .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(confirmationButton);
}

export function createVoteResultButton(blink_id: number): ActionRowBuilder<ButtonBuilder> {
    const voteResultButton = new ButtonBuilder()
        .setCustomId(`showBlinkVoteResults:${blink_id}`)
        .setLabel("Show Results")
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(voteResultButton);
    return row;
}

export function createDepositButton(): ActionRowBuilder<ButtonBuilder> {
    const depositButton = new ButtonBuilder()
        .setCustomId('deposit')
        .setLabel('Deposit')
        .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(depositButton);
}

export function createWalletUIButtons(): ActionRowBuilder<ButtonBuilder>[] {
    const startButton = new ButtonBuilder()
        .setCustomId('start')
        .setLabel('Start')
        .setStyle(ButtonStyle.Secondary);

    const depositButton = new ButtonBuilder()
        .setCustomId('deposit')
        .setLabel('Deposit')
        .setStyle(ButtonStyle.Secondary);

    const withdrawAllSolButton = new ButtonBuilder()
        .setCustomId('withdrawAllSol')
        .setLabel('Withdraw all SOL')
        .setStyle(ButtonStyle.Secondary);

    const withdrawXSolButton = new ButtonBuilder()
        .setCustomId('withdrawXSol')
        .setLabel('Withdraw X SOL')
        .setStyle(ButtonStyle.Secondary);

    const passwordButton = new ButtonBuilder()
        .setCustomId('passwordSettings')
        .setLabel('Password')
        .setStyle(ButtonStyle.Secondary);

    const removeWalletButton = new ButtonBuilder()
        .setCustomId('removeWallet')
        .setLabel('Remove Wallet')
        .setStyle(ButtonStyle.Secondary);

    const changeWallet = new ButtonBuilder()
        .setCustomId('changeWallet')
        .setLabel('Change Wallet')
        .setStyle(ButtonStyle.Secondary);

    const addNewWalletButton = new ButtonBuilder()
        .setCustomId('addNewWallet')
        .setLabel('Add new Wallet')
        .setStyle(ButtonStyle.Secondary);

    const exportPrivKeyButton = new ButtonBuilder()
        .setCustomId('exportPrivKeyConfirmation')
        .setLabel('Export Private Key')
        .setStyle(ButtonStyle.Secondary);

    const firstRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(startButton, depositButton, withdrawAllSolButton, withdrawXSolButton, passwordButton);
    const secondRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(changeWallet, addNewWalletButton, removeWalletButton, exportPrivKeyButton);

    return [firstRow, secondRow];
}

export function createStartUIButtons(includeTestButton: boolean = false): ActionRowBuilder<ButtonBuilder>[] {
    const testButton = new ButtonBuilder()
        .setCustomId('test')
        .setLabel('Test')
        .setStyle(ButtonStyle.Secondary);

    const buyButton = new ButtonBuilder()
        .setCustomId('buy')
        .setLabel('Buy')
        .setStyle(ButtonStyle.Secondary);

    const sellButton = new ButtonBuilder()
        .setCustomId('sellAndManage')
        .setLabel('Sell & Manage')
        .setStyle(ButtonStyle.Secondary);

    const walletButton = new ButtonBuilder()
        .setCustomId('wallet')
        .setLabel('Wallet')
        .setStyle(ButtonStyle.Secondary);

    const settingsButton = new ButtonBuilder()
        .setCustomId('settings')
        .setLabel('Settings')
        .setStyle(ButtonStyle.Secondary);

    const refreshButton = new ButtonBuilder()
        .setCustomId('refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary);

    const helpButton = new ButtonBuilder()
        .setCustomId('help')
        .setLabel('Help')
        .setStyle(ButtonStyle.Secondary);

    const referButton = new ButtonBuilder()
        .setCustomId('refer')
        .setLabel('Refer Friends')
        .setStyle(ButtonStyle.Secondary);

    const advancedButton = new ButtonBuilder()
        .setCustomId('advanced')
        .setLabel('Advanced')
        .setStyle(ButtonStyle.Secondary);

    const blinkSettingsButton = new ButtonBuilder()
        .setCustomId('blinkSettings')
        .setLabel('Blinks')
        .setStyle(ButtonStyle.Secondary);

    const firstRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buyButton, sellButton, blinkSettingsButton, walletButton);
    const secondRow = new ActionRowBuilder<ButtonBuilder>().addComponents(helpButton, referButton, settingsButton, refreshButton);
    if (includeTestButton) secondRow.addComponents(testButton);

    return [firstRow, secondRow];
}

export function createStartButton(content: string): InteractionEditReplyOptions {
    const startButton = new ButtonBuilder()
        .setCustomId('start')
        .setLabel('Start')
        .setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton);
    return { content, components: [row] };
}

export function createBlinkCreationButtons(
    blink_id: number, editMode: boolean = false, blinkDisabled: boolean = false
): ActionRowBuilder<ButtonBuilder>[] {
    const titleButton = new ButtonBuilder()
        .setCustomId(`changeUserBlink:Title:${blink_id}${editMode ? ":e" : ""}`)
        .setLabel('Change Title')
        .setStyle(ButtonStyle.Secondary);

    const urlButton = new ButtonBuilder()
        .setCustomId(`changeUserBlink:Url:${blink_id}${editMode ? ":e" : ""}`)
        .setLabel('Change URL')
        .setStyle(ButtonStyle.Secondary);

    const iconButton = new ButtonBuilder()
        .setCustomId(`changeUserBlink:Icon:${blink_id}${editMode ? ":e" : ""}`)
        .setLabel('Change Image')
        .setStyle(ButtonStyle.Secondary);

    const descriptionButton = new ButtonBuilder()
        .setCustomId(`changeUserBlink:Description:${blink_id}${editMode ? ":e" : ""}`)
        .setLabel('Change Description')
        .setStyle(ButtonStyle.Secondary);

    const labelButton = new ButtonBuilder()
        .setCustomId(`changeUserBlink:Label:${blink_id}${editMode ? ":e" : ""}`)
        .setLabel('Change Label')
        .setStyle(ButtonStyle.Secondary);

    const addActionButton = new ButtonBuilder()
        .setCustomId(`changeUserBlink:AddAction:${blink_id}${editMode ? ":e" : ""}`)
        .setLabel("Add Action")
        .setStyle(ButtonStyle.Secondary);

    const removeActionButton = new ButtonBuilder()
        .setCustomId(`changeUserBlink:RemoveAction:${blink_id}${editMode ? ":e" : ""}`)
        .setLabel("Remove Action")
        .setStyle(ButtonStyle.Secondary);

    const previewButton = new ButtonBuilder()
        .setCustomId('previewBlink')
        .setLabel("Preview")
        .setStyle(ButtonStyle.Secondary);

    const createButton = new ButtonBuilder()
        .setCustomId(`finishBlinkCreation:${blink_id}`)
        .setLabel("Create Blink")
        .setStyle(ButtonStyle.Primary);

    const editButton = new ButtonBuilder()
        .setCustomId(`finishBlinkEdit:${blink_id}`)
        .setLabel("Save")
        .setStyle(ButtonStyle.Primary);

    const disableButton = new ButtonBuilder()
        .setCustomId(`disableBlink:${blink_id}`)
        .setLabel(`${blinkDisabled ? "Disabled" : "Enabled"}`)
        .setStyle(blinkDisabled ? ButtonStyle.Danger : ButtonStyle.Success);

    const row1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(labelButton, titleButton, descriptionButton, iconButton);

    let row2;
    if (editMode) {
        row2 = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(addActionButton, removeActionButton, previewButton, disableButton, editButton);
    } else {
        row2 = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(addActionButton, removeActionButton, previewButton, createButton);
    }

    return [row1, row2];
}

export function createSettingsUIButtons(wallet_settings: any, auto_buy_amount: number): ActionRowBuilder<ButtonBuilder>[] {
    // general settings
    const generalSettingsButton = new ButtonBuilder()
        .setCustomId('generalSettings')
        .setLabel('General Settings:')
        .setStyle(ButtonStyle.Secondary);

    const minPositionValueButton = new ButtonBuilder()
        .setCustomId('minPositionValue')
        .setLabel(`Min Position Value: ${"$" + wallet_settings.min_position_value}`)
        .setStyle(ButtonStyle.Secondary);

    const autoBuyValueButton = new ButtonBuilder()
        .setCustomId('autoBuyValue')
        .setLabel(`Auto Buy: ${auto_buy_amount > 0 ? auto_buy_amount + " SOL" : "Disabled"}`)
        .setStyle(ButtonStyle.Secondary);

    const buySlippageButton = new ButtonBuilder()
        .setCustomId('buySlippage')
        .setLabel(`Buy slippage: ${wallet_settings.buy_slippage}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellSlippageButton = new ButtonBuilder()
        .setCustomId('sellSlippage')
        .setLabel(`Sell slippage: ${wallet_settings.sell_slippage}%`)
        .setStyle(ButtonStyle.Secondary);

    // buy buttons config
    const buyButtonsConfigButton = new ButtonBuilder()
        .setCustomId('buyButtonsConfig')
        .setLabel('Buy Buttons Config:')
        .setStyle(ButtonStyle.Secondary);

    const buyButtons1stButton = new ButtonBuilder()
        .setCustomId('buyButtons1st')
        .setLabel(`1st: ${wallet_settings.buy_button_1} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButtons2ndButton = new ButtonBuilder()
        .setCustomId('buyButtons2nd')
        .setLabel(`2nd: ${wallet_settings.buy_button_2} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButtons3rdButton = new ButtonBuilder()
        .setCustomId('buyButtons3rd')
        .setLabel(`3rd: ${wallet_settings.buy_button_3} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButtons4thButton = new ButtonBuilder()
        .setCustomId('buyButtons4th')
        .setLabel(`4th: ${wallet_settings.buy_button_4} SOL`)
        .setStyle(ButtonStyle.Secondary);

    // sell buttons config
    const sellButtonsConfigButton = new ButtonBuilder()
        .setCustomId('sellButtonsConfig')
        .setLabel('Sell Buttons Config:')
        .setStyle(ButtonStyle.Secondary);

    const sellButtons1stButton = new ButtonBuilder()
        .setCustomId('sellButtons1st')
        .setLabel(`1st: ${wallet_settings.sell_button_1}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellButtons2ndButton = new ButtonBuilder()
        .setCustomId('sellButtons2nd')
        .setLabel(`2nd: ${wallet_settings.sell_button_2}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellButtons3rdButton = new ButtonBuilder()
        .setCustomId('sellButtons3rd')
        .setLabel(`3rd: ${wallet_settings.sell_button_3}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellButtons4thButton = new ButtonBuilder()
        .setCustomId('sellButtons4th')
        .setLabel(`4th: ${wallet_settings.sell_button_4}%`)
        .setStyle(ButtonStyle.Secondary);

    // transaction config
    const transactionConfigButton = new ButtonBuilder()
        .setCustomId('transactionConfig')
        .setLabel('Transaction Config:')
        .setStyle(ButtonStyle.Secondary);

    const mevProtectionButton = new ButtonBuilder()
        .setCustomId('mevProtection')
        .setLabel(`MEV Protection: ${wallet_settings.mev_protection}`)
        .setStyle(ButtonStyle.Secondary);

    const gasLimitButton = new ButtonBuilder()
        .setCustomId('txPriority')
        .setLabel(`Transaction Priority: ${wallet_settings.tx_priority_value / LAMPORTS_PER_SOL} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const firstRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(generalSettingsButton, minPositionValueButton, autoBuyValueButton, buySlippageButton, sellSlippageButton);

    const secondRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(buyButtonsConfigButton, buyButtons1stButton, buyButtons2ndButton, buyButtons3rdButton, buyButtons4thButton);

    const thirdRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(sellButtonsConfigButton, sellButtons1stButton, sellButtons2ndButton, sellButtons3rdButton, sellButtons4thButton);

    const fourthRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(transactionConfigButton, mevProtectionButton, gasLimitButton);
    return [firstRow, secondRow, thirdRow, fourthRow];
}

export function createBlinkSettingsUIButtons(): ActionRowBuilder<ButtonBuilder> {
    const createBlinkButton = new ButtonBuilder()
        .setCustomId('createBlink')
        .setLabel('Create Blink')
        .setStyle(ButtonStyle.Secondary);

    const editBlinkButton = new ButtonBuilder()
        .setCustomId('editBlink')
        .setLabel('Edit Blink')
        .setStyle(ButtonStyle.Secondary);

    const deleteBlinkButton = new ButtonBuilder()
        .setCustomId('deleteBlink')
        .setLabel('Delete Blink')
        .setStyle(ButtonStyle.Secondary);

    const showblinkUrlButton = new ButtonBuilder()
        .setCustomId('showBlinkUrl')
        .setLabel('Show Blink URL')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(createBlinkButton, editBlinkButton, deleteBlinkButton, showblinkUrlButton);
    return row;
}

export function createPreBuyUIButtons(wallet_settings: any, token_address: string): ActionRowBuilder<ButtonBuilder>[] {
    const solscanCoinButton = new ButtonBuilder()
        .setURL(`https://solscan.io/token/${token_address}`)
        .setLabel('Solscan')
        .setStyle(ButtonStyle.Link);

    const buyButton1Button = new ButtonBuilder()
        .setCustomId('buyButton1')
        .setLabel(`Buy ${wallet_settings.buy_button_1} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButton2Button = new ButtonBuilder()
        .setCustomId('buyButton2')
        .setLabel(`Buy ${wallet_settings.buy_button_2} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButton3Button = new ButtonBuilder()
        .setCustomId('buyButton3')
        .setLabel(`Buy ${wallet_settings.buy_button_3} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButton4Button = new ButtonBuilder()
        .setCustomId('buyButton4')
        .setLabel(`Buy ${wallet_settings.buy_button_4} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButtonX = new ButtonBuilder()
        .setCustomId('buyButtonX')
        .setLabel('Buy X SOL')
        .setStyle(ButtonStyle.Secondary);

    const refreshButton = new ButtonBuilder()
        .setCustomId('refreshCoinInfo')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary);

    const firstRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(buyButton1Button, buyButton2Button, buyButton3Button, buyButton4Button, buyButtonX);
    const secondRow = new ActionRowBuilder<ButtonBuilder>().addComponents(solscanCoinButton, refreshButton);
    return [firstRow, secondRow];
}

export function createSellAndManageUIButtons(wallet_settings: any, token_address: string): ActionRowBuilder<ButtonBuilder>[] {
    const buyButton1Button = new ButtonBuilder()
        .setCustomId('buyButton1')
        .setLabel(`Buy ${wallet_settings.buy_button_1} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButton2Button = new ButtonBuilder()
        .setCustomId('buyButton2')
        .setLabel(`Buy ${wallet_settings.buy_button_2} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButton3Button = new ButtonBuilder()
        .setCustomId('buyButton3')
        .setLabel(`Buy ${wallet_settings.buy_button_3} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButton4Button = new ButtonBuilder()
        .setCustomId('buyButton4')
        .setLabel(`Buy ${wallet_settings.buy_button_4} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButtonX = new ButtonBuilder()
        .setCustomId('buyButtonX')
        .setLabel('Buy X SOL')
        .setStyle(ButtonStyle.Secondary);

    const currentCoinButton = new ButtonBuilder()
        .setCustomId('currentCoin')
        .setLabel(`Select Token`)
        .setStyle(ButtonStyle.Secondary);

    const sellCoin1Button = new ButtonBuilder()
        .setCustomId('sellButton1')
        .setLabel(`Sell ${wallet_settings.sell_button_1}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellCoin2Button = new ButtonBuilder()
        .setCustomId('sellButton2')
        .setLabel(`Sell ${wallet_settings.sell_button_2}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellCoin3Button = new ButtonBuilder()
        .setCustomId('sellButton3')
        .setLabel(`Sell ${wallet_settings.sell_button_3}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellCoin4Button = new ButtonBuilder()
        .setCustomId('sellButton4')
        .setLabel(`Sell ${wallet_settings.sell_button_4}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellXPercentButton = new ButtonBuilder()
        .setCustomId('sellButtonX')
        .setLabel('Sell X %')
        .setStyle(ButtonStyle.Secondary);

    const solscanCoinButton = new ButtonBuilder()
        .setURL(`https://solscan.io/token/${token_address}`)
        .setLabel('Solscan')
        .setStyle(ButtonStyle.Link);

    const dexscreenerButton = new ButtonBuilder()
        .setURL(`https://dexscreener.com/solana/${token_address}`)
        .setLabel('Dexscreener')
        .setStyle(ButtonStyle.Link);

    const sendCoinButton = new ButtonBuilder()
        .setCustomId('sendCoin')
        .setLabel('Send')
        .setStyle(ButtonStyle.Secondary);

    const refreshButton = new ButtonBuilder()
        .setCustomId('refreshManageInfo')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary);

    const firstRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(buyButton1Button, buyButton2Button, buyButton3Button, buyButton4Button, buyButtonX);

    const secondRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(sellCoin1Button, sellCoin2Button, sellCoin3Button, sellCoin4Button, sellXPercentButton);

    const thirdRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(solscanCoinButton, dexscreenerButton, currentCoinButton, sendCoinButton, refreshButton);
    return [firstRow, secondRow, thirdRow];
}

export function createPasswordSettingsButtons(hasPassword: boolean): ActionRowBuilder<ButtonBuilder>[] {
    const setPasswordButton = new ButtonBuilder()
        .setCustomId('setPassword')
        .setLabel('Set Password')
        .setStyle(ButtonStyle.Secondary);

    const changePasswordButton = new ButtonBuilder()
        .setCustomId(`changePassword`)
        .setLabel('Change Password')
        .setStyle(ButtonStyle.Secondary);

    const deletePasswordButton = new ButtonBuilder()
        .setCustomId('deletePassword')
        .setLabel('Delete Password')
        .setStyle(ButtonStyle.Secondary);

    const autolockTimerButton = new ButtonBuilder()
        .setCustomId('autolockTimer')
        .setLabel('Auto-Lock Timer')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>();
    if (hasPassword) {
        row.addComponents(changePasswordButton, deletePasswordButton, autolockTimerButton);
    } else {
        row.addComponents(setPasswordButton);
    }

    return [row];
}