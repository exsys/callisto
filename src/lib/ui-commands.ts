import { Wallet } from "../models/wallet";
import {
    createAutoBuyValueModal,
    createBuyModal,
    createBuySlippageModal,
    createBuyXSolModal,
    createChangeBuyButtonModal,
    createChangeSellButtonModal,
    createChangeWalletMenu,
    createExportPrivKeyUI,
    createMinPositionValueModal,
    createPreBuyUI,
    createRemoveWalletUI,
    createSellSlippageModal,
    createSellAndManageUI,
    createSetAsDefaultUI,
    createSettingsUI,
    createStartUI,
    createTransactionPriorityModal,
    createWalletUI,
    createWithdrawAllSolModal,
    createWithdrawXSolModal,
    createSelectCoinMenu,
    createSellXPercentModal,
    createSendCoinModal,
    createHelpUI,
    createRefCodeModal,
    createClaimRefFeeUI,
    createReferUI,
    createSelectCoinToSendMenu,
    createTokenInfoBeforeSendUI,
    sendXPercentToUserModal,
    sendXAmountToUserModal,
    createLimitOrderModal,
    createCoinInfoForLimitOrderUI,
    createBuyLimitPercentModal,
    createBuyLimitPriceModal,
    createSellLimitPercentModal,
    createSellLimitPriceModal
} from "./discord-ui";
import {
    buyCoin,
    buyCoinX,
    createNewWallet,
    decryptPKey,
    extractAmountFromMessage,
    extractAndValidateCA,
    getKeypairFromEncryptedPKey,
    exportPrivateKeyOfUser,
    isNumber,
    sellCoin,
    sellCoinX,
    saveReferralAndUpdateFees,
    storeUnpaidRefFee,
    claimUnpaidRefFees,
    saveDbTransaction,
    extractUserIdFromMessage,
    extractBalanceFromMessage,
} from "./util";
import { SolanaWeb3 } from "./solanaweb3";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ERROR_CODES } from "../config/errors";
import { TxResponse } from "../types/tx-response";
import { REFCODE_MODAL_STRING } from "../config/constants";
import { UIResponse } from "../types/ui-response";
import { ButtonInteraction, InteractionEditReplyOptions, ModalBuilder, ModalSubmitInteraction, StringSelectMenuInteraction } from "discord.js";

const REF_FEE_DEBOUNCE_MAP: Map<string, boolean> = new Map();
const DEBOUNCE_TIME: number = 8000;

export const BUTTON_COMMANDS = {
    test: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const userId: string = interaction.user.id;
        const wallet = await Wallet.findOne({ user_id: userId, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Test failed. Wallet not found" });
            return;
        }
        const signer: Keypair | null = await getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
        if (!signer) {
            await interaction.editReply({ content: "Test failed. Signer not found" });
            return;
        }

        // test here
        const tokenAcc = await SolanaWeb3.getTokenAccountOfWallet("26dmF2GnE5iUk3HyUx2iUfTDHhHm9zinTLNKjV6bbHWu", "So11111111111111111111111111111111111111112");
        console.log(tokenAcc);

        await interaction.editReply({ content: "Test successful" });
    },
    start: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const startUI: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
        await interaction.editReply(startUI);
    },
    buy: async (interaction: ButtonInteraction) => {
        const modal = createBuyModal();
        await interaction.showModal(modal);
    },
    limitOrder: async (interaction: ButtonInteraction) => {
        const modal = createLimitOrderModal();
        await interaction.showModal(modal);
        // paste ca
        // show coin info
        // let user submit price where to buy
        // option 1: $ price, but like jup show % change 
        // option 2: let user 
    },
    sellAndManage: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id, page: 0 });
        await interaction.editReply(sellUI);
    },
    wallet: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const walletUi: InteractionEditReplyOptions = await createWalletUI(interaction.user.id);
        await interaction.editReply(walletUi);
    },
    settings: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
        await interaction.editReply(settingsUI);
    },
    refresh: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const startUI: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
        await interaction.editReply(startUI);
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
        const sellAndManageUI: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id, ca: contractAddress });
        await interaction.editReply(sellAndManageUI);
    },
    help: async (interaction: ButtonInteraction) => {
        const helpUI: string = createHelpUI();
        await interaction.reply(helpUI);
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
        const walletAddress: string | null = await createNewWallet(interaction.user.id);
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
        const walletAddress: string | null = await createNewWallet(interaction.user.id);
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
            const newDefaultWallet: any = allWallets.sort((a: any, b: any) => a.createdAt - b.createdAt)[0]; // find the latest wallet by date
            if (!newDefaultWallet || !oldDefaultWallet) {
                await interaction.editReply({ content: "Server error. Please try again later" });
                return;
            }

            await Wallet.updateOne({ user_id: interaction.user.id, wallet_address: oldDefaultWallet.wallet_address }, { is_default_wallet: false });
            await Wallet.updateOne({ user_id: interaction.user.id, wallet_address: newDefaultWallet.wallet_address }, { is_default_wallet: true });
            await interaction.editReply({ content: "Successfully set as your default wallet!" });
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
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

        const userId: string = interaction.user.id;
        if (REF_FEE_DEBOUNCE_MAP.has(userId)) {
            await interaction.editReply("Claim request already sent. Please wait until the current request has been processed.");
            return;
        }
        REF_FEE_DEBOUNCE_MAP.set(userId, true);

        // TODO: change it so reply is sent after a few seconds, and actual request is sent after, after a longer waiting period
        // or backend request to another server after 5 seconds, where the actual transfer will be processed, or something like that
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
            const success: boolean = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    sellButton2: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "2");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            const success: boolean = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    sellButton3: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "3");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            const success: boolean = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    sellButton4: async (interaction: ButtonInteraction) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "4");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            const success: boolean = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    sellButtonX: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createSellXPercentModal();
        await interaction.showModal(modal);
    },
    generalSettings: async (interaction: ButtonInteraction) => {
        await interaction.reply({ content: "GENERAL SETTINGS\n\nMin Position Value: Minimum position value to show in portfolio. Will hide tokens below this threshhold. Tap to edit.\n\nAuto Buy: Immediately buy when pasting token address. Tap to edit. Changing it to 0 disables Auto Buy.\n\nSlippage Config: Customize your slippage settings for buys and sells. If the price of a coin will change by more than the set amount while waiting for the transaction to finish the transaction will be cancelled. Tap to edit." });
    },
    buyButtonsConfig: async (interaction: ButtonInteraction) => {
        await interaction.reply({ content: "BUY BUTTONS CONFIG\n\nCustomize your buy buttons when buying a coin." });
    },
    sellButtonsConfig: async (interaction: ButtonInteraction) => {
        await interaction.reply({ content: "SELL BUTTONS CONFIG\n\nCustomize your sell buttons when selling a coin." });
    },
    transactionConfig: async (interaction: ButtonInteraction) => {
        await interaction.reply({ content: "TRANSACTION CONFIG\n\nMEV Protection: Accelerates your transactions and protect against frontruns to make sure you get the best price possible or turn it off for faster transactions.\nOff: Callisto will not use MEV protection. Transactions will be faster but might get frontrun.\nOn: Transactions are guaranteed to be protected from MEV, but transactions may be slower or fail.\n\nTransaction Priority: Increase your Transaction Priority to improve transaction speed. Tap to edit." });
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
            await interaction.editReply({ content: "Server Error. Please try again." });
            return;
        }

        if (amount.includes("%")) {
            const amountWithoutPercentSymbol = amount.slice(0, -1);
            const uiResponseSell: UIResponse = await sellCoinX(interaction.user.id, interaction.message.content, amountWithoutPercentSymbol);
            await interaction.editReply(uiResponseSell.ui);
            if (uiResponseSell.store_ref_fee) {
                const success = await storeUnpaidRefFee(uiResponseSell.transaction!);
                if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponseSell));
            }
        } else {
            const uiResponseBuy: UIResponse = await buyCoinX(interaction.user.id, interaction.message.content, amount);
            await interaction.editReply(uiResponseBuy.ui);
        }
    },
    buyLimitPercent: async (interaction: ButtonInteraction) => {
        const modal: ModalBuilder = createBuyLimitPercentModal();
        console.log("test")
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
};

export const MENU_COMMANDS = {
    selectWallet: async (interaction: StringSelectMenuInteraction, newDefault: string) => {
        await interaction.deferReply({ ephemeral: true });
        const allWallets: any[] = await Wallet.find({ user_id: interaction.user.id }).lean();
        if (!allWallets.length) {
            await interaction.editReply({ content: "No wallets found. Create a wallet with the /create command to get started." });
            return;
        }
        const oldDefaultWallet: any = allWallets.find((wallet: any) => wallet.is_default_wallet);
        const newDefaultWallet: any = allWallets.find((wallet: any) => wallet.wallet_address === newDefault);
        if (!newDefaultWallet || !oldDefaultWallet) {
            await interaction.editReply({ content: "Server error. Please try again later" });
            return;
        }

        try {
            await Wallet.updateOne({ wallet_address: oldDefaultWallet.wallet_address }, { is_default_wallet: false });
            await Wallet.updateOne({ wallet_address: newDefaultWallet.wallet_address }, { is_default_wallet: true });

            const walletUi: InteractionEditReplyOptions = await createWalletUI(interaction.user.id);
            await interaction.editReply(walletUi);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    removeSelectedWallet: async (interaction: StringSelectMenuInteraction, walletToRemove: string) => {
        await interaction.deferReply({ ephemeral: true });
        const allWallets: any[] = await Wallet.find({ user_id: interaction.user.id });
        if (!allWallets.length) {
            await interaction.editReply({ content: "No wallets found. Create a wallet with the /create command to get started." });
            return;
        }

        const removeWallet: any = allWallets.find((wallet: any) => wallet.wallet_address === walletToRemove);
        if (!removeWallet) {
            await interaction.editReply({ content: "Wallet not found. Please contact support if the issue persists." });
            return;
        }

        try {
            removeWallet.user_id = "deleted";
            removeWallet.user_id_deleted = interaction.user.id;
            if (removeWallet.is_default_wallet) {
                removeWallet.is_default_wallet = false;
            }
            await removeWallet.save();

            if (allWallets.length > 1) {
                const newDefaultWallet: any = allWallets.find((wallet: any) => wallet.wallet_address !== removeWallet.wallet_address);
                newDefaultWallet.is_default_wallet = true;
                await newDefaultWallet.save();
            }

            await interaction.editReply({ content: "Successfully removed wallet." });
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    selectCoin: async (interaction: StringSelectMenuInteraction, contractAddress: string) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: InteractionEditReplyOptions = await createSellAndManageUI({ userId: interaction.user.id, ca: contractAddress });
        await interaction.editReply(sellUI);
    },
    selectTokenToSend: async (interaction: StringSelectMenuInteraction, contractAddress: string) => {
        await interaction.deferReply({ ephemeral: true });
        const recipientId: string = extractUserIdFromMessage(interaction.message.content);
        const ui: InteractionEditReplyOptions = await createTokenInfoBeforeSendUI(interaction.user.id, recipientId, contractAddress);
        await interaction.editReply(ui);
    }
};

export const MODAL_COMMANDS = {
    buyCoin: async (interaction: ModalSubmitInteraction, contractAddress: string) => {
        // this one will be called after pasting the contract address in the CA modal
        await interaction.deferReply({ ephemeral: true });
        const isValidAddress: boolean = await SolanaWeb3.checkIfValidAddress(contractAddress);
        if (!isValidAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address." });
            return;
        }
        const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, contractAddress);
        await interaction.editReply(uiResponse.ui);
    },
    buyXSol: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoinX(interaction.user.id, interaction.message!.content, amount);
        await interaction.editReply(uiResponse.ui);
    },
    sellXPercent: async (interaction: ModalSubmitInteraction, percent: string) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoinX(interaction.user.id, interaction.message!.content, percent);
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee && !uiResponse.transaction?.error) {
            const success = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    limitOrderInfo: async (interaction: ModalSubmitInteraction, contractAddress: string) => {
        await interaction.deferReply({ ephemeral: true });
        const contract_address: string = await extractAndValidateCA(contractAddress);
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
        const isValidAddress: boolean = await SolanaWeb3.checkIfValidAddress(destinationAddress);
        if (!isValidAddress) {
            await interaction.editReply({ content: "Invalid destination address. Please enter a valid address." });
            return;
        }

        const result: TxResponse = await SolanaWeb3.transferXSol(interaction.user.id, amountToWithdraw, destinationAddress);
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    withdrawAllSol: async (interaction: ModalSubmitInteraction, destinationAddress: string) => {
        await interaction.deferReply({ ephemeral: true });
        const isValidAddress: boolean = await SolanaWeb3.checkIfValidAddress(destinationAddress);
        if (!isValidAddress) {
            await interaction.editReply({ content: "Invalid destination address. Please enter a valid address." });
            return;
        }

        const result: TxResponse = await SolanaWeb3.transferAllSol(interaction.user.id, destinationAddress);
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    changeMinPositionValue: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.reply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        wallet.settings.min_position_value = Number(amount);
        await wallet.save();

        const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
        await interaction.editReply(settingsUI);
    },
    changeAutoBuyValue: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.auto_buy_value = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeBuySlippage: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.buy_slippage = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }

    },
    changeSellSlippage: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.sell_slippage = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeTransactionPriority: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }

        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.tx_priority_value = Number(amount) * LAMPORTS_PER_SOL; // convert to lamports
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeBuyButton1: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.buy_button_1 = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeBuyButton2: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.buy_button_2 = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeBuyButton3: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.buy_button_3 = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeBuyButton4: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.buy_button_4 = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeSellButton1: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.sell_button_1 = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeSellButton2: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.sell_button_2 = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeSellButton3: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.sell_button_3 = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
        }
    },
    changeSellButton4: async (interaction: ModalSubmitInteraction, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number." });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003" });
            return;
        }

        try {
            wallet.settings.sell_button_4 = Number(amount);
            await wallet.save();

            const settingsUI: InteractionEditReplyOptions = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later." });
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

        const result: TxResponse = await SolanaWeb3.sendXPercentOfCoin(interaction.user.id, contractAddress, percentToSend, destinationAddress);
        await interaction.editReply({ content: result.response });
        await saveDbTransaction(result);
    },
    sendXPercentToUser: async (interaction: ModalSubmitInteraction, amountInPercent: string) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message!.content, 3);
        if (!contractAddress) await interaction.editReply("Server error. Please try again later.");
        const recipientId: string = extractUserIdFromMessage(interaction.message!.content);
        if (!recipientId) await interaction.editReply("Server error. Please try again later.");
        const recipientWallet: any = await Wallet.findOne({ user_id: recipientId, is_default_wallet: true }).lean();
        if (!recipientWallet) await interaction.editReply(ERROR_CODES["0002"].message);

        const balanceLine: number = contractAddress === "SOL" ? 4 : 5;
        const tokenBalanceInDecimal: number = extractBalanceFromMessage(interaction.message!.content, balanceLine);
        if (amountInPercent.includes("%")) amountInPercent = amountInPercent.replace("%", "");
        const amountToSend: string = String(tokenBalanceInDecimal * (Number(amountInPercent) / 100));
        let response: TxResponse;
        if (contractAddress === "SOL") {
            response = await SolanaWeb3.transferXSol(interaction.user.id, amountToSend, recipientWallet.wallet_address);
        } else {
            response = await SolanaWeb3.sendCoin(interaction.user.id, contractAddress, amountToSend, recipientWallet.wallet_address);
        }
        await interaction.editReply({ content: response.response });
        await saveDbTransaction(response);
    },
    sendXAmountToUser: async (interaction: ModalSubmitInteraction, amountInToken: string) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string = await extractAndValidateCA(interaction.message!.content, 3);
        if (!contractAddress) await interaction.editReply("Server error. Please try again later.");
        const recipientId: string = extractUserIdFromMessage(interaction.message!.content);
        if (!recipientId) await interaction.editReply("Server error. Please try again later.");
        const recipientWallet: any = await Wallet.findOne({ user_id: recipientId, is_default_wallet: true }).lean();
        if (!recipientWallet) await interaction.editReply(ERROR_CODES["0002"].message);

        let response: TxResponse;
        if (contractAddress === "SOL") {
            response = await SolanaWeb3.transferXSol(interaction.user.id, amountInToken, recipientWallet.wallet_address);
        } else {
            response = await SolanaWeb3.sendCoin(interaction.user.id, contractAddress, amountInToken, recipientWallet.wallet_address);
        }
        await interaction.editReply({ content: response.response });
        await saveDbTransaction(response);
    },
    enterRefCode: async (interaction: ModalSubmitInteraction, refCode: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (refCode) {
            const response: InteractionEditReplyOptions = await saveReferralAndUpdateFees(interaction.user.id, refCode);
            await interaction.editReply(response);
        } else {
            const startUI: InteractionEditReplyOptions = await createStartUI(interaction.user.id);
            await interaction.editReply(startUI);
        }
    },
    buyLimitPercentModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply("not implemented yet");
    },
    buyLimitPriceModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply("not implemented yet");
    },
    sellLimitPercentModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply("not implemented yet");
    },
    sellLimitPriceModal: async (interaction: ModalSubmitInteraction, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply("not implemented yet");
    },
};