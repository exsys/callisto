import { TypedActionParameter } from "@solana/actions-spec";
import { InteractionReplyOptions } from "discord.js";

export interface BlinkResponse {
    content?: string,
    custom_values?: boolean, // whether custom values from blink ui have to be submitted
    action_id?: string,
    button_id?: string,
    params?: TypedActionParameter[],
    success?: boolean,
    deposit_response?: InteractionReplyOptions,
}