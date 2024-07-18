import { UI } from "../interfaces/ui";
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
    createRefCodeModal
} from "./discord-ui";
import { Wallet } from "../models/wallet";
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
    createRefCodeForUser,
    saveReferralAndUpdateFees,
    storeUnpaidRefFee
} from "./util";
import { SolanaWeb3 } from "./solanaweb3";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ERROR_CODES } from "../config/errors";
import { TxResponse } from "../interfaces/tx-response";
import { REFCODE_MODAL_STRING } from "../config/constants";
import { UIResponse } from "../interfaces/ui-response";
import { ModalBuilder } from "discord.js";

export const BUTTON_COMMANDS = {
    test: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const userId: string = interaction.user.id;
        const wallet = await Wallet.findOne({ user_id: userId, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Test failed. Wallet not found", ephemeral: true });
            return;
        }
        const signer: Keypair | null = getKeypairFromEncryptedPKey(wallet.encrypted_private_key, wallet.iv);
        if (!signer) {
            await interaction.editReply({ content: "Test failed. Signer not found", ephemeral: true });
            return;
        }

        // test here
        const tokenAcc = await SolanaWeb3.getTokenAccountOfWallet("26dmF2GnE5iUk3HyUx2iUfTDHhHm9zinTLNKjV6bbHWu", "So11111111111111111111111111111111111111112");
        console.log(tokenAcc);

        await interaction.editReply({ content: "Test successful", ephemeral: true });
    },
    start: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const startUI: UI = await createStartUI(interaction.user.id);
        await interaction.editReply(startUI);
    },
    buy: async (interaction: any) => {
        const modal = createBuyModal();
        await interaction.showModal(modal);
    },
    sellAndManage: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: UI = await createSellAndManageUI({ userId: interaction.user.id, page: 0 });
        await interaction.editReply(sellUI);
    },
    wallet: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const walletUi: UI = await createWalletUI(interaction.user.id);
        await interaction.editReply(walletUi);
    },
    settings: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const settingsUI: UI = await createSettingsUI(interaction.user.id);
        await interaction.editReply(settingsUI);
    },
    refresh: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const startUI: UI = await createStartUI(interaction.user.id);
        await interaction.editReply(startUI);
    },
    refreshCoinInfo: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string | null = extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: ERROR_CODES["0006"].message, ephemeral: true });
            return;
        }
        const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, contractAddress);
        await interaction.editReply(uiResponse.ui);
    },
    refreshManageInfo: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string | null = extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: ERROR_CODES["0006"].message, ephemeral: true });
            return;
        }
        const sellAndManageUI: UI = await createSellAndManageUI({ userId: interaction.user.id, ca: contractAddress });
        await interaction.editReply(sellAndManageUI);
    },
    help: async (interaction: any) => {
        const helpUI: UI = createHelpUI();
        await interaction.reply(helpUI);
    },
    refer: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const refCodeMsg: string | null = await createRefCodeForUser(interaction.user.id);
        if (refCodeMsg) {
            await interaction.editReply({ content: refCodeMsg, ephemeral: true });
            return;
        }
        await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
    },
    deposit: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        try {
            const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
            if (!wallet) {
                await interaction.editReply({ content: ERROR_CODES["0003"].message, ephemeral: true });
                return;
            }
            await interaction.editReply({ content: wallet.wallet_address, ephemeral: true });
        } catch (error) {
            await interaction.editReply({ content: ERROR_CODES["0000"].message, ephemeral: true });
        }

    },
    withdrawAllSol: async (interaction: any) => {
        const modal: ModalBuilder = createWithdrawAllSolModal();
        await interaction.showModal(modal);
    },
    withdrawXSol: async (interaction: any) => {
        const modal: ModalBuilder = createWithdrawXSolModal();
        await interaction.showModal(modal);
    },
    removeWallet: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const removeWalletUI: UI = await createRemoveWalletUI(interaction.user.id);
        await interaction.editReply(removeWalletUI);
    },
    changeWallet: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const changeWalletUI: UI = await createChangeWalletMenu(interaction.user.id);
        await interaction.editReply(changeWalletUI);
    },
    createWallet: async (interaction: any) => {
        const walletAddress: string | null = await createNewWallet(interaction.user.id);
        if (!walletAddress) {
            await interaction.editReply({ content: ERROR_CODES["0005"].message, ephemeral: true });
            return;
        }

        if (walletAddress === REFCODE_MODAL_STRING) {
            const refCodeModal = createRefCodeModal();
            await interaction.showModal(refCodeModal);
        }

        const startUI: UI = await createStartUI(interaction.user.id);
        await interaction.editReply(startUI);
    },
    addNewWallet: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const walletAddress: string | null = await createNewWallet(interaction.user.id);
        if (!walletAddress) {
            await interaction.editReply({ content: ERROR_CODES["0005"].message, ephemeral: true });
            return;
        }
        const setAsDefaultUI: UI = createSetAsDefaultUI(walletAddress as string);
        await interaction.editReply(setAsDefaultUI);
    },
    setAsDefault: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        try {
            const allWallets: any[] = await Wallet.find({ user_id: interaction.user.id }).lean();
            if (!allWallets.length) {
                await interaction.editReply({ content: "No wallets found. Create a wallet with the /create command to get started.", ephemeral: true });
                return;
            }
            const oldDefaultWallet: any = allWallets.find((wallet: any) => wallet.is_default_wallet);
            const newDefaultWallet: any = allWallets.sort((a: any, b: any) => a.createdAt - b.createdAt)[0]; // find the latest wallet by date
            if (!newDefaultWallet || !oldDefaultWallet) {
                await interaction.editReply({ content: "Server error. Please try again later", ephemeral: true });
                return;
            }

            await Wallet.updateOne({ user_id: interaction.user.id, wallet_address: oldDefaultWallet.wallet_address }, { is_default_wallet: false });
            await Wallet.updateOne({ user_id: interaction.user.id, wallet_address: newDefaultWallet.wallet_address }, { is_default_wallet: true });
            await interaction.editReply({ content: "Successfully set as your default wallet!", ephemeral: true });
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    exportPrivKeyConfirmation: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const exportUI: UI = createExportPrivKeyUI();
        await interaction.editReply(exportUI);
    },
    exportPrivKey: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const wallet = await exportPrivateKeyOfUser(interaction.user.id);
        if (!wallet) {
            await interaction.editReply({ content: ERROR_CODES["0002"].message, ephemeral: true });
            return;
        } else {
            await interaction.editReply({ content: `Your private key:\n${decryptPKey(wallet.encrypted_private_key, wallet.iv)}\n\nDo not share your private key with anyone. Anyone with access to your private key will also have access to your funds.`, ephemeral: true });
        }
    },
    buyButton1: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, interaction.message.content, "1");
        await interaction.editReply(uiResponse.ui);
    },
    buyButton2: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, interaction.message.content, "2");
        await interaction.editReply(uiResponse.ui);
    },
    buyButton3: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, interaction.message.content, "3");
        await interaction.editReply(uiResponse.ui);
    },
    buyButton4: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoin(interaction.user.id, interaction.message.content, "4");
        await interaction.editReply(uiResponse.ui);
    },
    buyButtonX: async (interaction: any) => {
        const modal: ModalBuilder = createBuyXSolModal();
        await interaction.showModal(modal);
    },
    sellButton1: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "1");
        await interaction.editReply(uiResponse.ui);
        // TODO: this if block will be executed if user swap fee is 0. fix that
        if (uiResponse.store_ref_fee) {
            const success = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    sellButton2: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "2");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee) {
            const success = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    sellButton3: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "3");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee) {
            const success = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    sellButton4: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoin(interaction.user.id, interaction.message.content, "4");
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee) {
            const success = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    sellButtonX: async (interaction: any) => {
        const modal: ModalBuilder = createSellXPercentModal();
        await interaction.showModal(modal);
    },
    generalSettings: async (interaction: any) => {
        await interaction.reply({ content: "GENERAL SETTINGS\n\nMin Position Value: Minimum position value to show in portfolio. Will hide tokens below this threshhold. Tap to edit.\n\nAuto Buy: Immediately buy when pasting token address. Tap to edit. Changing it to 0 disables Auto Buy.\n\nSlippage Config: Customize your slippage settings for buys and sells. If the price of a coin will change by more than the set amount while waiting for the transaction to finish the transaction will be cancelled. Tap to edit.", ephemeral: true });
    },
    buyButtonsConfig: async (interaction: any) => {
        await interaction.reply({ content: "BUY BUTTONS CONFIG\n\nCustomize your buy buttons when buying a coin.", ephemeral: true });
    },
    sellButtonsConfig: async (interaction: any) => {
        await interaction.reply({ content: "SELL BUTTONS CONFIG\n\nCustomize your sell buttons when selling a coin.", ephemeral: true });
    },
    transactionConfig: async (interaction: any) => {
        await interaction.reply({ content: "TRANSACTION CONFIG\n\nMEV Protection: Accelerates your transactions and protect against frontruns to make sure you get the best price possible or turn it off for faster transactions.\nOff: Callisto will not use MEV protection. Transactions will be faster but might get frontrun.\nOn: Transactions are guaranteed to be protected from MEV, but transactions may be slower or fail.\n\nTransaction Priority: Increase your Transaction Priority to improve transaction speed. Tap to edit.", ephemeral: true });
    },
    minPositionValue: async (interaction: any) => {
        const modal: ModalBuilder = createMinPositionValueModal();
        await interaction.showModal(modal);
    },
    autoBuyValue: async (interaction: any) => {
        const modal: ModalBuilder = createAutoBuyValueModal();
        await interaction.showModal(modal);
    },
    mevProtection: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({ content: "Not implemented yet.", ephemeral: true });
    },
    txPriority: async (interaction: any) => {
        const modal: ModalBuilder = createTransactionPriorityModal();
        await interaction.showModal(modal);
    },
    buySlippage: async (interaction: any) => {
        const modal: ModalBuilder = createBuySlippageModal();
        await interaction.showModal(modal);
    },
    sellSlippage: async (interaction: any) => {
        const modal: ModalBuilder = createSellSlippageModal();
        await interaction.showModal(modal);
    },
    buyButtons1st: async (interaction: any) => {
        const modal: ModalBuilder = createChangeBuyButtonModal("1");
        await interaction.showModal(modal);
    },
    buyButtons2nd: async (interaction: any) => {
        const modal: ModalBuilder = createChangeBuyButtonModal("2");
        await interaction.showModal(modal);
    },
    buyButtons3rd: async (interaction: any) => {
        const modal: ModalBuilder = createChangeBuyButtonModal("3");
        await interaction.showModal(modal);
    },
    buyButtons4th: async (interaction: any) => {
        const modal: ModalBuilder = createChangeBuyButtonModal("4");
        await interaction.showModal(modal);
    },
    sellButtons1st: async (interaction: any) => {
        const modal: ModalBuilder = createChangeSellButtonModal("1");
        await interaction.showModal(modal);
    },
    sellButtons2nd: async (interaction: any) => {
        const modal: ModalBuilder = createChangeSellButtonModal("2");
        await interaction.showModal(modal);
    },
    sellButtons3rd: async (interaction: any) => {
        const modal: ModalBuilder = createChangeSellButtonModal("3");
        await interaction.showModal(modal);
    },
    sellButtons4th: async (interaction: any) => {
        const modal: ModalBuilder = createChangeSellButtonModal("4");
        await interaction.showModal(modal);
    },
    firstCoin: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: UI = await createSellAndManageUI({ userId: interaction.user.id, page: 0 });
        await interaction.editReply(sellUI);
    },
    previousCoin: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string | null = extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address.", ephemeral: true });
            return;
        }
        const sellUI: UI = await createSellAndManageUI({ userId: interaction.user.id, ca: contractAddress, prevCoin: true });
        await interaction.editReply(sellUI);
    },
    nextCoin: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string | null = extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address.", ephemeral: true });
            return;
        }
        const sellUI: UI = await createSellAndManageUI({ userId: interaction.user.id, ca: contractAddress, nextCoin: true });
        await interaction.editReply(sellUI);
    },
    lastCoin: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: UI = await createSellAndManageUI({ userId: interaction.user.id, page: -1 });
        await interaction.editReply(sellUI);
    },
    currentCoin: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const selectCoinMenu: UI = await createSelectCoinMenu(interaction.user.id);
        await interaction.editReply(selectCoinMenu);
    },
    sendCoin: async (interaction: any) => {
        const modal: ModalBuilder = createSendCoinModal();
        await interaction.showModal(modal);
    },
    retryLastSwap: async (interaction: any) => {
        await interaction.deferReply({ ephemeral: true });
        const contractAddress: string | null = extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address.", ephemeral: true });
            return;
        }
        const amount: string | null = extractAmountFromMessage(interaction.message.content);
        if (!amount) {
            await interaction.editReply({ content: "Server Error. Please try again.", ephemeral: true });
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
};

export const MENU_COMMANDS = {
    selectWallet: async (interaction: any, newDefault: any) => {
        await interaction.deferReply({ ephemeral: true });
        const allWallets: any[] = await Wallet.find({ user_id: interaction.user.id }).lean();
        if (!allWallets.length) {
            await interaction.editReply({ content: "No wallets found. Create a wallet with the /create command to get started.", ephemeral: true });
            return;
        }
        const oldDefaultWallet: any = allWallets.find((wallet: any) => wallet.is_default_wallet);
        const newDefaultWallet: any = allWallets.find((wallet: any) => wallet.wallet_address === newDefault);
        if (!newDefaultWallet || !oldDefaultWallet) {
            await interaction.editReply({ content: "Server error. Please try again later", ephemeral: true });
            return;
        }

        try {
            await Wallet.updateOne({ wallet_address: oldDefaultWallet.wallet_address }, { is_default_wallet: false });
            await Wallet.updateOne({ wallet_address: newDefaultWallet.wallet_address }, { is_default_wallet: true });

            const walletUi: UI = await createWalletUI(interaction.user.id);
            await interaction.editReply(walletUi);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    removeSelectedWallet: async (interaction: any, walletToRemove: string) => {
        await interaction.deferReply({ ephemeral: true });
        const allWallets: any[] = await Wallet.find({ user_id: interaction.user.id });
        if (!allWallets.length) {
            await interaction.editReply({ content: "No wallets found. Create a wallet with the /create command to get started.", ephemeral: true });
            return;
        }

        const removeWallet: any = allWallets.find((wallet: any) => wallet.wallet_address === walletToRemove);
        if (!removeWallet) {
            await interaction.editReply({ content: "Wallet not found. Please contact support if the issue persists.", ephemeral: true });
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

            await interaction.editReply({ content: "Successfully removed wallet.", ephemeral: true });
        } catch (error) {
            // TODO: store error
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    selectCoin: async (interaction: any, contractAddress: string) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: UI = await createSellAndManageUI({ userId: interaction.user.id, ca: contractAddress });
        await interaction.editReply(sellUI);
    },
};

export const MODAL_COMMANDS = {
    // this one will be called after pasting the contract address in the CA modal
    buyCoin: async (interaction: any, contractAddress: string) => {
        await interaction.deferReply({ ephemeral: true });
        const isValidAddress: boolean = SolanaWeb3.checkIfValidAddress(contractAddress);
        if (!isValidAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address.", ephemeral: true });
            return;
        }
        const uiResponse: UIResponse = await createPreBuyUI(interaction.user.id, contractAddress);
        await interaction.editReply(uiResponse.ui);
    },
    buyXSol: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await buyCoinX(interaction.user.id, interaction.message.content, amount);
        await interaction.editReply(uiResponse.ui);
    },
    sellXPercent: async (interaction: any, percent: string) => {
        await interaction.deferReply({ ephemeral: true });
        const uiResponse: UIResponse = await sellCoinX(interaction.user.id, interaction.message.content, percent);
        await interaction.editReply(uiResponse.ui);
        if (uiResponse.store_ref_fee) {
            const success = await storeUnpaidRefFee(uiResponse.transaction!);
            if (!success) console.log("Failed to store ref fee. UI response: " + JSON.stringify(uiResponse));
        }
    },
    withdrawXSol: async (interaction: any, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const amountToWithdraw = values[0];
        const destinationAddress = values[1];
        const isValidAddress = SolanaWeb3.checkIfValidAddress(destinationAddress);
        if (!isValidAddress) {
            await interaction.editReply({ content: "Invalid destination address. Please enter a valid address.", ephemeral: true });
            return;
        }

        try {
            const result: TxResponse = await SolanaWeb3.transferXSol(interaction.user.id, amountToWithdraw, destinationAddress);
            await interaction.editReply({ content: result.response, ephemeral: true });
        } catch (error) {
            // TODO: store error
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }

    },
    withdrawAllSol: async (interaction: any, destinationAddress: string) => {
        await interaction.deferReply({ ephemeral: true });
        const isValidAddress = SolanaWeb3.checkIfValidAddress(destinationAddress);
        if (!isValidAddress) {
            await interaction.editReply({ content: "Invalid destination address. Please enter a valid address.", ephemeral: true });
            return;
        }

        try {
            const result: TxResponse = await SolanaWeb3.transferAllSol(interaction.user.id, destinationAddress);
            await interaction.editReply({ content: result.response, ephemeral: true });
        } catch (error) {
            // TODO: store error
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeMinPositionValue: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.reply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        wallet.settings.min_position_value = Number(amount);
        await wallet.save();

        const settingsUI: UI = await createSettingsUI(interaction.user.id);
        await interaction.editReply(settingsUI);
    },
    changeAutoBuyValue: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.auto_buy_value = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeBuySlippage: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.buy_slippage = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }

    },
    changeSellSlippage: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.sell_slippage = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeTransactionPriority: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }

        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.tx_priority_value = Number(amount) * LAMPORTS_PER_SOL; // convert to lamports
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeBuyButton1: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.buy_button_1 = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeBuyButton2: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.buy_button_2 = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeBuyButton3: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.buy_button_3 = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeBuyButton4: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.buy_button_4 = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeSellButton1: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.sell_button_1 = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeSellButton2: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.sell_button_2 = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeSellButton3: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.sell_button_3 = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    changeSellButton4: async (interaction: any, amount: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (!isNumber(amount)) {
            await interaction.editReply({ content: "Invalid amount. Please enter a valid number.", ephemeral: true });
            return;
        }
        const wallet: any = await Wallet.findOne({ user_id: interaction.user.id, is_default_wallet: true });
        if (!wallet) {
            await interaction.editReply({ content: "Server error. If this issue persists please contact Support. Error code: 0003", ephemeral: true });
            return;
        }

        try {
            wallet.settings.sell_button_4 = Number(amount);
            await wallet.save();

            const settingsUI: UI = await createSettingsUI(interaction.user.id);
            await interaction.editReply(settingsUI);
        } catch (error) {
            await interaction.editReply({ content: "Server error. Please try again later.", ephemeral: true });
        }
    },
    sendCoin: async (interaction: any, values: string[]) => {
        await interaction.deferReply({ ephemeral: true });
        const amountToSend = values[0];
        const destinationAddress = values[1];
        const contractAddress = extractAndValidateCA(interaction.message.content);
        if (!contractAddress) {
            await interaction.editReply({ content: "Invalid contract address. Please enter a valid contract address.", ephemeral: true });
            return;
        }

        const result: TxResponse = await SolanaWeb3.sendCoin(interaction.user.id, contractAddress, amountToSend, destinationAddress);
        await interaction.editReply({ content: result.response, ephemeral: true });
    },
    enterRefCode: async (interaction: any, refCode: string) => {
        await interaction.deferReply({ ephemeral: true });
        if (refCode) {
            const response: UI = await saveReferralAndUpdateFees(interaction.user.id, refCode);
            await interaction.editReply(response);
        } else {
            const startUI: UI = await createStartUI(interaction.user.id);
            await interaction.editReply(startUI);
        }
    }
};