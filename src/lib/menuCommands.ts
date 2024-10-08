import { Wallet } from "../models/wallet";
import { DEFAULT_ERROR_REPLY } from "../config/errors";
import {
    StringSelectMenuInteraction,
    InteractionEditReplyOptions,
    ModalBuilder,
    InteractionReplyOptions
} from "discord.js";
import {
    createWalletUI,
    createSellAndManageUI,
    createTokenInfoBeforeSendUI,
    createNewBlinkUI,
    removeActionButtonFromBlink,
    createBlinkEmbedUIFromBlinkId,
    deleteUserBlink,
    tokenAddressForBlinkModal
} from "./discord-ui";
import { extractUserIdFromMessage } from "./util";
import { AppStats } from "../models/appstats";

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
            await interaction.editReply(DEFAULT_ERROR_REPLY);
            return;
        }

        try {
            await Wallet.updateOne({ wallet_address: oldDefaultWallet.wallet_address }, { is_default_wallet: false });
            await Wallet.updateOne({ wallet_address: newDefaultWallet.wallet_address }, { is_default_wallet: true });

            const walletUi: InteractionReplyOptions = await createWalletUI(interaction.user.id);
            await interaction.editReply(walletUi);
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    removeSelectedWallet: async (interaction: StringSelectMenuInteraction, walletToRemove: string) => {
        await interaction.deferReply({ ephemeral: true });
        const allWallets: any[] = await Wallet.find({ user_id: interaction.user.id });
        if (!allWallets.length) {
            await interaction.editReply({ content: "No wallets found." });
            return;
        }


        const removeWallet: any = allWallets.find((wallet: any) => wallet.wallet_address === walletToRemove);
        if (!removeWallet) {
            await interaction.editReply({ content: "Wallet not found. Please contact support if the issue persists." });
            return;
        }

        try {
            if (allWallets.length > 1) {
                const newDefaultWallet: any = allWallets.find((wallet: any) => wallet.wallet_address !== removeWallet.wallet_address);
                newDefaultWallet.is_default_wallet = true;
                await newDefaultWallet.save();
            }

            removeWallet.user_id = "deleted";
            removeWallet.user_id_deleted = interaction.user.id;
            if (removeWallet.is_default_wallet) {
                removeWallet.is_default_wallet = false;
            }
            
            const appStats: any = await AppStats.findOne({ stats_id: 1 });
            appStats.wallets_deleted++;

            await removeWallet.save();
            await appStats.save();
            await interaction.editReply({ content: "Successfully removed wallet." });
        } catch (error) {
            await interaction.editReply(DEFAULT_ERROR_REPLY);
        }
    },
    selectCoin: async (interaction: StringSelectMenuInteraction, contractAddress: string) => {
        await interaction.deferReply({ ephemeral: true });
        const sellUI: InteractionEditReplyOptions = await createSellAndManageUI({ user_id: interaction.user.id, ca: contractAddress });
        await interaction.editReply(sellUI);
    },
    selectTokenToSend: async (interaction: StringSelectMenuInteraction, contractAddress: string) => {
        await interaction.deferReply({ ephemeral: true });
        const recipientId: string = extractUserIdFromMessage(interaction.message.content);
        const ui: InteractionEditReplyOptions = await createTokenInfoBeforeSendUI(interaction.user.id, recipientId, contractAddress);
        await interaction.editReply(ui);
    },
    selectBlinkType: async (interaction: StringSelectMenuInteraction, blinkType: string) => {
        if (blinkType === "blinkTokenSwap" || blinkType === "blinkDonation") {
            const modal: ModalBuilder = tokenAddressForBlinkModal(blinkType);
            return await interaction.showModal(modal);
        }
        await interaction.deferReply({ ephemeral: true });
        const ui: InteractionEditReplyOptions = await createNewBlinkUI(interaction.user.id, blinkType);
        await interaction.editReply(ui);
    },
    removeBlinkAction: async (interaction: StringSelectMenuInteraction, buttonValues: string) => {
        await interaction.deferReply({ ephemeral: true });
        const editMode: boolean = interaction.customId.split(":")[1] === "e";
        const values: string[] = buttonValues.split(":");
        const blinkId: string = values[0];
        const buttonLabel: string = values[1];
        const buttonLabelOrder: number = Number(values[2]);
        const ui: InteractionReplyOptions = await removeActionButtonFromBlink(blinkId, buttonLabel, buttonLabelOrder, editMode);
        await interaction.editReply(ui);
    },
    selectBlinkToEdit: async (interaction: StringSelectMenuInteraction, blinkId: string) => {
        await interaction.deferReply({ ephemeral: true });
        const blinkUI: InteractionReplyOptions = await createBlinkEmbedUIFromBlinkId(blinkId, true);
        await interaction.editReply(blinkUI);
    },
    selectBlinkToDelete: async (interaction: StringSelectMenuInteraction, blinkId: string) => {
        await interaction.deferReply({ ephemeral: true });
        const response: InteractionReplyOptions = await deleteUserBlink(blinkId);
        await interaction.editReply(response);
    },
    selectBlinkToShowUrl: async (interaction: StringSelectMenuInteraction, blinkId: string) => {
        const content: string = `https://callistobot.com/blinks/${blinkId}`;
        await interaction.reply({ content, ephemeral: true });
    },
};