import { Wallet } from "../models/wallet";
import {
    createPreBuyUI,
    createSettingsUI,
    createStartUI,
    createCoinInfoForLimitOrderUI,
    changeUserBlinkEmbedUI,
    addFixedActionButtonToBlink,
    addCustomActionButtonToBlink,
    createNewBlinkUI,
    createSellAndManageUI,
    createTokenSelectionUI,
    createAdminUI,
    createBlinkSuccessMessage,
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
    parseTokenAddress,
    executeChainedAction,
    decryptPKey,
    exportPrivateKeyOfUser,
} from "./util";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DEFAULT_ERROR, DEFAULT_ERROR_REPLY, ERROR_CODES } from "../config/errors";
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
import {
    changeAutolockTimer,
    changeWalletPassword,
    deleteWalletPassword,
    setWalletPassword,
    unlockWallet
} from "./db-controller";

export const MODAL_COMMANDS = {
    buyCoin: async (interaction: ModalSubmitInteraction, values: string[]) => {
        // this one will be called after pasting the contract address or symbol in the CA modal
        await interaction.deferReply({ ephemeral: true });
        const tokenAddress: string | null = parseTokenAddress(values[0]);
        if (!tokenAddress) return await interaction.editReply({ content: "Invalid token address or symbol." });
        const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, tokenAddress);
        await interaction.editReply(uiResponse.ui);
    },
    buyXSol: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        let content: string | undefined = interaction.message?.embeds[0].data.description;
        if (!content) {
            content = interaction.message?.embeds[0].data.fields?.[0].name;
            if (!content) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        }
        const uiResponse: UIResponse = await buyCoinX(interaction.user.id, content, values[0]);
        await interaction.editReply(uiResponse.ui);
    },
    sellXPercent: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const caLine: string | undefined = interaction.message?.embeds[0].data.fields?.[0].name;
        if (!caLine) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        const uiResponse: UIResponse = await sellCoinX(interaction.user.id, caLine, values[0]);
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            await storeUnpaidRefFee(uiResponse.transaction!);
        }
    },
    limitOrderInfo: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        // TODO: check whether CA line is correct
        const contract_address: string | null = extractAndValidateCA(values[0], 0);
        if (!contract_address) return await interaction.editReply("Invalid contract address.");
        const ui: InteractionEditReplyOptions = await createCoinInfoForLimitOrderUI(contract_address);
        await interaction.editReply(ui);
    },
    withdrawXSol: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const amountToWithdraw = values[0];
        const destinationAddress = values[1];
        const isValidAddress: boolean = checkIfValidAddress(destinationAddress);
        if (!isValidAddress) return await interaction.editReply({ content: "Invalid destination wallet address." });

        const result: TxResponse = await transferXSol(interaction.user.id, amountToWithdraw, destinationAddress);
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    withdrawAllSol: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const isValidAddress: boolean = checkIfValidAddress(values[0]);
        if (!isValidAddress) return await interaction.editReply({ content: "Invalid destination wallet address." });

        const result: TxResponse = await transferAllSol(interaction.user.id, values[0]);
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    setPassword: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionReplyOptions = await setWalletPassword(interaction.user.id, values[0], values[1]);
        await interaction.editReply(ui);
    },
    changePassword: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionReplyOptions = await changeWalletPassword(interaction.user.id, values[0], values[1], values[2]);
        await interaction.editReply(ui);
    },
    deletePassword: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionReplyOptions = await deleteWalletPassword(interaction.user.id, values[0]);
        await interaction.editReply(ui);
    },
    autolockTimer: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionReplyOptions = await changeAutolockTimer(interaction.user.id, values[0], values[1]);
        await interaction.editReply(ui);
    },
    unlockWallet: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const command: string = values[0];
        const password: string = values[2] ? values[2] : values[1];
        const extraInfo: string | undefined = values[2] ? values[1] : undefined;

        try {
            const isCorrectPasswordOrError: string | boolean = await unlockWallet(interaction.user.id, password);
            if (typeof isCorrectPasswordOrError === "string") return await interaction.editReply(isCorrectPasswordOrError);

            switch (command) {
                case "start": {
                    const startUI: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
                    return await interaction.editReply(startUI);
                }
                case "positions": {
                    const ui: InteractionEditReplyOptions = await createSellAndManageUI({ user_id: interaction.user.id });
                    await interaction.editReply(ui);
                }
                case "buy": {
                    if (!extraInfo) return await interaction.editReply(DEFAULT_ERROR_REPLY);
                    const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, extraInfo);
                    await interaction.editReply(uiResponse.ui);
                }
                case "send": {
                    if (!extraInfo) return await interaction.editReply(DEFAULT_ERROR_REPLY);
                    const recipientWallet: any = await Wallet.findOne({ user_id: extraInfo, is_default_wallet: true }).lean();
                    if (!recipientWallet) return await interaction.editReply("The given user doesn't have a Callisto wallet yet.");
                    const ui: InteractionEditReplyOptions = await createTokenSelectionUI(interaction.user.id, extraInfo);
                    await interaction.editReply(ui);
                }
                case "admin": {
                    if (!extraInfo) return await interaction.editReply(DEFAULT_ERROR_REPLY);
                    const ui: InteractionReplyOptions = await createAdminUI(extraInfo);
                    return await interaction.editReply(ui);
                }
                case "exportPrivKey": {
                    const wallet = await exportPrivateKeyOfUser(interaction.user.id);
                    if (!wallet) return await interaction.editReply(DEFAULT_ERROR_REPLY);
                    return await interaction.editReply({ content: `Your private key:\n${await decryptPKey(wallet.encrypted_private_key, wallet.iv)}\n\nDo not share your private key with anyone. Anyone with access to your private key will also have access to your funds.` });
                }
                default: {
                    return await interaction.editReply(DEFAULT_ERROR_REPLY);
                }
            }
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeMinPositionValue: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) return await interaction.reply({ content: "Invalid amount. Please enter a valid number." });
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        wallet.settings.min_position_value = Number(values[0]);
        await wallet.save();
        const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
        await interaction.editReply(settingsUI);
    },
    changeAutoBuyValue: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(values[0]) || values[0].includes("-")) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.auto_buy_value = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeBuySlippage: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.buy_slippage = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }

    },
    changeSellSlippage: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.sell_slippage = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeTransactionPriority: async (interaction: ModalSubmitInteraction, values: string[]) => {
        // TODO: consider allowing disabling tx prio by setting it to 0 (isPositiveNumber)
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }

        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.tx_priority_value = Number(values[0]) * LAMPORTS_PER_SOL; // convert to lamports
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeBuyButton1: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.buy_button_1 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeBuyButton2: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.buy_button_2 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeBuyButton3: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.buy_button_3 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeBuyButton4: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.buy_button_4 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeSellButton1: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.sell_button_1 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeSellButton2: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.sell_button_2 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeSellButton3: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.sell_button_3 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeSellButton4: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isPositiveNumber(values[0])) {
            return await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) return await interaction.editReply({ content: ERROR_CODES["0003"].message });

        try {
            wallet.settings.sell_button_4 = Number(values[0]);
            await wallet.save();

            const settingsUI: InteractionReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    sendCoin: async (interaction: ModalSubmitInteraction, values: string[]) => {
        // send coins to other users through the /send command
        await interaction.deferReply({ ephemeral: true });
        const percentToSend = values[0];
        const destinationAddress = values[1];
        const caLine: string | undefined = interaction.message?.embeds[0].data.fields?.[0].name;
        if (!caLine) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        const contractAddress: string | null = extractAndValidateCA(caLine, 1);
        if (!contractAddress) {
            return await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address." });
        }

        const result: TxResponse = await sendXPercentOfCoin(interaction.user.id, contractAddress, percentToSend, destinationAddress);
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    sendXPercentToUser: async (interaction: ModalSubmitInteraction, values: string[]) => {
        // send coins to other users through the /send command
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string | null = extractAndValidateCA(interaction.message!.content, 3);
        if (!contractAddress) return await interaction.editReply(DEFAULT_ERROR);

        const recipientId: string = extractUserIdFromMessage(interaction.message!.content);
        if (!recipientId) return await interaction.editReply(DEFAULT_ERROR);

        const recipientWallet: any = await Wallet.findOne({ user_id: recipientId, is_default_wallet: true }).lean();
        if (!recipientWallet) return await interaction.editReply(ERROR_CODES["0002"].message);

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
        // send coins to other users through the /send command
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string | null = extractAndValidateCA(interaction.message!.content, 3);
        if (!contractAddress) return await interaction.editReply(DEFAULT_ERROR);

        const recipientId: string = extractUserIdFromMessage(interaction.message!.content);
        if (!recipientId) return await interaction.editReply(DEFAULT_ERROR);

        const recipientWallet: any = await Wallet.findOne({ user_id: recipientId, is_default_wallet: true }).lean();
        if (!recipientWallet) return await interaction.editReply(ERROR_CODES["0002"].message);

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
        const response: InteractionEditReplyOptions = await saveReferralAndUpdateFees(interaction.user.id, values[0]);
        await interaction.editReply(response);
    },
    buyLimitPercentModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        // TODO: check whether CA line is correct
        const contractAddress: string | null = extractAndValidateCA(interaction.message!.content, 0);
        if (!contractAddress) {
            return await interaction.editReply("Couldn't find contract address. If the issue persists please contact support.");
        }
        let buyAfterXPercentDecrease: string = values[0];
        const amountToBuyInSol: string = values[1];
        const validFor: string | undefined = values[2];
        if (buyAfterXPercentDecrease.includes("%")) buyAfterXPercentDecrease = buyAfterXPercentDecrease.replace("%", "");
        if (!isPositiveNumber(buyAfterXPercentDecrease) || !isPositiveNumber(amountToBuyInSol)) {
            return await interaction.editReply("Please enter a valid number.");
        }
        if (validFor) {
            if (!isPositiveNumber(validFor)) return await interaction.editReply("Please enter a valid number.");
        }
        const result: TxResponse = await createBuyLimitOrder(
            interaction.user.id,
            contractAddress,
            Number(buyAfterXPercentDecrease),
            Number(amountToBuyInSol),
            Number(validFor),
            true
        );
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    buyLimitPriceModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        // TODO: check whether CA line is correct
        const contractAddress: string | null = extractAndValidateCA(interaction.message!.content, 0);
        if (!contractAddress) {
            return await interaction.editReply("Couldn't find contract address. If the issue persists please contact support.");
        }
        const buyEntry: string = values[0];
        const amountToBuyInSol: string = values[1];
        const validFor: string = values[2];
        if (!isPositiveNumber(buyEntry) || !isPositiveNumber(amountToBuyInSol) || !isPositiveNumber(validFor)) {
            return await interaction.editReply("Please enter a valid number.");
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
        // TODO: check whether CA line is correct
        const contractAddress: string | null = extractAndValidateCA(interaction.message!.content, 0);
        if (!contractAddress) {
            return await interaction.editReply("Couldn't find contract address. If the issue persists please contact support.");
        }
        let sellEntry: string = values[0];
        const amountToSellInPercent: string = values[1];
        const validFor: string = values[2];
        if (sellEntry.includes("%")) sellEntry = sellEntry.replace("%", "");
        if (!isPositiveNumber(sellEntry) || !isPositiveNumber(amountToSellInPercent) || !isPositiveNumber(validFor)) {
            return await interaction.editReply("Please enter a valid number.");
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
        // TODO: check whether CA line is correct
        const contractAddress: string | null = extractAndValidateCA(interaction.message!.content, 0);
        if (!contractAddress) {
            return await interaction.editReply("Couldn't find contract address. If the issue persists please contact support.");
        }
        let sellEntry: string = values[0];
        const amountToSellInPercent: string = values[1];
        const validFor: string = values[2];
        if (sellEntry.includes("%")) sellEntry = sellEntry.replace("%", "");
        if (!isPositiveNumber(sellEntry) || !isPositiveNumber(amountToSellInPercent) || !isPositiveNumber(validFor)) {
            return await interaction.editReply("Please enter a valid number.");
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
        const editMode: boolean = values[1] === "e";
        const buttonValues: string[] = editMode ? values.slice(2) : values.slice(1);
        const ui: InteractionReplyOptions | undefined = await addFixedActionButtonToBlink(blinkId, buttonValues, editMode);
        if (!ui) return await interaction.editReply(DEFAULT_ERROR);
        await interaction.editReply(ui);
    },
    addCustomAction: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const blinkId: string = values[0];
        const editMode: boolean = values[1] === "e";
        const buttonValues: string[] = editMode ? values.slice(2) : values.slice(1);
        const ui: InteractionReplyOptions | undefined = await addCustomActionButtonToBlink(blinkId, buttonValues, editMode);
        if (!ui) return await interaction.editReply(DEFAULT_ERROR);
        await interaction.editReply(ui);
    },
    createBlinkWithAddress: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const blinkType: string = values[0];
        const tokenAddress: string | null = parseTokenAddress(values[1]);
        if (!tokenAddress && blinkType !== "blinkDonation") return await interaction.editReply("Invalid token address or token symbol.");
        const ui: InteractionEditReplyOptions = await createNewBlinkUI(interaction.user.id, blinkType, tokenAddress || undefined);
        await interaction.editReply(ui);
    },
    blinkCustomValues: async (interaction: ModalSubmitInteraction, values: any[]) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            const actionId: string = values[0].includes(".") ? values[0].split(".")[0] : values[0];
            const chainId: string | undefined = values[0].includes(".") ? values[0].split(".")[1] : undefined;
            const buttonId: string = values[1];
            const orderedBlinkValues: BlinkCustomValue[] = values[2];
            let result: BlinkResponse;
            if (chainId) {
                result = await executeChainedAction(interaction.user.id, actionId, chainId, buttonId, orderedBlinkValues);
            } else {
                result = await executeBlink(interaction.user.id, actionId, buttonId, orderedBlinkValues);
            }
            switch (result.response_type) {
                case "success": {
                    const ui: InteractionReplyOptions = await createBlinkSuccessMessage(result.reply_object);
                    return await interaction.editReply(ui);
                }
                default: {
                    return await interaction.editReply(result.reply_object);
                }
            }
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
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
            const editMode: boolean = values[2] === "e";
            const newValue: string = editMode ? values[3] : values[2];
            const ui: InteractionEditReplyOptions = await changeUserBlinkEmbedUI(
                interaction.user.id, blinkId, interaction.message.embeds[0], fieldToChange, newValue, editMode
            );
            await interaction.editReply(ui);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    },
};