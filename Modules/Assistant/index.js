const { config } = require("../config");
const { sequelize } = require("../VRChatAI/AI/Addons/DB/db");
const initAssistantItem = require("./models/AssistantItem");
const { wakewordLoop } = require("./WakeWord");
const {
  startRecordingAndRunDeepSpeech,
  voskLoader
} = require("../VRChatAI/AI/VOICEModules/Main");
const { loadTtsConfigs } = require("../VRChatAI/AI/VOICEModules/Speak");

const {
  ensureVoskModelDownloaded,
  setupPiper,
  setupWhisper,
  setupWakeword
} = require("../Addons/installer");

function initAssistantDb() {
  if (!sequelize) {
    console.warn("[Assistant] DB unavailable; assistant storage disabled.");
    return;
  }
  initAssistantItem(sequelize);
  sequelize.sync().catch(err => {
    console.warn("[Assistant] Failed to sync assistant DB:", err.message || err);
  });
}

async function startAiSystem() {
  startRecordingAndRunDeepSpeech();
  (async () => {
    if (sequelize) {
      await sequelize.sync();
    } else {
      console.warn("[DB] Skipping sqlite sync (sqlite3 not installed).");
    }
  })();
}

function startAssistant() {
  require("log-timestamp");

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
        const wakewordCfg = config.addons.AI.wakeword || {};
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
        if (wakewordCfg.enabled && wakewordCfg.provider === "local") {
          await setupWakeword();
        }
        await startAiSystem();
        initAssistantDb();
        if (wakewordCfg.enabled) {
          wakewordLoop();
        }
      } catch (err) {
        console.error("Assistant initialization failed:", err.message);
      }
    })();
  }
}

module.exports = {
  startAssistant,
  initAssistantDb
};
