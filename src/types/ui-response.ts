import { TxResponse } from "./tx-response";
import { UI } from "./ui";

export interface UIResponse {
    ui: UI;
    transaction?: TxResponse,
    store_ref_fee?: boolean;
}