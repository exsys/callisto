export interface CoinMetadata {
    decimals: number;
    freezeAuthority: string | null;
    isInitialized: boolean;
    mintAuthority: string | null;
    supply: string;
}