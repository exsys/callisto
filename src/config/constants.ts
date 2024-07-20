import { PublicKey } from "@solana/web3.js";

export const FEE_TOKEN_ACCOUNT: string = "7D5uthQB8jyLFF7ehh57AevUz9AwWyMW6QgzSfSETxZQ";
export const FEE_ACCOUNT_OWNER: string = "CaLLiEqJCMivss9qhZPMQiTxgLhFc4ZFFYTzRpXZBTk";
export const CALLISTO_FEE_WALLET: string = "CaLLiEqJCMivss9qhZPMQiTxgLhFc4ZFFYTzRpXZBTk";
export const MICROLAMPORTS_PER_LAMPORT: number = 1_000_000;
export const TOKEN_PROGRAM: PublicKey = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM: PublicKey = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const BASE_SWAP_FEE = 0.75;
export const FEE_REDUCTION_WITH_REF_CODE = 0.1; // 0.1 = 10%
export const FEE_REDUCTION_PERIOD = 2592000; // 2592000 = 30 days
export const LEVEL1_FEE_IN_PERCENT = 10;
export const LEVEL2_FEE_IN_PERCENT = 20;
export const LEVEL3_FEE_IN_PERCENT = 30;
export const REFCODE_MODAL_STRING = "refcodemodal";