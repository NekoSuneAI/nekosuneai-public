const fs = require("fs");
const path = require("path");
const { config } = require("../config");

function getDataRoot() {
  return path.resolve(__dirname, "..", "..", "data");
}

function getModeName() {
  return (config.mode || "default").toLowerCase();
}

function getModeDataDir() {
  return path.join(getDataRoot(), getModeName());
}

function getAssistantDir() {
  return path.join(getDataRoot(), "assistant");
}

function getVRChatDir() {
  return path.join(getDataRoot(), "vrchatai");
}

function getVTuberDir() {
  return path.join(getDataRoot(), "vtuberai");
}

function getMusicDir() {
  return path.join(getDataRoot(), "music");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

module.exports = {
  getDataRoot,
  getModeDataDir,
  getAssistantDir,
  getVRChatDir,
  getVTuberDir,
  getMusicDir,
  ensureDir
};
