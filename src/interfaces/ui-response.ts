import { ActionRowBuilder } from "discord.js";
import { TxResponse } from "./tx-response";

export interface UIResponse {
    ui: {
        content: string;
        components?: ActionRowBuilder[];
        ephemeral: boolean;
    };
    transaction?: TxResponse,
    store_ref_fee?: boolean;
}