import axios from "axios";
import WebSocket from "ws";
import { promises as fsp, readFileSync, watch, unlink } from "fs";
import { Blob } from "buffer";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { exec } from "child_process";
import { Sequelize, DataTypes } from "sequelize";
import config from "./config/runtimeConfig.js";
import { SQLITE_DIR, TTS_DIR as TTS_DIR_BASE, INPUT_DIR, MICAUDIO_DIR, TOKENS_DIR } from "./utils/paths.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { askGPT } = require("../../Addons/API/GPTNODE.js");

import startRecordingAndRunDeepSpeech from "./botnode/micfunction.js";
import playAudioDiscord from "./botnode/discordbot.js";

import { initStreamElements } from "./modules/gateways/streamelements.js";

import express from "express";
import streamlabsRoutes from "./modules/expressapi/streamlabs.js";
import twitchRoutes from "./modules/expressapi/twitch.js";

const app = express();
app.use(express.json());

app.use("/streamlabs", streamlabsRoutes);
app.use("/twitch", twitchRoutes);

// ===[ GLOBALS & SETUP ]===
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VNyan_WS = config.vnyan?.ws || "ws://127.0.0.1:8000/vnyan";
const behaviorsfile = join(__dirname, "systemprompts", "behaviors.txt");
const systemfile = join(__dirname, "systemprompts", "system_prompts.txt");
const emotionsFile = join(__dirname, "systemprompts", "emotions.json");

let ws;
let emotions = {};
let behaviors = {};

// ===[ DATABASE MODULE ]===
const Database = (() => {
  const sequelizequeue = new Sequelize({
    dialect: "sqlite",
    storage: join(SQLITE_DIR, `queue-${config.vtuberai.gptModel}.db`),
    logging: false
  });

  const sequelizebrain = new Sequelize({
    dialect: "sqlite",
    storage: join(SQLITE_DIR, `aibrain-${config.vtuberai.gptModel}.db`),
    logging: false
  });

  const UserEmotion = sequelizebrain.define('UserEmotion', {
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    emotion: { type: DataTypes.STRING, allowNull: false },
    lastUpdated: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  const MemoryItem = sequelizebrain.define("Memory", {
    username: { type: DataTypes.STRING, allowNull: true },
    usercontext: { type: DataTypes.TEXT, allowNull: false },
    useremotion: { type: DataTypes.STRING, allowNull: false },
    airesponse: { type: DataTypes.TEXT, allowNull: false },
    aiemotion: { type: DataTypes.STRING, allowNull: false },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  });

  const Bully = sequelizebrain.define("Bully", {
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    lastOffense: { type: DataTypes.DATE, allowNull: false },
    isBully: { type: DataTypes.BOOLEAN, defaultValue: true },
    pastOffenses: { type: DataTypes.INTEGER, defaultValue: 1 },
  });

  const QueueItem = sequelizequeue.define("QueueItem", {
    username: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    processed: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.STRING, defaultValue: "pending" }, // pending, processing, done
    lastError: { type: DataTypes.TEXT, allowNull: true }
  });

  const init = async () => {
    await sequelizequeue.sync({ alter: true });
    await sequelizebrain.sync({ alter: true });
    console.log("Databases synced.");
  };

  return { init, UserEmotion, MemoryItem, Bully, QueueItem };
})();

// ===[ EMOTION & BEHAVIOR MODULE ]===
const EmotionBehavior = (() => {
  const loadEmotions = () => {
    try {
      console.log("Loading emotions from emotions.json...");
      const data = readFileSync(emotionsFile, "utf8");
      emotions = JSON.parse(data);
    } catch (error) {
      console.error("Failed to load emotions.json:", error);
      emotions = [];
    }
  };

  const loadBehaviors = () => {
    const fileContent = readFileSync(behaviorsfile, "utf8").trim();
    behaviors = {};
    fileContent.split("\n").forEach(line => {
      const match = line.match(/^(\d+)\)\s*([^:]+)(?::\s*(.+))?$/);
      if (match) {
        const [, , trigger, action] = match;
        behaviors[trigger.trim().toLowerCase()] = (action || "").trim();
      }
    });
    console.log("Behaviors updated.");
  };

  const watchFiles = () => {
    watch(emotionsFile, eventType => {
      if (eventType === "change") {
        console.log("Reloading emotions.json...");
        loadEmotions();
      }
    });

    watch(behaviorsfile, (eventType) => {
      if (eventType === "change") {
        console.log("Reloading behavior rules...");
        loadBehaviors();
      }
    });
  };

  return { loadEmotions, loadBehaviors, watchFiles, emotions: () => emotions, behaviors: () => behaviors };
})();

// ===[ VNyan WEBSOCKET MODULE ]===
const VNyan = (() => {
  const connect = () => {
    ws = new WebSocket(VNyan_WS);
    ws.on("open", () => console.log("Connected to VNyan WebSocket"));
    ws.on("error", err => console.error("WebSocket Error:", err.message));
  };

  const triggerExpression = (emotion) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("VNyan WebSocket not connected");
      return;
    }
    ws.send(emotion);
    console.log(`Triggered VNyan emotion: ${emotion}`);
  };

  const triggerHandMovement = (action) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("VNyan WebSocket not connected");
      return;
    }

    const actions = {
      wave: { event: "MoveHand", side: "both", position: { x: 0, y: 100 }, duration: 1.5 },
      point: { event: "MoveHand", side: "right", position: { x: 100, y: 0 }, duration: 1 },
      down: { event: "MoveHand", side: "both", position: { x: 0, y: -100 }, duration: 1 }
    };

    const cmd = actions[action.toLowerCase()];
    if (!cmd) {
      console.log("Unknown hand action:", action);
      return;
    }

    ws.send(JSON.stringify(cmd));
    console.log(`Hand movement: ${action}`);
  };

  return { connect, triggerExpression, triggerHandMovement };
})();

// ===[ BULLY & MEMORY MODULE ]===
const BullyMemory = (() => {
  const detectBullying = (message) => {
    const lower = message.toLowerCase();
    const keywords = ["idiot", "stupid", "hate you", "loser", "die", "kys", "worthless"];
    return keywords.some(kw => lower.includes(kw));
  };

  const markAsBully = async (username) => {
    const [bully, created] = await Database.Bully.findOrCreate({
      where: { username },
      defaults: { lastOffense: new Date() }
    });
    if (!created) {
      await bully.update({
        lastOffense: new Date(),
        isBully: true,
        pastOffenses: bully.pastOffenses + 1
      });
    }
    console.log(`${username} ${created ? "marked" : "remains"} a bully.`);
  };

  const respondToBully = async (username) => {
    const bully = await Database.Bully.findOne({ where: { username } });
    if (!bully) return null;

    const daysSince = (Date.now() - new Date(bully.lastOffense)) / (1000 * 60 * 60 * 24);
    if (daysSince > 5) {
      await bully.update({ isBully: false });
      return `Hey ${username}, you've kept it cool for a bit—let's start fresh and keep it kind.`;
    }
    if (bully.isBully) {
      const recent = daysSince < 1 ? "earlier today" : "recently";
      const lines = [
        `I'm remembering how you came at me ${recent}, ${username}. I'm here to chat, not to be a target.`,
        `${username}, last time wasn't kind. If you want to talk, keep it respectful.`,
        `Let's not repeat the rough vibes from ${recent}, ${username}. Be decent and we can chat.`
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    return null;
  };

  const retrieveMemory = async (context) => {
    return await Database.MemoryItem.findAll({
      where: { usercontext: { [Sequelize.Op.like]: `%${context}%` } },
      order: [["createdAt", "DESC"]],
      limit: 3
    });
  };

  const getRecentMemories = async (username, limit = 5) => {
    return await Database.MemoryItem.findAll({
      where: { username },
      order: [["createdAt", "DESC"]],
      limit
    });
  };

  const searchMemoriesByUserAndText = async (username, text, limit = 3) => {
    const terms = text.split(/\s+/).filter(Boolean).slice(0, 4);
    if (terms.length === 0) return [];
    return await Database.MemoryItem.findAll({
      where: {
        username,
        usercontext: { [Sequelize.Op.like]: `%${terms.join("%")}%` }
      },
      order: [["createdAt", "DESC"]],
      limit
    });
  };

  const storeMemory = async (username, message, gptResponse, aiEmotion) => {
    const userEmotion = await detectEmotion(message);
    const safeMessage = filterSensitiveContent(message).replace('@ ', '');
    await Database.MemoryItem.create({
      username,
      usercontext: safeMessage,
      useremotion: userEmotion,
      airesponse: gptResponse,
      aiemotion: aiEmotion,
      createdAt: new Date()
    });
    console.log(`Memory stored for ${username} (Emotion: ${userEmotion})`);
  };

  return {
    detectBullying,
    markAsBully,
    respondToBully,
    retrieveMemory,
    getRecentMemories,
    searchMemoriesByUserAndText,
    storeMemory
  };
})();

// ===[ FILTER & EMOTION DETECTION ]===
const detectEmotion = async (message) => {
  const lower = message.toLowerCase();
  const emotions = [
    { name: "happy", triggers: ["yay", "good", "excited", "happy"] },
    { name: "sad", triggers: ["sad", "cry", "upset", "down", "heartbroken"] },
    { name: "angry", triggers: ["angry", "mad", "furious", "hate"] }
  ];
  for (const { name, triggers } of emotions) {
    if (triggers.some(t => lower.includes(t))) return name;
  }
  return "neutral";
};

// ===[ GPT & QUEUE MODULE ]===
const GPTQueue = (() => {
  const resetStuckQueueItems = async () => {
    const timeout = Date.now() - 10 * 60 * 1000; // 10 minutes
    const [count] = await Database.QueueItem.update(
      { status: "pending", processed: false, lastError: null },
      {
        where: {
          status: "processing",
          updatedAt: { [Sequelize.Op.lt]: new Date(timeout) }
        }
      }
    );
    if (count > 0) {
      console.log(`Reset ${count} stuck queue item(s) to pending.`);
    }
  };

  let processingQueue = false;

  const GPTTIME = async (username, message, queueItem, memoriesForContext = []) => {
    const memoryContext = memoriesForContext
      .map(
        (m) =>
          `On ${new Date(m.createdAt).toISOString()}, ${m.username || "user"} said "${m.usercontext}". You replied "${m.airesponse}". (User felt: ${m.useremotion}, You felt: ${m.aiemotion})`
      )
      .join("\n");

    const memoryBlock = memoryContext
      ? `Use these recent memories to stay consistent:\n${memoryContext}`
      : "No prior memories available for this user. Stay consistent with your existing persona.";

    const response = await askGPT("/chat/completions", "POST", {
      model: config.vtuberai.gptModel,
      messages: [
        {
          role: "system",
          content: `${memoryBlock}`
        },
        { role: "user", content: `${username} said: ${message}` }
      ],
      stream: false
    });

    const gptResponse =
      response?.choices?.[0]?.message?.content ||
      response?.choices?.[0]?.text ||
      "";
    const emotion = await detectEmotion(gptResponse);

    await BullyMemory.storeMemory(username, message, gptResponse, emotion);
    await TTS.speakTTS(gptResponse, queueItem);
  };

  const processWithMemoryOrGPT = async (username, message, queueItem) => {
    // 1. Bully Check
    const bullyResponse = await BullyMemory.respondToBully(username);
    if (bullyResponse) {
      TTS.speakTTS(bullyResponse, queueItem);
      VNyan.triggerExpression("angry");
      return;
    }

    // 2. Bully Detection
    if (config.filters?.bullyPhrases?.some(p => message.toLowerCase().includes(p.toLowerCase()))) {
      await BullyMemory.markAsBully(username);
      TTS.speakTTS("That's not very nice... I remember how you treat me.", queueItem);
      VNyan.triggerExpression("sad");
      return;
    }

    // 3. Memory Recall (user + text match)
    const memory = await BullyMemory.searchMemoriesByUserAndText(username, message, 1);
    if (memory.length > 0) {
      const { airesponse, aiemotion } = memory[0];
      console.log("Using memory response:", airesponse);
      TTS.speakTTS(airesponse, queueItem);
      VNyan.triggerExpression(aiemotion);
      return;
    }

    // 4. Update Emotion & GPT with memory context
    await Database.UserEmotion.upsert({
      username,
      emotion: await detectEmotion(message),
      lastUpdated: new Date()
    });

    const recentMemories = await BullyMemory.getRecentMemories(username, 5);
    GPTTIME(username, message, queueItem, recentMemories);
  };

  const processQueue = async () => {
    if (processingQueue) return;
    processingQueue = true;
    await resetStuckQueueItems();

    try {
      // loop until no more pending items
      while (true) {
        const item = await Database.QueueItem.findOne({
          where: { status: { [Sequelize.Op.or]: ["pending", null] } },
          order: [["createdAt", "ASC"]],
        });
        if (!item) break;

        await item.update({ status: "processing", processed: false, lastError: null });

        try {
          await processWithMemoryOrGPT(item.username, item.message, item);
          await item.destroy();
        } catch (err) {
          console.error("Queue processing error:", err);
          await item.update({ status: "pending", processed: false, lastError: err.message });
        }
      }
    } finally {
      processingQueue = false;
    }
  };

  const addToQueue = async (username, message) => {
    await Database.QueueItem.create({ username, message, status: "pending", processed: false });
    processQueue();
  };

  return { addToQueue, processQueue };
})();

// ===[ TTS & AUDIO MODULE ]===
  const TTS = (() => {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const TTS_DIR = TTS_DIR_BASE;
    const RVC_API = config.rvc?.api || "http://84.46.248.182:5050"; // RVC server

  const fetchWithFallback = async (...args) => {
    if (typeof fetch !== "undefined") return fetch(...args);
    const mod = await import("node-fetch");
    const f = mod.default || mod;
    return f(...args);
  };

  const pickVoiceProfile = (voice) => {
    // Default profile (Nekoo) unless matched below
    const profile = {
      rvcModel: "Nekoo",
      gender: "en_US-amy-medium",
      pitch: 11,
    };

    if (voice === "gordon-ramsay") {
      return { rvcModel: "GordonRamsay", gender: "en_GB-alan-medium", pitch: 0 };
    }
    if (voice === "rocket-guardian-of-the-galaxy") {
      return { rvcModel: "Rocket", gender: "en_GB-alan-medium", pitch: 3.5 };
    }
    if (voice === "paimon-genshin") {
      return { rvcModel: "Paimon", gender: "en_US-amy-medium", pitch: 9.5 };
    }
    if (voice === "shylilly-vtuber") {
      return { rvcModel: "Shylilly", gender: "en_US-amy-medium", pitch: 9.5 };
    }
    if (voice === "filian-vtuber") {
      return { rvcModel: "Fillian", gender: "en_US-amy-medium", pitch: 9.5 };
    }
    if (voice === "fallout-76-price-checker") {
      return { rvcModel: "Codsworth", gender: "en_GB-alan-medium", pitch: 0 };
    }
    if (voice === "franklin-gta5") {
      return { rvcModel: "Franklin", gender: "en_GB-alan-medium", pitch: 0 };
    }

    return profile;
  };

  /**
   * Generate TTS audio, convert with RVC, and return final wav path.
   */
  const runTTSRVC = async (text, voice = config.vtuberai.voice) => {
    await fsp.mkdir(TTS_DIR, { recursive: true });

    const { rvcModel, gender, pitch } = pickVoiceProfile(voice);
    const rawFile = join(TTS_DIR, `${Date.now()}-RAW-${voice}.wav`);

    // 1) Generate base TTS
    const ttsEndpoint = config.tts?.baseURL || "http://75.119.148.51:3456/tts";
    const ttsRes = await axios.post(
      ttsEndpoint,
      { text, voice: gender },
      { responseType: "arraybuffer" }
    );
    await fsp.writeFile(rawFile, ttsRes.data);

    // 2) Send to RVC
    const baseAudioBuffer = await fsp.readFile(rawFile);
    const { Client } = await import("@gradio/client");
    const client = await Client.connect(RVC_API);

    const audioBlob = new Blob([baseAudioBuffer], { type: "audio/wav" });
    const result = await client.predict("/process_audio", {
      audio_path: audioBlob,
      model_name: rvcModel,
      pitch,
      f0method: "harvest",
      index_rate: 0.5,
      filter_radius: 3,
      rms_mix_rate: 1,
      protect: 0.33,
      device: "cuda:0",
    });

    const fileUrl = result?.data?.[0]?.url;
    if (!fileUrl) {
      throw new Error("No file URL returned from RVC server");
    }

    // 3) Download final wav
    const res = await fetchWithFallback(fileUrl);
    const arrayBuf = await res.arrayBuffer();
    const finalBuffer = Buffer.from(arrayBuf);

    const finalFile = join(TTS_DIR, `${Date.now()}-${voice}-FINAL.wav`);
    await fsp.writeFile(finalFile, finalBuffer);

    // Best-effort cleanup of raw file
    try {
      await fsp.unlink(rawFile);
    } catch (err) {
      console.warn("Could not delete raw TTS file:", err.message);
    }

    console.log(`Using RVC model: ${rvcModel}`);
    console.log("Saved final file:", finalFile);
    return finalFile;
  };

  const playAndHandleQueue = async (outputFile, queueItem) => {
    if (config.discordbotcfg.enable) {
      await playAudioDiscord(outputFile);
      if (queueItem) {
        await queueItem.destroy();
        GPTQueue.processQueue();
      }
    } else {
      const audioDevice = `"AI Line (Virtual Audio Cable)"`;
      exec(`sox "${outputFile}" -t waveaudio ${audioDevice}`, async (err) => {
        if (err) console.error("Playback error:", err);

        unlink(outputFile, (unlinkErr) => {
          if (unlinkErr) console.error("Delete error:", unlinkErr);
          else console.log("Output file deleted.");
          if (config.mic.enable) startRecordingAndRunDeepSpeech();
        });

        if (queueItem) {
          await queueItem.destroy();
          GPTQueue.processQueue();
        }
      });
    }
  };

  const speakTTS = async (text, queueItem, voice = config.vtuberai.voice) => {
    console.log(`GPT Reply: ${text}`);

    try {
      const outputFile = await runTTSRVC(text, voice);
      await playAndHandleQueue(outputFile, queueItem);
    } catch (err) {
      console.error("TTS/RVC Error:", err);
      if (queueItem) {
        queueItem.processed = false;
        await queueItem.save();
      }
    }
  };

  const speakMessageTTS = async (text, voice = config.vtuberai.voice) => {
    console.log(`Speaking: ${text}`);
    try {
      const outputFile = await runTTSRVC(text, voice);
      await playAndHandleQueue(outputFile, null);
    } catch (err) {
      console.error("TTS/RVC Error:", err);
    }
  };

  return { speakTTS, speakMessageTTS };
})();

function filterSensitiveContent(message) {

  // Regular expression patterns for more advanced detection
  const sensitivePatterns = [/died/i, /lost (my|someone)/i, /divorced/i, /fired/i];

  // Check for sensitive keywords
  if (config.filters?.sensitiveKeywords?.some(keyword => message.toLowerCase().includes(keyword))) {
    return "Something happened, but they’re staying strong!";
  }

  // Check for more complex patterns
  for (const pattern of sensitivePatterns) {
    if (pattern.test(message)) {
      return "Something happened, but they’re staying strong!";
    }
  }

  return message; // If nothing sensitive, return the original message.
}


// ===[ EXPORTS ]===
export const addToQueue = GPTQueue.addToQueue;
export const speakMessageTTS = TTS.speakMessageTTS;

// ===[ INITIALIZATION ]===
(async () => {
  await fsp.mkdir(SQLITE_DIR, { recursive: true });
  await fsp.mkdir(TTS_DIR_BASE, { recursive: true });
  await fsp.mkdir(INPUT_DIR, { recursive: true });
  await fsp.mkdir(MICAUDIO_DIR, { recursive: true });
  await fsp.mkdir(TOKENS_DIR, { recursive: true });
  await Database.init();
  EmotionBehavior.loadEmotions();
  EmotionBehavior.loadBehaviors();
  EmotionBehavior.watchFiles();
  VNyan.connect();
  initStreamElements();
  //initStreamLabs();

  if (config.twitchchat?.enable) {
    await import("./botnode/twitchbot.js");
  }

  if (config.mic.enable) {
    console.log("Mic Press F9 to toggle microphone on/off.");
    startRecordingAndRunDeepSpeech();
  } else {
    console.log("Mic listening is disabled in config.");
  }

  GPTQueue.processQueue();

  app.listen(3000, () => console.log("Server running on port 3000"));
})();
