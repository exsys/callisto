import { AttachmentBuilder, Events, Message, MessageCreateOptions } from "discord.js";
import { BLINK_URL_REGEX, CALLISTO_WEBSITE_ROOT_URLS } from "../config/constants";
import { extractUrls, postDiscordErrorWebhook, replaceWildcards, urlToBuffer } from "../lib/util";
import { ActionGetResponse, ActionRuleObject, ACTIONS_CORS_HEADERS } from "@solana/actions";
import { ActionRule } from "../types/actionRule";
import { createBlinkUI, voteResultButton } from "../lib/discord-ui";
import { ActionUI } from "../models/actionui";
import sharp from "sharp";
import { BlinkURLs } from "../types/blinkUrls";
import { BLINKS_BLACKLIST } from "../config/blinks_blacklist";
import { GuildSettings } from "../models/guildSettings";

const event = {
    name: Events.MessageCreate,
    async execute(message: Message) {
        if (!message.content) return;

        try {
            const urls: string[] | null = extractUrls(message.content);
            if (urls) {
                urls.forEach(async (url: string) => {
                    try {
                        const urlObj: URL = new URL(url);
                        if (urlObj.protocol !== "https:") return;
                        const isBlinkUrl: boolean = BLINK_URL_REGEX.test(urlObj.href);
                        const guildId: string | null = message.guildId;
                        let guildSettings: any;
                        if (guildId) {
                            // check whether blink conversion is turned off for this guild
                            guildSettings = await GuildSettings.findOne({ guild_id: guildId }).lean();
                            if (guildSettings && !guildSettings.blinks_conversion) return;
                        }

                        if (isBlinkUrl) {
                            // this block is executed if the url has the "solana-action:" schema
                            const reqUrl: string = urlObj.href.split("solana-action:")[1];
                            const actionRootUrl: URL = new URL(reqUrl);
                            if (BLINKS_BLACKLIST.includes(actionRootUrl.origin)) {
                                return await message.reply({ content: "This Blink is blacklisted." });
                            }

                            const action: ActionGetResponse = await (
                                await fetch(reqUrl)
                            ).json();

                            // if action url is already stored in database use that ui object
                            const actionUIExists: any = await ActionUI.findOne({ action_url: reqUrl }).lean();
                            if (actionUIExists) {
                                let attachment: AttachmentBuilder | undefined;
                                if (actionUIExists.has_attachment) {
                                    // convert svgs into pngs because discord doesn't support svgs in embeds
                                    const buffer: Buffer = await urlToBuffer(action.icon);
                                    const imageBuffer: Buffer = await sharp(buffer).png().toBuffer();
                                    attachment = new AttachmentBuilder("image.png").setFile(imageBuffer);
                                }
                                await message.reply({ embeds: [actionUIExists.embed], components: actionUIExists.rows, files: attachment ? [attachment] : undefined });
                            } else {
                                const urls: any = {
                                    posted_url: urlObj.href,
                                    root_url: actionRootUrl.origin,
                                    action_root_url: actionRootUrl.origin,
                                    action_url: reqUrl,
                                    isV1: action.links === undefined,
                                }
                                const actionUI: MessageCreateOptions | undefined = await createBlinkUI(urls, action);
                                if (!actionUI) return;
                                await message.reply(actionUI);
                            }
                        } else {
                            // this block is executed if it's a normal url without "solana-action:"
                            const rootUrl: string | undefined = urlObj.origin;
                            if (BLINKS_BLACKLIST.includes(rootUrl)) {
                                return await message.reply({ content: "This Blink is blacklisted." });
                            }
                            if (!rootUrl) return;
                            const actionRule: ActionRule | any = await (
                                await fetch(`${rootUrl}/actions.json`, {
                                    headers: ACTIONS_CORS_HEADERS,
                                })
                            ).json();
                            if (!actionRule) return;

                            // TODO: handle multiple objects inside the rules array. check: how does it have to be handled or processed?
                            const actionRuleObj: ActionRuleObject = actionRule.rules[0];
                            const pathPattern: string = actionRuleObj.pathPattern;
                            const apiPath: string = actionRuleObj.apiPath;

                            // TODO: add Map for strict list and warn users if not in strict list

                            const actionUrl: string | undefined = replaceWildcards(urlObj.href, apiPath, pathPattern);
                            if (!actionUrl) {
                                await postDiscordErrorWebhook(
                                    "blinks",
                                    undefined,
                                    `replaceWildcards returned undefined. Root url: ${rootUrl} | Posted url: ${urlObj.href} | apiPath: ${apiPath} | pathPattern: ${pathPattern}`
                                );
                                return;
                            }
                            const action: ActionGetResponse = await (
                                await fetch(actionUrl, {
                                    headers: ACTIONS_CORS_HEADERS,
                                })
                            ).json();

                            // if action url is already stored in database use that ui object
                            const actionUIExists: any = await ActionUI.findOne({ action_url: actionUrl }).lean();
                            if (actionUIExists) {
                                let attachment: AttachmentBuilder[] | undefined;
                                if (CALLISTO_WEBSITE_ROOT_URLS.includes(rootUrl) && actionUIExists.callisto_blink_type === "blinkVote") {
                                    // "Show Result" button for Callisto vote blinks
                                    const showResultsButton = voteResultButton(actionUIExists.callisto_blink_id);
                                    actionUIExists.rows.push(showResultsButton);
                                }
                                if (actionUIExists.icon_url_is_redirect) {
                                    const imgResponse = await fetch(action.icon, { redirect: 'follow' });
                                    const contentType = imgResponse.headers.get('Content-Type');
                                    if (contentType?.startsWith("image/")) {
                                        const arrayBuffer: ArrayBuffer = await imgResponse.arrayBuffer();
                                        const imageBuffer: Buffer = Buffer.from(arrayBuffer);
                                        attachment = [new AttachmentBuilder("image.png").setFile(imageBuffer)];
                                        actionUIExists.embed.image.url = "attachment://image.png";
                                    }
                                }
                                await message.reply({ embeds: [actionUIExists.embed], components: actionUIExists.rows, files: attachment });
                            } else {
                                let actionRootUrl: URL;
                                if (actionRuleObj.apiPath.includes("https://")) {
                                    // absolute api path urls
                                    actionRootUrl = new URL(actionRuleObj.apiPath);
                                } else {
                                    // relative api path urls
                                    actionRootUrl = new URL(actionUrl);
                                }
                                const importantUrls: BlinkURLs = {
                                    posted_url: urlObj.href,
                                    root_url: rootUrl,
                                    action_root_url: actionRootUrl.origin,
                                    action_url: actionUrl,
                                    api_path: actionRuleObj.apiPath,
                                    path_pattern: actionRuleObj.pathPattern,
                                    isV1: action.links === undefined
                                }
                                const actionUI: MessageCreateOptions | undefined = await createBlinkUI(importantUrls, action);
                                if (!actionUI) return;
                                await message.reply(actionUI);
                            }
                        }
                    } catch (error) { }
                });
            }
        } catch (error) { }
    },
}

export default event;