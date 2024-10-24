import { CoinStats } from "./coinstats";
import { Referral } from "./referral";

export interface TxResponse {
    user_id: string,
    tx_type: string,
    wallet_address?: string,
    destination_address?: string,
    success?: boolean,
    response?: string,
    contract_address?: string,
    tx_signature?: string, // transaction signature
    token_amount?: number, // in lamports
    sell_amount?: number, // in percent
    token_stats?: CoinStats,
    include_retry_button?: boolean,
    referral?: Referral,
    processing_time_function?: number,
    processing_time_tx?: number,
    total_fee?: number,
    callisto_fee?: number,
    ref_fee?: number,
    usd_volume?: number,
    timestamp?: number,
    error?: any,
}