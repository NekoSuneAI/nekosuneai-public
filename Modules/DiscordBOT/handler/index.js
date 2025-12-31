const { glob } = require("glob");
const { promisify } = require("util");
const globPromise = promisify(glob);
const { Client, Collection, ApplicationCommandType } = require("discord.js");
const mainjson = require("../../../config/config.json");
const chalkImport = require("chalk");
const chalk = chalkImport.default || chalkImport;
const path = require("path");

module.exports = async (client) => {
  const baseDir = path.join(process.cwd(), "Modules", "DiscordBOT");
   // ———————————————[Events]———————————————
  const eventFiles = await globPromise(`${baseDir}/events/*.js`);
  for (const file of eventFiles) {
    // Each event module should self-register on require()
    require(file);
  }

  // ———————————————[Slash Commands]———————————————
  const slashFiles = await globPromise(`${baseDir}/SlashCommands/*/*.js`);

  const arrayOfSlashCommands = [];
  for (const filePath of slashFiles) {
    const command = require(filePath);
    if (!command?.name) continue;

    // store for runtime usage
    const directory = filePath.split("/").slice(-2, -1)[0];
    const properties = { directory, ...command };
    client.slashCommands.set(command.name, properties);

    // prepare data for registration
    const reg = { ...command };

    // Back-compat for type strings
    if (reg.type === "MESSAGE") reg.type = ApplicationCommandType.Message;
    if (reg.type === "USER") reg.type = ApplicationCommandType.User;

    // DJS requirement: Message/User commands don’t use description
    if (reg.type === ApplicationCommandType.Message || reg.type === ApplicationCommandType.User) {
      delete reg.description;
    }

    arrayOfSlashCommands.push(reg);
  }

  // ———————————————[Registration on Ready]———————————————
  client.once("ready", async () => {
    try {
      // Sometimes client.application is null right after ready; fetch it to hydrate.
      await client.application?.fetch();

      const app = client.application;
      if (!app) {
        console.warn(chalk.yellow("[SlashCmds] client.application not available yet. Retrying in 2s…"));
        setTimeout(async () => {
          try {
            await client.application?.fetch();
            if (!client.application) {
              console.error(chalk.red("[SlashCmds] client.application still null; aborting registration."));
              return;
            }
            await registerCommands(client, arrayOfSlashCommands);
          } catch (e) {
            logRegError(e);
          }
        }, 2000);
        return;
      }

      await registerCommands(client, arrayOfSlashCommands);
    } catch (e) {
      logRegError(e);
    }
  });
  
  client.on("ready", async () => {
    // Register for a single guild
    if (mainjson.TestingServerID === "Your Server ID") {
      console.log(chalk.gray("—————————————————————————————————"));
      console.log(
        chalk.white("["),
        chalk.red.bold("AntiCrash"),
        chalk.white("]"),
        chalk.gray(" : "),
        chalk.white.bold("Couldn't Find ServerID to set the Slash Cmds")
      );
      console.log(chalk.gray("—————————————————————————————————"));
      console.log(chalk.magenta("Please Fix it with following methods."));
      console.log(
        chalk.yellow.bold("1.) ") +
          chalk.cyan("Go to ") +
          chalk.red.underline("config/settings.json") +
          chalk.cyan(" and put your \nSupportServer/TestServer ID in the") +
          chalk.red(" TestingServerID String!")
      );
      console.log(
        chalk.yellow.bold("2.) ") +
          chalk.cyan("Use Global Slash Commands by changing line no 74 to\n") +
          chalk.blue.bold.underline(
            " await client.application.commands.set(arrayOfSlashCommands);\n"
          ) +
          chalk.cyan(" in the else statement.")
      );
    } else {
      //await client.guilds.cache.get(mainjson.TestingServerID).commands.set(arrayOfSlashCommands);

      // Register for all the guilds the bot is in
       await client.application.commands.set(arrayOfSlashCommands);
    }
  });
};
