import { CoinInfo } from "./coininfo";

export interface UIResponse {
    user_id: string;
    content: string;
    success: boolean;
    amount?: string;
    token?: CoinInfo;
    ca?: string;
    includeRetryButton?: boolean;
    error?: any;
}