const { badwords } = require("../../../config");

const { writeToLogFile } = require("../../VOICEModules/LogFiles");

const { generateTts } = require("../../VOICEModules/Speak");
const { playAudioTTS } = require("../Audios/AudioDownloader");

const fs = require("fs");

function findWord(word, str) {
  return str.split(" ").some(function(w) {
    return w === word;
  });
}

function containsBannedWord(message) {
  for (var i = 0; i < badwords.length; i++) {
    if (findWord(badwords[i], message)) {
      console.log("Found bad word: " + badwords[i]);
      writeToLogFile("Found bad word: " + badwords[i]);
      return true;
    }
  }
}

async function BadWordDetected(audioFile, messageid) {

  const { startRecordingAndRunDeepSpeech } = require("../../VOICEModules/Main");

  const { sleep } = require("../ShortCuts");

  const { config } = require("../../../config");

  return new Promise(async (resolve, reject) => {
    console.log(`[FORBIDDEN ACCESS]`);
    await sleep(5000);
    console.log(
      `This infomation is Forbidden access by my Creator, Please follow Terms of Service.`
    );
    
    const audioFileAi = await generateTts(
      "This infomation is Forbidden access by my Creator, Please follow Terms of Service.",
      config.addons.AI.voice || "en_US-lessac-medium",
      `audio/aiout_${Date.now()}.wav`
    );
    playAudioTTS(audioFileAi);
    fs.unlinkSync(audioFile);
    startRecordingAndRunDeepSpeech();
    resolve();
  });
}

module.exports = {
  BadWordDetected,
  containsBannedWord
};
