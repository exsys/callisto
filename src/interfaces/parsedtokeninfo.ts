import { TokenAmount } from "@solana/web3.js";

export interface ParsedTokenInfo {
    isNative: boolean;
    mint: string;
    owner: string;
    state: string;
    tokenAmount: TokenAmount;
}