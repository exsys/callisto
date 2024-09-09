import { LinkedAction } from "@solana/actions"

export interface DbBlink {
    blink_id: string,
    user_id: string,
    wallet_address?: string,
    blink_type: string,
    is_complete: boolean,
    required_parameters?: string[],
    token_address?: string,
    title_url: string,
    icon?: string,
    title: string,
    description: string,
    label: string,
    disabled: boolean,
    links?: {
        actions: LinkedAction[],
    },
}