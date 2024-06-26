import { CoinInfo } from "./coininfo";

export interface UIResponse {
    content: string;
    success: boolean;
    amount?: string;
    token?: CoinInfo;
    ca?: string;
    includeRetryButton?: boolean;
}