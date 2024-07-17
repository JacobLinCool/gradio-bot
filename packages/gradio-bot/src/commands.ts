import type { ChatInputCommandInteraction, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import type { CommandAdapter } from "./command";

export class CommandsAdapter {
	public readonly adapters: Record<string, CommandAdapter>;

	constructor(adapters: Record<string, CommandAdapter>) {
		this.adapters = adapters;
	}

	public decorate(
		builder: SlashCommandSubcommandsOnlyBuilder,
	): SlashCommandSubcommandsOnlyBuilder {
		for (const commandName in this.adapters) {
			const adapter = this.adapters[commandName];
			builder = builder.addSubcommand((builder) => {
				builder = builder.setName(commandName).setDescription(commandName);
				return adapter.decorate(builder);
			});
		}

		return builder;
	}

	public parse(interaction: ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand();
		const adapter = this.adapters[sub];
		return adapter.parse(interaction);
	}
}
