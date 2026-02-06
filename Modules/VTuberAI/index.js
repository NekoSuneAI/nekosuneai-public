const { config } = require("../config");
const {
  startRecordingAndRunDeepSpeech,
  voskLoader
} = require("../VRChatAI/AI/VOICEModules/Main");
const { loadTtsConfigs } = require("../VRChatAI/AI/VOICEModules/Speak");

const {
  ensureVoskModelDownloaded,
  setupPiper,
  setupWhisper
} = require("../Addons/installer");

async function startAiSystem() {
  startRecordingAndRunDeepSpeech();
}

function startVTuberAI() {
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
      } catch (err) {
        console.error("VTuber AI initialization failed:", err.message);
      }
    })();
  }
}

module.exports = {
  startVTuberAI
};
