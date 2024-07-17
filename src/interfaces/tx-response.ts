import { CoinStats } from "./coinstats";
import { Referrer } from "./referrer";

export interface TxResponse {
    user_id: string;
    wallet_address?: string;
    success?: boolean;
    response?: string;
    contract_address?: string;
    tx_type: string;
    tx_signature?: string; // transaction signature
    token_amount?: string; // in decimal
    sell_amount?: number; // in percent
    token_stats?: CoinStats;
    include_retry_button?: boolean;
    referrer?: Referrer;
    error?: any;
    processing_time_function?: number;
    processing_time_tx?: number;
    total_fees?: number;
    callisto_fees?: number;
    ref_fees?: number;
    usd_volume?: number;
    timestamp?: number;
}