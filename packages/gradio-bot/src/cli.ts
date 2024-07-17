#!/usr/bin/env node
import { Client, OAuth2Scopes } from "discord.js";
import { config } from "dotenv";
import { GradioBot } from "./bot";

config();

const space = process.argv[2];
if (!space) {
	console.error("Please provide a valid Gradio space.");
	console.error("Usage: gradio-bot '<space>'");
	process.exit(1);
}

process.on("unhandledRejection", (error) => {
	console.error(error);
});

main();

async function main() {
	const client = new Client({ intents: [] });
	const gb = await GradioBot.from(space, client);
	await gb.register();
	await gb.start();
	console.log(
		`Invite Link: ${gb.bot?.generateInvite({ scopes: [OAuth2Scopes.ApplicationsCommands] })}`,
	);
}
