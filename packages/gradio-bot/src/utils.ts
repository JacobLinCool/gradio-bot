import { AttachmentBuilder } from "discord.js";
import type { GradioEndpointInfo } from "./types";

export function normalizeName(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.replace(/^-+/, "");
}

export function parseChoice(pythonType: string): string[] | undefined {
	const match = pythonType.match(/^Literal\['(.*)'\]$/);
	if (!match) {
		return undefined;
	}
	const choices = match[1].split("', '");
	if (choices.length === 0) {
		return undefined;
	}
	return choices;
}

export function paramType(param: GradioEndpointInfo["parameters"][number]) {
	if (param.type === "string") {
		return "string";
	}
	if (param.type === "number") {
		return param.python_type.type === "int" ? "integer" : "number";
	}
	if (param.type === "boolean") {
		return "boolean";
	}
	if (param.component === "File" || param.component === "Audio" || param.component === "Image") {
		return "attachment";
	}
	throw new Error(`Unsupported parameter type "${param.type}"`);
}

export async function makeAttachments(obj: unknown, proxy?: string): Promise<AttachmentBuilder[]> {
	// traverse the obj and find all FileData
	const files: { url: string; orig_name?: string; mime_type?: string }[] = [];
	const queue = [obj];
	while (queue.length > 0) {
		const current = queue.shift();
		if (
			current instanceof Object &&
			"url" in current &&
			typeof current.url === "string" &&
			("orig_name" in current || "mime_type" in current)
		) {
			files.push(current as never);
		} else if (Array.isArray(current) && current.length < 10) {
			queue.push(...current);
		} else if (current instanceof Object) {
			queue.push(...Object.values(current));
		}
	}

	// fetch the files and create AttachmentBuilder
	const attachments = await Promise.all(
		files.map(async (file) => {
			let url: string;
			try {
				url = new URL(`${proxy}${new URL(file.url).pathname}`).toString();
			} catch {
				url = file.url;
			}
			const response = await fetch(url);
			const name = file.orig_name || `file.${file.mime_type}`;
			const buffer = Buffer.from(await response.arrayBuffer());
			return new AttachmentBuilder(buffer, { name });
		}),
	);

	return attachments;
}
