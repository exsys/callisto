import { AccountInfo, ParsedAccountData, PublicKey, TokenAmount } from "@solana/web3.js"

export interface ParsedProgramAccount {
    pubkey: PublicKey;
    account: AccountInfo<Buffer | ParsedAccountData>;
}

export interface ParsedProgramAccountWrittenOut {
    account: {
        data: {
            parsed: {
                info: {
                    isNative: boolean;
                    mint: string;
                    owner: string;
                    state: string;
                    tokenAmount: TokenAmount;
                },
                type: string;
            };
            program: string;
            space: number;
        };
        executable: boolean;
        lamports: number;
        owner: PublicKey;
        rentEpoch: number;
        space: number;
    },
    pubkey: PublicKey;
}