const client = require("../index");
const chalk = require("chalk");
const { version: discordjsVersion, ActivityType } = require("discord.js");
const pjson = require("../package.json");

let botReady = false;
let GuildChis, ChannelChis;
let presenceInterval = null; // ensure we don't stack intervals

// --- tiny helpers ---
const getUserSafe = () => client.user ?? null;
const getUsername = () => getUserSafe()?.username ?? "Unknown User";
const getUserId = () => getUserSafe()?.id ?? "unknown-id";
const safeGuildCount = () => client.guilds?.cache?.size ?? 0;
const safeUserTotal = () => {
  try {
    return client.guilds.cache.reduce((acc, g) => acc + (g?.memberCount ?? 0), 0);
  } catch {
    return 0;
  }
};

// Helper to update bot presence
const setBotPresence = async (activity, type = ActivityType.Watching, url = null) => {
  const u = getUserSafe();
  if (!u) return; // avoid crash if user not yet available
  client.user.setPresence({
    activities: [{ name: activity, type, url }],
    status: "dnd",
  });
};

// Fetch stream data and update bot presence
const updateStreamPresence = async () => {
  try {
      rotatePresenceMessages();
  } catch (error) {
    console.error(chalk.red("Error fetching stream data:"), error);
    rotatePresenceMessages();
  }
};

// Rotate presence messages when offline (no stacking)
const rotatePresenceMessages = () => {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }

  const messages = [
    `/help || NekoSuneAI || Developed by NekoSuneVR`,
    `/help || NekoSuneAI || BOT Version: ${pjson.version} (BETA)`,
    `/help || NekoSuneAI || Connected: ${safeGuildCount()} ${safeGuildCount() === 1 ? "Server" : "Servers"}`,
    `/help || NekoSuneAI || Serving: ${safeUserTotal()} ${safeUserTotal() === 1 ? "User," : "Users,"}`,
    `/help || NekoSuneAI || DONATE TO NekoSuneVR Keep Servers Active on they Pateron/Ko-FI`,
  ];

  let i = 0;
  presenceInterval = setInterval(() => {
    if (i >= messages.length) {
      clearInterval(presenceInterval);
      presenceInterval = null;
      return;
    }
    setBotPresence(messages[i]);
    i += 1;
  }, 10_000);
};

client.once("ready", async () => {
  console.log(chalk.red.bold("———————————————[Ready MSG]———————————————"));

  // If, for any reason, user isn't populated yet, bail safely (prevents null .username).
  if (!getUserSafe()) {
    console.warn(chalk.yellow("[READY] Client user not available yet — deferring initialization by 1s."));
    setTimeout(() => client.emit("ready"), 1000);
    return;
  }

  // Initialize support server and channel references
  GuildChis = client.guilds.cache.get(client.config.botcfg.TestingServerID) ?? null;
  ChannelChis = GuildChis?.channels?.cache?.get(client.config.botcfg.TestingServerCID) ?? null;

  if (!ChannelChis) {
    console.log(chalk.red.bold("——————————[SERVER CHECK]——————————"));
    console.log(
      chalk.gray(
        `[Checking Support Server]: A matching channel could not be found. Check your DISCORD_SERVERID and DISCORD_CHANNELID.`
      )
    );
  } else {
    console.log(chalk.gray(`[Checking Support Server]: ${getUsername()} is ready!`));
    botReady = true;
  }

  client.botReady = botReady;

  console.log(chalk.red.bold("——————————[BOT DETAILS]——————————"));
  console.log(`Logged in as ${chalk.yellow(getUsername())} (${getUserId()})`);
  console.log(chalk.gray(`Connected to ${safeGuildCount()} servers.`));

  // Fetch and set initial bot presence
  updateStreamPresence();
  setInterval(updateStreamPresence, 110_000);

  console.log(chalk.red.bold("——————————[Statistics]——————————"));
  console.log(
    chalk.gray(
      `Discord.js Version: ${discordjsVersion}\nNode: ${process.version}\nPlatform: ${process.platform} ${process.arch}`
    )
  );

  const mem = process.memoryUsage();
  console.log(
    chalk.gray(
      `Memory: ${(mem.rss / 1024 / 1024).toFixed(2)} MB RSS | ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB Heap`
    )
  );

  // Optional: log blacklist counts if you use them elsewhere
  console.log(chalk.gray(`Blacklist: ${blockServers} servers, ${blockUsers} users`));
});