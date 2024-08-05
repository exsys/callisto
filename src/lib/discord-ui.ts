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
} from "discord.js";
import { createNewRefCode, createWallet, createOrUseRefCodeForUser, formatNumber } from "./util";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { CoinStats } from "../types/coinstats";
import { CoinInfo } from "../types/coininfo";
import { ERROR_CODES } from "../config/errors";
import { TxResponse } from "../types/tx-response";
import { User } from "../models/user";
import { REFCODE_MODAL_STRING } from "../config/constants";
import { UIResponse } from "../types/ui-response";
import {
    buyCoinViaAPI,
    getAllCoinInfos,
    getAllCoinStatsFromWallet,
    getBalanceOfWalletInDecimal,
    getBalanceOfWalletInLamports,
    getCoinPriceStats,
    getCoinStatsFromWallet,
    getCurrentSolPrice
} from "./solanaweb3";

/***************************************************** UIs *****************************************************/

export const createStartUI = async (userId: string): Promise<InteractionEditReplyOptions> => {
    try {
        const user: any = await User.findOne({ user_id: userId }).lean();
        if (!user) {
            const walletAddress: string | undefined = await createWallet(userId);
            if (!walletAddress) {
                return { content: "Error while trying to create a wallet. If the issue persists please contact support." };
            }

            if (walletAddress === REFCODE_MODAL_STRING) return { content: REFCODE_MODAL_STRING };
        }

        const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true });
        if (!wallet) return { content: "Server error. Please try again later. " };

        let content: string = "Solana's fastest Discord bot to trade any coin.";
        const walletBalance: number | undefined = await getBalanceOfWalletInDecimal(wallet.wallet_address);
        let formattedBalance: string;
        if (walletBalance === undefined) {
            // return start ui even if walletBalance returns an error
            formattedBalance = "???";
        } else {
            formattedBalance = walletBalance > 0 ? walletBalance.toFixed(4) : "0";
        }

        if (formattedBalance == "0" || formattedBalance == "0.0") {
            content += "\n\nYou currently have no SOL balance. To get started with trading, send some SOL to your Callisto wallet address. Once done tap refresh and your balance will appear here.";
        } else {
            content += `\n\nYour current balance is ${formattedBalance} SOL.`;
        }

        content += `\n\nWallet: ${wallet.wallet_address}`;
        content += "\n\nTo buy a coin tap the Buy button.";
        content += "\n\nWe guarantee the safety of user funds on Callisto, but if you expose your private key your funds will not be safe.";

        //const testButton = new ButtonBuilder().setCustomId('test').setLabel('Test').setStyle(ButtonStyle.Secondary);

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

        const firstRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buyButton, sellButton, walletButton);
        const secondRow = new ActionRowBuilder<ButtonBuilder>().addComponents(helpButton, referButton, settingsButton, refreshButton);

        return { content, components: [firstRow, secondRow] };
    } catch (error) {
        return { content: "Server error. Please try again later" };
    }
};

export const createAdvancedUI = async (userId: string): Promise<InteractionEditReplyOptions> => {
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
        return { content: "Server error. Please try again later" };
    }
}

export const createWalletUI = async (userId: string): Promise<InteractionEditReplyOptions> => {
    const wallet = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
    if (!wallet) return { content: ERROR_CODES["0003"].message };

    const walletBalance: number | undefined = await getBalanceOfWalletInDecimal(wallet.wallet_address);
    if (walletBalance === undefined) return { content: ERROR_CODES["0015"].message };
    const formattedBalance = walletBalance > 0 ? walletBalance.toFixed(4) : "0";
    const content = `Default Wallet Address:\n${wallet.wallet_address}\n\nBalance:\n${formattedBalance} SOL\n\nCopy the address and send SOL to deposit.`;

    const solscanButton = new ButtonBuilder()
        .setLabel('View on Solscan')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://solscan.io/account/${wallet.wallet_address}`);

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
        .addComponents(solscanButton, depositButton, withdrawAllSolButton, withdrawXSolButton, removeWalletButton);
    const secondRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(changeWallet, addNewWalletButton, exportPrivKeyButton);

    return { content, components: [firstRow, secondRow] };
};

export const createHelpUI = (): string => {
    const content = "Welcome to Callisto, the fastest Solana trading bot on Discord.\n\nTo get started, use the /start command, this command will create a new Solana wallet for your automatically if you don't have one yet.\n\nOnce you have a wallet, you can use the Buy button to buy a coin.\n\nTo sell a coin, use the Sell & Manage button.\n\nTo view your wallet, tap the Wallet button.\n\nTo view and change your settings, tap the Settings button. Here you can change different settings like priority fee and slippage.\n\nTo refer friends, tap the Refer Friends button.\n\nWith the Refresh button you can refresh your Account Balance.\n\nFor more information, visit our website at https://callistobot.com";
    return content;
};

export const createReferUI = async (userId: string): Promise<InteractionEditReplyOptions> => {
    const refCodeMsg: string | null = await createOrUseRefCodeForUser(userId);
    if (!refCodeMsg) {
        return {
            content: ERROR_CODES["0000"].message
        }
    }

    const claimFeesButton = new ButtonBuilder()
        .setCustomId("showRefFees")
        .setLabel("Claim Fees")
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claimFeesButton);
    return { content: refCodeMsg, components: [row] };
}

export const createPreBuyUI = async (userId: string, contractAddress: string): Promise<UIResponse> => {
    let content: string = "";
    const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
    if (!wallet) return { ui: { content: "No default wallet found. Create one with the /create command." } };
    const walletBalance: number | undefined = await getBalanceOfWalletInLamports(wallet.wallet_address);
    if (walletBalance === undefined) return { ui: { content: ERROR_CODES["0015"].message } };
    if (wallet.settings.auto_buy_value > 0) {
        const txPrio: number = wallet.settings.tx_priority_value;

        if (walletBalance < wallet.settings.auto_buy_value * LAMPORTS_PER_SOL + txPrio + 105000) {
            // 105000 is the minimum amount of lamports needed for a swap
            content += `Not enough SOL for autobuy. Please deposit more SOL to your wallet.`;
            return { ui: { content } };
        }
        const response: TxResponse = await buyCoinViaAPI(userId, contractAddress, String(wallet.settings.auto_buy_value));
        if (!response.error) {
            const ui: InteractionEditReplyOptions = await createSellAndManageUI({ userId });
            return { ui, transaction: response };
        } else {
            return createAfterSwapUI(response);
        }
    }

    // TODO: if dexscreener fails try another method
    // TODO: find a way to get a more up-to-date price of the coin, because dex price can lag like 1 min behind
    // best way for this would be to know how much SOL and how much of the token are in the LP and then simply calculate the price
    const coinInfo: CoinStats | null = await getCoinPriceStats(contractAddress);
    if (!coinInfo) return { ui: { content: "Coin not found. Please enter a valid contract address." } };

    // TODO: calculate price impact

    content += `\n\n${coinInfo.name} | ${coinInfo.symbol} | ${contractAddress}`;
    content += `\n\nPrice: $${coinInfo.price}`;
    content += `\nMarket Cap: $${coinInfo.fdv}`;
    content += `\n5m: ${coinInfo.priceChange.m5}%, 1h: ${coinInfo.priceChange.h1}%, 6h: ${coinInfo.priceChange.h6}%, 24h: ${coinInfo.priceChange.h24}%`
    content += `\n\nWallet Balance: ${(walletBalance / LAMPORTS_PER_SOL).toFixed(5)} SOL`;
    content += "\n\nTap one of the buttons below to buy the coin.";

    const solscanCoinButton = new ButtonBuilder()
        .setURL(`https://solscan.io/token/${contractAddress}`)
        .setLabel('Solscan')
        .setStyle(ButtonStyle.Link);

    const dexscreenerButton = new ButtonBuilder()
        .setURL(`https://dexscreener.com/solana/${contractAddress}`)
        .setLabel('Dexscreener')
        .setStyle(ButtonStyle.Link);

    const buyButton1Button = new ButtonBuilder()
        .setCustomId('buyButton1')
        .setLabel(`Buy ${wallet.settings.buy_button_1} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButton2Button = new ButtonBuilder()
        .setCustomId('buyButton2')
        .setLabel(`Buy ${wallet.settings.buy_button_2} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButton3Button = new ButtonBuilder()
        .setCustomId('buyButton3')
        .setLabel(`Buy ${wallet.settings.buy_button_3} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButton4Button = new ButtonBuilder()
        .setCustomId('buyButton4')
        .setLabel(`Buy ${wallet.settings.buy_button_4} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButtonX = new ButtonBuilder()
        .setCustomId('buyButtonX')
        .setLabel('Buy X SOL')
        .setStyle(ButtonStyle.Secondary);

    const refreshButton = new ButtonBuilder()
        .setCustomId('refreshCoinInfo')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary);

    const firstRow = new ActionRowBuilder<ButtonBuilder>().addComponents(solscanCoinButton, dexscreenerButton);
    const secondRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(buyButton1Button, buyButton2Button, buyButton3Button, buyButton4Button, buyButtonX);
    const thirdRow = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton);

    return {
        ui: {
            content,
            components: [firstRow, secondRow, thirdRow]
        }
    };
};

export const createCoinInfoForLimitOrderUI = async (contract_address: string): Promise<InteractionEditReplyOptions> => {
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
        content += `\n\n${coinInfo.name} | ${coinInfo.symbol} | ${contract_address}`;
        content += `\n\nPrice: $${coinInfo.price} | -50%: $${price50PercentDown} | +50%: $${price50PercentUp}`;
        content += `\nMarket Cap: $${coinInfo.fdv} | -50%: ${mcap50PercentDown}M | +50%: ${mcap50PercentUp}M`;
        content += `\n5m: ${coinInfo.priceChange.m5}% | 1h: ${coinInfo.priceChange.h1}% | 6h: ${coinInfo.priceChange.h6}% | 24h: ${coinInfo.priceChange.h24}%`
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
        return { content: "Server error. Please try again later." };
    }
}

export const createSellAndManageUI = async ({ userId, page, ca, successMsg, prevCoin, nextCoin }:
    { userId: string, page?: number, ca?: string, successMsg?: boolean, prevCoin?: boolean, nextCoin?: boolean }
): Promise<InteractionEditReplyOptions> => {
    try {
        const wallet: any = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
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
            if (prevCoin) {
                const index = coinsInWallet.findIndex((coin: CoinStats) => coin.address === ca);
                if (index === 0) {
                    selectedCoin = coinsInWallet[coinsInWallet.length - 1];
                } else {
                    selectedCoin = coinsInWallet[index - 1];
                }
            } else if (nextCoin) {
                const index = coinsInWallet.findIndex((coin: CoinStats) => coin.address === ca);
                if (index === coinsInWallet.length - 1) {
                    selectedCoin = coinsInWallet[0];
                } else {
                    selectedCoin = coinsInWallet[index + 1];
                }
            } else {
                selectedCoin = coinsInWallet.find((coin: CoinStats) => coin.address === ca);
                if (!selectedCoin) {
                    selectedCoin = coinsInWallet[0];
                }
            }
        }
        if (!selectedCoin) return { content: ERROR_CODES["0007"].message };
        const coinSymbols: string[] = coinsInWallet.map((coin: CoinStats) => coin.symbol);
        const coinSymbolsDivided: string = coinSymbols.join(" | ");
        const solBalance: number | undefined = await getBalanceOfWalletInDecimal(wallet.wallet_address);
        if (!solBalance) return { content: "Server error. Please try again later." };

        // TODO: uiAmount might be null in some cases. handle that case
        const usdValue: string = selectedCoin.value ? selectedCoin.value.inUSD : "0";
        const solValue: string = selectedCoin.value ? selectedCoin.value.inSOL : "0";

        // TODO: add profit in % and SOL

        let content = `Open Positions:\n${coinSymbolsDivided}`;
        content += `\n\n${selectedCoin.name} | ${selectedCoin.symbol} | ${selectedCoin.address}`;
        content += `\nHoldings Value: $${usdValue} | ${solValue} SOL`;
        content += `\nMcap: $${selectedCoin.fdv} @ $${formatNumber(selectedCoin.price)}`;
        content += `\n5m: ${selectedCoin.priceChange.m5}%, 1h: ${selectedCoin.priceChange.h1}%, 6h: ${selectedCoin.priceChange.h6}%, 24h: ${selectedCoin.priceChange.h24}%`;
        content += `\n\nBalance: ${solBalance?.toFixed(4)} SOL`;
        // buy buttons
        const buyButton1Button = new ButtonBuilder()
            .setCustomId('buyButton1')
            .setLabel(`Buy ${wallet.settings.buy_button_1} SOL`)
            .setStyle(ButtonStyle.Secondary);

        const buyButton2Button = new ButtonBuilder()
            .setCustomId('buyButton2')
            .setLabel(`Buy ${wallet.settings.buy_button_2} SOL`)
            .setStyle(ButtonStyle.Secondary);

        const buyButton3Button = new ButtonBuilder()
            .setCustomId('buyButton3')
            .setLabel(`Buy ${wallet.settings.buy_button_3} SOL`)
            .setStyle(ButtonStyle.Secondary);

        const buyButton4Button = new ButtonBuilder()
            .setCustomId('buyButton4')
            .setLabel(`Buy ${wallet.settings.buy_button_4} SOL`)
            .setStyle(ButtonStyle.Secondary);

        const buyButtonX = new ButtonBuilder()
            .setCustomId('buyButtonX')
            .setLabel('Buy X SOL')
            .setStyle(ButtonStyle.Secondary);

        // switch coins buttons
        const currentCoinButton = new ButtonBuilder()
            .setCustomId('currentCoin')
            .setLabel(`${selectedCoin.symbol}`)
            .setStyle(ButtonStyle.Secondary);

        // sell buttons
        const sellCoin1Button = new ButtonBuilder()
            .setCustomId('sellButton1')
            .setLabel(`Sell ${wallet.settings.sell_button_1}%`)
            .setStyle(ButtonStyle.Secondary);

        const sellCoin2Button = new ButtonBuilder()
            .setCustomId('sellButton2')
            .setLabel(`Sell ${wallet.settings.sell_button_2}%`)
            .setStyle(ButtonStyle.Secondary);

        const sellCoin3Button = new ButtonBuilder()
            .setCustomId('sellButton3')
            .setLabel(`Sell ${wallet.settings.sell_button_3}%`)
            .setStyle(ButtonStyle.Secondary);

        const sellCoin4Button = new ButtonBuilder()
            .setCustomId('sellButton4')
            .setLabel(`Sell ${wallet.settings.sell_button_4}%`)
            .setStyle(ButtonStyle.Secondary);

        const sellXPercentButton = new ButtonBuilder()
            .setCustomId('sellButtonX')
            .setLabel('Sell X %')
            .setStyle(ButtonStyle.Secondary);

        // social buttons
        const solscanCoinButton = new ButtonBuilder()
            .setURL(`https://solscan.io/token/${selectedCoin.address}`)
            .setLabel('Solscan')
            .setStyle(ButtonStyle.Link);

        const dexscreenerButton = new ButtonBuilder()
            .setURL(`https://dexscreener.com/solana/${selectedCoin.address}`)
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

        return {
            content,
            components: [firstRow, secondRow, thirdRow]
        };
    } catch (error) {
        return { content: "Server error. Please try again later." };
    }
};

export const createAfterSwapUI = (txResponse: TxResponse, storeRefFee: boolean = false): UIResponse => {
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
        response = txResponse.response ? txResponse.response : "Server error. Please try again later.";
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
        ui: {
            content: response,
            components: [row]
        },
        store_ref_fee: storeRefFee,
    };
};

export const createTokenSelectionUI = async (user_id: string, recipientId: string): Promise<InteractionEditReplyOptions> => {
    try {
        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return { content: ERROR_CODES["0003"].message };

        const solBalance: number | undefined = await getBalanceOfWalletInDecimal(wallet.wallet_address);
        if (!solBalance) return { content: "Server error. Please try again later." };

        let content: string = `Sending token to <@${recipientId}>\n\nYour SOL balance: ${solBalance}\nYour Tokens:\n`;
        const coinInfos: CoinInfo[] | null = await getAllCoinInfos({
            walletAddress: wallet.wallet_address,
            minPos: wallet.settings.min_position_value
        });
        if (!coinInfos) return { content: "Server error. Please try again later." };
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
        content += '\n\nTo send a token press the "Select Token" button below and select a token to send.';

        const selectTokenButton = new ButtonBuilder()
            .setCustomId("selectTokenToSend")
            .setLabel("Select Token")
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(selectTokenButton);
        return { content, components: [row] };
    } catch (error) {
        return { content: "Server error. Please try again later." };
    }
}

export const createTokenInfoBeforeSendUI = async (
    user_id: string,
    recipientId: string,
    contract_address: string
): Promise<InteractionEditReplyOptions> => {
    const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
    if (!wallet) return { content: ERROR_CODES["0003"].message };
    const recipientWallet: any = await Wallet.findOne({ user_id: recipientId, is_default_wallet: true }).lean();
    if (!recipientWallet) return { content: ERROR_CODES["0003"].message };

    let content = `Send token to <@${recipientId}>`;

    if (contract_address === "SOL") {
        const solBalance: number | undefined = await getBalanceOfWalletInDecimal(wallet.wallet_address);
        if (!solBalance) return { content: "Server error. Please try again later." };
        const solPrice: number | null = await getCurrentSolPrice();
        const holdingsValue: number = Number((solBalance * solPrice).toFixed(2));
        content += `\n\nSolana | SOL`;
        content += `\nBalance: ${solBalance}`;
        content += `\nHoldings value: $${holdingsValue}`;
    } else {
        const coinInfo: CoinStats | null = await getCoinStatsFromWallet(wallet.wallet_address, contract_address);
        if (!coinInfo) return { content: "Server error. Please try again later." };
        content += `\n\n${coinInfo.name} | ${coinInfo.symbol} | ${coinInfo.address}`;
        content += `\nMarket Cap: $${coinInfo.fdv} @ $${formatNumber(coinInfo.price)}`;
        content += `\nBalance: ${coinInfo.tokenAmount ? coinInfo.tokenAmount.uiAmount : "???"}`;
        content += `\nHoldings value: $${coinInfo.value ? coinInfo.value.inUSD : "???"} | ${coinInfo.value ? coinInfo.value.inSOL : "???"} SOL`;
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

export const createClaimRefFeeUI = async (userId: string): Promise<InteractionEditReplyOptions> => {
    try {
        const user: any = await User.findOne({ user_id: userId });
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

export const createSettingsUI = async (userId: string): Promise<InteractionEditReplyOptions> => {
    const content = "Settings Help\n\nGENERAL SETTINGS\nMin Position Value: Minimum position value to show in portfolio. Will hide tokens below this threshhold. Tap to edit.\nAuto Buy: Immediately buy when pasting token address. Tap to edit. Changing it to 0 disables Auto Buy.\nSlippage Config: Customize your slippage settings for buys and sells. If the price of a coin will change by more than the set amount while waiting for the transaction to finish the transaction will be cancelled. Tap to edit.\n\nBUTTONS CONFIG\nCustomize your buy and sell buttons. Tap to edit.\n\nTRANSACTION CONFIG\nMEV Protection: Accelerates your transactions and protect against frontruns to make sure you get the best price possible.\nTurbo: Callisto will use MEV Protection, but if unprotected sending is faster it will use that instead.\nSecure: Transactions are guaranteed to be protected from MEV, but transactions may be slower.\nTransaction Priority: Increase your Transaction Priority to improve transaction speed. Tap to edit.";

    let wallet: any;
    try {
        wallet = await Wallet.findOne({ user_id: userId, is_default_wallet: true }).lean();
        if (!wallet) return { content: "No default wallet found. Create one with the /create command." };
    } catch (error) {
        return { content: ERROR_CODES["0000"].message };
    }
    const autobuyValue = wallet.settings.auto_buy_value;

    // general settings
    const generalSettingsButton = new ButtonBuilder()
        .setCustomId('generalSettings')
        .setLabel('General Settings:')
        .setStyle(ButtonStyle.Secondary);

    const minPositionValueButton = new ButtonBuilder()
        .setCustomId('minPositionValue')
        .setLabel(`Min Position Value: ${"$" + wallet.settings.min_position_value}`)
        .setStyle(ButtonStyle.Secondary);

    const autoBuyValueButton = new ButtonBuilder()
        .setCustomId('autoBuyValue')
        .setLabel(`Auto Buy: ${autobuyValue > 0 ? autobuyValue + " SOL" : "Disabled"}`)
        .setStyle(ButtonStyle.Secondary);

    const buySlippageButton = new ButtonBuilder()
        .setCustomId('buySlippage')
        .setLabel(`Buy slippage: ${wallet.settings.buy_slippage}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellSlippageButton = new ButtonBuilder()
        .setCustomId('sellSlippage')
        .setLabel(`Sell slippage: ${wallet.settings.sell_slippage}%`)
        .setStyle(ButtonStyle.Secondary);

    // buy buttons config
    const buyButtonsConfigButton = new ButtonBuilder()
        .setCustomId('buyButtonsConfig')
        .setLabel('Buy Buttons Config:')
        .setStyle(ButtonStyle.Secondary);

    const buyButtons1stButton = new ButtonBuilder()
        .setCustomId('buyButtons1st')
        .setLabel(`1st: ${wallet.settings.buy_button_1} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButtons2ndButton = new ButtonBuilder()
        .setCustomId('buyButtons2nd')
        .setLabel(`2nd: ${wallet.settings.buy_button_2} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButtons3rdButton = new ButtonBuilder()
        .setCustomId('buyButtons3rd')
        .setLabel(`3rd: ${wallet.settings.buy_button_3} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const buyButtons4thButton = new ButtonBuilder()
        .setCustomId('buyButtons4th')
        .setLabel(`4th: ${wallet.settings.buy_button_4} SOL`)
        .setStyle(ButtonStyle.Secondary);

    // sell buttons config
    const sellButtonsConfigButton = new ButtonBuilder()
        .setCustomId('sellButtonsConfig')
        .setLabel('Sell Buttons Config:')
        .setStyle(ButtonStyle.Secondary);

    const sellButtons1stButton = new ButtonBuilder()
        .setCustomId('sellButtons1st')
        .setLabel(`1st: ${wallet.settings.sell_button_1}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellButtons2ndButton = new ButtonBuilder()
        .setCustomId('sellButtons2nd')
        .setLabel(`2nd: ${wallet.settings.sell_button_2}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellButtons3rdButton = new ButtonBuilder()
        .setCustomId('sellButtons3rd')
        .setLabel(`3rd: ${wallet.settings.sell_button_3}%`)
        .setStyle(ButtonStyle.Secondary);

    const sellButtons4thButton = new ButtonBuilder()
        .setCustomId('sellButtons4th')
        .setLabel(`4th: ${wallet.settings.sell_button_4}%`)
        .setStyle(ButtonStyle.Secondary);

    // transaction config
    const transactionConfigButton = new ButtonBuilder()
        .setCustomId('transactionConfig')
        .setLabel('Transaction Config:')
        .setStyle(ButtonStyle.Secondary);

    const mevProtectionButton = new ButtonBuilder()
        .setCustomId('mevProtection')
        .setLabel(`MEV Protection: ${wallet.settings.mev_protection}`)
        .setStyle(ButtonStyle.Secondary);

    const gasLimitButton = new ButtonBuilder()
        .setCustomId('txPriority')
        .setLabel(`Transaction Priority: ${wallet.settings.tx_priority_value / LAMPORTS_PER_SOL} SOL`)
        .setStyle(ButtonStyle.Secondary);

    const firstRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(generalSettingsButton, minPositionValueButton, autoBuyValueButton, buySlippageButton, sellSlippageButton);

    const secondRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(buyButtonsConfigButton, buyButtons1stButton, buyButtons2ndButton, buyButtons3rdButton, buyButtons4thButton);

    const thirdRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(sellButtonsConfigButton, sellButtons1stButton, sellButtons2ndButton, sellButtons3rdButton, sellButtons4thButton);

    const fourthRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(transactionConfigButton, mevProtectionButton, gasLimitButton);

    return {
        content,
        components: [firstRow, secondRow, thirdRow, fourthRow]
    };
};

export const createSetAsDefaultUI = (walletAddress: string): InteractionEditReplyOptions => {
    const setAsDefaultButton = new ButtonBuilder()
        .setCustomId('setAsDefault')
        .setLabel('Set as default')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(setAsDefaultButton);

    return {
        content: `Your new wallet has been added.\nWallet address: ${walletAddress}\n\nTap the "Set as default" button below to set the new wallet as your default wallet.`,
        components: [row],
    };
};

export const createExportPrivKeyUI = (): InteractionEditReplyOptions => {
    const exportButton = new ButtonBuilder()
        .setCustomId('exportPrivKey')
        .setLabel('Export')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(exportButton);
    return {
        content: "Exporting your private key will allow you to access your wallet from other applications. Make sure you are in a secure environment before exporting your private key.\n\nDo not share your private key with anyone. Callisto cannot guarantee the safety of your funds if you expose your private key.\n\nTap the Export button below to export your private key.",
        components: [row],
    };
};

export const createRemoveWalletUI = async (userId: string): Promise<InteractionEditReplyOptions> => {
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

    return {
        content: "Select a wallet to remove.\n\nWARNING: This action is irreversible!\n\nCallisto will remove the selected wallet from your account. Make sure you have exported your private key or withdrawn all funds before removing the wallet, else your funds will be lost forever!",
        components: [row],
    };
};

/****************************************************** MENUS *****************************************************/

export const createChangeWalletMenu = async (userId: string): Promise<InteractionEditReplyOptions> => {
    const content: string = "Select a wallet to set it as your default wallet.";
    const allWallets: any[] = await Wallet.find({ user_id: userId }).lean();
    if (!allWallets) {
        return { content: "No wallets found. Create one with the /create command to get started." };
    }

    const options = allWallets.map((wallet: any) => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(wallet.wallet_address)
            .setValue(wallet.wallet_address);
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('selectWallet')
        .setPlaceholder('Select a Wallet')
        .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    return { content, components: [row] };
};

export const createSelectCoinMenu = async (userId: string): Promise<InteractionEditReplyOptions> => {
    const content: string = "Select a coin to view its info's.";
    try {
        const coinInfos: CoinInfo[] | null = await getAllCoinInfos({ user_id: userId });
        if (!coinInfos) return { content: "Server error. Please try again later." };

        // TODO: seems like max length is 25, handle that case
        const options = coinInfos.map((coinInfo: CoinInfo) => {
            return new StringSelectMenuOptionBuilder()
                .setLabel(coinInfo.symbol)
                .setValue(coinInfo.address);
        });

        if (!options.length) return { content: "No coins found." };

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('selectCoin')
            .setPlaceholder('Select a Coin')
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        return { content, components: [row] };
    } catch (error) {
        return { content: "Server error. Please try again later." };
    }
};

export const createSelectCoinToSendMenu = async (userId: string, msgContent: string): Promise<InteractionEditReplyOptions> => {
    const content: string = `${msgContent}\n\nSelect a coin to send.`;
    try {
        const coinInfos: CoinInfo[] | null = await getAllCoinInfos({ user_id: userId });
        if (!coinInfos) return { content: "Server error. Please try again later." };

        // TODO: seems like max length is 25, handle that case
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

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('selectTokenToSend')
            .setPlaceholder('Select a Coin')
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        return { content, components: [row] };
    } catch (error) {
        return { content: "Server error. Please try again later." };
    }
};

/************************************************************** MODALS *****************************************************/

export const createBuyModal = (): ModalBuilder => {
    const enterCAModal = new ModalBuilder()
        .setCustomId('buyCoin')
        .setTitle('Enter Contract Address');

    const CAInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Contract Address')
        .setPlaceholder('Enter Contract Address')
        .setRequired(true)
        .setMinLength(32)
        .setMaxLength(44)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(CAInput);

    enterCAModal.addComponents(row);
    return enterCAModal;
};

export const createLimitOrderModal = (): ModalBuilder => {
    const enterCAModal = new ModalBuilder()
        .setCustomId('limitOrderInfo')
        .setTitle('Enter Contract Address');

    const CAInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Contract Address')
        .setPlaceholder('Enter Contract Address')
        .setRequired(true)
        .setMinLength(32)
        .setMaxLength(44)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(CAInput);
    enterCAModal.addComponents(row);
    return enterCAModal;
};

export const createChangeBuyButtonModal = (buttonNumber: string): ModalBuilder => {
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

export const createChangeSellButtonModal = (buttonNumber: string): ModalBuilder => {
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

export const createWithdrawXSolModal = (): ModalBuilder => {
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
        .setMinLength(43)
        .setMaxLength(44)
        .setStyle(TextInputStyle.Short);

    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(withdrawAddressInput);

    withdrawXSolModal.addComponents(firstRow, secondRow);
    return withdrawXSolModal;
};

export const createWithdrawAllSolModal = (): ModalBuilder => {
    const withdrawXSolModal = new ModalBuilder()
        .setCustomId('withdrawAllSol')
        .setTitle('Withdraw all SOL');

    const withdrawAddressInput = new TextInputBuilder()
        .setCustomId('value1')
        .setLabel('Destination address')
        .setPlaceholder('Enter destination address')
        .setRequired(true)
        .setMinLength(43)
        .setMaxLength(44)
        .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(withdrawAddressInput);

    withdrawXSolModal.addComponents(row);
    return withdrawXSolModal;
};

export const createMinPositionValueModal = (): ModalBuilder => {
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

export const createAutoBuyValueModal = (): ModalBuilder => {
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

export const createBuySlippageModal = (): ModalBuilder => {
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

export const createSellSlippageModal = (): ModalBuilder => {
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

export const createTransactionPriorityModal = (): ModalBuilder => {
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

export const createBuyXSolModal = (): ModalBuilder => {
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

export const createSellXPercentModal = (): ModalBuilder => {
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

export const createSendCoinModal = (): ModalBuilder => {
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
        .setMinLength(43)
        .setMaxLength(44)
        .setStyle(TextInputStyle.Short);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput);
    sendCoinModal.addComponents(row1, row2);
    return sendCoinModal;
};

export const sendXPercentToUserModal = (): ModalBuilder => {
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

export const sendXAmountToUserModal = (): ModalBuilder => {
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

export const createRefCodeModal = (): ModalBuilder => {
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

export const createBuyLimitPercentModal = (): ModalBuilder => {
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

export const createBuyLimitPriceModal = (): ModalBuilder => {
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

export const createSellLimitPercentModal = (): ModalBuilder => {
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

export const createSellLimitPriceModal = (): ModalBuilder => {
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

/**************************************************** ADDITIONAL **********************************************************/

export const addStartButton = (content: string): InteractionEditReplyOptions => {
    const startButton = new ButtonBuilder()
        .setCustomId('start')
        .setLabel('Start')
        .setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton);
    return { content, components: [row] };
}