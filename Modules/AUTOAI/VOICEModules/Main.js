const { sendMSGOSC } = require("../AddonsModules/OSC/Send");

const { writeToLogFile } = require("./LogFiles");

const {
  BadWordDetected,
  containsBannedWord
} = require("../AddonsModules/API/BadWordDetected");

const { RunCommands } = require("../Commands/Main");
const { markMemoryActivity } = require("../../Addons/memoryStore");

const { sleep } = require("../AddonsModules/ShortCuts");

const { sendToWebhookchat } = require("../AddonsModules/API/Webhooks");

const { playSound } = require("../AddonsModules/Audios/AudioSounds");
const { stopAudioSound } = require("../AddonsModules/Audios/AudioDownloader");
const { startRenderProgress, stopRenderProgress } = require("./Speak");
const { isMicDisabled } = require("./VoiceState");

const fs = require("fs");
const path = require("path");
const record = require("node-record-lpcm16");
const FormData = require("form-data");
const { config } = require("../../config");

// Constants.
const DIRECTORY = "./audio";

// Create the path to write recordings to.
if (!fs.existsSync(DIRECTORY)) {
  fs.mkdirSync(DIRECTORY);
}

let activeRecorder = null;

// Function to start recording and run DeepSpeech.
function startRecordingAndRunDeepSpeech() {
  if (isMicDisabled()) {
    writeToLogFile("Mic disabled: skipping recording start.");
    return;
  }
  const audioFile = path.join(DIRECTORY, "audio.wav");
  const renamedAudioFile = path.join(DIRECTORY, "recognized_audio.wav");
  // Initialize the audio recorder (replace with your actual initialization logic)
  const recorder = record.record({
    sampleRate: 16000,
    endOnSilence: true,
    recorder: "sox"
  });
  activeRecorder = recorder;
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
      activeRecorder = null;
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
      activeRecorder = null;
    })
    .pipe(fileStream);
}

// Function to run DeepSpeech and delete the audio file.
async function performSpeechRecognition(audioFile) {
  if (isMicDisabled()) {
    try {
      if (fs.existsSync(audioFile)) {
        fs.unlinkSync(audioFile);
      }
    } catch (err) {
      console.error("Failed to cleanup audio while mic disabled:", err.message);
    }
    return;
  }

  startRenderProgress(2 * 60);

  try {
    const sttProvider = (config.addons.AI.sttProvider || "openai").toLowerCase();
    const whisperModel = config.addons.AI.whisperModel || "base";
    const whisperDevice = config.addons.AI.whisperDevice || "cpu";
    const result = await new Promise(async (resolve, reject) => {
      try {
        const axios = require("axios");

        const extractTranscript = data =>
          data.transcript ||
          data.text ||
          (data.transcripts && (data.transcripts.whisper || data.transcripts.vosk)) ||
          "";

        const postStt = async engine => {
          const form = new FormData();
          form.append("audio", fs.createReadStream(audioFile)); // API expects "audio"
          form.append("engine", engine);
          if (engine === "whisper" || engine === "both") {
            form.append("model", whisperModel);
            form.append("device", whisperDevice);
          }

          const res = await axios.post(`${config.addons.AI.ApiNodeFallback}/stt`, form, {
            headers: {
              ...form.getHeaders()
            }
          });

          return { text: extractTranscript(res.data) };
        };

        if (sttProvider === "vosk" || sttProvider === "vosk_api") {
          resolve(await postStt("vosk"));
          return;
        }

        if (
          sttProvider === "whisper" ||
          sttProvider === "wishiper" ||
          sttProvider === "whisper_api" ||
          sttProvider === "both"
        ) {
          try {
            const whisperResult = await postStt("whisper");
            if (whisperResult.text && whisperResult.text.trim() !== "") {
              resolve(whisperResult);
              return;
            }
          } catch (err) {
            // Fall back to Vosk.
          }

          try {
            const voskResult = await postStt("vosk");
            if (voskResult.text && voskResult.text.trim() !== "") {
              resolve(voskResult);
              return;
            }
          } catch (err) {
            // Fall through to error.
          }

          reject(new Error("STT nodes are down."));
          return;
        }

        const form = new FormData();
        form.append("file", fs.createReadStream(audioFile)); // must be "file"
        form.append("model", "whisper-1");

        const res = await axios.post(`${config.addons.AI.OPENAI.baseURL}/audio/transcriptions`, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${config.addons.AI.OPENAI.apiKey}`
          }
        });

        resolve(res.data); // server response with recognized text
      } catch (err) {
        reject(new Error(`STT request failed: ${err.message}`));
      }
    });

    if (result.text && result.text.trim() !== '') {
      console.log(`[STT:${sttProvider}] Recognized text:`, result.text);
      const resulttt = [
        {
          text: result.text
        }
      ];
      markMemoryActivity();
      writeToLogFile(`[STT:${sttProvider}] Recognized text: ${resulttt[0].text}`);
      if (resulttt[0].text.includes("[BLANK_AUDIO]")) {
        console.log("[STT] Blank audio detected. Restarting voice.");
        writeToLogFile("[STT] Blank audio detected. Restarting voice.");
        stopAudioSound();
        stopRenderProgress({ force: true });
        if (fs.existsSync(audioFile)) {
          fs.unlinkSync(audioFile);
        }
        await sleep(1000);
        startRecordingAndRunDeepSpeech();
        return;
      }
      if (config.addons.discord.toggle) {
        sendToWebhookchat(resulttt[0].text).then(async meep => {
          if (containsBannedWord(resulttt[0].text)) {
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
        if (containsBannedWord(resulttt[0].text)) {
          BadWordDetected(audioFile, null);
        } else {
          const SoundboardResp = await playSound(audioFile, resulttt);
          console.log("[SoundboardResp]", SoundboardResp.resp);
          if (SoundboardResp.resp == "NO MATCH DATA!") {
            await RunCommands(audioFile, resulttt, null);
          }
        }
      }
    } else {
      //const error = await response.text();
      //console.log(`Server error: ${error}`);
      console.log("No audio data to recognize.");
      writeToLogFile("No audio data to recognize");
      stopRenderProgress();
      // Delete the renamed audio file after recognition.
      fs.unlinkSync(audioFile);
      // Start recording and running DeepSpeech again.
      await sleep(5000);
      startRecordingAndRunDeepSpeech();
    }
  } catch (error) {
    console.error("Error:", error.message);
    console.log("No audio data to recognize.");
    stopRenderProgress();
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
  stopRecording: () => {
    if (activeRecorder) {
      try {
        activeRecorder.stop();
      } catch (err) {
        console.error("Failed to stop recorder:", err.message);
      }
      activeRecorder = null;
    }
  }
};
