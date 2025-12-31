const { client } = require("../index");
const chalkImport = require("chalk");
const chalk = chalkImport.default || chalkImport;
const fetch = require("node-fetch");
const { version: discordjsVersion, ActivityType } = require("discord.js");
const pjson = require("../../../package.json");

let botReady = false;
let GuildChis, ChannelChis;

// Helper to update bot presence
const setBotPresence = async (activity, type = ActivityType.Watching, url = null) => {
  client.user.setPresence({
    activities: [{ name: activity, type, url }],
    status: "dnd",
  });
};

// Fetch stream data and update bot presence
const updateStreamPresence = async () => {
  try {
    const response = await fetch(`https://api.nekosunevr.co.uk/v5/social/api/twitch/${client.config.discord.API.twitchuser}`, {
      method: "GET",
      headers: {
        "nekosunevr-api-key": client.config.discord.API.MYAPIKEY,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    if (data.livestream && data.livestream.online) {
      await setBotPresence(
        `[LIVE] [${data.livestream.game}] ${data.livestream.title}`,
        ActivityType.Streaming,
        `https://www.twitch.tv/${client.config.discord.API.twitchuser}`
      );
    } else {
      rotatePresenceMessages();
    }
  } catch (error) {
    console.error(chalk.red("Error fetching stream data:"), error);
    rotatePresenceMessages();
  }
};

// Rotate presence messages when offline
const rotatePresenceMessages = () => {
  const messages = [
    `/help || RAWR! || IM A BIG CUTIE`,
    `/help || NEKO BOT || MY MASTER NEKOSUNEVR IS A CUTIE!`,
    `/help || NEKO BOT || NOTICE ME SENPAI!! UWU`,
    `/help || NEKO BOT || BOT Version: ${pjson.version} (BETA) [GETTING REAMPED CODE SOON]`,
    `/help || NEKO BOT || Connected: ${client.guilds.cache.size} ${
      client.guilds.cache.size > 1 ? "Servers" : "Server"
    }`,
    `/help || NEKO BOT || Serving: ${client.guilds.cache.reduce((a, b) => a + b.memberCount, 0)} ${
      client.guilds.cache.reduce((a, b) => a + b.memberCount, 0) > 1 ? "Users," : "User,"
    }`,
    `/help || NEKO BOT || DONATE TO US KEEP OUR SERVERS ACTIVE ON OUR PATREON £1 a Month WITH PERKS /patreon in SERVERS`,
  ];

  let i = 0;
  const interval = setInterval(() => {
    if (i >= messages.length) {
      clearInterval(interval);
      return;
    }
    setBotPresence(messages[i]);
    i++;
  }, 10000);
};

client.on("ready", async () => {
  console.log(chalk.red.bold("———————————————[Ready MSG]———————————————"));

  // Initialize support server and channel references
  GuildChis = client.guilds.cache.get(client.config.discord.TestingServerID);
  if (GuildChis) ChannelChis = GuildChis.channels.cache.get(client.config.discord.TestingServerCID);

  if (!ChannelChis) {
    console.log(chalk.red.bold("——————————[SERVER CHECK]——————————"));
    console.log(
      chalk.gray(
        `[Checking Support Server]: A matching channel could not be found. Check your DISCORD_SERVERID and DISCORD_CHANNELID.`
      )
    );
  } else {
    console.log(chalk.gray(`[Checking Support Server]: ${client.user.username} is ready!`));
    botReady = true;
  }

  client.botReady = botReady;

  console.log(chalk.red.bold("——————————[BOT DETAILS]——————————"));
  console.log(`Logged in as ${chalk.yellow(client.user.username)} (${client.user.id})`);
  console.log(chalk.gray(`Connected to ${client.guilds.cache.size} servers.`));

  // Fetch and set initial bot presence
  updateStreamPresence();
  setInterval(updateStreamPresence, 110000);

  console.log(chalk.red.bold("——————————[Statistics]——————————"));
  console.log(
    chalk.gray(
      `Discord.js Version: ${discordjsVersion}\nNode: ${process.version}\nPlatform: ${process.platform} ${process.arch}`
    )
  );
  console.log(
    chalk.gray(
      `Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB RSS | ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB Heap`
    )
  );
});
