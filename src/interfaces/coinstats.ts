import { TokenAmount } from "@solana/web3.js";
import { PriceChangeInfo } from "./pricechangeinfo";
import { TxInfo } from "./txinfo";
import { VolumeInfo } from "./volumeinfo";

export interface CoinStats {
    address: string;
    name: string;
    symbol: string;
    transactions: TxInfo;
    volume: VolumeInfo;
    priceChange: PriceChangeInfo;
    price: string;
    fdv: string;
    tokenAmount?: TokenAmount;
    value?: {
        inUSD: string;
        inSOL: string;
    };
}