import { Keypair } from "@solana/web3.js";
import { ButtonInteraction, InteractionEditReplyOptions, InteractionReplyOptions, ModalBuilder, MessageCreateOptions } from "discord.js";
import { DEBOUNCE_TIME, REF_FEE_DEBOUNCE_MAP, REFCODE_MODAL_STRING } from "../config/constants";
import { ERROR_CODES, DEFAULT_ERROR, DEFAULT_ERROR_REPLY_EPHEM, DEFAULT_ERROR_REPLY } from "../config/errors";
import { ActionUI } from "../models/actionui";
import { Wallet } from "../models/wallet";
import { BlinkCustomValue } from "../types/blinkCustomValue";
import { BlinkResponse } from "../types/blinkResponse";
import { UIResponse } from "../types/uiResponse";
import {
    createStartUI,
    createAdvancedUI,
    createBuyModal,
    createSellAndManageUI,
    createBlinkSettingsUI,
    createBlinkCreationMenu,
    createLimitOrderModal,
    createWalletUI,
    createSettingsUI,
    createPreBuyUI,
    createHelpUI,
    createReferUI,
    createWithdrawAllSolModal,
    createWithdrawXSolModal,
    sendXPercentToUserModal,
    sendXAmountToUserModal,
    createRemoveWalletUI,
    createChangeWalletMenu,
    createRefCodeModal,
    createSetAsDefaultUI,
    createExportPrivKeyUI,
    createClaimRefFeeUI,
    createSelectCoinToSendMenu,
    createBuyXSolModal,
    createSellXPercentModal,
    createMinPositionValueModal,
    createAutoBuyValueModal,
    createTransactionPriorityModal,
    createBuySlippageModal,
    createSellSlippageModal,
    createChangeBuyButtonModal,
    createChangeSellButtonModal,
    createSelectCoinMenu,
    createSendCoinModal,
    createBuyLimitPercentModal,
    createBuyLimitPriceModal,
    createSellLimitPercentModal,
    createSellLimitPriceModal,
    createBlinkCustomValuesModal,
    createChangeBlinkCustomValueModal,
    createChangeUserBlinkModal,
    createFixedActionModal,
    createCustomActionModal,
    addActionButtonTypeSelection,
    removeActionSelectionMenu,
    createBlinkUiFromEmbed,
} from "./discord-ui";
import { getTokenAccountOfWallet } from "./solanaweb3";
import {
    getKeypairFromEncryptedPKey,
    extractAndValidateCA,
    createWallet,
    exportPrivateKeyOfUser,
    decryptPKey,
    extractUserIdFromMessage,
    claimUnpaidRefFees,
    buyCoin,
    sellCoin,
    storeUnpaidRefFee,
    extractAmountFromMessage,
    sellCoinX,
    buyCoinX,
    executeBlink,
    validateCustomBlinkValues,
    convertDescriptionToOrderedValues,
    storeUserBlink
} from "./util";

export const BUTTON_COMMANDS = {
    test: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const userId: string = interaction.user.id;
        const wallet = await Wallet.findOne({ user_id: userId, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Test failed. Wallet not found" });
            return;
        }
        const signer: Keypair | undefined = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
        if (!signer) {
            await interaction.editReply({ content: "Test failed. Signer not found" });
            return;
        }

        // test here
        const tokenAcc = await getTokenAccountOfWallet("26dmF2GnE5iUk3HyUx2iUfTDHhHm9zinTLNKjV6bbHWu", "So11111111111111111111111111111111111111112");
        console.log(tokenAcc);

        await interaction.editReply({ content: "Test successful" });
    },
    start: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
        await interaction.editReply(ui);
    },
    advanced: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createAdvancedUI(interaction.user.id);
        await interaction.editReply(ui);
    },
    buy: async (interaction: ButtonInteraction) => {
        const modal = createBuyModal();
        await interaction.showModal(modal);
    },
    sellAndManage: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id, page: 0 });
        await interaction.editReply(ui);
    },
    blinkSettings: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createBlinkSettingsUI(interaction.user.id);
        await interaction.editReply(ui);
    },
    createBlink: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = createBlinkCreationMenu();
        await interaction.editReply(ui);
    },
    limitOrder: async (interaction: ButtonInteraction) => {
        const modal = createLimitOrderModal();
        await interaction.showModal(modal);
    },
    openLimitOrders: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply("not implemented yet");
    },
    dcaOrder: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply("not implemented yet");
    },
    wallet: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createWalletUI(interaction.user.id);
        await interaction.editReply(ui);
    },
    settings: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
        await interaction.editReply(ui);
    },
    refresh: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
        await interaction.editReply(ui);
    },
    refreshCoinInfo: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: ERROR_CODES["0006"].message });
            return;
        }
        const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, contractAddress);
        await interaction.editReply(uiResponse.ui);
    },
    refreshManageInfo: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: ERROR_CODES["0006"].message });
            return;
        }
        const ui: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id, ca: contractAddress });
        await interaction.editReply(ui);
    },
    help: async (interaction: ButtonInteraction) => {
        const ui: InteractionReplyOptions = createHelpUI();
        await interaction.reply(ui);
    },
    refer: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createReferUI(interaction.user.id);
        await interaction.editReply(ui);
    },
    deposit: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        try {
            const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
            if (!wallet) {
                await interaction.editReply({ content: ERROR_CODES["0003"].message });
                return;
            }
            await interaction.editReply({ content: wallet.wallet_address });
        } catch (error) {
            await interaction.editReply({ content: ERROR_CODES["0000"].message });
        }

    },
    withdrawAllSol: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createWithdrawAllSolModal();
        await interaction.showModal(modal);
    },
    withdrawXSol: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createWithdrawXSolModal();
        await interaction.showModal(modal);
    },
    sendPercentToUser: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = sendXPercentToUserModal();
        await interaction.showModal(modal);
    },
    sendAmountToUser: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = sendXAmountToUserModal();
        await interaction.showModal(modal);
    },
    removeWallet: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const removeWalletUI: InteractionEditReplyOptions = await createRemoveWalletUI(interaction.user.id);
        await interaction.editReply(removeWalletUI);
    },
    changeWallet: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const changeWalletUI: InteractionEditReplyOptions = await createChangeWalletMenu(interaction.user.id);
        await interaction.editReply(changeWalletUI);
    },
    createWallet: async (interaction: ButtonInteraction) => {
        const walletAddress: string | undefined = await createWallet(interaction.user.id);
        if (!walletAddress) {
            await interaction.editReply({ content: ERROR_CODES["0005"].message });
            return;
        }

        if (walletAddress === REFCODE_MODAL_STRING) {
            const refCodeModal: ModalBuilder = createRefCodeModal();
            await interaction.showModal(refCodeModal);
        }

        const startUI: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
        await interaction.editReply(startUI);
    },
    addNewWallet: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const walletAddress: string | undefined = await createWallet(interaction.user.id);
        if (!walletAddress) {
            await interaction.editReply({ content: ERROR_CODES["0005"].message });
            return;
        }
        const setAsDefaultUI: InteractionEditReplyOptions = createSetAsDefaultUI(walletAddress as string);
        await interaction.editReply(setAsDefaultUI);
    },
    setAsDefault: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        try {
            const allWallets: any[] = await Wallet.find({ user_id: interaction.user.id }).lean();
            if (!allWallets.length) {
                await interaction.editReply({ content: "No wallets found. Create a wallet with the /create command to get started." });
                return;
            }
            const oldDefaultWallet: any = allWallets.find((wallet: any) => wallet.is_default_wallet);
            const newDefaultWallet: any = allWallets.sort((a: any, b: any) => {
                return Math.floor(new Date(b.createdAt).getTime() / 1000) - Math.floor(new Date(a.createdAt).getTime() / 1000);
            })[0]; // find the latest wallet by date
            if (!newDefaultWallet || !oldDefaultWallet) {
                await interaction.editReply(DEFAULT_ERROR_REPLY);
                return;
            }

            await Wallet.updateOne({ user_id: interaction.user.id, wallet_address: oldDefaultWallet.wallet_address }, { is_default_wallet: false });
            await Wallet.updateOne({ user_id: interaction.user.id, wallet_address: newDefaultWallet.wallet_address }, { is_default_wallet: true });
            await interaction.editReply({ content: "Successfully set as your default wallet!" });
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    exportPrivKeyConfirmation: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const exportUI: InteractionEditReplyOptions = createExportPrivKeyUI();
        await interaction.editReply(exportUI);
    },
    exportPrivKey: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const wallet = await exportPrivateKeyOfUser(interaction.user.id);
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0003"].message });
            return;
        } else {
            await interaction.editReply({ content: `Your private key:\n${decryptPKey(wallet.encrypted_private_key, wallet.iv)}\n\nDo not share your private key with anyone. Anyone with access to your private key will also have access to your funds.` });
        }
    },
    showRefFees: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createClaimRefFeeUI(interaction.user.id);
        await interaction.editReply(ui);
    },
    selectTokenToSend: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const recipientUserId: string = extractUserIdFromMessage(interaction.message.content);
        if (!recipientUserId) {
            await interaction.editReply("Couldn't find recipient. If you believe this is a mistake please contact support.");
            return;
        }
        const ui: InteractionEditReplyOptions = await createSelectCoinToSendMenu(interaction.user.id, `Send token to <@${recipientUserId}>`);
        await interaction.editReply(ui);
    },
    claimRefFees: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });

        // TODO: save claimed = true before doing the debounce
        // if later claiming fails, revert db change

        const userId: string = interaction.user.id;
        if (REF_FEE_DEBOUNCE_MAP.has(userId)) {
            await interaction.editReply("Claim request already sent. Please wait until the current request has been processed.");
            return;
        }
        REF_FEE_DEBOUNCE_MAP.set(userId, true);

        setTimeout(async () => {
            REF_FEE_DEBOUNCE_MAP.delete(userId);
            const uiResponse: UIResponse = await claimUnpaidRefFees(userId);
            await interaction.editReply(uiResponse.ui);
        }, DEBOUNCE_TIME);
    },
    buyButton1: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, interaction.message.content, "1");
        await interaction.editReply(uiResponse.ui);
    },
    buyButton2: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, interaction.message.content, "2");
        await interaction.editReply(uiResponse.ui);
    },
    buyButton3: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, interaction.message.content, "3");
        await interaction.editReply(uiResponse.ui);
    },
    buyButton4: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, interaction.message.content, "4");
        await interaction.editReply(uiResponse.ui);
    },
    buyButtonX: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createBuyXSolModal();
        await interaction.showModal(modal);
    },
    sellButton1: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "1");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            await storeUnpaidRefFee(uiResponse.transaction!);
        }
    },
    sellButton2: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "2");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            await storeUnpaidRefFee(uiResponse.transaction!);
        }
    },
    sellButton3: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "3");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            await storeUnpaidRefFee(uiResponse.transaction!);
        }
    },
    sellButton4: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "4");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            await storeUnpaidRefFee(uiResponse.transaction!);
        }
    },
    sellButtonX: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createSellXPercentModal();
        await interaction.showModal(modal);
    },
    generalSettings: async (interaction: ButtonInteraction) => {
        await interaction.reply({ content: "**GENERAL SETTINGS**\n\n**Min Position Value**: Minimum position value to show in portfolio. Will hide tokens below this threshhold. Tap to edit.\n\n**Auto Buy**: Immediately buy when pasting token address. Tap to edit. Changing it to 0 disables Auto Buy.\n\n**Slippage Config**: Customize your slippage settings for buys and sells. If the price of a coin will change by more than the set amount while waiting for the transaction to finish the transaction will be cancelled. Tap to edit.", ephemeral: true });
    },
    buyButtonsConfig: async (interaction: ButtonInteraction) => {
        await interaction.reply({ content: "**BUY BUTTONS CONFIG**\n\nCustomize your buy buttons when buying a coin.", ephemeral: true });
    },
    sellButtonsConfig: async (interaction: ButtonInteraction) => {
        await interaction.reply({ content: "**SELL BUTTONS CONFIG**\n\nCustomize your sell buttons when selling a coin.", ephemeral: true });
    },
    transactionConfig: async (interaction: ButtonInteraction) => {
        await interaction.reply({ content: "**TRANSACTION CONFIG**\n\n**MEV Protection**: Accelerates your transactions and protect against frontruns to make sure you get the best price possible or turn it off for faster transactions.\n**Off**: Callisto will not use MEV protection. Transactions will be faster but might get frontrun.\n**On**: Transactions are guaranteed to be protected from MEV, but transactions may be slower or fail.\n\n**Transaction Priority**: Increase your Transaction Priority to improve transaction speed. Tap to edit.", ephemeral: true });
    },
    minPositionValue: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createMinPositionValueModal();
        await interaction.showModal(modal);
    },
    autoBuyValue: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createAutoBuyValueModal();
        await interaction.showModal(modal);
    },
    mevProtection: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({ content: "Not implemented yet." });
    },
    txPriority: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createTransactionPriorityModal();
        await interaction.showModal(modal);
    },
    buySlippage: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createBuySlippageModal();
        await interaction.showModal(modal);
    },
    sellSlippage: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createSellSlippageModal();
        await interaction.showModal(modal);
    },
    buyButtons1st: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createChangeBuyButtonModal("1");
        await interaction.showModal(modal);
    },
    buyButtons2nd: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createChangeBuyButtonModal("2");
        await interaction.showModal(modal);
    },
    buyButtons3rd: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createChangeBuyButtonModal("3");
        await interaction.showModal(modal);
    },
    buyButtons4th: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createChangeBuyButtonModal("4");
        await interaction.showModal(modal);
    },
    sellButtons1st: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createChangeSellButtonModal("1");
        await interaction.showModal(modal);
    },
    sellButtons2nd: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createChangeSellButtonModal("2");
        await interaction.showModal(modal);
    },
    sellButtons3rd: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createChangeSellButtonModal("3");
        await interaction.showModal(modal);
    },
    sellButtons4th: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createChangeSellButtonModal("4");
        await interaction.showModal(modal);
    },
    firstCoin: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id, page: 0 });
        await interaction.editReply(sellUI);
    },
    previousCoin: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address." });
            return;
        }
        const sellUI: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id, ca: contractAddress, prevCoin: true });
        await interaction.editReply(sellUI);
    },
    nextCoin: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address." });
            return;
        }
        const sellUI: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id, ca: contractAddress, nextCoin: true });
        await interaction.editReply(sellUI);
    },
    lastCoin: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id, page: -1 });
        await interaction.editReply(sellUI);
    },
    currentCoin: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const selectCoinMenu: InteractionEditReplyOptions = await createSelectCoinMenu(interaction.user.id);
        await interaction.editReply(selectCoinMenu);
    },
    sendCoin: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createSendCoinModal();
        await interaction.showModal(modal);
    },
    retryLastSwap: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address." });
            return;
        }
        const amount: string = extractAmountFromMessage(interaction.message.content);
        if (!amount) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
            return;
        }

        if (amount.includes("%")) {
            const amountWithoutPercentSymbol = amount.slice(0, -1);
            const uiResponseSell: UIResponse = await sellCoinX(interaction.user.id, interaction.message.content, amountWithoutPercentSymbol);
            await interaction.editReply(uiResponseSell.ui);
            if (uiResponseSell.store_ref_fee && !uiResponseSell.transaction?.error) {
                await storeUnpaidRefFee(uiResponseSell.transaction!);
            }
        } else {
            // NOTE: ref fee for buys is stored inside the buyCoinViaAPI function
            const uiResponseBuy: UIResponse = await buyCoinX(interaction.user.id, interaction.message.content, amount);
            await interaction.editReply(uiResponseBuy.ui);
        }
    },
    buyLimitPercent: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createBuyLimitPercentModal();
        await interaction.showModal(modal);
    },
    buyLimitPrice: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createBuyLimitPriceModal();
        await interaction.showModal(modal);
    },
    sellLimitPercent: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createSellLimitPercentModal();
        await interaction.showModal(modal);
    },
    sellLimitPrice: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createSellLimitPriceModal();
        await interaction.showModal(modal);
    },
    blinkButton: async (interaction: ButtonInteraction, action_id?: string, button_id?: string, buttonType?: string) => {
        try {
            if (buttonType !== "custom") {
                // NOTE: discord doesn't allow to show a modal after a reply, and a reply has to be send within 3 seconds
                // but this function might take more than 3 seconds to process
                await interaction.deferReply({ ephemeral: true });
            }
            const result: BlinkResponse = await executeBlink(interaction.user.id, action_id!, button_id!);
            if (result.custom_values) {
                const modal: ModalBuilder | MessageCreateOptions | undefined =
                    await createBlinkCustomValuesModal(result.action_id!, result.button_id!, result.params!);
                if (!modal) {
                    await interaction.editReply(DEFAULT_ERROR_REPLY);
                    return;
                }

                if (modal instanceof ModalBuilder) {
                    await interaction.showModal(modal);
                } else {
                    await interaction.reply({ embeds: modal.embeds, components: modal.components, ephemeral: true });
                }
            } else {
                await interaction.editReply({ content: result.content! });
            }
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    changeBlinkEmbedValue: async (interaction: ButtonInteraction, action_id?: string, button_id?: string, valueIndex?: string) => {
        const embedDescription: string | undefined = interaction.message.embeds[0].data.description;
        if (!embedDescription) {
            return await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
        }
        if (valueIndex === "send") {
            await interaction.deferReply({ ephemeral: true });
            const actionUI: any = await ActionUI.findOne({ action_id }).lean();
            if (!actionUI) return await interaction.editReply({ content: "Couldn't find corresponding Blink." });
            const correspondingButton: any = actionUI.buttons.find((button: any) => button.button_id == button_id);
            if (!correspondingButton) return await interaction.editReply({ content: "Couldn't find corresponding Blink." });
            // check if everything is valid and if all required fields are submitted
            const missingValues: string = await validateCustomBlinkValues(embedDescription, actionUI, correspondingButton);
            if (missingValues) return await interaction.editReply({ content: missingValues });

            // order values and prepare them to send to the RPC
            const orderedBlinkValues: BlinkCustomValue[] = convertDescriptionToOrderedValues(embedDescription, actionUI, correspondingButton);
            const result: BlinkResponse = await executeBlink(interaction.user.id, action_id!, button_id!, orderedBlinkValues);
            return await interaction.editReply({ content: result.content! });
        }

        // get all lines from the embed
        const lines: string[] = embedDescription.split("\n");
        // find the corresponding line to change and create a modal to submit the value
        const correspondingLine: string = lines[Number(valueIndex)];
        let lineSplit: string[] = correspondingLine.split(": ");
        const modal: ModalBuilder | undefined = await createChangeBlinkCustomValueModal(lineSplit[0], lineSplit[1], valueIndex!)
        if (!modal) {
            return await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
        }
        await interaction.showModal(modal);
    },
    changeUserBlink: async (interaction: ButtonInteraction, fieldToChange?: string, blink_id?: string) => {
        try {
            switch (fieldToChange) {
                case "AddAction": {
                    const ui: InteractionReplyOptions = addActionButtonTypeSelection(blink_id!);
                    return await interaction.reply(ui);
                }
                case "RemoveAction": {
                    await interaction.deferReply({ ephemeral: true });
                    const ui: InteractionEditReplyOptions = await removeActionSelectionMenu(blink_id!);
                    return await interaction.editReply(ui);
                }
                default: {
                    const modal: ModalBuilder | undefined = await createChangeUserBlinkModal(fieldToChange!, blink_id!);
                    if (!modal) return await interaction.reply(DEFAULT_ERROR);
                    return await interaction.showModal(modal);
                }
            }
        } catch (error) {
            await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
        }
    },
    previewBlink: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionReplyOptions = await createBlinkUiFromEmbed(interaction.message.embeds[0].data);
        await interaction.editReply(ui);
    },
    finishBlinkCreation: async (interaction: ButtonInteraction, blink_id?: string) => {
        await interaction.deferReply({ ephemeral: true });
        const response: InteractionReplyOptions = await storeUserBlink(blink_id!);
        await interaction.editReply(response);
    },
    addFixedAction: async (interaction: ButtonInteraction, blink_id?: string) => {
        try {
            const response: ModalBuilder | undefined = await createFixedActionModal(blink_id!);
            if (!response) return await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
            await interaction.showModal(response);
        } catch (error) {
            await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
        }
    },
    addCustomAction: async (interaction: ButtonInteraction, blink_id?: string) => {
        try {
            const response: ModalBuilder | undefined = await createCustomActionModal(blink_id!);
            if (!response) return await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
            await interaction.showModal(response);
        } catch (error) {
            await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
        }
    },
    blinkPreviewButton: async (interaction: ButtonInteraction, buttonOrder?: string) => {
        await interaction.reply({ content: "This is a preview. Buttons aren't executable in a preview.", ephemeral: true });
    },
};