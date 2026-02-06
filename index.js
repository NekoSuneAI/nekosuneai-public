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
