export interface Referral {
    code: string;
    timestamp: number;
    referrer_user_id: string;
    referrer_wallet: string;
    fee_level: number;
    number_of_referral: number;
}