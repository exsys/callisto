import { ActionGetResponse } from "@solana/actions";

export interface ActionAndUrlResponse {
    action: ActionGetResponse,
    action_root_url: string,
}