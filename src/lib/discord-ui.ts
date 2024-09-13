import { Wallet } from "../models/wallet";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    InteractionEditReplyOptions,
    SelectMenuComponentOptionData,
    EmbedBuilder,
    MessageCreateOptions,
    AttachmentBuilder,
    InteractionReplyOptions,
    Embed,
    APIEmbed,
    APIEmbedField,
    EmbedField,
} from "discord.js";
import {
    createNewRefCode,
    createWallet,
    createOrUseRefCodeForUser,
    formatNumber,
    saveError,
    createNewBlink,
    isPositiveNumber,
    checkImageAndFormat,
    postDiscordErrorWebhook,
    extractUrlAndMessageFromBlink,
    urlToBuffer
} from "./util";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { CoinStats } from "../types/coinStats";
import { CoinInfo } from "../types/coinInfo";
import {
    DEFAULT_ERROR,
    DEFAULT_ERROR_REPLY,
    DEFAULT_ERROR_REPLY_EPHEM,
    ERROR_CODES
} from "../config/errors";
import { TxResponse } from "../types/txResponse";
import { User } from "../models/user";
import {
    BLINK_DEFAULT_IMAGE,
    CALLISTO_WEBSITE_ROOT_URLS,
    REFCODE_MODAL_STRING,
    SOL_WALLET_ADDRESS_MAX_LENGTH,
    SOL_WALLET_ADDRESS_MIN_LENGTH,
} from "../config/constants";
import { UIResponse } from "../types/uiResponse";
import {
    buyCoinViaAPI,
    getAllCoinInfos,
    getAllCoinStatsFromWallet,
    getBalanceOfWalletInDecimal,
    getBalanceOfWalletInLamports,
    getCoinPriceStats,
    getCoinStatsFromWallet,
    getCurrentSolPrice,
    getTokenBalanceOfWallet,
    getTokenIcon,
} from "./solanaweb3";
import { ActionGetResponse, LinkedAction, NextAction } from "@solana/actions";
import { ActionUI } from "../models/actionui";
import { AppStats } from "../models/appstats";
import { TypedActionParameter } from "@solana/actions-spec";
import { Blink } from "../models/blink";
import { BLINKS_TYPE_MAPPING } from "../config/blinks_type_mapping";
import { TOKEN_ADDRESS_STRICT_LIST, TOKEN_STRICT_LIST } from "../config/token_strict_list";
import { DBAction } from "../types/dbAction";
import { BlinkVoteResult } from "../models/blinkVoteResult";
import QRCode from 'qrcode';
import { GuildSettings } from "../models/guildSettings";
import { EmbedFromUrlResponse } from "../types/EmbedFromUrlResponse";
import { UrlAndBlinkMsg } from "../types/UrlAndBlinkMsg";
import {
    createActionBlinkButtons,
    createBlinkCreationButtons,
    createBlinkSettingsUIButtons,
    createPreBuyUIButtons,
    createSellAndManageUIButtons,
    createSettingsUIButtons,
    createStartUIButtons,
    createVoteResultButton,
    createWalletUIButtons
} from "./ui-buttons";
import { DbBlink } from "../types/DbBlink";
import sharp from "sharp";

/***************************************************** UIs *****************************************************/

export async function createAdminUI(guild_id: string, toggled?: string): Promise<InteractionReplyOptions> {
    try {
        let content: string = "**Blinks Conversion:** Toggle the automatic Blinks URL conversion to Action Blinks. If turned off Callisto will not transform Blink URLs into Action Blinks.";

        let blinksConversion: string = "On";
        if (!toggled) {
            const guildSettings: any = await GuildSettings.findOne({ guild_id }).lean();
            if (!guildSettings) {
                const newGuildSettings = new GuildSettings({
                    guild_id,
                });
                await newGuildSettings.save();
            } else {
                if (!guildSettings.blinks_conversion) blinksConversion = "Off";
            }
        }
        const blinksToggleButton = new ButtonBuilder()
            .setCustomId(`toggleBlinksConversion`)
            .setLabel(`Blinks Conversion: ${toggled ? toggled : blinksConversion}`)
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(blinksToggleButton);
        return { content, components: [row] };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, "createAdminUI");
        return DEFAULT_ERROR_REPLY;
    }
}

export async function createStartUI(user_id: string): Promise<InteractionReplyOptions> {
    try {
        const user: any = await User.findOne({ user_id }).lean();
        if (!user) {
            const walletAddress: string | undefined = await createWallet(user_id);
            if (!walletAddress) {
                return { content: "Error while trying to create a wallet. If the issue persists please contact support." };
            }

            if (walletAddress === REFCODE_MODAL_STRING) return { content: REFCODE_MODAL_STRING };
        }

        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true });
        if (!wallet) return DEFAULT_ERROR_REPLY;

        const [solBalance, usdcBalance] = await Promise.all([
            getBalanceOfWalletInDecimal(wallet.wallet_address),
            getTokenBalanceOfWallet(wallet.wallet_address, TOKEN_STRICT_LIST.USDC)
        ]);

        const formattedSolBalance: string = solBalance ? (solBalance > 0 ? solBalance.toFixed(4) : "0") : "0";
        const formattedUsdcBalance: string = usdcBalance ? (usdcBalance > 0 ? usdcBalance.toFixed(2) : "0") : "0";
        const description: string = Number(formattedSolBalance) == 0 ? "You currently have no SOL balance. To get started with trading, send some SOL to your Callisto wallet address. Once done tap refresh and your balance will appear here." : 'To buy a coin tap the "Buy" button.';
        const embed = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setTitle("Wallet")
            .setAuthor({ name: "Solana's fastest wallet for Discord" })
            .setDescription(`${wallet.wallet_address}\n\n${description}`)
            .addFields(
                { name: "SOL Balance", value: `${formattedSolBalance} SOL`, inline: true },
                { name: "USDC Balance", value: `${formattedUsdcBalance} USDC`, inline: true },
            );

        const buttons = createStartUIButtons();
        return { embeds: [embed], components: buttons };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
};

export async function changeUserBlinkEmbedUI(
    user_id: string, blink_id: string, embed: Embed, fieldToChange: string, newValue: string, editMode: boolean = false,
): Promise<InteractionEditReplyOptions> {
    try {
        const newEmbed: EmbedBuilder = EmbedBuilder.from(embed);
        const blink: any = await Blink.findOne({ user_id, blink_id });
        if (!blink) return DEFAULT_ERROR_REPLY;
        const content: string = createBlinkCreationContent(blink);
        const buttons: ActionRowBuilder<ButtonBuilder>[] = createBlinkCreationButtons(blink.blink_id, editMode, blink.disabled);

        switch (fieldToChange) {
            case "Title": {
                newEmbed.setTitle(newValue);
                blink.title = newValue;
                break;
            }
            case "Description": {
                newEmbed.setDescription(newValue);
                blink.description = newValue;
                break;
            }
            case "Label": {
                newEmbed.setAuthor({ name: newValue });
                blink.label = newValue;
                break;
            }
            case "Icon": {
                const imageFormat: string | null = await checkImageAndFormat(newValue);
                if (!imageFormat) {
                    return { content: "Couldn't retrieve image. Please use another URL." };
                }

                if (imageFormat === "svg+xml" || imageFormat === "svg") {
                    // TODO: convert svg to png
                }

                if (imageFormat !== "jpeg" && imageFormat !== "jpg" && imageFormat !== "png" && imageFormat !== "gif") {
                    return { content: "Only jpg, png and gif images are currently supported." };
                }

                newEmbed.setImage(newValue);
                blink.icon = newValue;
                break;
            }
            case "Url": {
                // NOTE: this is currently not changeable by the user
                try {
                    if (!newValue.includes("https://")) {
                        newValue = `https://${newValue}`;
                    }
                    const newUrl: URL = new URL(newValue);
                    newEmbed.setURL(newUrl.href);

                } catch (error) {
                    return { content: "Invalid URL." };
                }
                break;
            }
        }

        await blink.save();
        return { content, embeds: [newEmbed], components: buttons };
    } catch (error) {
        //console.log(error);
        await saveError({
            function_name: "changeUserBlinkEmbedUI",
            error,
        });
        return DEFAULT_ERROR_REPLY;
    }
}

// TODO: check if I can combine addCustomActionButtonToBlink and addFixedActionButtonToBlink in an elegant way

export async function addCustomActionButtonToBlink(
    blink_id: string, buttonValues: string[], editMode: boolean = false
): Promise<InteractionReplyOptions | undefined> {
    try {
        const blink: any = await Blink.findOne({ blink_id });
        if (!blink) return;
        const content: string = createBlinkCreationContent(blink);
        const buttons: ActionRowBuilder<ButtonBuilder>[] = createBlinkCreationButtons(blink.blink_id, editMode, blink.disabled);

        const embed: EmbedBuilder = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setTitle(blink.title)
            .setURL(blink.title_url)
            .setAuthor({ name: blink.label })
            .setDescription(blink.description);

        if (blink.icon) embed.setImage(blink.icon);

        // TODO: refactor this: because 99% of values etc are the same for donation and tokenswap

        const customAmountString: string = "Amount: custom";
        switch (blink.blink_type) {
            case "blinkDonation": {
                const buttonLabel: string = buttonValues[0];
                if (!blink.links) {
                    blink.links = {
                        actions: [{
                            label: buttonLabel,
                            href: `/blinks/${blink.blink_id}?amount={amount}`,
                            embed_field_value: customAmountString,
                            parameters: [{
                                name: "amount",
                                label: buttonLabel,
                                required: true,
                            }],
                        }],
                    }
                } else {
                    const customAmountButtonAlreadyExists: DBAction | null
                        = blink.links.actions.find((action: DBAction) => action.parameters?.length !== 0);
                    if (customAmountButtonAlreadyExists) {
                        return { content: "You can add only one custom value button to Donation Blinks." };
                    }

                    blink.links.actions.forEach((action: any) => {
                        embed.addFields({
                            name: action.label,
                            value: action.embed_field_value,
                            inline: true,
                        });
                    });

                    blink.links.actions.push({
                        label: buttonLabel,
                        href: `/blinks/${blink.blink_id}?amount={amount}`,
                        embed_field_value: customAmountString,
                        parameters: [{
                            name: "amount",
                            label: buttonLabel,
                            required: true,
                        }],
                    });
                    blink.links.actions = sortDBActions(blink.links.actions);
                }

                // additionally add the one the user just added and store it in the db
                embed.addFields(
                    { name: buttonLabel, value: customAmountString, inline: true },
                );
                break;
            }
            case "blinkTokenSwap": {
                const buttonLabel: string = buttonValues[0];
                if (!blink.links) {
                    blink.links = {
                        actions: [{
                            label: buttonLabel,
                            href: `/blinks/${blink.blink_id}?amount={amount}`,
                            embed_field_value: customAmountString,
                            parameters: [{
                                name: "amount",
                                label: buttonLabel,
                                required: true,
                            }],
                        }],
                    }
                } else {
                    const customAmountButtonAlreadyExists: DBAction | null
                        = blink.links.actions.find((action: DBAction) => action.parameters?.length !== 0);
                    if (customAmountButtonAlreadyExists) {
                        return { content: "You can add only one custom value button to Token Swap Blinks." };
                    }

                    blink.links.actions.forEach((action: any) => {
                        embed.addFields({
                            name: action.label,
                            value: action.embed_field_value,
                            inline: true,
                        });
                    });
                    blink.links.actions.push({
                        label: buttonLabel,
                        href: `/blinks/${blink.blink_id}?amount={amount}`,
                        embed_field_value: customAmountString,
                        parameters: [{
                            name: "amount",
                            label: buttonLabel,
                            required: true,
                        }],
                    });
                    blink.links.actions = sortDBActions(blink.links.actions);
                }
                embed.addFields(
                    { name: buttonLabel, value: customAmountString, inline: true },
                );
                break;
            }
            case "blinkVote": {
                const buttonLabel: string = buttonValues[0];
                const buttonValue: string = buttonLabel.split(" ").join(" ");
                if (!blink.links) {
                    blink.links = {
                        actions: [{
                            label: buttonValue,
                            href: `/blinks/${blink.blink_id}?choice={choice}`,
                            embed_field_value: buttonLabel,
                            parameters: [{
                                name: "choice",
                                label: buttonLabel,
                                required: true,
                            }],
                        }],
                    }
                } else {
                    const customAmountButtonAlreadyExists: DBAction | null
                        = blink.links.actions.find((action: DBAction) => action.parameters?.length !== 0);
                    if (customAmountButtonAlreadyExists) {
                        return { content: "You can add only one custom value button to vote Blinks." };
                    }

                    blink.links.actions.forEach((action: any, index: number) => {
                        embed.addFields({
                            name: `Choice ${index + 1}`,
                            value: action.embed_field_value,
                            inline: true,
                        });
                    });
                    blink.links.actions.push({
                        label: buttonValue,
                        href: `/blinks/${blink.blink_id}?choice={choice}`,
                        embed_field_value: buttonLabel,
                        parameters: [{
                            name: "choice",
                            label: buttonLabel,
                            required: true,
                        }],
                    });
                }

                embed.addFields(
                    { name: `Choice ${blink.links.actions.length} (custom)`, value: buttonLabel, inline: true },
                );
                break;
            }
            default: {
                return DEFAULT_ERROR_REPLY_EPHEM;
            }
        }

        await blink.save();
        return { content, embeds: [embed], components: buttons };
    } catch (error) {
        await postDiscordErrorWebhook("blinks", error, `addCustomActionButtonToBlink | Blink: ${blink_id}`)
        return;
    }
}

export async function addFixedActionButtonToBlink(
    blink_id: string, buttonValues: string[], editMode: boolean = false
): Promise<InteractionReplyOptions | undefined> {
    try {
        const blink: any = await Blink.findOne({ blink_id });
        if (!blink) return;
        const content: string = createBlinkCreationContent(blink);
        const buttons: ActionRowBuilder<ButtonBuilder>[] = createBlinkCreationButtons(blink.blink_id, editMode, blink.disabled);

        const embed: EmbedBuilder = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setTitle(blink.title)
            .setURL(blink.title_url)
            .setAuthor({ name: blink.label })
            .setDescription(blink.description);

        if (blink.icon) embed.setImage(blink.icon);

        switch (blink.blink_type) {
            case "blinkDonation": {
                // add existing buttons (blink.links.actions) as field objects
                const buttonLabel: string = buttonValues[0];
                const transferAmountInSOL: string = buttonValues[1];
                const amountString: string = `Amount: ${transferAmountInSOL}`;
                if (!isPositiveNumber(transferAmountInSOL)) return { content: "Invalid value for amount." };

                if (!blink.links) {
                    blink.links = {
                        actions: [{
                            label: buttonLabel,
                            href: `/blinks/${blink.blink_id}?amount=${transferAmountInSOL}`, // TODO: allow custom tokens
                            embed_field_value: amountString,
                            token_amount: transferAmountInSOL,
                        }],
                    }
                } else {
                    blink.links.actions.push({
                        label: buttonLabel,
                        href: `/blinks/${blink.blink_id}?amount=${transferAmountInSOL}`,
                        token_amount: transferAmountInSOL,
                        embed_field_value: amountString
                    });
                    blink.links.actions = sortDBActions(blink.links.actions);
                }

                const sortedFields: EmbedField[] = sortEmbedFields(blink.links.actions);
                embed.addFields(sortedFields);
                break;
            }
            case "blinkTokenSwap": {
                const swapAmountInSOL: string = buttonValues[0];
                if (!isPositiveNumber(swapAmountInSOL)) return { content: "Invalid value for amount." };
                const amountString: string = `Amount: ${swapAmountInSOL}`;

                if (!blink.links) {
                    blink.links = {
                        actions: [{
                            label: `Buy ${swapAmountInSOL} SOL`,
                            href: `/blinks/${blink.blink_id}?amount=${swapAmountInSOL}`,
                            token_amount: swapAmountInSOL,
                            embed_field_value: amountString,
                        }],
                    }
                } else {
                    blink.links.actions.push({
                        label: `Buy ${swapAmountInSOL} SOL`,
                        href: `/blinks/${blink.blink_id}?amount=${swapAmountInSOL}`,
                        token_amount: swapAmountInSOL,
                        embed_field_value: amountString,
                    });
                    blink.links.actions = sortDBActions(blink.links.actions);
                }

                const sortedFields: EmbedField[] = sortEmbedFields(blink.links.actions);
                embed.addFields(sortedFields);
                break;
            }
            case "blinkVote": {
                const buttonLabel: string = buttonValues[0];
                const buttonValue: string = buttonLabel.split(" ").join(" ");
                if (!blink.links) {
                    blink.links = {
                        actions: [{
                            label: buttonValue,
                            href: `/blinks/${blink.blink_id}?choice=${buttonValue}`,
                            embed_field_value: buttonLabel,
                        }],
                    }
                } else {
                    const customAmountButtonAlreadyExists: DBAction | null
                        = blink.links.actions.find((action: DBAction) => action.embed_field_value === buttonLabel);
                    if (customAmountButtonAlreadyExists) {
                        return { content: "You can add only one custom value button to vote Blinks." };
                    }

                    blink.links.actions.forEach((action: any, index: number) => {
                        embed.addFields({
                            name: `Choice ${index + 1}${action.parameters?.length === 0 ? "" : " (custom)"}`,
                            value: action.embed_field_value,
                            inline: true,
                        });
                    });
                    blink.links.actions.push({
                        label: buttonValue,
                        href: `/blinks/${blink.blink_id}?choice=${buttonValue}`,
                        embed_field_value: buttonLabel,
                    });
                }

                embed.addFields(
                    { name: `Choice ${blink.links.actions.length}`, value: buttonLabel, inline: true },
                );
                break;
            }
            default: {
                return DEFAULT_ERROR_REPLY_EPHEM;
            }
        }

        await blink.save();
        return { content, embeds: [embed], components: buttons };
    } catch (error) {
        await postDiscordErrorWebhook("blinks", error, `addFixedActionButtonToBlink | Blink: ${blink_id}`)
        return;
    }
}

export async function createBlinkEmbedUIFromBlinkId(blink_id: string, editMode: boolean = false): Promise<InteractionReplyOptions> {
    try {
        const blink: any = await Blink.findOne({ blink_id }).lean();
        if (!blink) return DEFAULT_ERROR_REPLY;

        const content: string = createBlinkCreationContent(blink);
        const buttons: ActionRowBuilder<ButtonBuilder>[] = createBlinkCreationButtons(Number(blink_id), editMode, blink.disabled);
        const embed: EmbedBuilder = createBlinkCreationEmbedFromBlink(blink);

        return { content, embeds: [embed], components: buttons };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export async function createBlinkSettingsUI(user_id: string, editModeSuccess: boolean = false): Promise<InteractionEditReplyOptions> {
    try {
        let content: string = "";
        if (editModeSuccess) {
            content += "Successfully edited Blink."
        } else {
            content += "Create and change Blinks here. You can post Blinks anywhere in the web for faster transactions.";
        }
        const usersBlinks: any[] = await Blink.find({ user_id }).lean();
        let disabledBlinks: number = 0;
        usersBlinks.forEach((blink: any) => {
            if (blink.disabled) disabledBlinks++;
        });
        content += `\n\n**Active Blinks**: ${usersBlinks.length - disabledBlinks}`;
        content += `\n**Inactive Blinks**: ${disabledBlinks}`;

        const buttons = createBlinkSettingsUIButtons();
        return { content, components: [buttons] };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export async function createAdvancedUI(userId: string): Promise<InteractionEditReplyOptions> {
    const content: string = "";
    try {
        const limitOrderButton = new ButtonBuilder()
            .setCustomId('limitOrder')
            .setLabel('Limit Order')
            .setStyle(ButtonStyle.Secondary);

        const openLimitOrdersButton = new ButtonBuilder()
            .setCustomId('openLimitOrders')
            .setLabel('Open Limit Orders')
            .setStyle(ButtonStyle.Secondary);

        const dcaOrderButton = new ButtonBuilder()
            .setCustomId('dcaOrder')
            .setLabel('DCA')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(limitOrderButton, openLimitOrdersButton, dcaOrderButton);
        return { content, components: [row] };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export async function createWalletUI(userId: string): Promise<InteractionReplyOptions> {
    const wallet = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
    if (!wallet) return { content: ERROR_CODES["0003"].message };

    const [solBalance, usdcBalance] = await Promise.all([
        getBalanceOfWalletInDecimal(wallet.wallet_address),
        getTokenBalanceOfWallet(wallet.wallet_address, TOKEN_STRICT_LIST.USDC)
    ]);
    const formattedSOLBalance: string = (solBalance && solBalance > 0) ? solBalance.toFixed(4) : "0";
    const formattedUsdcBalance: string = usdcBalance ? usdcBalance.toFixed(2) : "0";
    const embed: EmbedBuilder = new EmbedBuilder()
        .setColor(0x4F01EB)
        .setTitle("Wallet Address")
        .setDescription(wallet.wallet_address)
        .setURL(`https://solscan.io/account/${wallet.wallet_address}`)
        .addFields(
            { name: "SOL Balance", value: formattedSOLBalance, inline: true },
            { name: "USDC Balance", value: formattedUsdcBalance, inline: true },
        );

    const buttons = createWalletUIButtons();
    return { embeds: [embed], components: buttons };
};

export async function createNewBlinkUI(user_id: string, blinkType: string, tokenAddress?: string): Promise<InteractionEditReplyOptions> {
    try {
        const blink: any | null = await createNewBlink(user_id, blinkType, tokenAddress);
        if (!blink) return DEFAULT_ERROR_REPLY;

        let content: string = `Blink ID: ${blink.blink_id}`;
        content += `\nBlink type: ${BLINKS_TYPE_MAPPING[blinkType]}`;
        if (tokenAddress) {
            // this only replaces the embed content with the token symbol, not the database value
            const addressToSymbol: string | undefined = TOKEN_ADDRESS_STRICT_LIST[tokenAddress as keyof typeof TOKEN_ADDRESS_STRICT_LIST];
            if (addressToSymbol) {
                content += `\nToken: ${addressToSymbol}`;
            } else {
                content += `\nToken: ${tokenAddress}`;
            }
        }

        const embedFields: APIEmbedField[] = blink.links?.actions.map((action: any) => {
            return {
                name: action.label,
                value: action.embed_field_value,
                inline: true,
            }
        });

        const label: string = blink.label || "label";
        const title: string = blink.title || "title";
        const description: string = blink.description || "description";

        const blinkEmbed: EmbedBuilder = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setAuthor({ name: label })
            .setTitle(title)
            .setDescription(description)
            .setImage(BLINK_DEFAULT_IMAGE)
            .setURL("https://callistobot.com");

        if (embedFields && embedFields.length) {
            blinkEmbed.setFields(embedFields);
        }

        const buttons: ActionRowBuilder<ButtonBuilder>[] = createBlinkCreationButtons(blink.blink_id);
        return { content, embeds: [blinkEmbed], components: buttons };
    } catch (error) {
        await saveError({
            function_name: "createNewBlink",
            error,
        });
        return DEFAULT_ERROR_REPLY;
    }
}

export async function createBlinkUI(posted_url: string, root_url: string, action: ActionGetResponse): Promise<MessageCreateOptions | null> {
    try {
        const embedResponse: EmbedFromUrlResponse | null = await createEmbedFromBlinkUrlAndAction(posted_url, action);
        if (!embedResponse) return null;

        const appStats: any = await AppStats.findOne({ stats_id: 1 });
        appStats.blinks_posted++;
        const newActionUI: any = new ActionUI({
            action_id: appStats.blinks_posted,
            posted_url: posted_url,
            root_url: root_url,
        });

        const buttons: ActionRowBuilder<ButtonBuilder>[] = createActionBlinkButtons(newActionUI.action_id, action);
        if (CALLISTO_WEBSITE_ROOT_URLS.includes(root_url)) {
            // also store the blink_id if it's a callisto blink
            const urlSplit: string[] = posted_url.split("/");
            const blink_id: string = urlSplit[urlSplit.length - 1];
            newActionUI.callisto_blink_id = blink_id;
            const blink: any = await Blink.findOne({ blink_id }).lean();
            if (blink) {
                // NOTE: dev environment will have different blink ids stored in DB. so dev might not include the "show result" button
                newActionUI.callisto_blink_type = blink.blink_type;
                if (blink.blink_type === "blinkVote") {
                    const showResultsButton = createVoteResultButton(blink.blink_id);
                    buttons.push(showResultsButton);
                }
            }
        }
        // TODO: retry a few times if save error
        await newActionUI.save();
        await appStats.save();
        return { embeds: [embedResponse.embed], components: buttons, files: embedResponse.attachment };
    } catch (error) {
        await postDiscordErrorWebhook("blinks", error, `createBlinkUI in discord-ui.ts: posted_url: ${posted_url} | root_url: ${root_url} | action: ${JSON.stringify(action)}`);
        return null;
    }
}

export function createHelpUI(): InteractionReplyOptions {
    let content = "Welcome to Callisto, the fastest Solana wallet on Discord.";
    content += "\n\nTo get started, use the **/start** command, this command will create a new Solana wallet automatically if you don't have one already.";
    content += " From there you will be able to navigate through Callisto.";
    content += "\n\n**Buttons:**";
    content += "\n**Buy:** Enter a contract address or a token symbol from a popular coin to buy any coin on Solana.";
    content += "\n**Sell & Manage:** View and manage your open positions.";
    content += "\n**Blinks:** Create and Manage Solana Action Blinks.";
    content += "\n**Wallet:** Manage your wallets.";
    content += "\n**Settings:** Manage your wallet settings.";
    content += "\n\n**Commands:**";
    content += "\n**/start:** Open the Callisto main UI.";
    content += "\n**/send <username>:** Send SOL or SPL tokens to other Discord users with a Callisto wallet using their username.";
    content += "\n**/buy <contract address>:** Enter a contract address or popular token symbol to buy a coin.";
    content += "\n**/positions:** View and manage your open positions.";
    content += "\n**/admin:** Open the admin settings. Only admins of a server can use this command.";
    content += "\n\nFor more information on the other features check out the /start command or visit our website at https://callistobot.com";
    return { content, ephemeral: true };
};

export async function createReferUI(userId: string): Promise<InteractionEditReplyOptions> {
    const refCodeMsg: string | null = await createOrUseRefCodeForUser(userId);
    if (!refCodeMsg) return { content: ERROR_CODES["0000"].message };

    const claimFeesButton = new ButtonBuilder()
        .setCustomId("showRefFees")
        .setLabel("Claim Fees")
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claimFeesButton);
    return { content: refCodeMsg, components: [row] };
}

export async function createPreBuyUI(user_id: string, tokenAddress: string): Promise<UIResponse> {
    let content: string = "";
    const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
    if (!wallet) return { ui: DEFAULT_ERROR_REPLY };
    const walletBalance: number | undefined = await getBalanceOfWalletInLamports(wallet.wallet_address);
    if (walletBalance === undefined) return { ui: { content: ERROR_CODES["0015"].message } };
    if (wallet.settings.auto_buy_value > 0) {
        const txPrio: number = wallet.settings.tx_priority_value;
        if (walletBalance < wallet.settings.auto_buy_value * LAMPORTS_PER_SOL + txPrio + 105000) {
            // 105000 is the minimum amount of lamports needed for a swap
            content += `Not enough SOL for autobuy. Please deposit more SOL to your wallet.`;
            // TODO: don't return here, give use coin info anyways but with the content above this line as extra
            return { ui: { content } };
        }
        const response: TxResponse = await buyCoinViaAPI(user_id, tokenAddress, String(wallet.settings.auto_buy_value));
        if (!response.error) {
            const ui: InteractionEditReplyOptions = await createSellAndManageUI({ user_id });
            return { ui, transaction: response };
        } else {
            return createAfterSwapUI(response);
        }
    }

    // TODO: if dexscreener fails try another method
    // TODO: find a way to get a more up-to-date price of the coin, because dex price can lag like 1 min behind
    // best way for this would be to know how much SOL and how much of the token are in the LP and then simply calculate the price
    const coinInfo: CoinStats | null = await getCoinPriceStats(tokenAddress);
    if (!coinInfo) return { ui: { content: "Coin not found. Please enter a valid contract address or token symbol." } };

    // TODO: calculate price impact

    const embed = new EmbedBuilder()
        .setColor(0x4F01EB)
        .setTitle("Dexscreener")
        .setURL(`https://dexscreener.com/solana/${tokenAddress}`)
        .setAuthor({ name: `${coinInfo.name} | ${coinInfo.symbol}` })
        .setDescription(tokenAddress)
        .addFields(
            { name: "Price", value: coinInfo.price, inline: true },
            { name: "Market Cap", value: coinInfo.fdv, inline: true },
            { name: "Price changes", value: `**5m**: ${coinInfo.priceChange.m5}% | **1h**: ${coinInfo.priceChange.h1}% | **6h**: ${coinInfo.priceChange.h6}% | **24h**: ${coinInfo.priceChange.h24}%` },
            { name: "Wallet Balance", value: (walletBalance / LAMPORTS_PER_SOL).toFixed(5) },
        );

    const buttons = createPreBuyUIButtons(wallet.settings, tokenAddress);
    return { ui: { embeds: [embed], components: buttons } };
};

export async function createCoinInfoForLimitOrderUI(contract_address: string): Promise<InteractionEditReplyOptions> {
    let content: string = "";
    try {
        const coinInfo: CoinStats | null = await getCoinPriceStats(contract_address);
        if (!coinInfo) return { content: "Coin not found. Please enter a valid coin." };

        // TODO: calculate price impact for different SOL amounts

        const mcapNumber: number = Number(coinInfo.fdv.replace("M", ""));
        const coinPrice: number = Number(coinInfo.price);
        const price50PercentDown: number = Math.round(coinPrice * 50000) / 100000;
        const price50PercentUp: number = Math.round(coinPrice * 150000) / 100000;
        const mcap50PercentDown: string = ((Math.round(mcapNumber * 10000) / 10000) * 0.5).toFixed(2);
        const mcap50PercentUp: string = ((Math.round(mcapNumber * 10000) / 10000) * 1.5).toFixed(2);
        content += `\n\n**${coinInfo.name}** | **${coinInfo.symbol}** | **${contract_address}**`;
        content += `\n\n**Price**: $${coinInfo.price} | **-50%**: $${price50PercentDown} | **+50%**: $${price50PercentUp}`;
        content += `\n**Market Cap**: $${coinInfo.fdv} | **-50%**: ${mcap50PercentDown}M | **+50%**: ${mcap50PercentUp}M`;
        content += `\n**5m**: ${coinInfo.priceChange.m5}% | **1h**: ${coinInfo.priceChange.h1}% | **6h**: ${coinInfo.priceChange.h6}% | **24h**: ${coinInfo.priceChange.h24}%`
        content += "\n\nTap one of the buttons below to create a limit order.";

        const buyLimitPercentButton = new ButtonBuilder()
            .setCustomId('buyLimitPercent')
            .setLabel(`Buy Limit (%)`)
            .setStyle(ButtonStyle.Secondary);

        const buyLimitPriceButton = new ButtonBuilder()
            .setCustomId('buyLimitPrice')
            .setLabel(`Buy Limit ($)`)
            .setStyle(ButtonStyle.Secondary);

        const sellLimitPercentButton = new ButtonBuilder()
            .setCustomId('sellLimitPercent')
            .setLabel(`Sell Limit (%)`)
            .setStyle(ButtonStyle.Secondary);

        const sellLimitPriceButton = new ButtonBuilder()
            .setCustomId('sellLimitPrice')
            .setLabel('Sell Limit ($)')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(buyLimitPercentButton, buyLimitPriceButton, sellLimitPercentButton, sellLimitPriceButton);
        return { content, components: [row] };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export async function createSellAndManageUI({ user_id, page, ca, successMsg }:
    { user_id: string, page?: number, ca?: string, successMsg?: boolean }
): Promise<InteractionEditReplyOptions> {
    try {
        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return { content: ERROR_CODES["0003"].message };

        const coinsInWallet: CoinStats[] | null = await getAllCoinStatsFromWallet(wallet.wallet_address, wallet.settings.min_position_value);
        if (!coinsInWallet) {
            if (successMsg) {
                // this block will be executed if user swapped with the sell & manage ui and there are no coins left inside their wallet (except sol)
                return { content: "Successfully swapped." };
            } else {
                return { content: "No coins found. Buy a coin to see it here." };
            }
        }
        // selectedCoin is the coin which will be shown first
        let selectedCoin: CoinStats | undefined = undefined;
        if (typeof page !== "undefined") {
            // if index was given
            if (page === -1) {
                selectedCoin = coinsInWallet[coinsInWallet.length - 1];
            } else {
                selectedCoin = coinsInWallet[page];
            }
        } else {
            // this block will be executed if ca has been passed
            selectedCoin = coinsInWallet.find((coin: CoinStats) => coin.address === ca);
            if (!selectedCoin) {
                selectedCoin = coinsInWallet[0];
            }
        }

        if (!selectedCoin) return { content: "No coins found. Buy a coin to see it here." };
        const coinSymbols: string[] = coinsInWallet.map((coin: CoinStats) => coin.symbol);
        const coinSymbolsDivided: string = coinSymbols.join(" | ");
        const [solBalance, tokenIcon] = await Promise.all([
            getBalanceOfWalletInDecimal(wallet.wallet_address),
            getTokenIcon(selectedCoin.address)
        ]);

        const usdValue: string = selectedCoin.value ? selectedCoin.value.inUSD : "0";
        const solValue: string = selectedCoin.value ? selectedCoin.value.inSOL : "0";

        let walletTotalValueInSol: number = solBalance || 0;
        coinsInWallet.forEach((coin: CoinStats) => {
            if (!coin.value) return;
            walletTotalValueInSol += Number(coin.value.inSOL);
        });

        const embed = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setTitle("Open Positions")
            .setURL(`https://solscan.io/account/${wallet.wallet_address}`)
            .setAuthor({ name: "Sell & Manage" })
            .setDescription(coinSymbolsDivided)
            .addFields(
                {
                    name: `**${selectedCoin.name}** | **${selectedCoin.symbol}** | **${selectedCoin.address}**`,
                    value: `**Holdings Value**: $${usdValue} | ${solValue} SOL\n**Market cap**: $${selectedCoin.fdv} @ $${formatNumber(selectedCoin.price)}\n**5m**: ${selectedCoin.priceChange.m5}%, **1h**: ${selectedCoin.priceChange.h1}%, **6h**: ${selectedCoin.priceChange.h6}%, **24h**: ${selectedCoin.priceChange.h24}%`
                },
                { name: "SOL Balance", value: `${solBalance?.toFixed(4)} SOL`, inline: true },
                { name: "Total Wallet Value", value: `${walletTotalValueInSol.toFixed(4)} SOL`, inline: true },
            );

        if (tokenIcon) embed.setThumbnail(tokenIcon);

        const buttons = createSellAndManageUIButtons(wallet.settings, selectedCoin.address);
        return { embeds: [embed], components: buttons };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `createSellAndManageUI | User: ${user_id} | Page?: ${page} | Token?: ${ca}`);
        return DEFAULT_ERROR_REPLY;
    }
};

export function createAfterSwapUI(txResponse: TxResponse, storeRefFee: boolean = false): UIResponse {
    const token: CoinStats | undefined = txResponse.token_stats;
    let amount: string = "";
    let response: string = "";
    if (txResponse.sell_amount) {
        amount = `${txResponse.sell_amount}% | `;
    }
    if (txResponse.token_amount) {
        const tokenAmount: number = txResponse.token_amount / LAMPORTS_PER_SOL;
        amount = `${tokenAmount} SOL | `;
    }

    if (txResponse.error) {
        response = txResponse.response ? txResponse.response : DEFAULT_ERROR;
    } else {
        if (token) {
            // if token exists it was a sell. since CoinStats are only set in the sellViaApi function
            response = `${amount}${token.name} | ${token.symbol} | ${token.address}\n\n${txResponse.response}`;
        }
        if (txResponse.contract_address) {
            response = `${amount}${txResponse.contract_address}\n\n${txResponse.response}`;
        }
    }

    const startButton = new ButtonBuilder()
        .setCustomId('start')
        .setLabel('Start')
        .setStyle(ButtonStyle.Secondary);

    const positionsButton = new ButtonBuilder()
        .setCustomId('sellAndManage')
        .setLabel('Positions')
        .setStyle(ButtonStyle.Secondary);

    const retryButton = new ButtonBuilder()
        .setCustomId('retryLastSwap')
        .setLabel('Retry')
        .setStyle(ButtonStyle.Secondary);

    const buttons = [startButton, positionsButton];
    if (txResponse.include_retry_button) buttons.push(retryButton);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
    return {
        transaction: txResponse,
        ui: { content: response, components: [row] },
        store_ref_fee: storeRefFee,
    };
};

export async function createTokenSelectionUI(user_id: string, recipientId: string): Promise<InteractionEditReplyOptions> {
    try {
        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return { content: ERROR_CODES["0003"].message };
        const solBalance: number | undefined = await getBalanceOfWalletInDecimal(wallet.wallet_address);
        if (!solBalance) return DEFAULT_ERROR_REPLY;

        let content: string = `Sending token to <@${recipientId}>\n\n**Your SOL balance**: ${solBalance}\n**Your Tokens**:\n`;
        const coinInfos: CoinInfo[] | null = await getAllCoinInfos({
            wallet_address: wallet.wallet_address,
            minPos: wallet.settings.min_position_value
        });
        if (!coinInfos) return DEFAULT_ERROR_REPLY;
        const symbols: string[] = coinInfos.map((coinInfo: CoinInfo, index: number) => {
            return index === coinInfos.length - 1 ? `${coinInfo.symbol}` : `${coinInfo.symbol} | `;
        });
        if (!symbols.length) {
            content += "---";
        } else {
            symbols.forEach((symbol: string) => {
                content += symbol;
            });
        }
        content += '\n\nTo send a token press the **Select Token** button below and select a token to send.';

        const selectTokenButton = new ButtonBuilder()
            .setCustomId("selectTokenToSend")
            .setLabel("Select Token")
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(selectTokenButton);
        return { content, components: [row] };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export async function createTokenInfoBeforeSendUI(
    user_id: string, recipientId: string, contract_address: string
): Promise<InteractionEditReplyOptions> {
    const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
    if (!wallet) return { content: ERROR_CODES["0003"].message };
    const recipientWallet: any = await Wallet.findOne({ user_id: recipientId, is_default_wallet: true }).lean();
    if (!recipientWallet) return { content: ERROR_CODES["0003"].message };

    let content = `Send token to <@${recipientId}>`;

    if (contract_address === "SOL") {
        const solBalance: number | undefined = await getBalanceOfWalletInDecimal(wallet.wallet_address);
        if (!solBalance) return DEFAULT_ERROR_REPLY;
        const solPrice: number | null = await getCurrentSolPrice();
        const holdingsValue: number = Number((solBalance * (solPrice ? solPrice : 0)).toFixed(2));
        content += `\n\nSolana | SOL`;
        content += `\n**Balance**: ${solBalance}`;
        content += `\n**Holdings value**: $${holdingsValue}`;
    } else {
        const coinInfo: CoinStats | null = await getCoinStatsFromWallet(wallet.wallet_address, contract_address);
        if (!coinInfo) return DEFAULT_ERROR_REPLY;
        content += `\n\n**${coinInfo.name}** | **${coinInfo.symbol}** | **${coinInfo.address}**`;
        content += `\n**Market Cap**: $${coinInfo.fdv} @ $${formatNumber(coinInfo.price)}`;
        content += `\n**Balance**: ${coinInfo.tokenAmount ? coinInfo.tokenAmount.uiAmount : "???"}`;
        content += `\n**Holdings value**: $${coinInfo.value ? coinInfo.value.inUSD : "???"} | ${coinInfo.value ? coinInfo.value.inSOL : "???"} SOL`;
    }

    const sendPercentButton = new ButtonBuilder()
        .setCustomId("sendPercentToUser")
        .setLabel("Send X percent")
        .setStyle(ButtonStyle.Secondary);

    const sendAmountButton = new ButtonBuilder()
        .setCustomId("sendAmountToUser")
        .setLabel("Send X amount")
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(sendPercentButton, sendAmountButton);
    return { content, components: [row] };
}

export async function createClaimRefFeeUI(user_id: string): Promise<InteractionEditReplyOptions> {
    try {
        const user: any = await User.findOne({ user_id });
        if (!user) return { content: ERROR_CODES["0000"].message };

        let userRefCode: string = user.ref_code;
        if (!userRefCode) {
            // NOTE: as the app currently is, this block should never be reached,
            // but in case we move the claim fee button somewhere else this will be necessary so this block won't be removed
            userRefCode = createNewRefCode();
            let userWithRefCodeExistsAlready = await User.findOne({ ref_code: userRefCode }).lean();
            while (userWithRefCodeExistsAlready) {
                userRefCode = createNewRefCode();
                userWithRefCodeExistsAlready = await User.findOne({ ref_code: userRefCode }).lean();
            }
            user.ref_code = userRefCode;
            await user.save();
        }

        let content: string = "";
        const userHasFeesToClaim: boolean = user.unclaimed_ref_fees > 0;
        if (userHasFeesToClaim) {
            content = `Your unclaimed referral fees: ${user.unclaimed_ref_fees / LAMPORTS_PER_SOL} SOL`;
        } else {
            content = `You have no unclaimed referral fees.\nTo receive referral fees invite your friends with your referral code:\n${userRefCode}`;
        }

        const claimFeesButton = new ButtonBuilder()
            .setCustomId("claimRefFees")
            .setLabel("Claim Fees")
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claimFeesButton);
        return {
            content: content,
            //components: userHasFeesToClaim ? [row] : undefined
            components: [row],
        };
    } catch (error) {
        return { content: ERROR_CODES["0000"].message };
    }
}

export async function createSettingsUI(userId: string): Promise<InteractionEditReplyOptions> {
    let wallet: any;
    try {
        wallet = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
        if (!wallet) return { content: "No default wallet found. Create one with the /create command." };
    } catch (error) {
        return { content: ERROR_CODES["0000"].message };
    }
    const autobuyValue: number = wallet.settings.auto_buy_value;
    const content: string = "**GENERAL SETTINGS**\n**Min Position Value**: Minimum position value to show in portfolio. Will hide tokens below this threshhold. Tap to edit.\n**Auto Buy**: Immediately buy when pasting token address. Tap to edit. Changing it to 0 disables Auto Buy.\n**Slippage Config**: Customize your slippage settings for buys and sells. If the price of a coin will change by more than the set amount while waiting for the transaction to finish the transaction will be cancelled. Tap to edit.\n\n**BUTTONS CONFIG**\nCustomize your buy and sell buttons. Tap to edit.\n\n**TRANSACTION CONFIG**\n**MEV Protection**: Accelerates your transactions and protect against frontruns to make sure you get the best price possible.\n**Turbo**: Callisto will use MEV Protection, but if unprotected sending is faster it will use that instead.\n**Secure**: Transactions are guaranteed to be protected from MEV, but transactions may be slower.\n**Transaction Priority**: Increase your Transaction Priority to improve transaction speed. Tap to edit.";

    const buttons = createSettingsUIButtons(wallet.settings, autobuyValue);
    return { content, components: buttons };
};

export function createSetAsDefaultUI(walletAddress: string): InteractionEditReplyOptions {
    const startButton = new ButtonBuilder()
        .setCustomId('start')
        .setLabel('Start')
        .setStyle(ButtonStyle.Secondary);

    const setAsDefaultButton = new ButtonBuilder()
        .setCustomId('setAsDefault')
        .setLabel('Set as default')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton, setAsDefaultButton);
    const content: string = `Your new wallet has been added.\n**Wallet address**: ${walletAddress}\n\nTap the "Set as default" button below to set the new wallet as your default wallet.`

    return { content, components: [row] };
};

export function createExportPrivKeyUI(): InteractionEditReplyOptions {
    const exportButton = new ButtonBuilder()
        .setCustomId('exportPrivKey')
        .setLabel('Export')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(exportButton);
    const content: string = "Exporting your private key will allow you to access your wallet from other applications. Make sure you are in a secure environment before exporting your private key.\n\nDo not share your private key with anyone. Callisto cannot guarantee the safety of your funds if you expose your private key.\n\nTap the Export button below to export your private key."
    return { content, components: [row] };
};

export async function createRemoveWalletUI(userId: string): Promise<InteractionEditReplyOptions> {
    const allWallets: any[] = await Wallet.find({ user_id: userId }).lean();
    if (!allWallets) return { content: "No wallets found. Create one with the /create command to get started." };

    const options = allWallets.map((wallet: any) => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(wallet.wallet_address)
            .setValue(wallet.wallet_address);
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('removeSelectedWallet')
        .setPlaceholder('Select a Wallet')
        .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    const content: string = "Select a wallet to remove.\n\n**WARNING**: This action is irreversible!\n\nCallisto will remove the selected wallet from your account. Make sure you have exported your private key or withdrawn all funds before removing the wallet, else your funds will be lost forever!";

    return { content, components: [row] };
};

/****************************************************** MENUS *****************************************************/

export async function selectBlinkMenu(user_id: string, actionType: string): Promise<InteractionEditReplyOptions> {
    try {
        const allBlinksOfUser: any[] = await Blink.find({ user_id });
        if (!allBlinksOfUser || !allBlinksOfUser.length) return { content: "You don't have any Blinks yet. Create one first." };

        let customId: string | undefined;
        let content: string | undefined;
        switch (actionType) {
            case "edit": {
                customId = "selectBlinkToEdit";
                content = "Select the Blink you want to edit.";
                break;
            }
            case "delete": {
                customId = "selectBlinkToDelete";
                content = "Select the Blink you want to delete.";
                break;
            }
            case "url": {
                customId = "selectBlinkToShowUrl";
                content = "Select a Blink to show the URL.";
                break;
            }
            default: {
                customId = "selectBlinkToEdit";
                content = "Select the Blink you want to edit.";
                break;
            }
        }

        const options: StringSelectMenuOptionBuilder[] = allBlinksOfUser.map((blink: any) => {
            return new StringSelectMenuOptionBuilder()
                .setLabel(blink.title)
                .setValue(blink.blink_id);
        });
        const selectMenu: StringSelectMenuBuilder = new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder("Select a Blink")
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        return { content, components: [row] };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export function createBlinkCreationMenu(): InteractionEditReplyOptions {
    let content: string = "What type of Action Blink do you want to create?";
    content += "\n\n**Donation**: Creates a Blink for tips to your default Callisto wallet.";
    content += "\n**Token Swap**: Creates a Blink to swap any token with SOL.";
    content += "\n**Vote**: Creates a Blink to vote for something with different choices.";

    const blinkTypes: SelectMenuComponentOptionData[] = [
        { label: "Donation", value: "blinkDonation" },
        { label: "Token Swap", value: "blinkTokenSwap" },
        { label: "Vote", value: "blinkVote" },
    ];

    const options: StringSelectMenuOptionBuilder[] = blinkTypes.map((type: SelectMenuComponentOptionData) => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(type.label)
            .setValue(type.value);
    });

    const selectMenu: StringSelectMenuBuilder = new StringSelectMenuBuilder()
        .setCustomId('selectBlinkType')
        .setPlaceholder('Select a Blink type')
        .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    return { content, components: [row] };
}

export async function createChangeWalletMenu(userId: string): Promise<InteractionEditReplyOptions> {
    try {
        const content: string = "Select a wallet to set it as your default wallet.";
        const allWallets: any[] = await Wallet.find({ user_id: userId }).lean();
        if (!allWallets) return { content: "No wallets found. Create one with the /create command to get started." };

        // NOTE: 25 is max length for this (discord limit). keep this in mind
        // but with current max limit of 10 wallets per user this shouldn't be a problem
        const options: StringSelectMenuOptionBuilder[] = allWallets.map((wallet: any) => {
            return new StringSelectMenuOptionBuilder()
                .setLabel(wallet.wallet_address)
                .setValue(wallet.wallet_address);
        });

        const selectMenu: StringSelectMenuBuilder = new StringSelectMenuBuilder()
            .setCustomId('selectWallet')
            .setPlaceholder('Select a Wallet')
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        return { content, components: [row] };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, "createChangeWalletMenu");
        return DEFAULT_ERROR_REPLY;
    }
};

export async function createSelectCoinMenu(user_id: string): Promise<InteractionEditReplyOptions> {
    const content: string = "Select a coin to view its info's.";
    let coinInfos: CoinInfo[] | null = null;
    try {
        coinInfos = await getAllCoinInfos({ user_id });
        if (!coinInfos) return DEFAULT_ERROR_REPLY;

        // NOTE: discord has a limit of 25 for string menus
        // TODO: replace last element with a "show more" entry, to show the next 25 elements (or 24 if again more than 25)
        if (coinInfos.length > 25) coinInfos = coinInfos.slice(0, 25);

        const options: StringSelectMenuOptionBuilder[] = coinInfos.map((coinInfo: CoinInfo) => {
            return new StringSelectMenuOptionBuilder()
                .setLabel(coinInfo.symbol)
                .setValue(coinInfo.address);
        });

        if (!options.length) return { content: "No coins found." };

        const selectMenu: StringSelectMenuBuilder = new StringSelectMenuBuilder()
            .setCustomId('selectCoin')
            .setPlaceholder('Select a Coin')
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        return { content, components: [row] };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `createSelectCoinMenu | User: ${user_id} | Coin Infos: ${JSON.stringify(coinInfos)}`);
        return DEFAULT_ERROR_REPLY;
    }
};

export async function createSelectCoinToSendMenu(user_id: string, msgContent: string): Promise<InteractionEditReplyOptions> {
    const content: string = `${msgContent}\n\nSelect a coin to send.`;
    let coinInfos: CoinInfo[] | null = null;
    try {
        coinInfos = await getAllCoinInfos({ user_id });
        if (!coinInfos) return DEFAULT_ERROR_REPLY;

        // NOTE: discord has a limit of 25 for string menus
        // TODO: replace last element with a "show more" entry, to show the next 25 elements (or 24 if again more than 25)
        if (coinInfos.length > 25) coinInfos = coinInfos.slice(0, 25);

        const options: StringSelectMenuOptionBuilder[] = [
            new StringSelectMenuOptionBuilder()
                .setLabel("SOL")
                .setValue("SOL"),
            ...coinInfos.map((coinInfo: CoinInfo) => {
                return new StringSelectMenuOptionBuilder()
                    .setLabel(coinInfo.symbol)
                    .setValue(coinInfo.address);
            })
        ];

        if (!options.length) return { content: "No coins found." };

        const selectMenu: StringSelectMenuBuilder = new StringSelectMenuBuilder()
            .setCustomId('selectTokenToSend')
            .setPlaceholder('Select a Coin')
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        return { content, components: [row] };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `createSelectCoinToSendMenu | User: ${user_id} | Coin Infos: ${JSON.stringify(coinInfos)}`);
        return DEFAULT_ERROR_REPLY;
    }
};

export async function removeActionSelectionMenu(blink_id: string, editMode: boolean = false): Promise<InteractionEditReplyOptions> {
    try {
        const blink: any = await Blink.findOne({ blink_id }).lean();
        if (!blink) return { content: ERROR_CODES["0017"].message };

        const blinkActions: SelectMenuComponentOptionData[] = [];
        const labels: { [key: string]: number } = {}; // label: number => with number being the order of the label
        blink.links.actions.forEach((action: any) => {
            if (labels[action.label]) {
                // means this exact label already exists
                // because discord doesn't allow duplicate values for menu options we have to modify the value
                labels[action.label]++;
                blinkActions.push({ label: `${action.label} (${labels[action.label]})`, value: `${blink_id}:${action.label}:${labels[action.label]}` });
            } else {
                // blink_id:button_label:order of label (in cases of duplicate labels)
                labels[action.label] = 1;
                blinkActions.push({ label: action.label, value: `${blink_id}:${action.label}:${labels[action.label]}` });
            }
        });

        if (!blinkActions.length) return { content: "No actions to remove." };

        const options: StringSelectMenuOptionBuilder[] = blinkActions.map((option: SelectMenuComponentOptionData) => {
            return new StringSelectMenuOptionBuilder().setLabel(option.label).setValue(option.value);
        });

        const selectMenu: StringSelectMenuBuilder = new StringSelectMenuBuilder()
            .setCustomId(`removeBlinkAction${editMode ? ":e" : ""}`)
            .setPlaceholder('Select a button to remove')
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        return { content: "Select a button to remove from your Blink.", components: [row] };
    } catch (error) {
        await saveError({ function_name: "removeActionSelectionMenu", error });
        return DEFAULT_ERROR_REPLY;
    }
}

/************************************************************** MODALS *****************************************************/

export function tokenAddressForBlinkModal(blinkType: string): ModalBuilder {
    const modal: ModalBuilder = new ModalBuilder()
        .setCustomId(`createBlinkWithAddress:${blinkType}`)
        .setTitle("Enter Token Address");

    // TODO: allow symbols instead of token address

    let label: string = `Token Address`;
    if (blinkType === "blinkDonation") label += " (empty for SOL)";
    const tokenAddressInputIsRequired: boolean = blinkType === "blinkDonation" ? false : true; // so SOL token swaps cant be created (buying SOL). there is no system to determine what base token would be used.

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
            .setCustomId('value1')
            .setLabel("Token Address (empty for SOL)")
            .setPlaceholder("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
            .setStyle(TextInputStyle.Short)
            .setRequired(tokenAddressInputIsRequired)
    );

    modal.addComponents(row);
    return modal;
}

export async function createCustomActionModal(
    blink_id: string, editMode: boolean = false
): Promise<ModalBuilder | InteractionReplyOptions | undefined> {
    try {
        const blink: any = await Blink.findOne({ blink_id }).lean();
        if (!blink) return undefined;
        if (blink.links?.actions.length >= 10) {
            return { content: "Max limit of 10 buttons reached.", ephemeral: true };
        }

        const modal: ModalBuilder = new ModalBuilder()
            .setCustomId(`addCustomAction:${blink_id}${editMode ? ":e" : ""}`)
            .setTitle("Add button with custom value");
        const rows: ActionRowBuilder<TextInputBuilder>[] = [];

        if (blink.blink_type === "blinkVote") {
            const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('value1')
                    .setLabel("Choice (Button Label)")
                    .setPlaceholder("choice")
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short)
            );
            rows.push(row);
        } else {
            // TODO: if user doesn't submit button label, use a default one (eg "Buy SOL")
            const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('value1')
                    .setLabel("Button Label")
                    .setPlaceholder("label")
                    .setStyle(TextInputStyle.Short)
            );
            rows.push(row);
        }

        modal.addComponents(rows);
        return modal;
    } catch (error) {
        await saveError({ function_name: "createCustomActionModal", error });
        return;
    }
}

export async function createFixedActionModal(
    blink_id: string, editMode: boolean = false
): Promise<ModalBuilder | InteractionReplyOptions | undefined> {
    try {
        const blink: any = await Blink.findOne({ blink_id }).lean();
        if (!blink) return undefined;
        if (blink.links?.actions.length >= 10) {
            return { content: "Max limit of 10 buttons reached.", ephemeral: true };
        }

        const modal: ModalBuilder = new ModalBuilder()
            .setCustomId(`addFixedAction:${blink_id}${editMode ? ":e" : ""}`)
            .setTitle("Add button with fixed value");

        const rows: ActionRowBuilder<TextInputBuilder>[] = [];
        if (blink.blink_type === "blinkDonation") {
            const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('value1')
                    .setLabel("Button Label")
                    .setPlaceholder("label")
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short)
            );
            const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('value2')
                    .setLabel("Amount (in SOL)")
                    .setPlaceholder("amount")
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short)
            );
            rows.push(row1, row2);
        }

        if (blink.blink_type === "blinkTokenSwap") {
            const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('value1')
                    .setLabel("Amount (in SOL)")
                    .setPlaceholder("amount")
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short)
            );
            rows.push(row);
        }

        if (blink.blink_type === "blinkVote") {
            const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('value1')
                    .setLabel("Choice (Button Label)")
                    .setPlaceholder("choice")
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short)
            );
            rows.push(row1);
        }

        modal.addComponents(rows);
        return modal;
    } catch (error) {
        await saveError({ function_name: "createFixedActionModal", error });
        return;
    }
}

export async function createChangeUserBlinkModal(
    fieldToChange: string, blink_id: string, editMode: boolean = false
): Promise<ModalBuilder | undefined> {
    try {
        const modal: ModalBuilder = new ModalBuilder()
            .setCustomId(`changeUserBlink:${blink_id}:${fieldToChange}${editMode ? ":e" : ""}`)
            .setTitle(`Change ${fieldToChange}`);
        const input = new TextInputBuilder()
            .setCustomId(`value1`)
            .setRequired(false) // TODO: check if field is required
            .setLabel(`Change ${fieldToChange}`)
            .setPlaceholder(`${fieldToChange}`);

        if (fieldToChange === "Description") {
            input.setStyle(TextInputStyle.Paragraph);
        } else {
            input.setStyle(TextInputStyle.Short);
        }

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(row);
        return modal;
    } catch (error) {
        await saveError({ function_name: "createChangeUserBlinkModal", error });
        return;
    }
}

export async function createChangeBlinkCustomValueModal(
    label: string, placeholder: string, lineIndex: string
): Promise<ModalBuilder | undefined> {
    try {
        // remove bold discord formatting first (eg **bold text**)
        const changeCustomValueModal: ModalBuilder = new ModalBuilder()
            .setCustomId(`changeBlinkEmbedValue:${lineIndex}`)
            .setTitle(label.replaceAll("*", ""));

        const input = new TextInputBuilder()
            .setCustomId('value1')
            .setLabel(label.replaceAll("*", ""))
            .setPlaceholder(placeholder)
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        changeCustomValueModal.addComponents(row);
        return changeCustomValueModal;
    } catch (error) {
        await saveError({ function_name: "createChangeBlinkCustomValueModal", error });
        return;
    }
}

export async function createBlinkCustomValuesModal(
    action_id: string, button_id: string, action: ActionGetResponse,
): Promise<ModalBuilder | MessageCreateOptions | undefined> {
    const linkedActions: LinkedAction[] | undefined = action.links?.actions;
    let actionButton: LinkedAction | undefined = linkedActions?.find((linkedAction: LinkedAction, index: number) => {
        return index + 1 === Number(button_id);
    });
    const params = actionButton?.parameters;
    try {
        if (!params) return;
        if (params.length > 5) {
            // NOTE: discord only allows 5 text inputs per modal, so we have to handle action UIs with more than 5 buttons differently
            // in this case we are creating an embed with buttons which will act as an modal
            return await blinkCustomValuesModalAsEmbed(action_id, button_id, action, params);
        }

        const blinkCustomValuesModal: ModalBuilder = new ModalBuilder()
            .setCustomId(`blinkCustomValues:${action_id}:${button_id}`)
            .setTitle(`Enter custom value${params.length > 1 ? "s" : ""}`);

        params.forEach((param: TypedActionParameter, i: number) => {
            const row = new ActionRowBuilder<TextInputBuilder>();
            if (param.label && param.label.length > 45) {
                // NOTE: discord api limits. label can't be more than 45 chars long
                param.label = param.label.slice(0, 42) + "...";
            }
            const input = new TextInputBuilder()
                .setCustomId(`value${i + 1}`)
                .setLabel(param.label ? param.label : "Enter custom value")
                .setPlaceholder(param.name)
                .setRequired(param.required)
                .setStyle(TextInputStyle.Short);

            row.addComponents(input);
            blinkCustomValuesModal.addComponents(row);
        });

        return blinkCustomValuesModal;
    } catch (error) {
        await postDiscordErrorWebhook(
            "blinks",
            error,
            `createBlinkCustomValuesModal | Action ID: ${action_id} | Button ID: ${button_id} | Params: ${JSON.stringify(params)}`
        );
        return;
    }
}

export function createBuyModal(): ModalBuilder {
    const enterCAModal = new ModalBuilder()
        .setCustomId('buyCoin')
        .setTitle('Enter Contract Address or Token Symbol');

    const CAInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Contract Address or Token Symbol')
        .setPlaceholder('ca or symbol')
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(CAInput);
    enterCAModal.addComponents(row);
    return enterCAModal;
};

export function createLimitOrderModal(): ModalBuilder {
    const enterCAModal = new ModalBuilder()
        .setCustomId('limitOrderInfo')
        .setTitle('Enter Contract Address');

    const CAInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Contract Address')
        .setPlaceholder('Enter Contract Address')
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(CAInput);
    enterCAModal.addComponents(row);
    return enterCAModal;
};

export function createChangeBuyButtonModal(buttonNumber: string): ModalBuilder {
    const changeBuyButton1Modal = new ModalBuilder()
        .setCustomId(`changeBuyButton${buttonNumber}`)
        .setTitle(`Change Buy Button ${buttonNumber}`);

    const amountInput = new TextInputBuilder()
        .setCustomId(`value1`)
        .setLabel('New SOL value')
        .setPlaceholder('1.0')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    changeBuyButton1Modal.addComponents(row);
    return changeBuyButton1Modal;
};

export function createChangeSellButtonModal(buttonNumber: string): ModalBuilder {
    const changeSellButton1Modal = new ModalBuilder()
        .setCustomId(`changeSellButton${buttonNumber}`)
        .setTitle(`Change Sell Button ${buttonNumber}`);

    const amountInput = new TextInputBuilder()
        .setCustomId(`value1`)
        .setLabel('New SOL value')
        .setPlaceholder('1.0')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    changeSellButton1Modal.addComponents(row);
    return changeSellButton1Modal;
};

export function createWithdrawXSolModal(): ModalBuilder {
    const withdrawXSolModal = new ModalBuilder()
        .setCustomId('withdrawXSol')
        .setTitle('Withdraw X SOL');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Amount to withdraw')
        .setPlaceholder('1.0')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const withdrawAddressInput = new TextInputBuilder()
        .setCustomId('value2')
        .setLabel('Destination address')
        .setPlaceholder('Enter destination address')
        .setRequired(true)
        .setMinLength(SOL_WALLET_ADDRESS_MIN_LENGTH)
        .setMaxLength(SOL_WALLET_ADDRESS_MAX_LENGTH)
        .setStyle(TextInputStyle.Short);

    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(withdrawAddressInput);
    withdrawXSolModal.addComponents(firstRow, secondRow);
    return withdrawXSolModal;
};

export function createWithdrawAllSolModal(): ModalBuilder {
    const withdrawXSolModal = new ModalBuilder()
        .setCustomId('withdrawAllSol')
        .setTitle('Withdraw all SOL');

    const withdrawAddressInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Destination address')
        .setPlaceholder('Enter destination address')
        .setRequired(true)
        .setMinLength(SOL_WALLET_ADDRESS_MIN_LENGTH)
        .setMaxLength(SOL_WALLET_ADDRESS_MAX_LENGTH)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(withdrawAddressInput);
    withdrawXSolModal.addComponents(row);
    return withdrawXSolModal;
};

export function createMinPositionValueModal(): ModalBuilder {
    const minPositionValueModal = new ModalBuilder()
        .setCustomId('changeMinPositionValue')
        .setTitle('Change Minimum Position Value');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Minimum Position Value')
        .setPlaceholder('0.1')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    minPositionValueModal.addComponents(row);
    return minPositionValueModal;
};

export function createAutoBuyValueModal(): ModalBuilder {
    const autoBuyValueModal = new ModalBuilder()
        .setCustomId('changeAutoBuyValue')
        .setTitle('Change Auto Buy Value');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Auto Buy Value')
        .setPlaceholder('1.0')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    autoBuyValueModal.addComponents(row);
    return autoBuyValueModal;
};

export function createBuySlippageModal(): ModalBuilder {
    const buySlippageModal = new ModalBuilder()
        .setCustomId('changeBuySlippage')
        .setTitle('Change Buy Slippage');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Buy Slippage')
        .setPlaceholder('10')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    buySlippageModal.addComponents(row);
    return buySlippageModal;
};

export function createSellSlippageModal(): ModalBuilder {
    const sellSlippageModal = new ModalBuilder()
        .setCustomId('changeSellSlippage')
        .setTitle('Change Sell Slippage');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Sell Slippage')
        .setPlaceholder('10')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    sellSlippageModal.addComponents(row);
    return sellSlippageModal;
};

export function createTransactionPriorityModal(): ModalBuilder {
    const transactionPriorityModal = new ModalBuilder()
        .setCustomId('changeTransactionPriority')
        .setTitle('Change Transaction Priority Amount');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Transaction Priority Amount')
        .setPlaceholder('0.005')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    transactionPriorityModal.addComponents(row);
    return transactionPriorityModal;
};

export function createBuyXSolModal(): ModalBuilder {
    const buyXSolModal = new ModalBuilder()
        .setCustomId('buyXSol')
        .setTitle('Buy X SOL');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Amount to buy')
        .setPlaceholder('1.0')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    buyXSolModal.addComponents(row);
    return buyXSolModal;
};

export function createSellXPercentModal(): ModalBuilder {
    const sellXPercentModal = new ModalBuilder()
        .setCustomId('sellXPercent')
        .setTitle('Sell X %');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Percentage to sell (0.01 - 100)')
        .setPlaceholder('50')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    sellXPercentModal.addComponents(row);
    return sellXPercentModal;
};

export function createSendCoinModal(): ModalBuilder {
    const sendCoinModal = new ModalBuilder()
        .setCustomId('sendCoin')
        .setTitle('Send Coin to another Wallet');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Amount to send in %')
        .setPlaceholder('100')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const addressInput = new TextInputBuilder()
        .setCustomId('value2')
        .setLabel('Destination address')
        .setPlaceholder('Enter destination address')
        .setRequired(true)
        .setMinLength(SOL_WALLET_ADDRESS_MIN_LENGTH)
        .setMaxLength(SOL_WALLET_ADDRESS_MAX_LENGTH)
        .setStyle(TextInputStyle.Short);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput);
    sendCoinModal.addComponents(row1, row2);
    return sendCoinModal;
};

export function sendXPercentToUserModal(): ModalBuilder {
    const sendXPercentModal = new ModalBuilder()
        .setCustomId('sendXPercentToUser')
        .setTitle('Send X percent');

    const percentInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Amount to send in %')
        .setPlaceholder('50')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(5)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(percentInput);
    sendXPercentModal.addComponents(row);
    return sendXPercentModal;
}

export function sendXAmountToUserModal(): ModalBuilder {
    const sendXAmountModal = new ModalBuilder()
        .setCustomId('sendXAmountToUser')
        .setTitle('Send X amount');

    const amountInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Token amount to send')
        .setPlaceholder('1000000')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(30)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    sendXAmountModal.addComponents(row);
    return sendXAmountModal;
}

export function createRefCodeModal(): ModalBuilder {
    const refCodeModal = new ModalBuilder()
        .setCustomId('enterRefCode')
        .setTitle('Enter referral code');

    const refCodeInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Get 10% reduced fees in your first month')
        .setPlaceholder("Referral code")
        .setRequired(false)
        .setMinLength(4)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(refCodeInput);
    refCodeModal.addComponents(row);
    return refCodeModal;
}

export function createBuyLimitPercentModal(): ModalBuilder {
    const buyLimitPercentModal = new ModalBuilder()
        .setCustomId('buyLimitPercentModal')
        .setTitle('Enter buy limit entry');

    const percentInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Buy after token price has fallen X percent')
        .setPlaceholder("50")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(5)
        .setStyle(TextInputStyle.Short);

    const amountInput = new TextInputBuilder()
        .setCustomId('value2')
        .setLabel('Amount to buy (in SOL)')
        .setPlaceholder("1")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const validForInput = new TextInputBuilder()
        .setCustomId('value3')
        .setLabel('Valid for X hours (empty = valid forever)')
        .setPlaceholder("0")
        .setRequired(false)
        .setMaxLength(5)
        .setStyle(TextInputStyle.Short);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(percentInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(validForInput);
    buyLimitPercentModal.addComponents(row1, row2, row3);
    return buyLimitPercentModal;
}

export function createBuyLimitPriceModal(): ModalBuilder {
    const buyLimitPriceModal = new ModalBuilder()
        .setCustomId('buyLimitPriceModal')
        .setTitle('Enter buy limit entry');

    const priceInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Buy when token price falls below price')
        .setPlaceholder("0.0069")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(30)
        .setStyle(TextInputStyle.Short);

    const amountInput = new TextInputBuilder()
        .setCustomId('value2')
        .setLabel('Amount to buy (in SOL)')
        .setPlaceholder("1")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    buyLimitPriceModal.addComponents(row1, row2);
    return buyLimitPriceModal;
}

export function createSellLimitPercentModal(): ModalBuilder {
    const sellLimitPercentModal = new ModalBuilder()
        .setCustomId('sellLimitPercentModal')
        .setTitle('Enter sell limit entry');

    const percentInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Sell when token price increases by X percent')
        .setPlaceholder("150")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(30)
        .setStyle(TextInputStyle.Short);

    const amountInput = new TextInputBuilder()
        .setCustomId('value2')
        .setLabel('Amount to sell (in %)')
        .setPlaceholder("100")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(percentInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    sellLimitPercentModal.addComponents(row1, row2);
    return sellLimitPercentModal;
}

export function createSellLimitPriceModal(): ModalBuilder {
    const sellLimitPriceModal = new ModalBuilder()
        .setCustomId('sellLimitPriceModal')
        .setTitle('Enter sell limit entry');

    const priceInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Sell when token price goes above price')
        .setPlaceholder("0.69")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(30)
        .setStyle(TextInputStyle.Short);

    const amountInput = new TextInputBuilder()
        .setCustomId('value2')
        .setLabel('Amount to sell (in %)')
        .setPlaceholder("100")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    sellLimitPriceModal.addComponents(row1, row2);
    return sellLimitPriceModal;
}

/************************************************************** EMBEDS ***********************************************************/

export async function blinkCustomValuesModalAsEmbed(
    action_id: string, button_id: string, action: ActionGetResponse, params: TypedActionParameter[]
): Promise<MessageCreateOptions | undefined> {
    try {
        let content: string = "";
        // create a line for each custom value
        const rows: ActionRowBuilder<ButtonBuilder>[] = [new ActionRowBuilder<ButtonBuilder>];
        let rowsIndex: number = 0;
        params.forEach((param: TypedActionParameter, index: number) => {
            if (index !== 0) content += "\n";
            content += `${param.label ? `**${param.label}**` : `Custom value ${index + 1}`}${param.required ? "*" : ""}: ${param.name}`;

            const button = new ButtonBuilder()
                // last value (index) will be used to find the correct line later, so the value for that custom value can be changed
                .setCustomId(`changeBlinkEmbedValue:${action_id}:${button_id}:${index}`)
                .setLabel(param.label ? param.label : `Custom value ${index + 1}`)
                .setStyle(ButtonStyle.Secondary);

            if (index !== 0 && index % 5 === 0) {
                // discord limit: only 5 buttons per row
                rows.push(new ActionRowBuilder<ButtonBuilder>);
                rowsIndex++;
            }
            rows[rowsIndex].addComponents(button);
        });

        // create a send button which sends the blink transaction
        const button = new ButtonBuilder()
            // last value (index) will be used to find the correct line later, so the value for that custom value can be changed
            .setCustomId(`changeBlinkEmbedValue:${action_id}:${button_id}:send`)
            .setLabel("Send")
            .setStyle(ButtonStyle.Secondary);
        // check if a new row needs to be created
        if (rows[rows.length - 1].components.length === 5) {
            rows.push(new ActionRowBuilder<ButtonBuilder>);
            rowsIndex++;
        }
        rows[rowsIndex].addComponents(button)

        const actionUI: any = await ActionUI.findOne({ action_id }).lean();

        const embed: EmbedBuilder = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setURL(actionUI.posted_url)
            .setTitle(action.title)
            .setDescription(content)
            .setAuthor({ name: action.label })
            .setThumbnail(action.icon);

        return { embeds: [embed], components: rows };
    } catch (error) {
        await postDiscordErrorWebhook(
            "blinks",
            error,
            `blinkCustomValuesModalAsEmbed | Action ID: ${action_id} | Button ID: ${button_id} | Params: ${JSON.stringify(params)}`
        );
        return;
    }
}

/************************************************************** UTILITY **********************************************************/

export async function toggleBlinksConversion(guild_id: string): Promise<InteractionReplyOptions> {
    try {
        const guildSettings: any = await GuildSettings.findOne({ guild_id });
        if (!guildSettings) {
            await postDiscordErrorWebhook("app", undefined, `Couldn't find guild settings inside database. Guild: ${guild_id}`);
            return DEFAULT_ERROR_REPLY;
        }

        guildSettings.blinks_conversion = !guildSettings.blinks_conversion;
        await guildSettings.save();
        const toggled: string = guildSettings.blinks_conversion ? "On" : "Off";
        return createAdminUI(guild_id, toggled);
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export async function createDepositEmbed(user_id: string, extra_content?: string): Promise<InteractionReplyOptions> {
    try {
        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true });
        if (!wallet) return { content: ERROR_CODES["0003"].message };

        const embed: EmbedBuilder = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setAuthor({ name: `Deposit` })
            .setTitle(`Your wallet address`)
            .setDescription(`${wallet.wallet_address}`)
            .setImage('attachment://wallet_qr_code.png');

        const qrBuffer: Buffer = await QRCode.toBuffer(wallet.wallet_address);
        const attachment = new AttachmentBuilder("wallet_qr_code.png").setFile(qrBuffer);
        return { content: extra_content, embeds: [embed], files: [attachment] };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, "createDepositEmbed");
        return DEFAULT_ERROR_REPLY;
    }
}

export async function getVoteResults(blink_id: string): Promise<InteractionReplyOptions> {
    try {
        const voteResults: any = await BlinkVoteResult.findOne({ blink_id }).lean();
        if (!voteResults) return { content: "No votes yet." };

        let description: string = "";
        const voteValues = Object.entries(voteResults.results);
        for (const [key, value] of voteValues) {
            description += `${key}: ${value}\n`;
        }

        const embed: EmbedBuilder = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setAuthor({ name: `${voteResults.blink_title}` })
            .setTitle(`Vote Results`)
            .setDescription(description);

        return { embeds: [embed] };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export function sortDBActions(actions: DBAction[]): DBAction[] {
    return actions.sort((a: DBAction, b: DBAction) => {
        if (a.token_amount === undefined) return 1;
        if (b.token_amount === undefined) return -1;
        if (a.token_amount < b.token_amount) return -1;
        if (a.token_amount > b.token_amount) return 1;
        return 0;
    });
}

export function sortEmbedFields(actions: DBAction[]): EmbedField[] {
    const actionsOrdered: DBAction[] = actions.sort((a: DBAction, b: DBAction) => {
        if (a.token_amount === undefined) return 1;
        if (b.token_amount === undefined) return -1;
        if (a.token_amount < b.token_amount) return -1;
        if (a.token_amount > b.token_amount) return 1;
        return 0;
    });

    return actionsOrdered.map((action: DBAction) => {
        return {
            name: action.label,
            value: action.embed_field_value,
            inline: true,
        };
    });
}

export async function storeUserBlink(blink_id: string): Promise<InteractionReplyOptions> {
    try {
        const blink: any = await Blink.findOne({ blink_id });
        if (!blink) return DEFAULT_ERROR_REPLY;

        if (!blink.links?.actions.length) return { content: "You need to add at least 1 action button." };

        blink.is_complete = true;
        blink.disabled = false;

        await blink.save();
        let content = "Successfully created Blink! Your Blink URL:";
        content += `\n\nhttps://callistobot.com/blinks/${blink.blink_id}`;
        return { content };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export async function deleteUserBlink(blink_id: string): Promise<InteractionReplyOptions> {
    try {
        const blink: any = await Blink.findOneAndDelete({ blink_id });
        if (!blink) return { content: "Failed to delete Blink. If the issue persists please contact support." };
        return { content: "Successfully deleted Blink." };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export async function checkAndUpdateBlink(blink_id: string): Promise<InteractionReplyOptions | null> {
    try {
        const blink: any = await Blink.findOne({ blink_id });
        if (blink && !blink.links?.actions.length) {
            return { content: "You need to add at least 1 action button." };
        }

        if (!blink.is_complete) {
            blink.is_complete = true;
            await blink.save();
        }

        return null;
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export async function disableBlink(blink_id: string): Promise<InteractionReplyOptions> {
    try {
        const blink: any = await Blink.findOne({ blink_id });
        if (!blink) return DEFAULT_ERROR_REPLY;

        blink.disabled = !blink.disabled;
        await blink.save();
        const content: string = createBlinkCreationContent(blink);
        const buttons: ActionRowBuilder<ButtonBuilder>[] = createBlinkCreationButtons(Number(blink_id), true, blink.disabled);
        const embed: EmbedBuilder = createBlinkCreationEmbedFromBlink(blink);
        return { content, embeds: [embed], components: buttons };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export function createBlinkCreationEmbedFromBlink(blink: DbBlink): EmbedBuilder {
    const embed: EmbedBuilder = new EmbedBuilder()
        .setColor(0x4F01EB)
        .setTitle(blink.title)
        .setURL(blink.title_url)
        .setAuthor({ name: blink.label })
        .setImage(blink.icon || null)
        .setDescription(blink.description);

    // TODO: consider adding "(custom)" to all field labels, not just for vote blinks
    if (blink.blink_type === "blinkVote") {
        blink.links?.actions.forEach((action: any) => {
            embed.addFields({ name: `${action.label}${action.parameters?.length ? " (custom)" : ""}`, value: action.embed_field_value, inline: true });
        });
    } else {
        blink.links?.actions.forEach((action: any) => {
            embed.addFields({ name: action.label, value: action.embed_field_value, inline: true });
        });
    }

    return embed;
}

export async function createBlinkUiFromEmbed(embed: Readonly<APIEmbed>, blinkType: string): Promise<InteractionReplyOptions> {
    try {
        const uiEmbed: EmbedBuilder = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setTitle(embed.title!)
            .setURL(embed.url!)
            .setAuthor(embed.author!)
            .setImage(embed.image!.url)
            .setDescription(embed.description!);

        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        let buttons: ButtonBuilder[] = [];
        embed.fields?.forEach((field: APIEmbedField, index: number) => {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`blinkPreviewButton:${index}`)
                    .setLabel(`${blinkType === "Vote" ? field.value : field.name}`)
                    .setStyle(ButtonStyle.Primary)
            );

            // discord api limit: can only add 5 buttons per row
            if ((index + 1) % 5 === 0) {
                rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
                buttons = [];
            }
        });

        if (buttons.length) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
        if (!embed.fields?.length) return { content: "You need to add at least 1 button to preview your Blink." };
        return { content: "Preview", embeds: [uiEmbed], components: rows };
    } catch (error) {
        return DEFAULT_ERROR_REPLY;
    }
}

export function createBlinkCreationContent(blink: any): string {
    let content = `Blink ID: ${blink.blink_id}`;
    content += `\nBlink Type: ${BLINKS_TYPE_MAPPING[blink.blink_type]}`;
    if (blink.token_address) content += `\nToken: ${blink.token_address}`;
    return content;
}

export async function executeBlinkSuccessMessage(reply_object: InteractionReplyOptions): Promise<InteractionReplyOptions> {
    const positionsButton = new ButtonBuilder()
        .setCustomId("sellAndManage")
        .setLabel("Token Balances")
        .setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(positionsButton);

    const solscanLinkAndBlinkMessage: UrlAndBlinkMsg | null = await extractUrlAndMessageFromBlink(reply_object.content!);
    if (!solscanLinkAndBlinkMessage) {
        return { content: reply_object.content!, components: [row] };
    }

    const embed: EmbedBuilder = new EmbedBuilder()
        .setColor(0x4F01EB)
        .setTitle("Blink successfully executed")
        .setDescription(solscanLinkAndBlinkMessage.url || "");

    if (solscanLinkAndBlinkMessage.message) {
        embed.addFields({ name: "Message", value: solscanLinkAndBlinkMessage.message });
    }

    return { embeds: [embed], components: [row] };
}

export async function removeActionButtonFromBlink(
    blink_id: string, label: string, order: number, editMode: boolean = false,
): Promise<InteractionReplyOptions> {
    try {
        const blink: any = await Blink.findOne({ blink_id });
        if (!blink) return { content: ERROR_CODES["0017"].message };

        // check for duplicate labels so we remove only the selected button label
        let duplicateLabels: number = 0;
        let indexToRemove: number = 0;
        blink.links.actions.forEach((action: any, index: number) => {
            // find the correct index to remove from blink.links.actions
            if (action.label === label) {
                duplicateLabels++;
                if (duplicateLabels === order) {
                    indexToRemove = index;
                    return;
                }
            }
        });

        if (duplicateLabels > 1) {
            blink.links.actions.splice(indexToRemove, 1);
        } else {
            blink.links.actions = blink.links.actions.filter((action: any) => action.label !== label);
        }

        await blink.save();

        const embed: EmbedBuilder = createBlinkCreationEmbedFromBlink(blink);
        const buttons: ActionRowBuilder<ButtonBuilder>[] = createBlinkCreationButtons(blink.blink_id, editMode, blink.disabled);
        const content: string = createBlinkCreationContent(blink);
        return { content, embeds: [embed], components: buttons };
    } catch (error) {
        await saveError({ function_name: "removeActionButtonFromBlink", error });
        return DEFAULT_ERROR_REPLY;
    }
}

export function addActionButtonTypeSelection(blink_id: string, editMode: boolean = false): InteractionReplyOptions {
    const addActionButton = new ButtonBuilder()
        .setCustomId(`addFixedAction:${blink_id}${editMode ? ":e" : ""}`)
        .setLabel('Fixed value')
        .setStyle(ButtonStyle.Secondary);

    const addCustomActionButton = new ButtonBuilder()
        .setCustomId(`addCustomAction:${blink_id}${editMode ? ":e" : ""}`)
        .setLabel('Custom value')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(addActionButton, addCustomActionButton);
    return { content: "Select a button type to add to your Blink.", components: [row], ephemeral: true };
}

export async function createEmbedFromBlinkUrlAndAction(url: string, action: ActionGetResponse | NextAction): Promise<EmbedFromUrlResponse | null> {
    try {
        const embed: EmbedBuilder = new EmbedBuilder()
            .setColor(0x4F01EB)
            .setURL(url)
            .setTitle(action.title)
            .setDescription(action.description ? action.description : null)
            .setAuthor({ name: action.label });

        const imgResponse = await fetch(action.icon, { redirect: 'follow' });
        const contentType = imgResponse.headers.get('Content-Type');

        let attachment: AttachmentBuilder[] | undefined;
        if (contentType === "image/svg+xml" || action.icon.endsWith(".svg")) {
            const buffer: Buffer = await urlToBuffer(action.icon);
            const imageBuffer: Buffer = await sharp(buffer).png().toBuffer();
            attachment = [new AttachmentBuilder("image.png").setFile(imageBuffer)];
            embed.setImage("attachment://image.png");
        } else {
            if (imgResponse.url !== action.icon) {
                // this block is executed if the image url returned a redirect url which contains the image
                // since discord can't handle those cases, this workaround is implemented
                if (contentType?.startsWith("image/")) {
                    const arrayBuffer: ArrayBuffer = await imgResponse.arrayBuffer();
                    const imageBuffer: Buffer = Buffer.from(arrayBuffer);
                    attachment = [new AttachmentBuilder("image.png").setFile(imageBuffer)];
                    embed.setImage("attachment://image.png");
                }
                embed.setImage(imgResponse.url);
            } else {
                embed.setImage(action.icon);
            }
        }

        return { embed, attachment };
    } catch (error) {
        return null;
    }
}