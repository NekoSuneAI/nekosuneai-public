const { config } = require("./Modules/config");
const {
  ensureDir,
  getDataRoot,
  getVRChatDir,
  getAssistantDir,
  getVTuberDir,
  getMusicDir
} = require("./Modules/Addons/DataPaths");

ensureDir(getDataRoot());
ensureDir(getVRChatDir());
ensureDir(getAssistantDir());
ensureDir(getVTuberDir());
ensureDir(getMusicDir());

const { startStreamProxy } = require("./Modules/Addons/StreamProxy");
startStreamProxy();

const { startOllamaOnBoot, stopOllamaIfManaged } = require("./Modules/Addons/API/OllamaNode");
(async () => {
  try {
    await startOllamaOnBoot();
  } catch (err) {
    console.warn("[Ollama] boot setup failed:", err.message || err);
  }
})();

const shutdownOllama = () => {
  return stopOllamaIfManaged().catch?.(() => {});
};
process.on("SIGINT", () => {
  Promise.resolve(shutdownOllama()).finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  Promise.resolve(shutdownOllama()).finally(() => process.exit(0));
});
process.on("exit", () => {
  shutdownOllama();
});

const mode = (config.mode || "vrchatai").toLowerCase();

if (mode === "assistant") {
  const { startAssistant } = require("./Modules/Assistant");
  startAssistant();
} else if (mode === "vtuberai") {
  const { startVTuberAI } = require("./Modules/VTuberAI");
  startVTuberAI();
} else {
  const { startVRChatAI } = require("./Modules/VRChatAI");
  startVRChatAI();
}
