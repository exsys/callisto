import { TypedActionParameter } from "@solana/actions-spec";

export interface BlinkResponse {
    content?: string;
    custom_values?: boolean; // whether custom values from blink ui have to be submitted
    blink_id?: string;
    button_id?: string;
    params?: TypedActionParameter[];
}