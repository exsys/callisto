export interface DBAction {
    href: string,
    label: string,
    embed_field_value: string,
    token_amount?: number,
    parameters?: {
        name: string,
        label?: string,
        required?: boolean,
    }[],
}