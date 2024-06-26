export interface SwapTx {
    swapTransaction?: string;
    lastValidBlockHeight?: number;
    prioritizationFeeLamports?: number;
    errorCode?: string;
    error?: string;
}