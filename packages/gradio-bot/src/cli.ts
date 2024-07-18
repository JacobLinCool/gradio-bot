#!/usr/bin/env node
import { Client as GradioClient } from "@gradio/client";
import {
	ChatInputCommandInteraction,
	Client,
	OAuth2Scopes,
	REST,
	Routes,
	SlashCommandBuilder,
} from "discord.js";
import { config } from "dotenv";
import { createServer } from "http";
import { GradioBot } from "./bot";

config();

const ID = process.env.BOT_ID || "";
const TOKEN = process.env.BOT_TOKEN || "";
if (!ID || !TOKEN) {
	throw new Error("Missing BOT_ID or BOT_TOKEN environment variables");
}

const spaces = process.argv.slice(2);
if (spaces.length === 0) {
	console.warn(
		"No spaces are pre-configured by command line arguments. Please use the management command.",
	);
	console.warn("To pre-configure spaces, provide the space names as arguments.");
	console.warn("Usage   : gradio-bot '<space>'");
	console.warn(
		"Example : gradio-bot 'stabilityai/stable-diffusion-3-medium' 'hf-audio/whisper-large-v3' 'parler-tts/parler_tts_mini'",
	);
}

process.on("unhandledRejection", (error) => {
	console.error(error);
});

main();

async function main() {
	const gbs = await Promise.all(spaces.map((space) => GradioBot.from(space)));

	// Setup token borrower to prevent problem of https://www.gradio.app/docs/python-client/using-zero-gpu-spaces
	const borrower = await TokenBorrower.create(process.env.TOKEN_BORROWER);
	gbs.forEach((gb) => borrower.decorate(gb.gr));

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
			await handleManagement(interaction, gbs, borrower);
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

	if (process.env.SPACE_ID) {
		const server = createServer((req, res) => {
			res.writeHead(200, { "Content-Type": "text/plain" });
			const link = client.generateInvite({ scopes: [OAuth2Scopes.ApplicationsCommands] });
			const spaces = gbs.map((gb) => gb.gr.config?.space_id).join(", ");
			const content = `Invite Link: ${link}\nConnected Spaces: ${spaces}\n`;
			res.end(content);
		});
		server.listen(process.env.PORT || 7860);
		console.log("Server running on port", process.env.PORT || 7860);
	}
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

async function handleManagement(
	interaction: ChatInputCommandInteraction,
	gbs: GradioBot[],
	borrower: TokenBorrower,
) {
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
			borrower.decorate(gb.gr);
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

class TokenBorrower {
	constructor(private gr?: GradioClient) {}

	static async create(proxy?: string): Promise<TokenBorrower> {
		const gr = proxy ? await GradioClient.connect(proxy) : undefined;
		return new TokenBorrower(gr);
	}

	decorate(gr: GradioClient): void {
		if (!this.gr) {
			return;
		}

		// @ts-expect-error
		if (gr.__token_borrower__) {
			return;
		}

		gr.fetch = (
			(f) =>
			async (...args: Parameters<typeof f>) => {
				if (!this.gr) {
					return f(...args);
				}

				if (!args[1]) {
					args[1] = {};
				}

				if (!args[1].headers) {
					args[1].headers = {};
				}

				try {
					const res = await this.gr.predict("/predict", []);
					const [token] = res.data as [string];
					if (token) {
						if (args[1].headers instanceof Headers) {
							args[1].headers.set("X-IP-Token", token);
						} else if (Array.isArray(args[1].headers)) {
							args[1].headers.push(["X-IP-Token", token]);
						} else {
							args[1].headers["X-IP-Token"] = token;
						}
					}
				} catch {}

				return f(...args);
			}
		)(gr.fetch.bind(gr));

		// @ts-expect-error
		gr.__token_borrower__ = true;
	}
}
