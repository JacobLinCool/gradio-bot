import { Client as GradioClient } from "@gradio/client";
import {
	ChatInputCommandInteraction,
	Client as DiscordClient,
	REST,
	Routes,
	SlashCommandBuilder,
} from "discord.js";
import { adapt } from "./adapt";
import { CommandsAdapter } from "./commands";
import { makeAttachments, normalizeName } from "./utils";

export class GradioBot extends SlashCommandBuilder {
	public readonly gr: GradioClient;
	public readonly commands: CommandsAdapter;
	public readonly bot: DiscordClient | undefined;

	constructor(commands: CommandsAdapter, gr: GradioClient, bot: DiscordClient | undefined) {
		super();

		this.gr = gr;
		this.bot = bot;
		this.commands = commands;
		this.setName(normalizeName(gr.config?.space_id?.split("/")[1]?.slice(0, 32) || "gradio"));
		this.setDescription(`Gradio Bot from ${this.gr.config?.space_id || "Private App"}`);
		this.commands.decorate(this);
	}

	static async from(gr: string | GradioClient, bot?: DiscordClient): Promise<GradioBot> {
		gr = typeof gr === "string" ? await GradioClient.connect(gr) : gr;
		const adapters = await adapt(gr);
		const commands = new CommandsAdapter(adapters);
		return new GradioBot(commands, gr, bot);
	}

	public async register(id = process.env.BOT_ID, token = process.env.BOT_TOKEN) {
		if (!id || !token) {
			throw new Error("Please provide a valid bot id and token.");
		}

		console.log(`Refreshing application (/) commands.`);
		const rest = new REST().setToken(token);
		await rest.put(Routes.applicationCommands(id), { body: [this.toJSON()] });
		console.log(`Successfully reloaded application (/) commands.`);
	}

	public async start(token = process.env.BOT_TOKEN) {
		if (!this.bot) {
			throw new Error("You must provide a bot client to start the bot.");
		}

		this.bot.on("interactionCreate", async (interaction) => {
			if (!interaction.isChatInputCommand()) {
				return;
			}

			await this.handle(interaction);
		});

		this.bot.once("ready", (bot) => {
			console.log(`Logged in as ${bot.user?.tag}!`);
		});

		return this.bot.login(token);
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		if (interaction.commandName !== this.name) {
			return false;
		}

		await interaction.deferReply();
		try {
			const { route, data } = this.parse(interaction);
			console.log(`Calling Gradio endpoint "${route}" with data:`, data);
			const result = await this.gr.predict(route, data);

			// @ts-expect-error
			if (result.data?.status === "error") {
				await interaction.editReply("An error occurred while processing the command.");
			}

			const outputs = result.data as unknown[];
			const content = outputs
				.filter((output) => typeof output === "string" || typeof output === "number")
				.join("\n");
			const files = await makeAttachments(outputs);
			await interaction.editReply({ content, files });
		} catch {
			await interaction.followUp("An error occurred while processing the command.");
		}

		return true;
	}

	public parse(interaction: ChatInputCommandInteraction) {
		return this.commands.parse(interaction);
	}
}
