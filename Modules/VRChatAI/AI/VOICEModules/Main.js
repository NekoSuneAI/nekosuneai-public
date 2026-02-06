const { sendMSGOSC } = require("../Addons/OSC/Send");

const { writeToLogFile } = require("./LogFiles");

const {
  BadWordDetected,
  containsBannedWord
} = require("../Addons/BadWordDetected");
// migrate path

const { RunCommands } = require("../Commands/Main");
const { markMemoryActivity } = require("../Addons/DB/memoryStore");

const { sleep } = require("../../../Addons/ShortCuts");

const { sendToWebhookchat } = require("../Addons/Webhooks");

const { playSound } = require("../Addons/Audios/AudioSounds");
const { stopAudioSound } = require("../Addons/Audios/AudioDownloader");
const { startRenderProgress, stopRenderProgress } = require("./Speak");
const { isMicDisabled } = require("../../../Addons/VoiceState");

const fs = require("fs");
const path = require("path");
let vosk = null;
let voskLoadError = null;
try {
  vosk = require("vosk");
} catch (err) {
  voskLoadError = err;
}
let record = null;
let recordLoadError = null;
let recordWarned = false;
try {
  record = require("node-record-lpcm16");
} catch (err) {
  recordLoadError = err;
}

function getRecorder() {
  if (record) return record;
  if (!recordWarned) {
    recordWarned = true;
    console.warn(
      "[Voice] 'node-record-lpcm16' is unavailable. Install it to enable mic recording.",
      recordLoadError ? recordLoadError.message : ""
    );
  }
  return null;
}
const FormData = require("form-data");
const { config } = require("../../../config");
const MODEL_PATH = path.resolve(__dirname, "../../../../tools/vosk/models", config.addons.AI.vaskmodel);
const os = require("os");
const { spawn } = require("child_process");

let model = null;
let whisperHardwareLogged = false;

async function voskLoader() {
  if (!config.addons.AI.toggle) return;
  if (!vosk) {
    const errMsg = voskLoadError ? voskLoadError.message : "vosk not installed";
    throw new Error(`Vosk unavailable: ${errMsg}`);
  }
  if (model !== null) return model;
  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error(`Vosk model not found: ${MODEL_PATH}`);
  }
  vosk.setLogLevel(0);
  model = new vosk.Model(MODEL_PATH);
  console.log("Vosk model loaded.");
  return model;
}

function getLocalPythonPath() {
  const platform = os.platform();
  const primaryDir = path.resolve(__dirname, "../../../../tools/python");
  const fallbackDir = path.resolve(__dirname, "../../../../tools/python_portable");
  const primaryExe = platform === "win32"
    ? path.join(primaryDir, "python.exe")
    : path.join(primaryDir, "bin", "python3");
  const fallbackExe = platform === "win32"
    ? path.join(fallbackDir, "python.exe")
    : path.join(fallbackDir, "bin", "python3");
  if (fs.existsSync(primaryExe)) return primaryExe;
  if (fs.existsSync(fallbackExe)) return fallbackExe;
  return primaryExe;
}

async function runLocalWhisper(audioFile) {
  const pythonExe = getLocalPythonPath();
  const scriptPath = path.resolve(__dirname, "../../../Addons/whisper_local.py");
  const modelsDir = path.resolve(__dirname, "../../../../tools/whisper/models");
  const modelName = config.addons.AI.whisperModel || "base";
  const device = config.addons.AI.whisperDevice || "auto";
  const computeType = config.addons.AI.whisperComputeType || "auto";

  return new Promise((resolve, reject) => {
    const args = [
      scriptPath,
      "--audio",
      audioFile,
      "--model",
      modelName,
      "--device",
      device,
      "--compute_type",
      computeType,
      "--models_dir",
      modelsDir
    ];
    const child = spawn(pythonExe, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", data => {
      stdout += data.toString();
    });
    child.stderr.on("data", data => {
      stderr += data.toString();
    });

    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(stderr || `Whisper exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve({
          text: parsed.text || "",
          device: parsed.device,
          computeType: parsed.compute_type,
          cpuVendor: parsed.cpu_vendor,
          cudaAvailable: parsed.cuda_available,
          nvidiaGpus: parsed.nvidia_gpus,
          supportedGpus: parsed.supported_gpus
        });
      } catch (err) {
        reject(new Error(`Failed to parse whisper output: ${err.message}`));
      }
    });
  });
}

const { ensureDir, getModeDataDir } = require("../../../Addons/DataPaths");
// Constants.
const DIRECTORY = ensureDir(path.join(getModeDataDir(), "audio"));

// Create the path to write recordings to.
if (!fs.existsSync(DIRECTORY)) {
  fs.mkdirSync(DIRECTORY);
}

let activeRecorder = null;

// Function to start recording and run DeepSpeech.
function startRecordingAndRunDeepSpeech(options = {}) {
  const singleUtterance = options && options.singleUtterance === true;
  if (isMicDisabled()) {
    writeToLogFile("Mic disabled: skipping recording start.");
    return;
  }
  const recorderImpl = getRecorder();
  if (!recorderImpl) {
    writeToLogFile("Mic recording is unavailable (missing node-record-lpcm16).");
    return;
  }
  const audioFile = path.join(DIRECTORY, "audio.wav");
  const renamedAudioFile = path.join(DIRECTORY, "recognized_audio.wav");
  // Initialize the audio recorder (replace with your actual initialization logic)
  const recorder = recorderImpl.record({
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
  const singleUtterance = false;
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
    const mode = (config.engineMode || "").toLowerCase();
    const whisperModel = config.addons.AI.whisperModel || "base";
    const rawWhisperDevice = (config.addons.AI.whisperDevice || "cpu").toLowerCase();
    const whisperDevice = rawWhisperDevice === "auto" ? "cpu" : rawWhisperDevice;
    const result = await new Promise(async (resolve, reject) => {
      try {
        if (sttProvider === "vosk" || sttProvider === "vosk_local") {
          const wfReader = fs.createReadStream(audioFile, { highWaterMark: 4096 });
          const model = await voskLoader();
          const rec = new vosk.Recognizer({ model, sampleRate: 16000 });
          rec.setMaxAlternatives(1);
          rec.setWords(true);

          wfReader.on("data", chunk => {
            rec.acceptWaveform(chunk);
          });

          wfReader.on("end", () => {
            const finalResult = rec.finalResult();
            rec.free();
            const text = finalResult?.alternatives?.[0]?.text || "";
            resolve({ text });
          });

          wfReader.on("error", err => {
            rec.free();
            reject(err);
          });

          return;
        }

        if (
          mode === "normal" &&
          (sttProvider === "whisper" || sttProvider === "whisper_local")
        ) {
          resolve(await runLocalWhisper(audioFile));
          return;
        }

        if (mode === "normal" && sttProvider === "both") {
          try {
            const whisperResult = await runLocalWhisper(audioFile);
            if (whisperResult.text && whisperResult.text.trim() !== "") {
              resolve(whisperResult);
              return;
            }
          } catch (err) {
            // Fall back to local Vosk.
          }

          try {
            const wfReader = fs.createReadStream(audioFile, { highWaterMark: 4096 });
            const model = await voskLoader();
            const rec = new vosk.Recognizer({ model, sampleRate: 16000 });
            rec.setMaxAlternatives(1);
            rec.setWords(true);

            wfReader.on("data", chunk => {
              rec.acceptWaveform(chunk);
            });

            wfReader.on("end", () => {
              const finalResult = rec.finalResult();
              rec.free();
              const text = finalResult?.alternatives?.[0]?.text || "";
              resolve({ text });
            });

            wfReader.on("error", err => {
              rec.free();
              reject(err);
            });
            return;
          } catch (err) {
            // Fall through to API
          }
        }

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

        if (sttProvider === "vosk_api") {
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

    if (!whisperHardwareLogged && result && (result.device || result.cpuVendor)) {
      whisperHardwareLogged = true;
      const gpuList = Array.isArray(result.supportedGpus) && result.supportedGpus.length
        ? result.supportedGpus.join(", ")
        : "none";
      const cudaFlag = typeof result.cudaAvailable === "boolean" ? result.cudaAvailable : false;
      const cpuVendor = result.cpuVendor || "unknown";
      const device = result.device || "unknown";
      const computeType = result.computeType || "unknown";
      console.log(
        `[Whisper] Device=${device} Compute=${computeType} CPU=${cpuVendor} CUDA=${cudaFlag} GPUs=${gpuList}`
      );
    }

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
        if (!singleUtterance) {
          startRecordingAndRunDeepSpeech();
        }
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
      if (!singleUtterance) {
        await sleep(5000);
        startRecordingAndRunDeepSpeech();
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
    console.log("No audio data to recognize.");
    stopRenderProgress();
    // Delete the renamed audio file after recognition.
    // TODO: issues with it keep say not unlink from the audiofiles need to look into
    //fs.unlinkSync(audioFile);

    // Start recording and running DeepSpeech again.
    if (!singleUtterance) {
      await sleep(5000);
      startRecordingAndRunDeepSpeech();
    }
  }
}

module.exports = {
  startRecordingAndRunDeepSpeech,
  voskLoader,
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
