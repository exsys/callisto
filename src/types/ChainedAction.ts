import { LinkedAction } from "@solana/actions";

export interface IChainedAction {
    user_id: string,
    wallet_address: string,
    posted_url: string,
    action_id: string,
    chain_id: string,
    href?: string,
    links?: {
        actions: LinkedAction[]
    }
}