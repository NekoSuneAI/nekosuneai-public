const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const record = require("node-record-lpcm16");
const { config } = require("../config");
const { setMicDisabled } = require("../Addons/VoiceState");
const { startRecordingAndRunDeepSpeech } = require("../VRChatAI/AI/VOICEModules/Main");

let wakeLoopActive = false;
let wakeLoopStop = null;

function getWakewordConfig() {
  const ww = (config.addons && config.addons.AI && config.addons.AI.wakeword) || {};
  return {
    enabled: Boolean(ww.enabled),
    provider: (ww.provider || "local").toLowerCase(),
    phrases: Array.isArray(ww.phrases) ? ww.phrases : [],
    chunkSeconds: typeof ww.chunkSeconds === "number" ? ww.chunkSeconds : 2.5,
    cooldownMs: typeof ww.cooldownMs === "number" ? ww.cooldownMs : 1500,
    sensitivity: ww.sensitivity || "high",
    local: ww.local || {},
    api: ww.api || {}
  };
}

function getPythonExe() {
  const platform = process.platform;
  const primaryDir = path.resolve(__dirname, "../../tools/python");
  const fallbackDir = path.resolve(__dirname, "../../tools/python_portable");
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

function getSherpaCli() {
  const platform = process.platform;
  const primaryDir = path.resolve(__dirname, "../../tools/python");
  const fallbackDir = path.resolve(__dirname, "../../tools/python_portable");
  const primaryCli = platform === "win32"
    ? path.join(primaryDir, "Scripts", "sherpa-onnx-keyword-spotter.exe")
    : path.join(primaryDir, "bin", "sherpa-onnx-keyword-spotter");
  const fallbackCli = platform === "win32"
    ? path.join(fallbackDir, "Scripts", "sherpa-onnx-keyword-spotter.exe")
    : path.join(fallbackDir, "bin", "sherpa-onnx-keyword-spotter");
  if (fs.existsSync(primaryCli)) return primaryCli;
  return fallbackCli;
}

async function writeKeywordsFile(phrases, keywordsRawPath) {
  const content = phrases
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => p.toUpperCase())
    .join("\n");
  await fs.promises.mkdir(path.dirname(keywordsRawPath), { recursive: true });
  await fs.promises.writeFile(keywordsRawPath, content + "\n");
}

function runSherpaKeywordSpotter(wavPath, phrases, localCfg) {
  return new Promise((resolve, reject) => {
    const cli = getSherpaCli();
    const keywordsFile = localCfg.keywordsFile;
    const detectRegex = localCfg.detectRegex || "keyword|wake|trigger";
    let child = null;
    if (fs.existsSync(cli)) {
      const args = [
        "--tokens",
        localCfg.tokens,
        "--encoder",
        localCfg.encoder,
        "--decoder",
        localCfg.decoder,
        "--joiner",
        localCfg.joiner,
        "--keywords-file",
        keywordsFile,
        "--provider",
        localCfg.provider || "cpu",
        "--num-threads",
        String(localCfg.numThreads || 2),
        wavPath
      ];
      child = spawn(cli, args, { stdio: ["ignore", "pipe", "pipe"] });
    } else {
      const pythonExe = getPythonExe();
      const scriptPath = path.resolve(__dirname, "../Addons/wakeword_spotter.py");
      const args = [
        scriptPath,
        "--wav",
        wavPath,
        "--tokens",
        localCfg.tokens,
        "--encoder",
        localCfg.encoder,
        "--decoder",
        localCfg.decoder,
        "--joiner",
        localCfg.joiner,
        "--keywords-file",
        keywordsFile,
        "--provider",
        localCfg.provider || "cpu",
        "--num-threads",
        String(localCfg.numThreads || 2)
      ];
      child = spawn(pythonExe, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONIOENCODING: "utf-8" }
      });
    }

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
        reject(new Error(stderr || `sherpa-onnx exited with code ${code}`));
        return;
      }
      let detected = false;
      let keyword = "";
      try {
        const parsed = JSON.parse(stdout);
        detected = Boolean(parsed && parsed.triggered);
        if (parsed && parsed.keyword) {
          keyword = String(parsed.keyword);
        }
      } catch {
        const regex = new RegExp(detectRegex, "i");
        detected = regex.test(stdout);
      }
      if (!detected) {
        resolve(false);
        return;
      }
      const phraseSource = keyword ? keyword : stdout;
      const lower = phraseSource.toLowerCase();
      const phraseHit = phrases.some(p => lower.includes(p.toLowerCase()));
      resolve(phraseHit || phrases.length === 0);
    });
  });
}

async function recordChunk(wavPath, seconds) {
  await fs.promises.mkdir(path.dirname(wavPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const recorder = record.record({
      sampleRate: 16000,
      endOnSilence: true,
      recorder: "sox"
    });
    if (recorder && typeof recorder.on === "function") {
      recorder.on("error", err => {
        reject(err);
      });
    }
    const fileStream = fs.createWriteStream(wavPath, { encoding: "binary" });
    const timeout = setTimeout(() => {
      try {
        recorder.stop();
      } catch (err) {
        // ignore
      }
    }, Math.max(500, seconds * 1000));

    fileStream.on("finish", () => {
      clearTimeout(timeout);
      resolve();
    });
    fileStream.on("error", err => {
      clearTimeout(timeout);
      reject(err);
    });

    const stream = recorder.stream();
    stream.on("error", err => {
      clearTimeout(timeout);
      reject(err);
    });
    stream.pipe(fileStream);
  });
}

async function checkWakewordOnce(cfg) {
  const localCfg = cfg.local || {};
  const audioDir = path.resolve(__dirname, "../../tools/wakeword/audio");
  const wavPath = path.join(audioDir, `wakeword_${Date.now()}.wav`);
  await recordChunk(wavPath, cfg.chunkSeconds);
  try {
    const stats = await fs.promises.stat(wavPath);
    if (!stats || stats.size < 100) {
      await fs.promises.unlink(wavPath).catch(() => {});
      return false;
    }
  } catch {
    return false;
  }

  let triggered = false;
  if (cfg.provider === "local" && (localCfg.backend || "").toLowerCase() === "sherpa-onnx") {
    await writeKeywordsFile(cfg.phrases, localCfg.keywordsRaw);
    if (!localCfg.keywordsFile || !localCfg.tokens || !localCfg.encoder || !localCfg.decoder || !localCfg.joiner) {
      throw new Error("Wakeword local config missing model paths.");
    }
    let needsCompile = true;
    if (fs.existsSync(localCfg.keywordsFile)) {
      try {
        const stats = await fs.promises.stat(localCfg.keywordsFile);
        if (stats.size > 0) {
          needsCompile = false;
        }
      } catch {
        needsCompile = true;
      }
    }
    if (needsCompile) {
      const pythonExe = getPythonExe();
      const tokensType = localCfg.tokensType || "bpe";
      const scriptPath = path.resolve(__dirname, "../Addons/wakeword_text2token.py");
      const args = [
        scriptPath,
        "--input",
        localCfg.keywordsRaw,
        "--output",
        localCfg.keywordsFile,
        "--tokens",
        localCfg.tokens,
        "--tokens-type",
        tokensType
      ];
      if (localCfg.bpeModel) {
        args.push("--bpe-model", localCfg.bpeModel);
      }
      if (localCfg.lexicon) {
        args.push("--lexicon", localCfg.lexicon);
      }
      await new Promise((resolve, reject) => {
        const child = spawn(pythonExe, args, {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, PYTHONIOENCODING: "utf-8" }
        });
        let stderr = "";
        child.stderr.on("data", data => {
          stderr += data.toString();
        });
        child.on("close", code => {
          if (code !== 0) {
            reject(new Error(stderr || `text2token exited with code ${code}`));
            return;
          }
          resolve();
        });
      });
    }
    triggered = await runSherpaKeywordSpotter(wavPath, cfg.phrases, localCfg);
  } else if (cfg.provider === "api" && cfg.api && cfg.api.url) {
    const axios = require("axios");
    const FormData = require("form-data");
    const form = new FormData();
    form.append("audio", fs.createReadStream(wavPath));
    form.append("phrases", JSON.stringify(cfg.phrases || []));
    const res = await axios.post(cfg.api.url, form, {
      headers: { ...form.getHeaders() }
    });
    triggered = Boolean(res.data && res.data.triggered);
  } else {
    triggered = false;
  }

  try {
    await fs.promises.unlink(wavPath);
  } catch (err) {
    // ignore
  }
  return triggered;
}

async function wakewordLoop() {
  const cfg = getWakewordConfig();
  if (!cfg.enabled) return;
  if (wakeLoopActive) return;

  wakeLoopActive = true;
  setMicDisabled(true);

  let cancelled = false;
  wakeLoopStop = () => {
    cancelled = true;
    wakeLoopActive = false;
  };

  while (!cancelled) {
    try {
      const triggered = await checkWakewordOnce(cfg);
      if (triggered) {
        console.log("[Wakeword] Triggered.");
        setMicDisabled(false);
        startRecordingAndRunDeepSpeech({ singleUtterance: true });
        await new Promise(resolve => setTimeout(resolve, cfg.cooldownMs));
        setMicDisabled(true);
      }
    } catch (err) {
      console.warn("[Wakeword] Error:", err.message || err);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

module.exports = {
  wakewordLoop
};
