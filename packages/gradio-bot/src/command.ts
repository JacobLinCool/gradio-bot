import { handle_file } from "@gradio/client";
import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandBuilder,
} from "discord.js";
import type { CommandDecoratorOption, GradioComponentMeta, GradioEndpointInfo } from "./types";
import { normalizeName, paramType, parseChoice } from "./utils";

export class CommandAdapter {
	private endpoint: string;
	private info: GradioEndpointInfo;
	private callAsArray: boolean;
	private parameterMapping: Map<
		string,
		[
			"string" | "integer" | "number" | "boolean" | "array" | "attachment",
			string,
			number,
			GradioComponentMeta | undefined,
		]
	>;

	constructor(endpoint: string, info: GradioEndpointInfo, components?: GradioComponentMeta[]) {
		this.endpoint = endpoint;
		this.info = info;
		this.callAsArray = info.parameters.some((param) => !param.parameter_name);

		this.parameterMapping = new Map<
			string,
			[ReturnType<typeof paramType>, string, number, GradioComponentMeta | undefined]
		>();
		for (let i = 0; i < info.parameters.length; i++) {
			const param = info.parameters[i];
			const name = normalizeName(param.parameter_name || param.label || `param-${i}`);

			const component = components?.find(
				(c) =>
					c.type.toLowerCase() === param.component.toLowerCase() &&
					c.props?.label === param.label,
			);

			this.parameterMapping.set(name, [paramType(param), param.parameter_name, i, component]);
		}
	}

	public decorate<B extends SlashCommandBuilder | SlashCommandSubcommandBuilder>(
		builder: B,
		options?: Record<string, CommandDecoratorOption>,
	): B extends SlashCommandBuilder
		? SlashCommandOptionsOnlyBuilder
		: SlashCommandSubcommandBuilder {
		for (let i = 0; i < this.info.parameters.length; i++) {
			const param = this.info.parameters[i];
			const name = normalizeName(param.parameter_name || param.label || `param-${i}`);
			const description =
				param.description || param.label || param.parameter_name || "No description";

			const mapping = this.parameterMapping.get(name);
			if (!mapping) {
				throw new Error(`Failed to find mapping for parameter "${name}"`);
			}
			const [type, paramName, _, component] = mapping;

			const opt = options?.[name];

			// some old endpoints do not have this field
			const required = opt?.required ?? param.parameter_has_default === false;

			switch (type) {
				case "string": {
					// @ts-expect-error
					builder = builder.addStringOption((option) => {
						option = option.setName(name).setDescription(description);
						const choices = parseChoice(param.python_type.type);
						if (choices) {
							option = option.addChoices(
								...choices.map((choice) => ({ name: choice, value: choice })),
							);
						}
						option = option.setRequired(required);
						if (opt?.localizations) {
							option = option.setDescriptionLocalizations(opt.localizations);
						}
						return option;
					});
					break;
				}
				case "integer": {
					// @ts-expect-error
					builder = builder.addIntegerOption((option) => {
						option = option.setName(name).setDescription(description);
						option = option.setRequired(required);
						if (opt?.localizations) {
							option = option.setDescriptionLocalizations(opt.localizations);
						}

						if (component?.props?.minimum) {
							option = option.setMinValue(component.props.minimum as number);
						}
						if (component?.props?.maximum) {
							option = option.setMaxValue(component.props.maximum as number);
						}
						return option;
					});
					break;
				}
				case "number": {
					// @ts-expect-error
					builder = builder.addNumberOption((option) => {
						option = option.setName(name).setDescription(description);
						option = option.setRequired(required);
						if (opt?.localizations) {
							option = option.setDescriptionLocalizations(opt.localizations);
						}

						if (component?.props?.minimum) {
							option = option.setMinValue(component.props.minimum as number);
						}
						if (component?.props?.maximum) {
							option = option.setMaxValue(component.props.maximum as number);
						}
						return option;
					});
					break;
				}
				case "boolean": {
					// @ts-expect-error
					builder = builder.addBooleanOption((option) => {
						option = option.setName(name).setDescription(description);
						option = option.setRequired(required);
						if (opt?.localizations) {
							option = option.setDescriptionLocalizations(opt.localizations);
						}
						return option;
					});
					break;
				}
				case "attachment": {
					// @ts-expect-error
					builder = builder.addAttachmentOption((option) => {
						option = option.setName(name).setDescription(description);
						option = option.setRequired(required);
						if (opt?.localizations) {
							option = option.setDescriptionLocalizations(opt.localizations);
						}
						return option;
					});
					break;
				}
				case "array": {
					// @ts-expect-error
					builder = builder.addStringOption((option) => {
						option = option.setName(name).setDescription(description);
						const choices = parseChoice(param.python_type.type);
						if (choices) {
							option = option.setDescription(
								`${description} (${choices.join(", ")})`.slice(0, 100),
							);
						}
						option = option.setRequired(required);
						if (opt?.localizations) {
							option = option.setDescriptionLocalizations(opt.localizations);
						}
						return option;
					});
					break;
				}
			}
		}

		// hoist required options to the top
		builder.options.sort((a, b) => {
			const aRequired = a.toJSON().required ?? false;
			const bRequired = b.toJSON().required ?? false;
			if (aRequired === bRequired) {
				return 0;
			}
			return aRequired ? -1 : 1;
		});

		return builder as unknown as typeof builder extends SlashCommandBuilder
			? SlashCommandOptionsOnlyBuilder
			: SlashCommandSubcommandBuilder;
	}

	public parse(interaction: ChatInputCommandInteraction): {
		route: string;
		data: Record<string, unknown> | unknown[];
	} {
		const named_data: Record<string, unknown> = {};
		const data: unknown[] = [];
		for (const [name, [type, paramName, i, component]] of this.parameterMapping) {
			const fallback = (component?.props.value as unknown) ?? null;
			switch (type) {
				case "string": {
					const value = interaction.options.getString(name, false) ?? fallback;
					if (this.callAsArray) {
						data[i] = value;
					} else {
						named_data[paramName] = value;
					}
					break;
				}
				case "integer": {
					const value = interaction.options.getInteger(name, false) ?? fallback;
					if (this.callAsArray) {
						data[i] = value;
					} else {
						named_data[paramName] = value;
					}
					break;
				}
				case "number": {
					const value = interaction.options.getNumber(name, false) ?? fallback;
					if (this.callAsArray) {
						data[i] = value;
					} else {
						named_data[paramName] = value;
					}
					break;
				}
				case "boolean": {
					const value = interaction.options.getBoolean(name, false) ?? fallback;
					if (this.callAsArray) {
						data[i] = value;
					} else {
						named_data[paramName] = value;
					}
					break;
				}
				case "attachment": {
					const attachment = interaction.options.getAttachment(name, false);
					if (attachment) {
						if (this.callAsArray) {
							data[i] = handle_file(attachment.url);
						} else {
							named_data[paramName] = handle_file(attachment.url);
						}
					}
					break;
				}
				case "array": {
					let value = (interaction.options
						.getString(name, false)
						?.split(",")
						.map((x) => x.trim()) ?? fallback) as (string | number)[];
					if (value.every((x) => !isNaN(Number(x)))) {
						value = value.map((x) => Number(x));
					}

					let choices: (string | number)[] | undefined = parseChoice(
						this.info.parameters[i].python_type.type,
					);
					if (choices && choices.every((x) => !isNaN(Number(x)))) {
						choices = choices.map((x) => Number(x));
					}
					if (choices && value.some((x) => !choices.includes(x))) {
						throw new Error(`Invalid choice for parameter "${name}"`);
					}

					if (this.callAsArray) {
						data[i] = value;
					} else {
						named_data[paramName] = value;
					}
					break;
				}
				default: {
					throw new Error(`Unsupported option type "${type}"`);
				}
			}
		}

		return { route: this.endpoint, data: this.callAsArray ? data : named_data };
	}
}
