export type DBTransaction = {
    user_id: string;
    wallet_address: string;
    buy_or_sell: "buy" | "sell";
    token_address: string;
    success: boolean;
    processing_time_function: number;
    processing_time_tx?: number;
    token_amount?: number; // SOL if swap was a buy. in lamports, or decimals included in case of tokens
    usd_volume?: number;
    fees_in_sol?: number;
    error?: any;
}