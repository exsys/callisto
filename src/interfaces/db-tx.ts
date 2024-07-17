export type DBTransaction = {
    user_id: string;
    wallet_address: string;
    token_address: string;
    buy_or_sell: "buy" | "sell";
    success: boolean;
    token_amount?: number; // in lamports
    sell_amount?: number; // in percent
    usd_volume?: number;
    total_fees?: number;
    callisto_fees?: number;
    ref_fees?: number;
    processing_time_function: number;
    processing_time_tx?: number;
    utc_timestamp: string;
    unix_timestamp: string;
    error?: any;
}