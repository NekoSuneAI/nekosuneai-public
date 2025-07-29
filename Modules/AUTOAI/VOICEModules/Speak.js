const { sendMSGOSC } = require("../AddonsModules/OSC/Send");
const { playAudioTTS } = require("../AddonsModules/Audios/AudioDownloader");

const { writeToLogFile } = require("./LogFiles");

const { config } = require("../../config");

const fs = require("fs");
const readline = require('readline');
const path = require("path");
const { spawn, exec } = require("child_process");
const logger = console;

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

// Generate TTS audio using piper-tts
async function generateTts(
  text,
  provider,
  outputFile = `audio/output_${Date.now()}.wav`
) {;
  const configstt = require(`../../../tts_configs/${provider}.json`);
  if (!configstt) {
    logger.error(`No TTS config found for provider: ${provider}`);
    return null;
  }

  const voice = provider || "en_US-lessac-medium";
  const modelPath = path.resolve(
    configstt.modelPath || `./piper/models/${voice}.onnx`
  );

  return new Promise((resolve, reject) => {
    const args = [
      "-m",
      "piper",
      "--model",
      modelPath,
      "--output_file",
      outputFile
    ];
    const child = spawn(configstt.pythonPath, args, {
      stdio: ["pipe", "inherit", "inherit"]
    });

    child.stdin.write(text + "\n");
    child.stdin.end();

    child.on("close", code => {
      if (code === 0) resolve(outputFile);
      else reject(new Error(`Piper exited with code ${code}`));
    });

    child.on("error", reject);
  });
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
