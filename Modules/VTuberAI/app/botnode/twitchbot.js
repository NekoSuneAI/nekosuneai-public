import config from "../config/runtimeConfig.js";
import rewardTypes from "../../../../config/rewardsTwitch.json" with { type: "json" };
import { Client } from "tmi.js";
import { addToQueue } from "../index.js";
import { getValidTwitchToken } from "../modules/gateways/twitch_oauth.js";

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store connected channels
let connectedChannels = [];

const useAnonymous =
  !config.twitchchat.username;

let twitchbot;

if (useAnonymous) {
  // 👤 Anonymous connection
  console.log("[TWITCH] Connecting anonymously…");

  twitchbot = new Client({
    connection: {
      reconnect: config.twitchchat.options.reconnect,
      secure: true
    },
    options: {
      debug: config.twitchchat.options.debug
    },
    identity: null, // ← THIS FORCES ANONYMOUS MODE
    channels: config.twitchchat.channels
  });

} else {
  // 🔐 Authenticated connection
  console.log("[TWITCH] Connecting with bot account…");

  const token = await getValidTwitchToken();

  if (!token) {
    console.error("[TMI] No OAuth token! Login at /twitch/auth");
  }

  twitchbot = new Client({
    connection: {
      reconnect: config.twitchchat.options.reconnect,
      secure: true
    },
    options: {
      debug: config.twitchchat.options.debug
    },
    identity: {
      username: config.twitchchat.username,
      password: `oauth:${token}`
    },
    channels: config.twitchchat.channels
  });
}

twitchbot.on("connecting", (address, port) => {
  console.log("🔄 [Twitch]: Connecting");
});

twitchbot.on("connected", (address, port) => {
  console.log("✅ [Twitch]: Connected to Twitch WSS");
  // Add all channels to the connectedChannels array when the bot connects
  config.twitchchat.channels.forEach(channel => {
    if (!connectedChannels.includes(channel)) {
      connectedChannels.push(channel);
      console.log(`✅ [Twitch]: Connected to channel: ${channel}`);
    }
  });
});

twitchbot.on("disconnected", (reason) => {
  console.log("❌ [Twitch]: Disconnected from Twitch WSS");
  // Remove channels from the connectedChannels array when disconnected
  config.twitchchat.channels.forEach(channel => {
    const index = connectedChannels.indexOf(channel);
    if (index > -1) {
      connectedChannels.splice(index, 1);
      console.log(`❌ [Twitch]: Disconnected from channel: ${channel}`);
    }
  });
});

// Handle reconnect event and track disconnected channels
twitchbot.on("reconnect", () => {
  console.log("🔄 [Twitch]: Reconnecting to Twitch WSS...");

  // Track which channels were disconnected during the reconnection
  const disconnectedChannels = [...connectedChannels]; // Make a copy of the connected channels

  // Log the channels that are being reconnected
  console.log(`Disconnected channels: ${disconnectedChannels.join(', ')}`);

  // Optionally, log the channels still connected after reconnection attempt
  setTimeout(() => {
    console.log(`Currently connected channels after reconnect: ${connectedChannels.join(', ')}`);
  }, 2000); // Delay to allow the bot to reconnect (you can adjust the delay)
});

twitchbot.on("message", (channel, tags, message, self) => {
  if (self) return; // Ignore messages from the bot

  const username = tags.username || tags["display-name"];
  let lowerMessage = message.toLowerCase(); // Normalize message to lowercase

  if (config.twitchchat.onlycmd) {
    if (message.startsWith("!askgpt ")) {
      const question = message.slice(8).trim(); // Extract the question
      if (question.length > 0) {
        addToQueue(username, question);
      } else {
        twitchbot.say(
          channel,
          `@${username}, please provide a question for GPT.`
        );
      }
    }
  } else {
    // Keywords to detect
    const triggerWords = ["hey nekosuneai", "nekosuneai", "@nekosuneai"];

    // Check if message contains any of the trigger words
    if (triggerWords.some((word) => lowerMessage.includes(word))) {
      //twitchbot.say(channel, `@${username}, how can I assist you?`);

      // Match "hey NekoSuneAI", "NekoSuneAI", or "@nekosuneai" and remove them
      lowerMessage = lowerMessage.replace(/\b(?:hey\s+)?@?nekosuneai\b/gi, "").trim();
      addToQueue(username, lowerMessage);
    }
  }
});

twitchbot.on("join", (channel, username, self) => {
  console.log(`✅ [Twitch]: ${username} has Connected to channel: ${channel}`);
});

twitchbot.on("part", (channel, username, self) => {
  console.log(`❌ [Twitch]: ${username} has Disconnected from channel: ${channel}`);
});

/*twitchbot.on("subscription", (channel, username, method, message, userstate) => {
    console.log(`💰 [Twitch]: ${username} has Subscribed to channel: ${channel}`);
    addToQueue(username, `Has Subscribed on Twitch with message: ${message}, what will you say for support they do for channel?`);
});

twitchbot.on("resub", (channel, username, months, message, userstate, methods) => {
    // Do your stuff.
    let cumulativeMonths = ~~userstate["msg-param-cumulative-months"];
    console.log(`💰 [Twitch]: ${username} has Re-Subscribed to channel: ${channel} for ${cumulativeMonths} Months`);
    addToQueue(username, `Has Re-Subscribed on Twitch for ${months} Months with message: ${message}, what will you say for support they do for channel?`);
});

twitchbot.on("subgift", (channel, username, streakMonths, recipient, methods, userstate) => {
    // Do your stuff.
    let senderCount = ~~userstate["msg-param-sender-count"];
    console.log(`💰 [Twitch]: ${username} has Gifted Subscribed to channel: ${channel} for ${senderCount} Users`);
    addToQueue(username, `Has Gifted Subscribed on Twitch for ${senderCount} Amount, what will you say for support they do for channel?`);
});

twitchbot.on("submysterygift", (channel, username, numbOfSubs, methods, userstate) => {
    // Do your stuff.
    let senderCount = ~~userstate["msg-param-sender-count"];
    console.log(`💰 [Twitch]: ${username} has Gifted Mystery Subscribed to channel: ${channel} for ${senderCount} Users`);
    addToQueue(username, `Someone Has Mystery Gifted Subscribed on Twitch for ${senderCount} Amount, what will you say for support they do for channel and been a anonymous gifted too?`);
});

twitchbot.on("cheer", (channel, userstate, message) => {
    console.log(`💰 [Twitch]: ${userstate.username} has Send ${userstate.bits} Bits to channel: ${channel}`);
    addToQueue(username, `Has Send ${userstate.bits} Bits on Twitch with message: ${message}, what will you say for support they do for channel?`);
});*/

twitchbot.on("redeem", (channel, username, rewardType, tags, message) => {
  console.log(rewardType)
  // Check if the rewardType is in the rewardTypes array
  //const reward = rewardTypes.find(r => r.id === rewardType);

  /*if (reward) {
    console.log(`${username} redeemed: ${reward.label}`); // Optional: Log the reward label
    addToQueue(username, message);
  }*/
});

async function initTwitchBot() {
  if (config.twitchchat.enable) {
    await twitchbot.connect()
  }
}

// Call the function when needed
initTwitchBot();

export default twitchbot;
