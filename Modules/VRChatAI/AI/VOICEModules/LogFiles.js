const fs = require("fs");
const path = require("path");
const { ensureDir, getModeDataDir } = require("../../../Addons/DataPaths");

function getLogsDir() {
  return ensureDir(path.join(getModeDataDir(), "logs"));
}

function writeToLogFileMusic(message) {
  const logFilePath = path.join(getLogsDir(), "Music.log");
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFile(logFilePath, logMessage, err => {
    if (err) {
      console.error("Error writing to log file:", err);
    }
  });
}

function writeToLogFile(message) {
  const logFilePath = path.join(getLogsDir(), "data.log");
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFile(logFilePath, logMessage, err => {
    if (err) {
      console.error("Error writing to log file:", err);
    }
  });
}

module.exports = {
  writeToLogFileMusic,
  writeToLogFile
};
