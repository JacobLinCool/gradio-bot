import type { Client } from "@gradio/client";
import type {
	ChatInputCommandInteraction,
	LocalizationMap,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandBuilder,
} from "discord.js";

export interface CommandDecoratorOption {
	required?: boolean;
	localizations?: LocalizationMap;
}

export type CommandDecorator = <B extends SlashCommandBuilder | SlashCommandSubcommandBuilder>(
	builder: B,
	options?: Record<string, CommandDecoratorOption>,
) => B extends SlashCommandBuilder ? SlashCommandOptionsOnlyBuilder : SlashCommandSubcommandBuilder;

export type OptionParser = (interaction: ChatInputCommandInteraction) => {
	endpoint: string;
	data: Record<string, unknown> | unknown[];
};

export type GradioEndpointInfo = Exclude<Client["api_info"], undefined>["named_endpoints"][number];
export type GradioComponentMeta = Exclude<Client["config"], undefined>["components"][number];
export type GradioPredictReturn = Awaited<ReturnType<Exclude<Client["predict"], undefined>>>;
