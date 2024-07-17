import { Client } from "@gradio/client";
import { CommandAdapter } from "./command";
import type { AdaptOptions } from "./types";
import { normalizeName } from "./utils";

export async function adapt(
	space: string | Client,
	options?: AdaptOptions,
): Promise<Record<string, CommandAdapter>> {
	const client = typeof space === "string" ? await Client.connect(space) : space;
	const apiInfo = await client.view_api();
	const components = client.config?.components;

	const adapters: Record<string, CommandAdapter> = {};
	for (const endpoint in apiInfo.named_endpoints) {
		let commandName = normalizeName(endpoint);
		if (options?.ignores?.includes(commandName)) {
			continue;
		}

		if (commandName.length > 32) {
			if (options?.trimmer) {
				commandName = options.trimmer(commandName);
			} else {
				commandName = commandName.slice(0, 32);
			}
		}

		if (adapters[commandName]) {
			console.error(`Duplicate command name: ${commandName}, skipping.`);
			continue;
		}

		const info = apiInfo.named_endpoints[endpoint];
		adapters[commandName] = new CommandAdapter(endpoint, info, components);
	}

	return adapters;
}
