import vosk from "vosk";
import record from "node-record-lpcm16";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import { exec } from "child_process";
import readline from "readline";
import { addToQueue } from "../index.js";
const sendMSGOSC = () => {};
const sendMSGOSCImmediate = () => {};
import sleep from "../botnode/shortcutcode.js"; // Adjust the import path as needed
import config from "../config/runtimeConfig.js";
import { MICAUDIO_DIR } from "../utils/paths.js";

let micOn = false;
let micStream = null;
let rec = null;
let model = null;
const sendProgressBar = (status, percent) => {
  const barLen = 20;
  const filled = Math.round((percent / 100) * barLen);
  const bar = "[" + "=".repeat(filled) + "-".repeat(barLen - filled) + `] ${percent}% ${status}`;
  try {
    sendMSGOSCImmediate(bar);
  } catch (_) {}
};

// Mic configuration and engine selection
const micCfg = config.mic || {};
const ENGINE = micCfg.engine || "vosk"; // "vosk" or "whisper"
const MODEL_PATH = micCfg.voskModelPath || "./model/vosk/models/vosk-model-en-us-0.22";
const MODEL_URL = micCfg.voskModelUrl || "https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip";
const WHISPER_LITELLM_ENDPOINT = micCfg.whisperLiteLLMEndpoint || null; // LiteLLM audio API endpoint
const WHISPER_LITELLM_API_KEY = micCfg.whisperLiteLLMApiKey || process.env.WHISPER_LITELLM_API_KEY || null;
const WHISPER_LITELLM_API_HEADER = micCfg.whisperLiteLLMApiHeader || "Authorization"; // header name to send key in
const WHISPER_MODEL_NAME = micCfg.whisperModel || "whisper-large-v3"; // model to request from LiteLLM
const DIRECTORY = MICAUDIO_DIR;
const SAMPLE_RATE = 16000;

if (config.mic.enable) {
  // Create the path to write recordings to.
  if (!fs.existsSync(DIRECTORY)) {
    fs.mkdirSync(DIRECTORY, { recursive: true });
  }

  if (ENGINE === "vosk") {
    ensureVoskModel()
      .then((readyPath) => {
        vosk.setLogLevel(0);
        model = new vosk.Model(readyPath);
        console.log("Vosk model loaded.");
      })
      .catch((err) => {
        console.error("Vosk model not ready:", err.message);
      });
  } else if (ENGINE === "whisper") {
    console.log("Whisper (LiteLLM) engine enabled.");
  } else {
    console.error(`Unknown mic engine "${ENGINE}". Defaulting to vosk.`);
  }
}

export default function startRecordingAndRunDeepSpeech() {
  const audioFile = path.join(DIRECTORY, "audio.wav");
  const renamedAudioFile = path.join(DIRECTORY, "recognized_audio.wav");

  const recorder = record.record({
    sampleRate: SAMPLE_RATE,
    endOnSilence: true,
    recorder: "sox",
  });

  const fileStream = fs.createWriteStream(audioFile, {
    encoding: "binary",
  });

  recorder
    .stream()
    .on("end", () => {
      console.error("Recording Ended");
      recorder.stop();
      if (fs.existsSync(audioFile)) {
        try {
          fs.renameSync(audioFile, renamedAudioFile);
          performSpeechRecognition(renamedAudioFile);
        } catch (err) {
          console.error("Error during recording and renaming:", err.message);
        }
      }
    })
    .on("error", (err) => {
      console.log("No audio detected. Recording ignored.");
      console.error("Recorder threw an error:", err);
    })
    .pipe(fileStream);
}

async function performSpeechRecognition(audioFile) {
  try {
    if (ENGINE === "whisper") {
      await transcribeWithWhisper(audioFile);
    } else if (model) {
      await transcribeWithVosk(audioFile);
    } else {
      console.error("No speech engine available. Check mic configuration.");
    }
  } catch (error) {
    console.error("Speech recognition error:", error.message);
  } finally {
    if (fs.existsSync(audioFile)) {
      fs.unlinkSync(audioFile);
    }
    await sleep(5000);
    startRecordingAndRunDeepSpeech();
  }
}

async function transcribeWithVosk(audioFile) {
  const wfReader = fs.createReadStream(audioFile, { highWaterMark: 4096 });
  const recognizer = new vosk.Recognizer({ model, sampleRate: SAMPLE_RATE });
  recognizer.setMaxAlternatives(1);
  recognizer.setWords(true);

  wfReader.on("data", (chunk) => {
    recognizer.acceptWaveform(chunk);
  });

  const result = await new Promise((resolve, reject) => {
    wfReader.on("end", () => {
      const finalResult = recognizer.finalResult();
      recognizer.free();
      resolve(finalResult);
    });

    wfReader.on("error", (err) => {
      recognizer.free();
      reject(err);
    });
  });

  if (result.alternatives && result.alternatives[0].text) {
    console.log("[Vosk Local] Recognized text:", result.alternatives[0].text);
    await addToQueue("nekosunevr", result.alternatives[0].text);
  } else {
    console.log("No audio data to recognize.");
  }
}

async function transcribeWithWhisper(audioFile) {
  if (!WHISPER_LITELLM_ENDPOINT) {
    console.error("Whisper LiteLLM endpoint not configured.");
    return;
  }

  const form = new FormData();
  form.append("file", fs.createReadStream(audioFile));
  form.append("model", WHISPER_MODEL_NAME);

  try {
    try {
      sendMSGOSC("[Status] Converting STT...");
      sendProgressBar("Listening", 10);
    } catch (_) {}

    const headers = { ...form.getHeaders() };
    if (WHISPER_LITELLM_API_KEY) {
      headers[WHISPER_LITELLM_API_HEADER] =
        WHISPER_LITELLM_API_HEADER.toLowerCase() === "authorization"
          ? `Bearer ${WHISPER_LITELLM_API_KEY}`
          : WHISPER_LITELLM_API_KEY;
    }

    const res = await axios.post(WHISPER_LITELLM_ENDPOINT, form, { headers });

    const text = res?.data?.text || res?.data?.transcript || "";
    if (text) {
      console.log("[Whisper LiteLLM] Recognized text:", text);
      sendProgressBar("STT done", 30);
      await addToQueue("nekosunevr", text);
      await new Promise((r) => setTimeout(r, 1500)); // allow OSC to settle before next stage
      return;
    }
    console.error("Whisper LiteLLM returned no transcript.");
  } catch (err) {
    console.error("Whisper LiteLLM failed:", err.message || err);
  }
}

// Console-only keyboard toggle (requires focused console)
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on("keypress", (str, key) => {
    if (key && key.ctrl && key.name === "c") {
      process.exit();
    }
    if (key && key.name === "v") {
      if (micOn) {
        stopMic();
      } else {
        startMic();
      }
    }
  });
}

// === Helpers: download models/binaries when missing ===
async function downloadFile(url, targetPath) {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const writer = fs.createWriteStream(targetPath);
  const response = await axios.get(url, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function ensureVoskModel() {
  if (fs.existsSync(MODEL_PATH)) return MODEL_PATH;

  console.log(`Downloading Vosk model from ${MODEL_URL}...`);
  const zipPath = MODEL_PATH.endsWith(".zip") ? MODEL_PATH : `${MODEL_PATH}.zip`;

  await downloadFile(MODEL_URL, zipPath);
  console.log("Download complete. Extracting...");

  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      exec(
        `powershell -NoLogo -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${path.dirname(
          MODEL_PATH
        )}' -Force"`,
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  } else {
    await new Promise((resolve, reject) => {
      exec(`unzip -o "${zipPath}" -d "${path.dirname(MODEL_PATH)}"`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  if (!fs.existsSync(MODEL_PATH)) {
    console.warn("Model folder not found after extraction; ensure MODEL_PATH matches extracted folder.");
  }
  return MODEL_PATH;
}
