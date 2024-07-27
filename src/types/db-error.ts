export interface DBError {
    user_id?: string;
    wallet_address?: string;
    contract_address?: string;
    tx_signature?: string;
    timestamp?: number;
    function_name: string;
    error: any;
}