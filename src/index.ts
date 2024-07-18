import "dotenv/config";
import { Client, GatewayIntentBits, Collection, Partials } from "discord.js";
import fs from "fs";
import path from "path";
import connectDb from "./lib/connect-db";

const isDevelopment = process.env.NODE_ENV === "development";
const client: any = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [
        Partials.Channel,
    ]
});

/** register commands */
client.commands = new Collection();
const commandFiles = isDevelopment ? fs.readdirSync(path.join(__dirname, "./commands")).filter(file => file.endsWith(".ts")) : fs.readdirSync(path.join(__dirname, "./commands")).filter(file => file.endsWith(".js"));
for (const file of commandFiles) {
    const command = require(`${path.join(__dirname, "./commands")}/${file}`).default;

    if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`WARNING: ${file} is missing a required data or execute property`);
    }
}

/** register events and start listening for them */
const eventFiles = isDevelopment ? fs.readdirSync(path.join(__dirname, "./events")).filter(file => file.endsWith(".ts")) : fs.readdirSync(path.join(__dirname, "./events")).filter(file => file.endsWith(".js"));
for (const file of eventFiles) {
    const event = require(`${path.join(__dirname, "./events")}/${file}`).default;

    if (event.once) {
        client.once(event.name, (...args: any) => event.execute(...args));
    } else {
        client.on(event.name, (...args: any) => event.execute(...args));
    }
}

client.on("ready", async () => {
    await connectDb();
    console.log("Bot started.");
});
client.login(isDevelopment ? process.env.BOT_TOKEN_DEV : process.env.BOT_TOKEN_PROD);