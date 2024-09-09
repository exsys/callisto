export type DBTransaction = {
    user_id: string;
    wallet_address: string;
    destination_address?: string;
    contract_address?: string;
    tx_type: string;
    success: boolean;
    tx_signature?: string;
    token_amount?: number; // in lamports
    sell_amount?: number; // in percent
    usd_volume?: number;
    total_fee?: number;
    callisto_fee?: number;
    ref_fee?: number;
    processing_time_function?: number;
    processing_time_tx?: number;
    timestamp?: number;
    error?: any;
}