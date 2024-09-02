import { ActionGetResponse } from "@solana/actions";
import { InteractionReplyOptions } from "discord.js";

export interface BlinkResponse {
    content?: string,
    custom_values?: boolean, // whether custom values from blink ui have to be submitted
    action_id?: string,
    button_id?: string,
    action?: ActionGetResponse,
    success?: boolean,
    components?: any,
    deposit_response?: InteractionReplyOptions,
}