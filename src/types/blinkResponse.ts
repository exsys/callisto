import { ActionGetResponse } from "@solana/actions";
import { InteractionReplyOptions } from "discord.js";
import { IChainedAction } from "./ChainedAction";

export interface BlinkResponse {
    response_type: "custom_input_required" | "chained_action" | "success" | "error",
    reply_object: InteractionReplyOptions,
    action_id?: string,
    button_id?: string,
    action?: ActionGetResponse,
    chained_action?: IChainedAction,
}