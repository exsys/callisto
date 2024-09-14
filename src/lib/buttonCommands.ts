import { Keypair } from "@solana/web3.js";
import {
    ButtonInteraction,
    InteractionEditReplyOptions,
    InteractionReplyOptions,
    ModalBuilder,
    MessageCreateOptions
} from "discord.js";
import {
    DEBOUNCE_TIME,
    REF_FEE_DEBOUNCE_MAP,
} from "../config/constants";
import {
    ERROR_CODES,
    DEFAULT_ERROR,
    DEFAULT_ERROR_REPLY_EPHEM,
    DEFAULT_ERROR_REPLY
} from "../config/errors";
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
    selectBlinkMenu,
    disableBlink,
    checkAndUpdateBlink,
    storeUserBlink,
    getVoteResults,
    createDepositEmbed,
    toggleBlinksConversion,
    createBlinkSuccessMessage,
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
    executeChainedAction
} from "./util";
import { ChainedAction } from "../models/chainedAction";
import { LinkedAction } from "@solana/actions";

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
        const ui: InteractionEditReplyOptions = await createSellAndManageUI({ user_id: interaction.user.id, page: 0 });
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
        const ui: InteractionReplyOptions = await createWalletUI(interaction.user.id);
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
        const contractAddress: string | null = extractAndValidateCA(interaction.message.content, 1);
        if (!contractAddress) return await interaction.editReply({ content: ERROR_CODES["0006"].message });
        const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, contractAddress);
        await interaction.editReply(uiResponse.ui);
    },
    refreshManageInfo: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const tokenAddressLine: string | undefined = interaction.message.embeds[0].data.fields?.[0].name;
        if (!tokenAddressLine) return await interaction.editReply(DEFAULT_ERROR_REPLY);
        const contractAddress: string | null = extractAndValidateCA(tokenAddressLine, 1);
        if (!contractAddress) return await interaction.editReply({ content: ERROR_CODES["0006"].message });
        const ui: InteractionEditReplyOptions = await createSellAndManageUI({ user_id: interaction.user.id, ca: contractAddress });
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
            const ui: InteractionReplyOptions = await createDepositEmbed(interaction.user.id);
            await interaction.editReply(ui);
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
    addNewWallet: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const walletAddress: string | undefined = await createWallet(interaction.user.id);
        if (!walletAddress) {
            await interaction.editReply({ content: ERROR_CODES["0005"].message });
            return;
        }
        if (walletAddress === "max_limit_reached") return await interaction.editReply("Max amount of wallets reached.");

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
            const ui: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
            await interaction.editReply(ui);
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
            await interaction.editReply({ content: `Your private key:\n${await decryptPKey(wallet.encrypted_private_key, wallet.iv)}\n\nDo not share your private key with anyone. Anyone with access to your private key will also have access to your funds.` });
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
        let content: string | undefined = interaction.message.embeds[0].data.description;
        if (!content) {
            content = interaction.message.embeds[0].data.fields?.[0].name;
            if (!content) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        }
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, content, "1");
        await interaction.editReply(uiResponse.ui);
    },
    buyButton2: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        let content: string | undefined = interaction.message.embeds[0].data.description;
        if (!content) {
            content = interaction.message.embeds[0].data.fields?.[0].name;
            if (!content) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        }
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, content, "2");
        await interaction.editReply(uiResponse.ui);
    },
    buyButton3: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        let content: string | undefined = interaction.message.embeds[0].data.description;
        if (!content) {
            content = interaction.message.embeds[0].data.fields?.[0].name;
            if (!content) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        }
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, content, "3");
        await interaction.editReply(uiResponse.ui);
    },
    buyButton4: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        let content: string | undefined = interaction.message.embeds[0].data.description;
        if (!content) {
            content = interaction.message.embeds[0].data.fields?.[0].name;
            if (!content) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        }
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, content, "4");
        await interaction.editReply(uiResponse.ui);
    },
    buyButtonX: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createBuyXSolModal();
        await interaction.showModal(modal);
    },
    sellButton1: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const caLine: string | undefined = interaction.message.embeds[0].data.fields?.[0].name;
        if (!caLine) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, caLine, "1");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            await storeUnpaidRefFee(uiResponse.transaction!);
        }
    },
    sellButton2: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const caLine: string | undefined = interaction.message.embeds[0].data.fields?.[0].name;
        if (!caLine) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, caLine, "2");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            await storeUnpaidRefFee(uiResponse.transaction!);
        }
    },
    sellButton3: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const caLine: string | undefined = interaction.message.embeds[0].data.fields?.[0].name;
        if (!caLine) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, caLine, "3");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            await storeUnpaidRefFee(uiResponse.transaction!);
        }
    },
    sellButton4: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const caLine: string | undefined = interaction.message.embeds[0].data.fields?.[0].name;
        if (!caLine) return await interaction.editReply("Couldn't find Token Address. Please contact support.");
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, caLine, "4");
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
        const sellUI: InteractionEditReplyOptions = await createSellAndManageUI({ user_id: interaction.user.id, page: 0 });
        await interaction.editReply(sellUI);
    },
    lastCoin: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: InteractionEditReplyOptions = await createSellAndManageUI({ user_id: interaction.user.id, page: -1 });
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
        // TODO: check whether this is still works, extractAndValidateCA for example had 0 for line number. also changed everything to embeds
        const contractAddress: string | null = extractAndValidateCA(interaction.message.content, 1);
        if (!contractAddress) {
            return await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address." });
        }
        const amount: string = extractAmountFromMessage(interaction.message.content);
        if (!amount) return await interaction.editReply(DEFAULT_ERROR_REPLY);

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
    executeBlinkButton: async (interaction: ButtonInteraction, action_id?: string, button_id?: string, buttonType?: string) => {
        // this is the function that will be executed whenever a user clicks on a button from a blink UI
        // TODO: always use embed for custom inputs because of discord 3 seconds limitations

        try {
            // buttonType is defined (as "custom") if the action has parameters defined. eg. action.links.actions[i].parameters
            if (buttonType !== "custom") {
                // NOTE: discord doesn't allow to show a modal after a reply, and a reply has to be send within 3 seconds
                // but this function might take more than 3 seconds to process
                await interaction.deferReply({ ephemeral: true });
            }

            // this will execute the blink if all values are processed. if custom values are needed and not submitted yet,
            // this function will return with custom_values, so they can be submitted first

            const result: BlinkResponse = await executeBlink(interaction.user.id, action_id!, button_id!);
            switch (result.response_type) {
                case "custom_input_required": {
                    // this if block means button which requires custom inputs was pressed and those haven't been submitted yet
                    const modal: ModalBuilder | MessageCreateOptions | undefined =
                        await createBlinkCustomValuesModal(result.action_id!, result.button_id!, result.action!);
                    if (!modal) return await interaction.editReply(DEFAULT_ERROR_REPLY);

                    if (modal instanceof ModalBuilder) {
                        return await interaction.showModal(modal);
                    } else {
                        // for buttons where more than 5 custom inputs are possible
                        return await interaction.reply({ embeds: modal.embeds, components: modal.components, ephemeral: true });
                    }
                }
                case "success": {
                    // createBlinkSuccessMessage is overwriting result.response. an embed is shown instead
                    // reason why we are doing this here instead of where the message is received is because
                    // in case of chained actions we still want to use the plain result.response text
                    const ui: InteractionReplyOptions = await createBlinkSuccessMessage(result.reply_object);
                    return await interaction.editReply(ui);
                }
                case "chained_action": {
                    return await interaction.editReply(result.reply_object);
                }
                case "error": {
                    return await interaction.editReply(result.reply_object);
                }
                default: {
                    return await interaction.editReply(DEFAULT_ERROR_REPLY);
                }
            }
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    executeChainedAction: async (interaction: ButtonInteraction, action_id?: string, button_id?: string, buttonType?: string) => {
        // NOTE: this will only be executed for NextActionLink's of type "inline"
        try {
            if (buttonType !== "custom") {
                await interaction.deferReply({ ephemeral: true });
            }

            const actionId: string | undefined = action_id?.includes(".") ? action_id.split(".")[0] : action_id;
            const chainId: string | undefined = action_id?.includes(".") ? action_id.split(".")[1] : "1";
            if (!actionId) return await interaction.editReply(DEFAULT_ERROR_REPLY);
            if (!button_id) return await interaction.editReply(DEFAULT_ERROR_REPLY);

            const result: BlinkResponse = await executeChainedAction(interaction.user.id, actionId, chainId, button_id);
            switch (result.response_type) {
                case "custom_input_required": {
                    // this if block means button which requires custom inputs was pressed and those haven't been submitted yet
                    const modal: ModalBuilder | MessageCreateOptions | undefined =
                        await createBlinkCustomValuesModal(action_id!, result.button_id!, undefined, result.chained_action?.links?.actions!);
                    if (!modal) return await interaction.editReply(DEFAULT_ERROR_REPLY);

                    if (modal instanceof ModalBuilder) {
                        return await interaction.showModal(modal);
                    } else {
                        // for buttons where more than 5 custom inputs are possible
                        return await interaction.reply({ embeds: modal.embeds, components: modal.components, ephemeral: true });
                    }
                }
                case "success": {
                    const ui: InteractionReplyOptions = await createBlinkSuccessMessage(result.reply_object);
                    return await interaction.editReply(ui);
                }
                case "chained_action": {
                    return await interaction.editReply(result.reply_object);
                }
                case "error": {
                    return await interaction.editReply(result.reply_object);
                }
                default: {
                    return await interaction.editReply(DEFAULT_ERROR_REPLY);
                }
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

            const actionId: string | undefined = action_id?.includes(".") ? action_id.split(".")[0] : action_id;
            const chain_id: string | undefined = action_id?.includes(".") ? action_id.split(".")[1] : undefined;

            const actionUI: any = await ActionUI.findOne({ action_id: actionId }).lean();
            if (!actionUI) return await interaction.editReply({ content: "Couldn't find corresponding Blink." });

            // TODO NEXT: fix this. buttons dont exist on actionUI anymore
            // check whether chainId is present, if yes use that to get linked actions (links)
            // if not query the actionUI, and do a GET req to the posted_url and get the links from there
            // if chained action executeChainedAction() else executeBlink()

            let correspondingLinkedAction: LinkedAction | undefined; // the button that was clicked on the blink
            if (chain_id) {
                const chainedAction: any = await ChainedAction.findOne({ action_id: actionId, chain_id, user_id: interaction.user.id }).lean();
                if (!chainedAction.links) return await interaction.editReply(DEFAULT_ERROR_REPLY);
                // TODO NEXT: corresponding button habe ich nur gebraucht um die parameters zu holen
                // ich kann hier also direkt den corresponding LinkedAction holen und von ihm die parameters nehmen
                const linkedActions: LinkedAction[] = chainedAction.links.actions;
                linkedActions.forEach((linkedAction: LinkedAction, index: number) => {
                    if (index + 1 === Number(button_id)) {
                        correspondingLinkedAction = linkedAction;
                        return;
                    }
                });
            }
            if (!correspondingLinkedAction) return await interaction.editReply({ content: "Couldn't find corresponding Blink." });
            // check if everything is valid and if all required fields are submitted
            const missingValues: string = await validateCustomBlinkValues(embedDescription, correspondingLinkedAction);
            if (missingValues) return await interaction.editReply({ content: missingValues });

            // order values and prepare them to send to the RPC
            const orderedBlinkValues: BlinkCustomValue[] | undefined =
                await convertDescriptionToOrderedValues(embedDescription, correspondingLinkedAction);
            if (!orderedBlinkValues) return await interaction.editReply(DEFAULT_ERROR_REPLY);
            const result: BlinkResponse = await executeBlink(interaction.user.id, action_id!, button_id!, orderedBlinkValues);
            return await interaction.editReply(result.reply_object);
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
    changeUserBlink: async (interaction: ButtonInteraction, fieldToChange?: string, blink_id?: string, editMode?: string) => {
        try {
            const isEditMode: boolean = editMode === "e";
            switch (fieldToChange) {
                case "AddAction": {
                    const ui: InteractionReplyOptions = addActionButtonTypeSelection(blink_id!, isEditMode);
                    return await interaction.reply(ui);
                }
                case "RemoveAction": {
                    await interaction.deferReply({ ephemeral: true });
                    const ui: InteractionEditReplyOptions = await removeActionSelectionMenu(blink_id!, isEditMode);
                    return await interaction.editReply(ui);
                }
                default: {
                    const modal: ModalBuilder | undefined = await createChangeUserBlinkModal(fieldToChange!, blink_id!, isEditMode);
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
        const blinkType: string = interaction.message.content.split("\n")[1].split(": ")[1];
        const ui: InteractionReplyOptions = await createBlinkUiFromEmbed(interaction.message.embeds[0].data, blinkType);
        await interaction.editReply(ui);
    },
    finishBlinkCreation: async (interaction: ButtonInteraction, blink_id?: string) => {
        await interaction.deferReply({ ephemeral: true });
        const response: InteractionReplyOptions = await storeUserBlink(blink_id!);
        await interaction.editReply(response);
    },
    addFixedAction: async (interaction: ButtonInteraction, blink_id?: string, editMode?: string) => {
        try {
            // NOTE: the app might not respond if the DB query takes more than 3 seconds, but the app won't crash
            const isEditMode: boolean = editMode === "e";
            const response: ModalBuilder | InteractionReplyOptions | undefined = await createFixedActionModal(blink_id!, isEditMode);
            if (!response) return await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
            if (response instanceof ModalBuilder) return await interaction.showModal(response);
            return await interaction.reply(response as InteractionReplyOptions);
        } catch (error) {
            await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
        }
    },
    addCustomAction: async (interaction: ButtonInteraction, blink_id?: string, editMode?: string) => {
        try {
            // NOTE: the app might not respond if the DB query takes more than 3 seconds, but the app won't crash
            const isEditMode: boolean = editMode === "e";
            const response: ModalBuilder | InteractionReplyOptions | undefined = await createCustomActionModal(blink_id!, isEditMode);
            if (!response) return await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
            if (response instanceof ModalBuilder) return await interaction.showModal(response);
            await interaction.reply(response);
        } catch (error) {
            await interaction.reply(DEFAULT_ERROR_REPLY_EPHEM);
        }
    },
    blinkPreviewButton: async (interaction: ButtonInteraction, buttonOrder?: string) => {
        await interaction.reply({ content: "This is a preview. Buttons aren't executable in a preview.", ephemeral: true });
    },
    editBlink: async (interaction: ButtonInteraction) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            const ui: InteractionEditReplyOptions = await selectBlinkMenu(interaction.user.id, "edit");
            await interaction.editReply(ui);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    },
    deleteBlink: async (interaction: ButtonInteraction) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            const ui: InteractionEditReplyOptions = await selectBlinkMenu(interaction.user.id, "delete");
            await interaction.editReply(ui);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR);
        }
    },
    finishBlinkEdit: async (interaction: ButtonInteraction, blink_id?: string) => {
        await interaction.deferReply({ ephemeral: true });
        const updateHasErrors: InteractionReplyOptions | null = await checkAndUpdateBlink(blink_id!);
        if (updateHasErrors) return await interaction.editReply(updateHasErrors);
        const ui: InteractionEditReplyOptions = await createBlinkSettingsUI(interaction.user.id, true);
        await interaction.editReply(ui);
    },
    disableBlink: async (interaction: ButtonInteraction, blinkId?: string) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionReplyOptions = await disableBlink(blinkId!);
        await interaction.editReply(ui);
    },
    showBlinkUrl: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const menu: InteractionEditReplyOptions = await selectBlinkMenu(interaction.user.id, "url");
        await interaction.editReply(menu);
    },
    showBlinkVoteResults: async (interaction: ButtonInteraction, blinkId?: string) => {
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionReplyOptions = await getVoteResults(blinkId!);
        await interaction.editReply(ui);
    },
    toggleBlinksConversion: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const guildId: string | null = interaction.guildId;
        if (!guildId) return await interaction.editReply("Couldn't find Server information. Please try again later.");
        const ui: InteractionReplyOptions = await toggleBlinksConversion(guildId);
        await interaction.editReply(ui);
    },
};