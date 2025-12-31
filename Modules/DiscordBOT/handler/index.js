const { glob } = require("glob");
const { promisify } = require("util");
const { Client, Collection, ApplicationCommandType } = require("discord.js");
const globPromise = promisify(glob);
const settings = require("../../../config/config.json");
const chalkImport = require("chalk");
const chalk = chalkImport.default || chalkImport;

/**
 * Loads events and slash commands, then registers slash commands (guild or global).
 * @param {Client} client
 */
module.exports = async (client) => {
  // Ensure the map exists so .set() won't throw elsewhere
  if (!client.slashCommands) client.slashCommands = new Collection();

  // ———————————————[Events]———————————————
  const eventFiles = await globPromise(`${process.cwd()}/Modules/DiscordBOT/events/*.js`);
  for (const file of eventFiles) {
    console.log(file)
    // Each event module should self-register on require()
    require(file);
  }

  // ———————————————[Slash Commands]———————————————
  const slashFiles = await globPromise(`${process.cwd()}/Modules/DiscordBOT/SlashCommands/*/*.js`);

  const arrayOfSlashCommands = [];
  for (const filePath of slashFiles) {
    console.log(filePath)
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
};

/** Resolve TestingServerID from settings or client.config, with fallbacks. */
function resolveTestingServerId(client) {
  // Prefer nested path used elsewhere in your codebase
  const nested = settings?.discord?.TestingServerID || client?.config?.discord?.TestingServerID;
  // Fallback to legacy root path if present
  const legacy = settings?.TestingServerID || client?.config?.TestingServerID;
  return nested || legacy || "Your Server ID";
}

/** Centralized registration with guards + logs */
async function registerCommands(client, arrayOfSlashCommands) {
  const testingGuildId = resolveTestingServerId(client);

  if (!Array.isArray(arrayOfSlashCommands) || arrayOfSlashCommands.length === 0) {
    console.log(chalk.gray("[SlashCmds] No slash commands found to register."));
    return;
  }

  if (testingGuildId === "Your Server ID") {
    console.log(chalk.gray("—————————————————————————————————"));
    console.log(chalk.white("["), chalk.red.bold("AntiCrash"), chalk.white("]"), chalk.gray(" : "),
      chalk.white.bold("Couldn't find TestingServerID to set guild-only slash commands")
    );
    console.log(chalk.gray("—————————————————————————————————"));
    console.log(chalk.magenta("You can fix it with one of these:"));
    console.log(
      chalk.yellow.bold("1.) ") +
      chalk.cyan("Set ") +
      chalk.red.underline("botcfg.TestingServerID") +
      chalk.cyan(" in ") +
      chalk.red("config/settings.json")
    );
    console.log(
      chalk.yellow.bold("2.) ") +
      chalk.cyan("Use global slash commands (default in this script).")
    );
  }

  // Prefer GLOBAL registration (more reliable across restarts); comment if you want guild-only
  // If you specifically want guild-only during development, uncomment the guild branch.
  try {
    // GUILD-ONLY (dev): uncomment to use
    // const guild = client.guilds.cache.get(testingGuildId);
    // if (guild) {
    //   await guild.commands.set(arrayOfSlashCommands);
    //   console.log(chalk.green(`[SlashCmds] Registered ${arrayOfSlashCommands.length} guild slash commands to ${guild.name} (${guild.id}).`));
    //   return;
    // }

    // GLOBAL
    await client.application.commands.set(arrayOfSlashCommands);
    console.log(
      chalk.green(`[SlashCmds] Registered ${arrayOfSlashCommands.length} global slash command(s). Propagation may take up to an hour.`)
    );
  } catch (e) {
    logRegError(e);
  }
}

function logRegError(e) {
  console.log(chalk.gray("—————————————————————————————————"));
  console.log(
    chalk.white("["),
    chalk.red.bold("SlashCmds"),
    chalk.white("]"),
    chalk.gray(" : "),
    chalk.white.bold("Registration failed")
  );
  console.log(chalk.gray("—————————————————————————————————"));
  console.error(e?.stack || e);
}