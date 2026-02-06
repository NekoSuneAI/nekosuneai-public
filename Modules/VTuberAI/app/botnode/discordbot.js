import config from "../config/runtimeConfig.js";

// Import the createRequire function to dynamically import CommonJS modules
import { createRequire } from 'module';

// Create a require function
const require = createRequire(import.meta.url);

import { Client, GatewayIntentBits, REST, Routes, ApplicationCommandOptionType } from "discord.js";
import { existsSync, writeFileSync, readFileSync, watch } from "fs";
import { join } from "path";
import { addToQueue } from "../index.js";

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Now you can use `require` to import CommonJS modules
const { addSpeechEvent, SpeechEvents } = require('discord-speech-recognition');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require("@discordjs/voice");

// Get the directory name from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define the folder and file to watch
const outputFolder = join(__dirname, "..", "output");
const outputFile = join(outputFolder, "output.wav");

const discordbot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const voiceConnections = new Map();
const voicechannelcfg = join(
  __dirname,
  "..",
  "systemprompts",
  "connections.json"
);

function loadVoiceConnections() {
  if (!existsSync(voicechannelcfg)) {
    writeFileSync(voicechannelcfg, JSON.stringify([]), "utf8");
    console.log(
      "❌ No previous connections found, starting fresh and created 'connections.json'."
    );
  }

  try {
    const data = readFileSync(voicechannelcfg, "utf8");
    const connectionsData = JSON.parse(data);

    connectionsData.forEach(data => {
      voiceConnections.set(data.guildId, data);
    });

    console.log("✅ Discord Loaded voice connections.");
  } catch (error) {
    console.error("❌ Error loading voice connections:", error);
  }
}

function saveVoiceConnections() {
  const dataToSave = Array.from(voiceConnections.values()).map(connection => ({
    guildId: connection.guildId,
    channelId: connection.channelId
  }));

  writeFileSync(voicechannelcfg, JSON.stringify(dataToSave), "utf8");
  console.log("✅ Saved voice connections.");
}


if (config.discordbotcfg.enable) {

loadVoiceConnections();

addSpeechEvent(discordbot);
}

// Register slash commands when bot starts
discordbot.once("ready", async () => {
  console.log(`✅ [Discord]: Logged in as ${discordbot.user.tag}`);

  // Registering commands
  const commands = [
    {
      name: "join",
      description: "Join a voice channel"
    },
    {
      name: "leave",
      description: "Leave the current voice channel"
    }
  ];

  const rest = new REST({ version: "10" }).setToken(config.discordbotcfg.token);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        config.discordbotcfg.clientId,
        config.discordbotcfg.guildId
      ),
      {
        body: commands
      }
    );
    console.log("✅ Slash commands registered successfully!");
  } catch (error) {
    console.error("❌ Error registering slash commands:", error);
  }
});

// Handle slash commands
discordbot.on("interactionCreate", async interaction => {
  if (!interaction.isCommand()) return;

  if (!config.discordbotcfg.admins.includes(interaction.user.id)) {
    return interaction.reply("❌ You are not authorized to use this bot.");
  }

  const { commandName } = interaction;

  if (commandName === "join") {
    const channel = interaction.member.voice.channel;
    if (!channel)
      return interaction.reply("❌ You need to join a voice channel first!");

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false
    });

    // Add only essential data to the voiceConnections Map
    voiceConnections.set(interaction.guild.id, connection);

    return interaction.reply("✅ Joined the voice channel!");
  }

  if (commandName === "leave") {
    const connection = voiceConnections.get(interaction.guild.id);
    if (!connection) return interaction.reply("❌ I'm not in a voice channel!");

    connection.destroy();
    voiceConnections.delete(interaction.guild.id);

    return interaction.reply("✅ Left the voice channel!");
  }
});

discordbot.on(SpeechEvents.speech, msg => {
  // If bot didn't recognize speech, content will be empty
  if (!msg.content) return;

  addToQueue(msg.author.globalName, msg.content);
});

// Play audio function to be used both for Discord and local (TTS)
async function playAudioDiscord(filePath) {
  const connection = voiceConnections.get(config.discordbotcfg.guildId);
  const resource = createAudioResource(filePath);
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  player.play(resource);
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, async () => {
    console.log("✅ Playback finished.");
  });

  player.on("error", error => {
    console.error("Audio error:", error);
  });
}

// Listen for the bot to shut down or restart and save the current connections
process.on("SIGINT", () => {
  console.log("Bot is shutting down...");
  saveVoiceConnections();
  process.exit();
});

async function initDiscordBot() {
    if (config.discordbotcfg.enable) {
      await discordbot.login(config.discordbotcfg.token);
    }
}
  
// Call the function when needed
initDiscordBot();

export default playAudioDiscord;
