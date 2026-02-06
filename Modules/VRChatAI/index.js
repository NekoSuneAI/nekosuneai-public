const { config } = require("../config");
const { sequelize } = require("./AI/Addons/DB/db");
require("./models/Message");
require("./models/MusicQueueItem");

const {
  startRecordingAndRunDeepSpeech,
  voskLoader
} = require("./AI/VOICEModules/Main");
const { loadTtsConfigs } = require("./AI/VOICEModules/Speak");
const { sendToWebhookerror } = require("./AI/Addons/Webhooks");
const { LoadsReadOSC } = require("./AI/Addons/OSC/Recieved");

const {
  ensureVoskModelDownloaded,
  setupPiper,
  setupWhisper
} = require("../Addons/installer");

async function startAiSystem() {
  startRecordingAndRunDeepSpeech();
  (async () => {
    if (sequelize) {
      await sequelize.sync();
    } else {
      console.warn("[DB] Skipping sqlite sync (sqlite3 not installed).");
    }
    if (config.addons.music?.toggle) {
      const { initQueueFromStorage } = require("./AI/Addons/musicdb/MusicQueue");
      initQueueFromStorage();
    }
  })();
}

function startVRChatAI() {
  require("log-timestamp");
  const chalkImport = require("chalk");
  const chalk = chalkImport.default || chalkImport;

  if (config.addons.AI.toggle == true) {
    const mode = (config.engineMode || "").toLowerCase();
    const sttProvider = (config.addons.AI.sttProvider || "").toLowerCase();
    const ttsProvider = (config.addons.AI.ttsProvider || "").toLowerCase();
    const useLocalStt =
      mode === "normal" && (sttProvider === "vosk" || sttProvider === "vosk_local");
    const useLocalWhisper =
      mode === "normal" && (sttProvider === "whisper" || sttProvider === "whisper_local" || sttProvider === "both");
    const useLocalTts =
      mode === "normal" && (ttsProvider === "piper" || ttsProvider === "piper_local");

    (async () => {
      try {
        if (useLocalTts) {
          await setupPiper();
          await loadTtsConfigs();
        }
        if (useLocalWhisper) {
          await setupWhisper();
        }
        if (useLocalStt) {
          await ensureVoskModelDownloaded(voskLoader);
        }
        await startAiSystem();
        LoadsReadOSC();
      } catch (err) {
        console.error("AI initialization failed:", err.message);
      }
    })();
  }

  if (config.addons.FriendsSystem.toggle == true) {
    const { VRCFriends } = require("./FriendsSystem/Modules/VRChat");
    const { BOTAPIPOINT } = require("./FriendsSystem/Modules/Web");
    VRCFriends();
    BOTAPIPOINT();
  }

  if (config.discord.toggle == true) {
    const { discordLogin } = require("../DiscordBOT/index");
    discordLogin();
  }

  process.on("unhandledRejection", (reason, p) => {
    if (
      reason ===
      "Error [INTERACTION_ALREADY_REPLIED]: The reply to this interaction has already been sent or deferred."
    )
      return;

    console.log(chalk.gray("----------------------------------------------------------------"));
    console.log(
      chalk.white("["),
      chalk.red.bold("AntiCrash"),
      chalk.white("]"),
      chalk.gray(" : "),
      chalk.white.bold("Unhandled Rejection/Catch")
    );
    console.log(chalk.gray("----------------------------------------------------------------"));

    sendToWebhookerror(`NekoSuneAI Error (unhandledRejection)`, reason);
    console.log(reason, p);
    startRecordingAndRunDeepSpeech();
  });
  process.on("uncaughtException", (err, origin) => {
    console.log(chalk.gray("----------------------------------------------------------------"));
    console.log(
      chalk.white("["),
      chalk.red.bold("AntiCrash"),
      chalk.white("]"),
      chalk.gray(" : "),
      chalk.white.bold("Uncaught Exception/Catch")
    );
    console.log(chalk.gray("----------------------------------------------------------------"));

    sendToWebhookerror(`NekoSuneAI Error (uncaughtException)`, err);
    console.log(err, origin);
    startRecordingAndRunDeepSpeech();
  });
}

module.exports = {
  startVRChatAI
};
