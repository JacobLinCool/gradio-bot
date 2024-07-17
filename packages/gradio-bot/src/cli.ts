#!/usr/bin/env node
import {
	ChatInputCommandInteraction,
	Client,
	OAuth2Scopes,
	REST,
	Routes,
	SlashCommandBuilder,
} from "discord.js";
import { config } from "dotenv";
import { GradioBot } from "./bot";

config();

const ID = process.env.BOT_ID || "";
const TOKEN = process.env.BOT_TOKEN || "";
if (!ID || !TOKEN) {
	throw new Error("Missing BOT_ID or BOT_TOKEN environment variables");
}

const spaces = process.argv.slice(2);
if (spaces.length === 0) {
	console.error("Please provide at least one valid Gradio space.");
	console.error("Usage   : gradio-bot '<space>'");
	console.error(
		"Example : gradio-bot 'stabilityai/stable-diffusion-3-medium' 'hf-audio/whisper-large-v3' 'parler-tts/parler_tts_mini'",
	);
	process.exit(1);
}

process.on("unhandledRejection", (error) => {
	console.error(error);
});

main();

async function main() {
	const gbs = await Promise.all(spaces.map((space) => GradioBot.from(space)));

	await register(gbs);

	const client = new Client({ intents: [] });
	client.once("ready", (bot) => {
		console.log(`Logged in as ${bot.user?.tag}!`);
		console.log(
			`Invite Link: ${bot.generateInvite({ scopes: [OAuth2Scopes.ApplicationsCommands] })}`,
		);
	});

	client.on("interactionCreate", async (interaction) => {
		if (!interaction.isChatInputCommand()) {
			return;
		}

		if (interaction.commandName === "management") {
			await handleManagement(interaction, gbs);
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
}

async function register(gbs: GradioBot[]) {
	console.log("Registering commands ...");
	const commands = [management(gbs).toJSON(), ...gbs.map((gb) => gb.toJSON())];
	const rest = new REST().setToken(TOKEN);
	await rest.put(Routes.applicationCommands(ID), { body: commands });
	console.log("Commands registered");
}

function management(gbs: GradioBot[]) {
	const builder = new SlashCommandBuilder()
		.setName("management")
		.setDescription("Management spaces")
		.setDefaultMemberPermissions(0)
		.addSubcommand((sub) => sub.setName("list").setDescription("List all spaces"))
		.addSubcommand((sub) =>
			sub
				.setName("add")
				.setDescription("Add a new space")
				.addStringOption((opt) =>
					opt.setName("space").setDescription("The space to add").setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("remove")
				.setDescription("Remove a space")
				.addStringOption((opt) =>
					opt
						.setName("space")
						.setDescription("The space to remove")
						.addChoices(...gbs.map((gb) => ({ name: gb.name, value: gb.name })))
						.setRequired(true),
				),
		);
	return builder;
}

async function handleManagement(interaction: ChatInputCommandInteraction, gbs: GradioBot[]) {
	await interaction.deferReply({ ephemeral: true });

	try {
		const sub = interaction.options.getSubcommand();
		if (sub === "list") {
			const list = gbs
				.map(
					(gb) =>
						`- [${gb.name}](https://huggingface.co/spaces/${gb.gr.config?.space_id})`,
				)
				.join("\n");
			await interaction.followUp(`## Spaces\n${list}`);
			return;
		}

		if (sub === "add") {
			const space = interaction.options.getString("space", true);
			const gb = await GradioBot.from(space);
			gbs.push(gb);
			await register(gbs);
			await interaction.followUp(`Space ${space} added`);
			return;
		}

		if (sub === "remove") {
			const space = interaction.options.getString("space", true);
			const index = gbs.findIndex((gb) => gb.name === space);
			if (index === -1) {
				await interaction.followUp(`Space ${space} not found`);
				return;
			}

			gbs.splice(index, 1);
			await register(gbs);
			await interaction.followUp(`Space ${space} removed`);
			return;
		}
	} catch (error) {
		console.error(error);
		await interaction.followUp("An error occurred");
	}
}
