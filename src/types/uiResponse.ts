import { InteractionEditReplyOptions } from "discord.js";
import { TxResponse } from "./txResponse";

export interface UIResponse {
    ui: InteractionEditReplyOptions;
    transaction?: TxResponse,
    store_ref_fee?: boolean;
}