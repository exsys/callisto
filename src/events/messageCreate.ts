import { AttachmentBuilder, Events, Message, MessageCreateOptions } from "discord.js";
import { BLINK_URL_REGEX } from "../config/constants";
import { replaceWildcards, saveError, urlToBuffer } from "../lib/util";
import { ActionGetResponse, ActionRuleObject, ACTIONS_CORS_HEADERS } from "@solana/actions";
import { ActionRule } from "../types/actionRule";
import { createBlinkUI } from "../lib/discord-ui";
import { ActionUI } from "../models/actionui";
import sharp from "sharp";

const event = {
    name: Events.MessageCreate,
    async execute(message: Message) {
        if (!message.content) return;

        // TODO: this will do a GET request for every url that gets send in chat, this might be ressource intensive, do some tests for that

        try {
            const url: URL = new URL(message.content);
            if (url.protocol !== "https:") return;
            const isBlinkUrl: boolean = BLINK_URL_REGEX.test(url.href);
            if (isBlinkUrl) {
                const reqUrl: string = url.href.split("solana-action:")[1];
                const action: ActionGetResponse = await (
                    await fetch(reqUrl)
                ).json();

                const actionRootUrl: URL = new URL(reqUrl);

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
                        posted_url: url.href,
                        root_url: actionRootUrl.origin,
                        action_root_url: actionRootUrl.origin,
                        action_url: reqUrl,
                    }
                    const actionUI: MessageCreateOptions | undefined = await createBlinkUI(urls, action);
                    if (!actionUI) return;
                    await message.reply(actionUI);
                }
            } else {
                const rootUrl: string | undefined = url.origin;
                if (!rootUrl) return;
                const actionRule: ActionRule | any = await (
                    await fetch(`${rootUrl}/actions.json`, {
                        headers: ACTIONS_CORS_HEADERS,
                    })
                ).json();
                if (!actionRule) return;

                // TODO: handle multiple objects inside the rules array. how does it have to be handled or processed?
                const actionRuleObj: ActionRuleObject = actionRule.rules[0];
                const pathPattern: string = actionRuleObj.pathPattern;
                const apiPath: string = actionRuleObj.apiPath;

                // TODO: add Map for strict list and warn users if not in strict list

                const actionUrl: string | undefined = replaceWildcards(url.href, apiPath, pathPattern);
                if (!actionUrl) {
                    await saveError({
                        function_name: "replaceWildcards returned undefined",
                        error: `Root url: ${rootUrl} | Posted url: ${url.href} | apiPath: ${apiPath} | pathPattern: ${pathPattern}`,
                    });
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
                    await message.reply({ embeds: [actionUIExists.embed], components: actionUIExists.rows });
                } else {
                    const actionRootUrl: URL = new URL(actionRuleObj.apiPath);
                    const urls: any = {
                        posted_url: url.href,
                        root_url: rootUrl,
                        action_root_url: actionRootUrl.origin,
                        action_url: actionUrl,
                        api_path: actionRuleObj.apiPath,
                        path_pattern: actionRuleObj.pathPattern,
                    }
                    const actionUI: MessageCreateOptions | undefined = await createBlinkUI(urls, action);
                    if (!actionUI) return;
                    await message.reply(actionUI);
                }
            }
        } catch (error) { }
    },
}

export default event;