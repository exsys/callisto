import { Wallet } from "../models/wallet";
import {
    createPreBuyUI,
    createSettingsUI,
    createStartUI,
    createCoinInfoForLimitOrderUI,
    changeUserBlinkEmbedUI,
    addFixedActionButtonToBlinkEmbed,
    addCustomActionButtonToBlinkEmbed,
    createBlinkCreationUI,
} from "./discord-ui";
import {
    buyCoinX,
    extractAndValidateCA,
    sellCoinX,
    saveReferralAndUpdateFees,
    storeUnpaidRefFee,
    saveDbTransaction,
    extractUserIdFromMessage,
    extractBalanceFromMessage,
    isPositiveNumber,
    executeBlink,
    isNumber,
    changeBlinkEmbedModal,
} from "./util";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DEFAULT_ERROR, ERROR_CODES } from "../config/errors";
import { TxResponse } from "../types/txResponse";
import { UIResponse } from "../types/uiResponse";
import {
    InteractionEditReplyOptions,
    InteractionReplyOptions,
    MessageCreateOptions,
    ModalSubmitInteraction,
} from "discord.js";
import {
    checkIfValidAddress,
    transferXSol,
    transferAllSol,
    sendXPercentOfCoin,
    sendCoin,
    createBuyLimitOrder,
    createSellLimitOrder,
} from "./solanaweb3";
import { BlinkResponse } from "../types/blinkResponse";
import { BlinkCustomValue } from "../types/blinkCustomValue";

export const MODAL_COMMANDS = {
    buyCoin: async (interaction: ModalSubmitInteraction, values: string[]) => {
        // this one will be called after pasting the contract address in the CA modal
        await interaction.deferReply({ ephemeral: true });
        const isValidAddress: boolean = await checkIfValidAddress(values[0]);
        if (!isValidAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address." });
            return;
        }
        const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, values[0]);
        await interaction.editReply(uiResponse.ui);
    },
    buyXSol: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoinX(interaction.user.id, interaction.message!.content, values[0]);
        await interaction.editReply(uiResponse.ui);
    },
    sellXPercent: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoinX(interaction.user.id, interaction.message!.content, values[0]);
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            await storeUnpaidRefFee(uiResponse.transaction!);
        }
    },
    limitOrderInfo: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const contract_address: string = await extractAndValidateCA(values[0]);
        if (!contract_address) {
            await interaction.editReply("Invalid contract address.");
            return;
        }
        const ui: InteractionEditReplyOptions = await createCoinInfoForLimitOrderUI(contract_address);
        await interaction.editReply(ui);
    },
    withdrawXSol: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const amountToWithdraw = values[0];
        const destinationAddress = values[1];
        const isValidAddress: boolean = await checkIfValidAddress(destinationAddress);
        if (!isValidAddress) {
            await interaction.editReply({ content: "Invalid destination address. Please enter a valid address." });
            return;
        }
        const result: TxResponse = await transferXSol(interaction.user.id, amountToWithdraw, destinationAddress);
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    withdrawAllSol: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const isValidAddress: boolean = await checkIfValidAddress(values[0]);
        if (!isValidAddress) {
            await interaction.editReply({ content: "Invalid destination address. Please enter a valid address." });
            return;
        }

        const result: TxResponse = await transferAllSol(interaction.user.id, values[0]);
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    changeMinPositionValue: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.reply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        wallet.settings.min_position_value = Number(values[0]);
        await wallet.save();

        const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
        await interaction.editReply(settingsUI);
    },
    changeAutoBuyValue: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(values[0]) || values[0].includes("-")) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.auto_buy_value = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeBuySlippage: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.buy_slippage = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }

    },
    changeSellSlippage: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.sell_slippage = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeTransactionPriority: async (interaction: ModalSubmitInteraction, values: string[]) => {
        // TODO: consider allowing disabling tx prio by setting it to 0 (isPositiveNumber)
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }

        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.tx_priority_value = Number(values[0]) * LAMPORTS_PER_SOL; // convert to lamports
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeBuyButton1: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.buy_button_1 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeBuyButton2: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.buy_button_2 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeBuyButton3: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.buy_button_3 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeBuyButton4: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.buy_button_4 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeSellButton1: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.sell_button_1 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeSellButton2: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.sell_button_2 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeSellButton3: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.sell_button_3 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeSellButton4: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        }

        try {
            wallet.settings.sell_button_4 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    sendCoin: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const percentToSend = values[0];
        const destinationAddress = values[1];
        const contractAddress: string = await extractAndValidateCA(interaction.message!.content);
        if (!contractAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address." });
            return;
        }

        const result: TxResponse = await sendXPercentOfCoin(interaction.user.id, contractAddress, percentToSend, destinationAddress);
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    sendXPercentToUser: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message!.content, 3);
        if (!contractAddress) await interaction.editReply(DEFAULT_ERROR);
        const recipientId: string = extractUserIdFromMessage(interaction.message!.content);
        if (!recipientId) await interaction.editReply(DEFAULT_ERROR);
        const recipientWallet: any = await Wallet.findOne({ user_id: recipientId, is_default_wallet: true }).lean();
        if (!recipientWallet) await interaction.editReply(ERROR_CODES["0002"].message);

        const balanceLine: number = contractAddress === "SOL" ? 4 : 5;
        const tokenBalanceInDecimal: number = extractBalanceFromMessage(interaction.message!.content, balanceLine);
        if (values[0].includes("%")) values[0] = values[0].replace("%", "");
        const amountToSend: string = String(tokenBalanceInDecimal * (Number(values[0]) / 100));
        let response: TxResponse;
        if (contractAddress === "SOL") {
            response = await transferXSol(interaction.user.id, amountToSend, recipientWallet.wallet_address);
        } else {
            response = await sendCoin(interaction.user.id, contractAddress, amountToSend, recipientWallet.wallet_address);
        }
        await interaction.editReply({ content: response.response });
        await saveDbTransaction(response);
    },
    sendXAmountToUser: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message!.content, 3);
        if (!contractAddress) await interaction.editReply(DEFAULT_ERROR);
        const recipientId: string = extractUserIdFromMessage(interaction.message!.content);
        if (!recipientId) await interaction.editReply(DEFAULT_ERROR);
        const recipientWallet: any = await Wallet.findOne({ user_id: recipientId, is_default_wallet: true }).lean();
        if (!recipientWallet) await interaction.editReply(ERROR_CODES["0002"].message);

        let response: TxResponse;
        if (contractAddress === "SOL") {
            response = await transferXSol(interaction.user.id, values[0], recipientWallet.wallet_address);
        } else {
            response = await sendCoin(interaction.user.id, contractAddress, values[0], recipientWallet.wallet_address);
        }
        await interaction.editReply({ content: response.response });
        await saveDbTransaction(response);
    },
    enterRefCode: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (values[0]) {
            const response: InteractionEditReplyOptions = await saveReferralAndUpdateFees(interaction.user.id, values[0]);
            await interaction.editReply(response);
        } else {
            const startUI: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
            await interaction.editReply(startUI);
        }
    },
    buyLimitPercentModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message!.content, 0);
        if (!contractAddress) {
            await interaction.editReply("Couldn't find contract address. If the issue persists please contact support.");
            return;
        }
        let buyAfterXPercentDecrease: string = values[0];
        const amountToBuyInSol: string = values[1];
        const validFor: string | undefined = values[2];
        if (buyAfterXPercentDecrease.includes("%")) buyAfterXPercentDecrease = buyAfterXPercentDecrease.replace("%", "");
        if (!isPositiveNumber(buyAfterXPercentDecrease) || !isPositiveNumber(amountToBuyInSol)) {
            await interaction.editReply("Please enter a valid number.");
            return;
        }
        if (validFor) {
            if (!isPositiveNumber(validFor)) {
                await interaction.editReply("Please enter a valid number.");
                return;
            }
        }
        const result: TxResponse = await createBuyLimitOrder(
            interaction.user.id,
            contractAddress,
            Number(buyAfterXPercentDecrease),
            Number(amountToBuyInSol),
            Number(validFor),
            true
        );
        await saveDbTransaction(result);
        await interaction.editReply({ content: result.response });
    },
    buyLimitPriceModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message!.content, 0);
        if (!contractAddress) {
            await interaction.editReply("Couldn't find contract address. If the issue persists please contact support.");
            return;
        }
        const buyEntry: string = values[0];
        const amountToBuyInSol: string = values[1];
        const validFor: string = values[2];
        if (!isPositiveNumber(buyEntry) || !isPositiveNumber(amountToBuyInSol) || !isPositiveNumber(validFor)) {
            await interaction.editReply("Please enter a valid number.");
            return;
        }
        const result: TxResponse = await createBuyLimitOrder(
            interaction.user.id,
            contractAddress,
            Number(buyEntry),
            Number(amountToBuyInSol),
            Number(validFor),
            false
        );
        await interaction.editReply({ content: result.response });
    },
    sellLimitPercentModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message!.content, 0);
        if (!contractAddress) {
            await interaction.editReply("Couldn't find contract address. If the issue persists please contact support.");
            return;
        }
        let sellEntry: string = values[0];
        const amountToSellInPercent: string = values[1];
        const validFor: string = values[2];
        if (sellEntry.includes("%")) sellEntry = sellEntry.replace("%", "");
        if (!isPositiveNumber(sellEntry) || !isPositiveNumber(amountToSellInPercent) || !isPositiveNumber(validFor)) {
            await interaction.editReply("Please enter a valid number.");
            return;
        }
        const result: TxResponse = await createSellLimitOrder(
            interaction.user.id,
            contractAddress,
            Number(sellEntry),
            Number(amountToSellInPercent),
            Number(validFor)
        );
        await interaction.editReply({ content: result.response });
    },
    sellLimitPriceModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message!.content, 0);
        if (!contractAddress) {
            await interaction.editReply("Couldn't find contract address. If the issue persists please contact support.");
            return;
        }
        let sellEntry: string = values[0];
        const amountToSellInPercent: string = values[1];
        const validFor: string = values[2];
        if (sellEntry.includes("%")) sellEntry = sellEntry.replace("%", "");
        if (!isPositiveNumber(sellEntry) || !isPositiveNumber(amountToSellInPercent) || !isPositiveNumber(validFor)) {
            await interaction.editReply("Please enter a valid number.");
            return;
        }
        const result: TxResponse = await createSellLimitOrder(
            interaction.user.id,
            contractAddress,
            Number(sellEntry),
            Number(amountToSellInPercent),
            Number(validFor)
        );
        await interaction.editReply({ content: result.response });
    },
    addFixedAction: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const blinkId: string = values[0];
        const buttonValues: string[] = values.slice(1);
        const ui: InteractionReplyOptions | undefined = await addFixedActionButtonToBlinkEmbed(blinkId, buttonValues);
        if (!ui) return await interaction.editReply(DEFAULT_ERROR);
        await interaction.editReply(ui);
    },
    addCustomAction: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const blinkId: string = values[0];
        const buttonValues: string[] = values.slice(1);
        const ui: InteractionReplyOptions | undefined = await addCustomActionButtonToBlinkEmbed(blinkId, buttonValues);
        if (!ui) return await interaction.editReply(DEFAULT_ERROR);
        await interaction.editReply(ui);
    },
    createTokenSwapBlink: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const tokenAddress: string = values[0];
        const ui: InteractionEditReplyOptions = await createBlinkCreationUI(interaction.user.id, "blinkTokenSwap", tokenAddress);
        await interaction.editReply(ui);
    },
    blinkCustomValues: async (interaction: ModalSubmitInteraction, values: any[]) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            const blinkId: string = values[0];
            const buttonId: string = values[1];
            const orderedBlinkValues: BlinkCustomValue[] = values[2];

            const result: BlinkResponse = await executeBlink(interaction.user.id, blinkId, buttonId, orderedBlinkValues);
            await interaction.editReply({ content: result.content! });
        } catch (error) {
            await interaction.editReply({ content: DEFAULT_ERROR });
        }
    },
    changeBlinkEmbedValue: async (interaction: ModalSubmitInteraction, values: any[]) => {
        try {
            // when user clicked on a blink button where custom values are needed and the amount of custom values to submit is above 5
            await interaction.deferReply({ ephemeral: true });
            const embed = interaction.message?.embeds[0];
            const rows = interaction.message?.components; // buttons
            const lineToChange: number = Number(values[0]);
            const newValue: string = values[1];
            const response: MessageCreateOptions = changeBlinkEmbedModal(embed, rows, lineToChange, newValue);
            await interaction.editReply(response);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    },
    changeUserBlink: async (interaction: ModalSubmitInteraction, values: string[]) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            if (!interaction.message?.embeds.length) return await interaction.editReply(DEFAULT_ERROR);

            const blinkId: string = values[0];
            const fieldToChange: string = values[1];
            const newValue: string = values[2];
            const ui: InteractionEditReplyOptions | undefined = await changeUserBlinkEmbedUI(
                interaction.user.id, blinkId, interaction.message.embeds[0], fieldToChange, newValue
            );
            if (!ui) return await interaction.editReply(DEFAULT_ERROR);

            if (!ui.content) {
                // if ui.content is undefined it means changeUserBlinkEmbedUI returned an error
                ui.content = interaction.message.content;
                ui.components = interaction.message.components;
            }
            await interaction.editReply(ui);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    },
};