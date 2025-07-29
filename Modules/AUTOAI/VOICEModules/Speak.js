const { sendMSGOSC } = require("../AddonsModules/OSC/Send");
const { playAudioTTS } = require("../AddonsModules/Audios/AudioDownloader");

const { writeToLogFile } = require("./LogFiles");

const { config } = require("../../config");

const fs = require("fs");
const path = require("path");
const fetch = require('node-fetch');

// Store TTS configurations and user preferences
const ttsConfigs = {};

// Load TTS configurations
async function loadTtsConfigs() {
  try {
    await fs.mkdir("tts_configs", { recursive: true });
    const files = await fs.readdir("tts_configs");
    for (const file of files) {
      if (file.endsWith(".json")) {
        const providerName = file.slice(0, -5);
        const configPath = path.join("tts_configs", file);
        const configData = await fs.readFile(configPath, "utf-8");
        try {
          ttsConfigs[providerName] = JSON.parse(configData);
          process.stdout.write(`\rLoaded TTS config: ${providerName}`);
        } catch (error) {
          process.stdout.write(`\rError parsing TTS config ${file}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error loading TTS configs: ${error.message}`);
  }
}

async function generateTts(
  text,
  provider,
  outputFile = `audio/output_${Date.now()}.wav`
) {
  const apiUrl = 'http://100.127.25.47:3000/tts'; // Adjust if needed

  // Create the request body
  const payload = {
    text: text,
    voice: provider || 'en_US-lessac-medium'
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.statusText}`);
    }

    // Pipe response to outputFile
    const fileStream = fs.createWriteStream(outputFile);
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', reject);
      fileStream.on('finish', resolve);
    });

    return outputFile;
  } catch (err) {
    console.error('TTS API failed:', err);
    throw err;
  }
}

function stripEmojis(text) {
  return text.replace(/[\p{Emoji_Presentation}\p{Emoji}\u200d]+/gu, '').trim();
}

async function readAndPrintSentences(sentences, audioFile, messageid) {
  const { startRecordingAndRunDeepSpeech } = require("../VOICEModules/Main");
  const {
    sendToWebhookchatResponse
  } = require("../AddonsModules/API/Webhooks");
  // This was added to fixed a issues with the Error: startRecordingAndRunDeepSpeech is not a function

  const totalPages = sentences.length;
  let currentPage = 1;

  for (const sentence of sentences) {
    console.log(`Reading: Page ${currentPage}/${totalPages}: ${sentence}`);
    writeToLogFile(`Reading: Page ${currentPage}/${totalPages}: ${sentence}`);
    sendToWebhookchatResponse(
      `Page ${currentPage}/${totalPages}: ${sentence}`,
      messageid
    ).then(datauwu => {
      console.log("Responded Message to Discord");
    });
    sendMSGOSC(`${sentence} \n⏪${currentPage}/${totalPages}⏩`);
    const cleanSentence = stripEmojis(sentence);
    const audioFileAi = await generateTts(
      cleanSentence,
      config.addons.AI.voice || "en_US-lessac-medium",
      `audio/aiout_${Date.now()}.wav`
    );
    playAudioTTS(audioFileAi);
    currentPage++;
  }

  console.log("Finished reading all sentences.");
  writeToLogFile("Finished reading all sentences.");
  // Delete the renamed audio file after recognition.
  fs.unlinkSync(audioFile);
  // Start recording and running DeepSpeech again.
  startRecordingAndRunDeepSpeech();
}

module.exports = {
  readAndPrintSentences,
  generateTts,
  loadTtsConfigs
};
