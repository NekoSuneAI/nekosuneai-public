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
const fetch = require('node-fetch');
const FormData = require('form-data');
const { config } = require("../../config");

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

async function transcribeViaApi(audioFile) {
  const form = new FormData();
  form.append('audio', fs.createReadStream(audioFile)); // same field name as multer expects

  try {
    const response = await fetch('http://localhost:3000/stt', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`STT API failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.transcript) {
      return data;
    } else {
      throw new Error('No transcript returned from STT API');
    }
  } catch (err) {
    console.error('STT API error:', err);
    throw err;
  }
}

// Function to run DeepSpeech and delete the audio file.
async function performSpeechRecognition(audioFile) {
  sendMSGOSC(`Thinking.`);

  try {
    const result = await transcribeViaApi(audioFile);
    if (result && result.transcript) {
      console.log("[Vosk Local] Recognized text:", result.transcript);
      const resulttt = [
        {
          text: result.transcript
        }
      ];

      writeToLogFile("[Vosk Local] Recognized text: " + resulttt[0].text);
      sendMSGOSC(`Thinking...`);
      if (config.addons.discord.toggle) {
        const recognizedText = resulttt[0].text.toLowerCase(); // case-insensitive check
        if (recognizedText.includes(config.addons.AI.onwakeword.toLowerCase())) {
          console.log(`Wake command "${config.addons.AI.onwakeword.toLowerCase()}" detected!`);
          // start your action here

          sendToWebhookchat(result.alternatives[0].text.replace(config.addons.AI.onwakeword.toLowerCase(), '')).then(async meep => {
            if (containsBannedWord(resulttt[0].text.replace(config.addons.AI.onwakeword.toLowerCase(), ''))) {
              BadWordDetected(audioFile, meep.messageid);
            } else {
              const SoundboardResp = await playSound(audioFile, resulttt);
              console.log("[SoundboardResp]", SoundboardResp.resp);
              if (SoundboardResp.resp == "NO MATCH DATA!") {
                await RunCommands(audioFile, resulttt, meep.messageid);
              }
            }
          });
        } else {
          console.log(`Wake command "${config.addons.AI.onwakeword.toLowerCase()}" Not Detected!`);
          fs.unlinkSync(audioFile);
          // Start recording and running DeepSpeech again.
          startRecordingAndRunDeepSpeech();
        }
      } else {
        const recognizedText = resulttt[0].text.toLowerCase(); // case-insensitive check
        if (recognizedText.includes('jarvis')) {
          console.log(`Wake command "${config.addons.AI.onwakeword.toLowerCase()}" detected!`);
          // start your action here

          if (containsBannedWord(resulttt[0].text.replace(config.addons.AI.onwakeword.toLowerCase(), ''))) {
            BadWordDetected(audioFile, null);
          } else {
            const SoundboardResp = await playSound(audioFile, resulttt);
            console.log("[SoundboardResp]", SoundboardResp.resp);
            if (SoundboardResp.resp == "NO MATCH DATA!") {
              await RunCommands(audioFile, resulttt, null);
            }
          }
        } else {
          console.log(`Wake command "${config.addons.AI.onwakeword.toLowerCase()}" Not Detected!`);
          fs.unlinkSync(audioFile);
          // Start recording and running DeepSpeech again.
          startRecordingAndRunDeepSpeech();
        }
      }
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
  startRecordingAndRunDeepSpeech,
  voskLoader
};
