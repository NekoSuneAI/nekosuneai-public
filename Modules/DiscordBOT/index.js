// client.js
// ---------------------------------------------------------
// Discord client bootstrap
// ---------------------------------------------------------

const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require("discord.js");
const chalkImport = require("chalk");
const chalk = chalkImport.default || chalkImport;
const path = require("path");
const i18n = require("i18n");

// ---------------------------------------------------------
// Create client instance
// ---------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.User,
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.Reaction,
    Partials.GuildScheduledEvent,
    Partials.ThreadMember,
  ],
});

// ---------------------------------------------------------
// Collections & Config
// ---------------------------------------------------------
client.aliases = new Collection();
client.cooldowns = new Collection();
client.slashCommands = new Collection();

client.config = require("../../config/config.json");
client.sqlconndata = client.config.discord?.sql;

// Load handlers (commands/events)
require("./handler")(client);

// ---------------------------------------------------------
// i18n setup
// ---------------------------------------------------------
i18n.configure({
  locales: ["en", "es", "ko", "fr", "tr", "pt_br", "zh_cn", "zh_tw"],
  directory: path.join(__dirname, "locales"),
  defaultLocale: "en",
  objectNotation: true,
  register: global,
  logWarnFn: (msg) => console.log("warn", msg),
  logErrorFn: (msg) => console.log("error", msg),
  missingKeyFn: (_locale, value) => value,
  mustacheConfig: { tags: ["{{", "}}"], disable: false },
});

// ---------------------------------------------------------
// Login helper
// ---------------------------------------------------------
function discordLogin() {
  const config  = require("../../config/config.json");
  const token =
    process.env.clienttoken || config.discord?.token || "";

  if (!token) {
    console.log(chalk.gray("—————————————————————————————————"));
    console.log(
      chalk.white("["),
      chalk.red.bold("AntiCrash"),
      chalk.white("]"),
      chalk.gray(" : "),
      chalk.white.bold("Invalid or missing token!")
    );
    console.log(chalk.gray("—————————————————————————————————"));
    return;
  }

  console.log(chalk.gray("—————————————————————————————————"));
  console.log(
    chalk.white("["),
    chalk.green.bold("Discord"),
    chalk.white("]"),
    chalk.gray(" : "),
    chalk.white.bold("Logging in…")
  );
  console.log(chalk.gray("—————————————————————————————————"));

  client.login(token).catch(err => {
    console.error("[Discord] Login failed:", err.message || err);
  });
}

// ---------------------------------------------------------
// Discord debug hooks
// ---------------------------------------------------------
client.on("error", err => {
  console.error("[Discord] Client error:", err.message || err);
});
client.on("warn", info => {
  console.warn("[Discord] Client warn:", info);
});
client.on("shardError", err => {
  console.error("[Discord] Shard error:", err.message || err);
});
client.on("invalidated", () => {
  console.error("[Discord] Client session invalidated.");
});

// ---------------------------------------------------------
// Error / crash handlers
// ---------------------------------------------------------
process.on("unhandledRejection", (reason, p) => {
  if (
    reason ===
    "Error [INTERACTION_ALREADY_REPLIED]: The reply to this interaction has already been sent or deferred."
  )
    return;

  console.log(chalk.gray("—————————————————————————————————"));
  console.log(
    chalk.white("["),
    chalk.red.bold("AntiCrash"),
    chalk.white("]"),
    chalk.gray(" : "),
    chalk.white.bold("Unhandled Rejection")
  );
  console.log(chalk.gray("—————————————————————————————————"));
  console.log(reason, p);
});

process.on("uncaughtException", (err, origin) => {
  console.log(chalk.gray("—————————————————————————————————"));
  console.log(
    chalk.white("["),
    chalk.red.bold("AntiCrash"),
    chalk.white("]"),
    chalk.gray(" : "),
    chalk.white.bold("Uncaught Exception")
  );
  console.log(chalk.gray("—————————————————————————————————"));
  console.log(err, origin);
});

// ---------------------------------------------------------
// Exports
// ---------------------------------------------------------
module.exports = {
  client,
  discordLogin,
};
