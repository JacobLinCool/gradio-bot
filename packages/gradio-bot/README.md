# Gradio Bot

Turn any Hugging Face Space or Gradio application into a discord.js bot.

![sd-gif](./images/sd.gif)

## Installation

```bash
pnpm i -g gradio-bot
```

> For API usage, you can install it as a dependency in your project without the `-g` flag.

## CLI Usage

For the CLI, it requires 2 environment variables to be set:

-   `BOT_ID`: The application ID of your bot.
-   `BOT_TOKEN`: The token of your bot.

You can also set them in a `.env` file.

To get the bot ID and token, you need to create a bot application in the [Discord Developer Portal](https://discord.com/developers/applications).

Then, simply run the following command:

```bash
gradio-bot 'user/repo'
```

The bot will automatically register the commands and start running.

### Example

```bash
gradio-bot 'stabilityai/stable-diffusion-3-medium'
```

The fields on Gradio will be automatically converted to Discord command options.

![options](./images/options.png)

![sd3](./images/sd3.png)

File uploads are also supported! 🎉

![file](./images/file.png)

## API Usage

### As a standalone bot

You can start a bot with the `GradioBot` directly.

```ts
import { Client } from "discord.js";
import { GradioBot } from "gradio-bot";

const client = new Client({ intents: [] });
const gb = await GradioBot.from(space, client);
await gb.register();
await gb.start();
```

You can explicitly pass the token and application ID to `.register` and `.start`, or it will try to get them from the environment variables.

### As a command builder and handler

The `GradioBot` class is inherited from `SlashCommandBuilder` in discord.js, so you can use it to add new powers to your existing bot too!

To register the new commands, you can use the `toJSON` method:

```ts
import { GradioBot } from "gradio-bot";

const gb = await GradioBot.from(space);

// Just like what you do before, but add gb.toJSON() to the array
const commands = [...others, gb.toJSON()];
const rest = new REST().setToken(token);
await rest.put(Routes.applicationCommands(id), { body: commands });
```

To handle the interaction, you can use the `handle` method:

```ts
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const handled = await gb.handle(interaction);
    if (handled) return;

    // The command name is not matched, do something else
    // ...
});
```

If you want to have more control over the interaction, you can use the `parse` method and respond manually:

```ts
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === gb.name) {
        // Parse the interaction options
        const { route, data } = gb.parse(interaction);

        // Run the prediction by yourself
        const result = await gradio.predict(route, data);

        // Create attachments for sending files (optional)
        const files = await makeAttachments(result.data);

        // Respond to the interaction manually
        await interaction.reply({ content: "Got some cool stuff!", files });
    }
});
```

> Checkout the [example-bot](./packages/example-bot) for a 50-line multi-space bot!
