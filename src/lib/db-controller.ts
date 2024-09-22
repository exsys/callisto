import { InteractionReplyOptions } from "discord.js";
import { DEFAULT_ERROR, DEFAULT_ERROR_REPLY } from "../config/errors";
import { Wallet } from "../models/wallet";
import bcrypt from "bcrypt";
import { convertMinutesToMs, convertMsToMinutes, getSafetyLockDuration, isPositiveNumber, postDiscordErrorWebhook } from "./util";
import { createPasswordSettingsButtons } from "./ui-buttons";
import { AUTOLOCK_DEFAULT, MAX_WALLET_UNLOCK_ATTEMPTS, UNLOCK_ATTEMPT_INTERVAL } from "../config/constants";
import { UnlockInfo } from "../models/unlockInfo";

export async function setWalletPassword(user_id: string, password: string, passwordRepeat: string): Promise<InteractionReplyOptions> {
    try {
        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true });
        if (!wallet) return DEFAULT_ERROR_REPLY;
        if (password !== passwordRepeat) return { content: "Passwords don't match." };
        await UnlockInfo.findOneAndUpdate(
            { user_id, wallet_address: wallet.wallet_address },
            { last_unlock_time: Date.now() },
            { new: true, upsert: true }
        ).lean();

        const pwHash: string = bcrypt.hashSync(password, 10);
        wallet.encrypted_password = pwHash;
        await wallet.save();
        const buttons = createPasswordSettingsButtons(true);
        const content: string = `Successfully set password. You can change the auto-lock timer by pressing the "Auto-Lock Timer" button.\n\nCurrent Auto-Lock Timer: **${AUTOLOCK_DEFAULT} minutes**`;
        return { content, components: buttons };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `setWalletPassword | User: ${user_id}`);
        return DEFAULT_ERROR_REPLY;
    }
}

export async function changeWalletPassword(
    user_id: string,
    password: string,
    newPassword: string,
    newPasswordRepeat: string
): Promise<InteractionReplyOptions> {
    try {
        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true });
        if (!wallet) return DEFAULT_ERROR_REPLY;
        if (!wallet.encrypted_password) return { content: "No password set." };

        const correctPassword: boolean = await bcrypt.compare(password, wallet.encrypted_password);
        if (!correctPassword) return { content: "Wrong password." };
        if (newPassword !== newPasswordRepeat) return { content: "Passwords don't match." };

        const pwHash: string = bcrypt.hashSync(newPassword, 10);
        wallet.encrypted_password = pwHash;
        await UnlockInfo.findOneAndUpdate(
            { user_id, wallet_address: wallet.wallet_address },
            { last_unlock_time: Date.now() },
            { new: true, upsert: true }
        ).lean();
        await wallet.save();
        return { content: "Successfully changed password." };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `changeWalletPassword | User: ${user_id}`);
        return DEFAULT_ERROR_REPLY;
    }
}

export async function deleteWalletPassword(user_id: string, password: string): Promise<InteractionReplyOptions> {
    try {
        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true });
        if (!wallet) return DEFAULT_ERROR_REPLY;
        if (!wallet.encrypted_password) return { content: "No password set." };

        const correctPassword: boolean = await bcrypt.compare(password, wallet.encrypted_password);
        if (!correctPassword) return { content: "Wrong password." };

        wallet.encrypted_password = undefined;
        await wallet.save();
        return { content: "Successfully deleted password." };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `deleteWalletPassword | User: ${user_id}`);
        return DEFAULT_ERROR_REPLY;
    }
}

export async function changeAutolockTimer(user_id: string, password: string, newAutolockTimerInMinutes: string): Promise<InteractionReplyOptions> {
    try {
        const wallet: any = await Wallet.findOne({ user_id, is_default_wallet: true }).lean();
        if (!wallet) return DEFAULT_ERROR_REPLY;
        if (!isPositiveNumber(newAutolockTimerInMinutes)) return { content: "Invalid value." };
        if (!Number.isInteger(newAutolockTimerInMinutes)) return { content: "Must be a whole number." };
        if (Number(newAutolockTimerInMinutes) > 1440) return { content: "Number can't be higher than 1440 (24 hours)." };
        const correctPassword: boolean = await bcrypt.compare(password, wallet.encrypted_password);
        if (!correctPassword) return { content: "Wrong password." };

        await UnlockInfo.findOneAndUpdate(
            { user_id, wallet_address: wallet.wallet_address },
            {
                last_unlock_time: Date.now(),
                autolock_timer: newAutolockTimerInMinutes,
            },
            { new: true, upsert: true }
        ).lean();
        return { content: "Successfully updated Auto-Lock Timer." };
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `changeAutolockTimer | User: ${user_id} | New autolock value: ${newAutolockTimerInMinutes}`);
        return DEFAULT_ERROR_REPLY;
    }
}

// returns true if wallet is locked
export async function checkWalletLockStatus(user_id: string, userWallet?: any): Promise<boolean | string> {
    try {
        let wallet: any = userWallet;
        if (!wallet) {
            wallet = await Wallet.findOne({ user_id }).lean();
        }
        if (!wallet) return false;
        if (!wallet.encrypted_password) return false;
        const unlockInfo: any = await UnlockInfo.findOne({ user_id, wallet_address: wallet.wallet_address });

        if (unlockInfo.safety_lock && unlockInfo.safety_lock >= 0) {
            // check whether safety lock can be removed again
            let timeRemainingInMin: number;
            let timeRemainingInMs: number = (unlockInfo.last_unlock_attempt + convertMinutesToMs(unlockInfo.safety_lock)) - Date.now();
            if (timeRemainingInMs <= 0) {
                unlockInfo.safety_lock = undefined;
            } else {
                timeRemainingInMin = convertMsToMinutes(timeRemainingInMs);
                return `Wallet is currently locked because of 3 failed unlock attempts. Time remaining: **${timeRemainingInMin} minutes**`;
            }
        }

        const autolockTimer: number = unlockInfo.autolock_timer;
        const autolockTimerInMs: number = autolockTimer * 60 * 1000;

        if (Date.now() > unlockInfo.last_unlock_time + autolockTimerInMs) return true;
        return false;
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `checkWalletUnlockTime | User: ${user_id}`);
        return false;
    }
}

// returns true if unlock was a success
export async function unlockWallet(user_id: string, password: string): Promise<string | boolean> {
    try {
        const wallet: any = await Wallet.findOne({ user_id }).lean();
        if (!wallet) return DEFAULT_ERROR;
        if (!wallet.encrypted_password) return DEFAULT_ERROR;
        const unlockInfo: any = await UnlockInfo.findOne({ user_id, wallet_address: wallet.wallet_address });
        if (!unlockInfo) return DEFAULT_ERROR;

        const isCorrectPassword: boolean = await bcrypt.compare(password, wallet.encrypted_password);
        if (!isCorrectPassword) {
            if (unlockInfo.last_unlock_attempt + convertMinutesToMs(UNLOCK_ATTEMPT_INTERVAL) > Date.now()) {
                // check if user is trying to unlock wallet in a short time frame
                unlockInfo.unlock_attempts = unlockInfo.unlock_attempts ? unlockInfo.unlock_attempts + 1 : 1;
            } else {
                unlockInfo.unlock_attempts = 1; // reset unlock attempts after UNLOCK_ATTEMPT_INTERVAL minutes
            }
            unlockInfo.last_unlock_attempt = Date.now();
            if (MAX_WALLET_UNLOCK_ATTEMPTS - unlockInfo.unlock_attempts === 0) {
                unlockInfo.total_safety_locks = unlockInfo.total_safety_locks + 1;
                unlockInfo.safety_lock = getSafetyLockDuration(unlockInfo.total_safety_locks);
                await unlockInfo.save();
                const lockDurationInHours: number = unlockInfo.safety_lock / 60;
                return `3 wrong password attempts. Wallet locked for ${lockDurationInHours} hours.`;
            } else {
                await unlockInfo.save();
                return `Wrong password. ${MAX_WALLET_UNLOCK_ATTEMPTS - unlockInfo.unlock_attempts} tries remaining.`;
            }
        }

        unlockInfo.unlock_attempts = 0;
        unlockInfo.last_unlock_time = Date.now();
        await unlockInfo.save();
        return true;
    } catch (error) {
        await postDiscordErrorWebhook("app", error, `unlockWallet | User: ${user_id}`);
        return DEFAULT_ERROR;
    }
} 