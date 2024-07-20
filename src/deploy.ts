import "dotenv/config";
import { REST, Routes } from "discord.js";
import fs from "fs";

const isDevelopment = process.env.NODE_ENV === "development";
// Grab all the command files from the commands directory you created earlier
const commands = [];
const commandFiles = fs.readdirSync('src/commands').filter(file => file.endsWith('.ts'));

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.default.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(isDevelopment ? String(process.env.BOT_TOKEN_DEV) : String(process.env.BOT_TOKEN_PROD));

(async () => {
    try {
        console.log(`Updating commands...`);
        const data: any = await rest.put(
            Routes.applicationCommands(isDevelopment ? String(process.env.BOT_APP_ID_DEV) : String(process.env.BOT_APP_ID_PROD)),
            { body: commands },
        );
        console.log(`Successfully updated ${data.length} application (/) commands.`);
    } catch (error) {
        console.log(error);
    }
})();