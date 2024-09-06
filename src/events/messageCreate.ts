import { ActionUI } from "../models/actionui";
import {
    Events,
    Message,
    MessageCreateOptions
} from "discord.js";
import {
    checkIfBlacklisted,
    createEmbedFromBlinkUrlAndAction,
    extractRootUrlFromBlink,
    extractUrls,
    getActionAndActionRootUrl,
} from "../lib/util";
import { createActionBlinkButtons, createBlinkUI } from "../lib/discord-ui";
import { GuildSettings } from "../models/guildSettings";
import { EmbedFromUrlResponse } from "../types/EmbedFromUrlResponse";

const event = {
    name: Events.MessageCreate,
    async execute(message: Message) {
        if (!message.content) return;

        // TODO: check whether blink urls can be in this schema: 
        // https://example.domain/?action=<action_url>
        // with <action_url> NOT containing "solana-action:"

        const urls: string[] | null = extractUrls(message.content);
        if (urls) {
            try {
                const guildId: string | null = message.guildId;
                if (guildId) {
                    // check whether blink conversion is turned off for this guild
                    // REDIS: store guild settings (for now for all, in the future maybe only for top guilds, if it makes sense and storing all is too much memory waste)
                    const guildSettings: any = await GuildSettings.findOne({ guild_id: guildId }).lean();
                    if (guildSettings && !guildSettings.blinks_conversion) return;
                }
            } catch (error) { }

            urls.forEach(async (url: string) => {
                try {
                    const urlObj: URL = new URL(url);
                    if (urlObj.protocol !== "https:") return;
                    const isActionsSchema: boolean = urlObj.href.includes("?action=solana-action:");

                    const blinkIsBlacklisted: boolean = checkIfBlacklisted(urlObj, isActionsSchema);
                    if (blinkIsBlacklisted) return await message.reply({ content: "This Blink is blacklisted." });

                    // Check whether Blink URL was already posted once and get ActionGetResponse
                    const actionUIExists: any = await ActionUI.findOne({ posted_url: urlObj.href }).lean();
                    const actionIdOrUrlObj = actionUIExists ? { action_id: actionUIExists.action_id } : { url: urlObj.href };
                    const actionAndUrl = await getActionAndActionRootUrl(actionIdOrUrlObj); // TODO: this call takes 2+ seconds for svg images, improve if possible
                    if (!actionAndUrl) return;

                    if (actionUIExists) {
                        // use url from DB if URL was posted before
                        // TODO: createEmbedFromBlinkUrlAndAction call takes 2+ seconds for svg images, improve if possible
                        const actionEmbed: EmbedFromUrlResponse | null = await createEmbedFromBlinkUrlAndAction(urlObj.href, actionAndUrl.action);
                        if (!actionEmbed) return;
                        const buttons = createActionBlinkButtons(actionUIExists.action_id, actionAndUrl.action);
                        await message.reply({ embeds: [actionEmbed.embed], components: buttons, files: actionEmbed.attachment });
                    } else {
                        // create action ui if url is posted for the first time
                        const posted_url: string = urlObj.href;
                        const root_url: string | null = await extractRootUrlFromBlink(urlObj, isActionsSchema);
                        if (!root_url) return;

                        const actionUI: MessageCreateOptions | null = await createBlinkUI(posted_url, root_url, actionAndUrl.action);
                        if (!actionUI) return;
                        await message.reply(actionUI);
                    }
                } catch (error) { }
            });
        }
    },
}

export default event;