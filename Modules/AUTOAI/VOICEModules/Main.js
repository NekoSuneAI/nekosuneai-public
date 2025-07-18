const { sendMSGOSC } = require("../AddonsModules/OSC/Send");

const { writeToLogFile } = require("./LogFiles");

const {
  BadWordDetected,
  containsBannedWord
} = require("../AddonsModules/API/BadWordDetected");

const { RunCommands } = require("../Commands/Main");

const { sleep } = require("../AddonsModules/ShortCuts");

const { sendToWebhookchat } = require("../AddonsModules/API/Webhooks");

const { playSound } = require("../AddonsModules/Audios/AudioSounds");

const fs = require("fs");
const path = require("path");
const record = require("node-record-lpcm16");
const vosk = require('vosk')
const { config } = require("../../config");
const MODEL_PATH = config.addons.AI.vaskmodel || "./model/vosk-model-en-us-0.22";

// Load model once at startup
if (!fs.existsSync(MODEL_PATH)) {
  console.error("❌ Vosk model not found at:", MODEL_PATH);
  process.exit(1);
}

vosk.setLogLevel(0);
model = new vosk.Model(MODEL_PATH);
console.log("✅ Vosk model loaded.");

// Constants.
const DIRECTORY = "./audio";

// Create the path to write recordings to.
if (!fs.existsSync(DIRECTORY)) {
  fs.mkdirSync(DIRECTORY);
}

// Function to start recording and run DeepSpeech.
function startRecordingAndRunDeepSpeech() {
  const audioFile = path.join(DIRECTORY, "audio.wav");
  const renamedAudioFile = path.join(DIRECTORY, "recognized_audio.wav");
  // Initialize the audio recorder (replace with your actual initialization logic)
  const recorder = record.record({
    sampleRate: 16000,
    endOnSilence: true,
    recorder: "sox"
  });
  const fileStream = fs.createWriteStream(audioFile, {
    encoding: "binary"
  });
  // Set an interval to send the OSC message every 20 seconds
  // const oscSayingwordsInterval = setInterval(sendOscSayingwordsMessage, 1000);
  recorder
    .stream()
    .on("data", data => {
      // Implement your audio detection logic here.
      // For simplicity, check if the audio data exceeds a threshold (adjust as needed)
      if (data.some(value => Math.abs(value) > 1000)) {
        console.log(data, "Audio detected");
      }
    })
    .on("end", () => {
      console.error("Recording Ended");
      writeToLogFile("Recording Ended");
      // clearInterval(oscSayingwordsInterval);
      recorder.stop();
      // Verify file existence before renaming
      if (fs.existsSync(audioFile)) {
        try {
          fs.renameSync(audioFile, renamedAudioFile); // Rename the file synchronously
          // Perform speech recognition on the recorded audio file.
          performSpeechRecognition(renamedAudioFile);
        } catch (err) {
          console.error("Error during recording and renaming:", err.message);
        }
      } else {
        //console.error('Source file does not exist:', audioFile);
      }
    })
    .on("error", err => {
      console.log("No audio detected. Recording ignored.");
      console.error("Recorder threw an error:", err);
    })
    .pipe(fileStream);
}

// Function to run DeepSpeech and delete the audio file.
async function performSpeechRecognition(audioFile) {
    sendMSGOSC(`Thinking.`);
    
    try {
        const wfReader = fs.createReadStream(audioFile, { highWaterMark: 4096 });

        const rec = new vosk.Recognizer({ model, sampleRate: 16000 });
        rec.setMaxAlternatives(1);
        rec.setWords(true);

        wfReader.on('data', (chunk) => {
            rec.acceptWaveform(chunk);
        });

        const result = await new Promise((resolve, reject) => {
            wfReader.on('end', () => {
                const finalResult = rec.finalResult();
                rec.free();
                resolve(finalResult);
            });

            wfReader.on('error', (err) => {
                rec.free();
                reject(err);
            });
        });
        if (result.alternatives && result.alternatives[0].text) {
          console.log('[Vosk Local] Recognized text:', result.alternatives[0].text);
          const result = [
            {
              text: result.alternatives[0].text
            }
          ];
          writeToLogFile("[Vosk Local] Recognized text: " + result[0].text);
          sendMSGOSC(`Thinking...`);
          sendToWebhookchat(result.alternatives[0].text).then(async meep => {
            if (containsBannedWord(result[0].text)) {
              BadWordDetected(audioFile, meep.messageid);
            } else {
              const SoundboardResp = await playSound(audioFile, result);
              console.log("[SoundboardResp]", SoundboardResp.resp);
              if (SoundboardResp.resp == "NO MATCH DATA!") {
                await RunCommands(audioFile, result, meep.messageid);
              }
            }
         });
        } else {
          //const error = await response.text();
          //console.log(`Server error: ${error}`);
          console.log("No audio data to recognize.");
          writeToLogFile("No audio data to recognize");
          // Delete the renamed audio file after recognition.
          fs.unlinkSync(audioFile);
          // Start recording and running DeepSpeech again.
          await sleep(5000);
          startRecordingAndRunDeepSpeech();
        }
    } catch (error) {
      console.error("Error:", error.message);
      console.log("No audio data to recognize.");
      // Delete the renamed audio file after recognition.
      // TODO: issues with it keep say not unlink from the audiofiles need to look into
      //fs.unlinkSync(audioFile);

      // Start recording and running DeepSpeech again.
      await sleep(5000);
      startRecordingAndRunDeepSpeech();
    }
}

module.exports = {
  startRecordingAndRunDeepSpeech
};
