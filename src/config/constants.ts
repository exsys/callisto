import { PublicKey } from "@solana/web3.js";

export const FEE_TOKEN_ACCOUNT: string = "7D5uthQB8jyLFF7ehh57AevUz9AwWyMW6QgzSfSETxZQ";
export const FEE_ACCOUNT_OWNER: string = "CaLLiEqJCMivss9qhZPMQiTxgLhFc4ZFFYTzRpXZBTk";
export const CALLISTO_FEE_WALLET: string = "CaLLiEqJCMivss9qhZPMQiTxgLhFc4ZFFYTzRpXZBTk";
export const WRAPPED_SOL_ADDRESS: string = "So11111111111111111111111111111111111111112";
export const MICROLAMPORTS_PER_LAMPORT: number = 1_000_000;
export const TOKEN_PROGRAM: PublicKey = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM: PublicKey = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const BASE_SWAP_FEE: number = 0.75;
export const FEE_REDUCTION_WITH_REF_CODE: number = 0.1; // 0.1 = 10%
export const FEE_REDUCTION_PERIOD: number = 2592000000; // 2592000000 ms = 2592000 sec = 30 days
export const LEVEL1_FEE_IN_PERCENT: number = 10;
export const LEVEL2_FEE_IN_PERCENT: number = 20;
export const LEVEL3_FEE_IN_PERCENT: number = 30;
export const REFCODE_MODAL_STRING: string = "refcodemodal";
export const DEFAULT_RPC_URL: string = "https://quaint-practical-liquid.solana-mainnet.quiknode.pro/de215f4d6fabf6c4bb0cb0eab8aceb79e8567a27/";
export const ERRORS_WEBHOOK: string = "https://discord.com/api/webhooks/1267889101269368906/Lw8j5-f5KUqTLbcG_CpuXIyRWzrk7Qk36bquXHZ1uDQO1W8MIUbB3Phh50vzbutwC5Op";
export const BLINK_URL_REGEX: RegExp = /https:\/\/[^\/\s]+\/\?action=[^&\s]+/;
export const REF_FEE_DEBOUNCE_MAP: Map<string, boolean> = new Map<string, boolean>();
export const DEBOUNCE_TIME: number = 8000;
export const SOL_TOKEN_ADDRESS_MIN_LENGTH: number = 32;
export const SOL_TOKEN_ADDRESS_MAX_LENGTH: number = 44;
export const SOL_WALLET_ADDRESS_MIN_LENGTH: number = 43;
export const SOL_WALLET_ADDRESS_MAX_LENGTH: number = 44;
export const BLINK_DEFAULT_IMAGE: string = "https://www.callistobot.com/images/planet.png";

// variables below are not needed for the bot but written down here for easy access to these values
const BOT_APP_ID: string = "1247262826838622311";
const DISCORD_SERVER_INVITE_LINK: string = "https://discord.gg/gA7u36rGpX";
const DISCORD_OAUTH_INVITE_LINK: string = "https://discord.com/oauth2/authorize?client_id=1247262826838622311&permissions=347136&integration_type=0&scope=applications.commands+bot";