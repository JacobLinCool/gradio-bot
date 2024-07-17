import { Client, REST, Routes } from "discord.js";
import { config } from "dotenv";
import { GradioBot } from "gradio-bot";

config();

const ID = process.env.BOT_ID;
const TOKEN = process.env.BOT_TOKEN;
if (!ID || !TOKEN) {
	throw new Error("Missing BOT_ID or BOT_TOKEN environment variables");
}

const defaults = [
	"hf-audio/whisper-large-v3",
	"huggingface-projects/QR-code-AI-art-generator",
	"parler-tts/parler_tts_mini",
];
const spaces = process.argv.slice(2);
if (spaces.length === 0) {
	console.warn("No spaces provided, using default spaces");
	spaces.push(...defaults);
}

console.log("Spaces:", spaces);

const gbs = await Promise.all(spaces.map((space) => GradioBot.from(space)));

console.log("Registering commands ...");
const commands = gbs.map((gb) => gb.toJSON());
const rest = new REST().setToken(TOKEN);
await rest.put(Routes.applicationCommands(ID), { body: commands });
console.log("Commands registered");

const client = new Client({ intents: [] });

client.once("ready", () => {
	console.log("Ready!");
});

client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) {
		return;
	}

	for (const gb of gbs) {
		const handled = await gb.handle(interaction);
		if (handled) {
			return;
		}
	}

	await interaction.reply("Command not found");
});

client.login(TOKEN);
