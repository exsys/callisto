export interface SwapTx {
    swapTransaction?: string; // encoded transaction in base64
    lastValidBlockHeight?: number;
    prioritizationFeeLamports?: number;
    errorCode?: string;
    error?: string;
}