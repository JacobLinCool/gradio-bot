#!/usr/bin/env node
import { Command } from "commander";
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
import * as pkg from "../package.json";
import { GradioBot } from "./bot";
import { TokenBorrower } from "./token-borrower";

config();

const { ID, TOKEN, TOKEN_BORROWER, PORT, SPACE_ID, DISABLE_MANAGEMENT, HF_TOKEN, SPACES } =
	parseEnvVar();

interface Options {
	id: string;
	token: string;
	port: number;
	hfToken: string;
	tokenBorrower: string;
	disableManagement: boolean;
}

const program = new Command();

program
	.name(pkg.name)
	.version(pkg.version)
	.description(pkg.description)
	.arguments("[spaces...]")
	.option("--id <id>", "Bot ID", ID)
	.option("--token <token>", "Bot token", TOKEN)
	.option("--port <port>", "Port to run the server on HF Spaces", parseInt, Number(PORT || 7860))
	.option("--hf-token <token>", "Hugging Face token", HF_TOKEN)
	.option("--token-borrower <endpoint>", "Token borrower (experimental)", TOKEN_BORROWER)
	.option("--disable-management", "Disable management commands", !!DISABLE_MANAGEMENT)
	.action(async (spaces: string[], options: Options) => {
		spaces = spaces.length > 0 ? spaces : SPACES;
		if (spaces.length === 0) {
			console.warn(
				"No spaces are pre-configured by command line arguments. Please use the management command.",
			);
			console.warn("To pre-configure spaces, provide the space names as arguments.");
			console.warn("Usage   : gradio-bot '<space>'");
			console.warn(
				"Example : gradio-bot 'stabilityai/stable-diffusion-3-medium' 'hf-audio/whisper-large-v3' 'parler-tts/parler_tts_mini'",
			);
		} else {
			console.log("Pre-configured spaces:", spaces);
		}

		if (!options.id || !options.token) {
			console.error("Discord bot ID and token are required");
			process.exit(1);
		}

		process.on("unhandledRejection", (error) => {
			console.error(error);
		});

		await main(spaces, options);
	});

program.parse(process.argv);

async function main(spaces: string[], options: Options) {
	const gbs = await Promise.all(
		spaces.map((space) =>
			GradioBot.from(space, undefined, { hf_token: options.hfToken as never }),
		),
	);

	// Setup token borrower to prevent problem of https://www.gradio.app/docs/python-client/using-zero-gpu-spaces
	const borrower = await TokenBorrower.create(options.tokenBorrower);
	gbs.forEach((gb) => borrower.decorate(gb.gr));

	await register();

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

		if (!DISABLE_MANAGEMENT && interaction.commandName === "management") {
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

	client.login(options.token);

	// Run a server in HF Spaces
	if (SPACE_ID) {
		const server = createServer((req, res) => {
			res.writeHead(200, { "Content-Type": "text/plain" });
			const link = client.generateInvite({ scopes: [OAuth2Scopes.ApplicationsCommands] });
			const spaces = gbs.map((gb) => gb.gr.config?.space_id).join(", ");
			const content = `Invite Link: ${link}\nConnected Spaces: ${spaces}\n`;
			res.end(content);
		});
		server.listen(options.port);
		console.log("Server running on port", options.port);
	}

	async function register() {
		console.log("Registering commands ...");
		const commands = gbs.map((gb) => gb.toJSON());
		if (!options.disableManagement) {
			commands.unshift(management().toJSON());
		}
		const rest = new REST().setToken(options.token);
		await rest.put(Routes.applicationCommands(options.id), { body: commands });
		console.log("Commands registered");
	}

	function management() {
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
				const gb = await GradioBot.from(space, undefined, {
					hf_token: options.hfToken as never,
				});
				borrower.decorate(gb.gr);
				gbs.push(gb);
				await register();
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
				await register();
				await interaction.followUp(`Space ${space} removed`);
				return;
			}
		} catch (error) {
			console.error(error);
			await interaction.followUp("An error occurred");
		}
	}
}

export function parseEnvVar(env: Record<string, string | undefined> = process.env) {
	return {
		ID: env.BOT_ID,
		TOKEN: env.BOT_TOKEN,
		TOKEN_BORROWER: env.TOKEN_BORROWER,
		PORT: env.PORT,
		SPACE_ID: env.SPACE_ID,
		DISABLE_MANAGEMENT: env.DISABLE_MANAGEMENT,
		HF_TOKEN: env.HF_TOKEN,
		SPACES: env.SPACES ? env.SPACES.split(",").map((s) => s.trim()) : [],
	};
}
