const { sendMSGOSC } = require("../AddonsModules/OSC/Send");
const { playAudioSound } = require("../AddonsModules/Audios/AudioDownloader");

const { writeToLogFile } = require("./LogFiles");

const { config } = require("../../config");

const fs = require("fs");

// Generate TTS audio using piper-tts
async function generateTts(
  text,
  provider,
  outputFile = `audios/output_${Date.now()}.wav`
) {
  const config = ttsConfigs[provider];
  if (!config) {
    logger.error(`No TTS config found for provider: ${provider}`);
    return null;
  }

  const voice = config.voice || "en_US-lessac-medium";
  const modelPath = path.resolve(
    config.modelPath || `./piper/models/${voice}.onnx`
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
    const child = spawn(config.pythonPath, args, {
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
    const audioFileAi = await generateTts(
      sentence,
      config.voice || "en_US-lessac-medium",
      `audios/aiout_${Date.now()}.wav`
    );
    playAudioSound(audioFileAi);
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
  generateTts
};
