import { Client } from "@gradio/client";
import { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import { CommandAdapter } from "./command";
import { normalizeName } from "./utils";

export async function adapt(space: string | Client): Promise<Record<string, CommandAdapter>> {
	const client = typeof space === "string" ? await Client.connect(space) : space;
	const apiInfo = await client.view_api();
	const components = client.config?.components;

	const adapters: Record<string, CommandAdapter> = {};
	for (const endpoint in apiInfo.named_endpoints) {
		const commandName = normalizeName(endpoint);
		const info = apiInfo.named_endpoints[endpoint];
		adapters[commandName] = new CommandAdapter(endpoint, info, components);
	}

	return adapters;
}

export async function adaptAsCommands(space: string | Client): Promise<{
	builder: SlashCommandSubcommandsOnlyBuilder;
	adapters: Record<string, CommandAdapter>;
}> {
	const client = typeof space === "string" ? await Client.connect(space) : space;
	const name = normalizeName(client.config?.space_id || "gradio");
	const adapters = await adapt(client);

	let builder: SlashCommandSubcommandsOnlyBuilder = new SlashCommandBuilder()
		.setName(name)
		.setDescription("commands");
	for (const commandName in adapters) {
		const adapter = adapters[commandName];
		builder = builder.addSubcommand((builder) => {
			builder = builder.setName(commandName).setDescription(commandName);
			return adapter.decorate(builder);
		});
	}

	return { builder, adapters };
}
