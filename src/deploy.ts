import "dotenv/config";
import { REST, Routes } from "discord.js";
import fs from "fs";
const isProduction = process.env.NODE_ENV === "production";

// Grab all the command files from the commands directory you created earlier
const commands = [];
const commandFiles = isProduction ? fs.readdirSync('src/commands').filter(file => file.endsWith('.js')) : fs.readdirSync('src/commands').filter(file => file.endsWith('.ts'));

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.default.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(String(process.env.BOT_TOKEN));

(async () => {
    try {
        console.log(`Updating commands...`);
        const data: any = await rest.put(
            Routes.applicationCommands(String(process.env.BOT_APP_ID)),
            { body: commands },
        );
        console.log(`Successfully updated ${data.length} application (/) commands.`);
    } catch (error) {
        console.log(error);
    }
})();