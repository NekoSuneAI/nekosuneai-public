const { badwords } = require("../../../config");

const { writeToLogFile } = require("../VOICEModules/LogFiles");

  const { generateTts, stopRenderProgress } = require("../VOICEModules/Speak");
  const { ensureDir, getModeDataDir } = require("../../../Addons/DataPaths");
  const path = require("path");
const { playAudioTTS } = require("./Audios/AudioDownloader");

const fs = require("fs");

function normalizeToken(token) {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9'-]+/g, "")
    .trim();
}

function findWord(word, str) {
  const normalizedWord = normalizeToken(word);
  if (!normalizedWord) return false;
  const tokens = str.split(/\s+/).map(normalizeToken).filter(Boolean);
  return tokens.includes(normalizedWord);
}

function containsBannedWord(message) {
  try {
    const lowerMessage = (message || "").toLowerCase();
    for (var i = 0; i < badwords.length; i++) {
      const term = (badwords[i] || "").toString().trim();
      if (!term) continue;
      const lowerTerm = term.toLowerCase();
      if (lowerTerm.includes(" ")) {
        if (lowerMessage.includes(lowerTerm)) {
          console.log("Found bad word: " + term);
          writeToLogFile("Found bad word: " + term);
          return true;
        }
        continue;
      }
      if (findWord(term, message)) {
        console.log("Found bad word: " + badwords[i]);
        writeToLogFile("Found bad word: " + badwords[i]);
        return true;
      }
    }
  } catch (err) {
    console.error("Bad word check failed:", err.message);
  }
  return false;
}

async function BadWordDetected(audioFile, messageid) {
  const { sendMSGOSC } = require("./OSC/Send");

  const { startRecordingAndRunDeepSpeech } = require("../VOICEModules/Main");

  const { sleep } = require("../../../Addons/ShortCuts");

  const { sendToWebhookchatResponse } = require("./Webhooks");
  const { config } = require("../../../config");

  stopRenderProgress();

  return new Promise(async (resolve, reject) => {
    sendMSGOSC(`[FORBIDDEN ACCESS]`);
    await sleep(5000);
    sendMSGOSC(
      `This infomation is Forbidden access by my Creator, Please follow VRChat Terms of Service.`
    );
    sendToWebhookchatResponse(
      `[FORBIDDEN ACCESS]\n\nThis infomation is Forbidden access by my Creator, Please follow VRChat Terms of Service.`,
      messageid
    ).then(datauwu => {
      console.log(datauwu);
    });
    const audioFileAi = await generateTts(
      "This infomation is Forbidden access by my Creator, Please follow VRChat Terms of Service.",
      config.addons.AI.voice || "en_US-lessac-medium",
      path.join(ensureDir(path.join(getModeDataDir(), "audio")), `aiout_${Date.now()}.wav`)
    );
    playAudioTTS(audioFileAi);
    if (audioFile && fs.existsSync(audioFile)) {
      fs.unlinkSync(audioFile);
    }
    startRecordingAndRunDeepSpeech();
    resolve();
  });
}

module.exports = {
  BadWordDetected,
  containsBannedWord
};
