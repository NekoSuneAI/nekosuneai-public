const fs = require("fs").promises;
const path = require("path");
const { https } = require("follow-redirects");
const { pipeline } = require("stream");
const util = require("util");
const os = require("os");
const readline = require("readline");
const unzipper = require("unzipper");
const { config } = require("../config");

const pipelineAsync = util.promisify(pipeline);

const TOOLS_DIR = path.resolve(__dirname, "..", "..", "..", "tools");
const PYTHON_DIR = path.join(TOOLS_DIR, "python");
const PYTHON_BIN_DIR = path.join(PYTHON_DIR, "bin");
const PIPER_DIR = path.join(TOOLS_DIR, "piper");
const PIPER_BIN_DIR = path.join(PIPER_DIR, "bin");
const PIPER_MODELS_DIR = path.join(PIPER_DIR, "models");
const PIPER_TTS_CONFIGS_DIR = path.join(PIPER_DIR, "tts_configs");
const VOSK_DIR = path.join(TOOLS_DIR, "vosk");
const VOSK_BIN_DIR = path.join(VOSK_DIR, "bin");
const VOSK_MODELS_DIR = path.join(VOSK_DIR, "models");
const WHISPER_DIR = path.join(TOOLS_DIR, "whisper");
const WHISPER_BIN_DIR = path.join(WHISPER_DIR, "bin");
const WHISPER_MODELS_DIR = path.join(WHISPER_DIR, "models");

const VOICE_MODELS = require("../../config/voice_dl.json");

const LANGUAGE_MAP = {
  de_DE: "German (Germany)",
  en_US: "English (United States)",
  en_GB: "English (United Kingdom)",
  es_ES: "Spanish (Spain)",
  fr_FR: "French (France)",
  sv_SE: "Swedish (Sweden)",
  nl_NL: "Dutch (Netherlands)",
  da_DK: "Danish (Denmark)",
  it_IT: "Italian (Italy)",
  ru_RU: "Russian (Russia)",
  pt_BR: "Portuguese (Brazil)",
  pl_PL: "Polish (Poland)"
};

async function extractZip(zipPath, extractTo) {
  const fszip = require("fs");
  console.log(`Extracting ${zipPath} to ${extractTo}`);
  await pipelineAsync(
    fszip.createReadStream(zipPath),
    unzipper.Extract({ path: extractTo })
  );
  console.log("Extraction complete.");
}

function renderProgress(filename, received, total) {
  const barWidth = 30;
  const percent = total ? received / total : 0;
  const filledBar = Math.floor(barWidth * percent);
  const emptyBar = barWidth - filledBar;
  const bar = "#".repeat(filledBar) + "-".repeat(emptyBar);
  const percentage = (percent * 100).toFixed(1);
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`Downloading ${filename} [${bar}] ${percentage}% (${received}/${total} bytes)`);
}

async function downloadFile(url, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const file = await fs.open(dest, "w");
  const stream = file.createWriteStream();
  const filename = path.basename(dest);

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Node.js" } }, (response) => {
      if (response.statusCode === 404) {
        reject(new Error(`Download skipped due to 404: ${url}`));
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: Status ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers["content-length"], 10);
      let receivedBytes = 0;

      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (totalBytes) {
          renderProgress(filename, receivedBytes, totalBytes);
        }
      });

      response.on("end", () => {
        process.stdout.write("\n");
      });

      pipelineAsync(response, stream)
        .then(resolve)
        .catch((error) => reject(new Error(`Download error for ${url}: ${error.message}`)));
    }).on("error", (error) => reject(new Error(`Download error for ${url}: ${error.message}`)));
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = require("child_process").spawn(cmd, args, options);
    let stdout = "";
    let stderr = "";

    if (child.stdout) child.stdout.on("data", (d) => (stdout += d));
    if (child.stderr) child.stderr.on("data", (d) => (stderr += d));

    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function ensurePortablePython() {
  const logger = console;
  const platform = os.platform();
  const pythonExe = platform === "win32"
    ? path.join(PYTHON_DIR, "python.exe")
    : path.join(PYTHON_DIR, "bin", "python3");

  const hasPortablePython = await fileExists(pythonExe);
  if (hasPortablePython) {
    return pythonExe;
  }

  logger.info("Portable Python not found, downloading and extracting...");

  if (platform === "win32") {
    const minicondaUrl = "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe";
    const installerPath = path.join(PYTHON_BIN_DIR, "miniconda_installer.exe");

    await downloadFile(minicondaUrl, installerPath);
    await runCommand(installerPath, ["/InstallationType=JustMe", "/AddToPath=0", "/RegisterPython=0", "/S", `/D=${PYTHON_DIR}`]);
    await fs.unlink(installerPath);
    logger.info("Extracted portable Python for Windows.");
  } else if (platform === "linux" || platform === "darwin") {
    const minicondaUrl = platform === "linux"
      ? "https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh"
      : "https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh";

    const shPath = path.join(PYTHON_BIN_DIR, "miniconda.sh");
    await downloadFile(minicondaUrl, shPath);
    await fs.chmod(shPath, 0o755);
    await runCommand("bash", [shPath, "-b", "-p", PYTHON_DIR]);
    await fs.unlink(shPath);
    logger.info("Installed Miniconda portable Python.");
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return pythonExe;
}

async function ensureVoskModelDownloaded(voskLoader) {
  const modelName = config.addons.AI.vaskmodel;
  const modelDir = path.join(VOSK_MODELS_DIR, modelName);
  const modelUrl = `https://alphacephei.com/vosk/models/${modelName}.zip`;
  const zipPath = path.join(VOSK_BIN_DIR, `${modelName}.zip`);

  try {
    await fs.access(modelDir);
    console.log("Vosk model already exists, skipping download.");
    if (typeof voskLoader === "function") {
      await voskLoader();
    }
    return;
  } catch {
    // download
  }

  await fs.mkdir(VOSK_MODELS_DIR, { recursive: true });
  await fs.mkdir(VOSK_DIR, { recursive: true });
  await fs.mkdir(VOSK_BIN_DIR, { recursive: true });
  await downloadFile(modelUrl, zipPath);
  await extractZip(zipPath, VOSK_MODELS_DIR);
  await fs.unlink(zipPath);
  console.log("Vosk model is ready.");
  if (typeof voskLoader === "function") {
    await voskLoader();
  }
}

async function setupPiper() {
  const logger = console;
  const pythonExe = await ensurePortablePython();

  let piperInstalled = false;
  try {
    await runCommand(pythonExe, ["-m", "pip", "install", "--upgrade", "pip"]);
    await runCommand(pythonExe, ["-m", "pip", "show", "piper-tts"]);
    piperInstalled = true;
  } catch {
    logger.info("piper-tts not installed in portable Python. Installing...");
    await runCommand(pythonExe, ["-m", "pip", "install", "--upgrade", "pip"]);
    await runCommand(pythonExe, ["-m", "pip", "install", "piper-tts"]);
    piperInstalled = true;
  }

  if (!piperInstalled) {
    throw new Error("Failed to install piper-tts");
  }
  logger.info("piper-tts is installed.");

  await fs.mkdir(PIPER_MODELS_DIR, { recursive: true });
  await fs.mkdir(PIPER_BIN_DIR, { recursive: true });

  for (const model of VOICE_MODELS) {
    const onnxPath = path.join(PIPER_MODELS_DIR, `${model.name}.onnx`);
    const jsonPath = path.join(PIPER_MODELS_DIR, `${model.name}.onnx.json`);

    if (!(await fileExists(onnxPath))) {
      logger.info(`Downloading voice model ${model.name}.onnx...`);
      await downloadFile(model.onnx, onnxPath);
    }
    if (!(await fileExists(jsonPath))) {
      logger.info(`Downloading voice model metadata ${model.name}.onnx.json...`);
      await downloadFile(model.json, jsonPath);
    }
  }

  await fs.mkdir(PIPER_TTS_CONFIGS_DIR, { recursive: true });
  for (const model of VOICE_MODELS) {
    const configPath = path.join(PIPER_TTS_CONFIGS_DIR, `${model.name}.json`);
    const langCode = model.name.split("-")[0];
    const provider = langCode.toLowerCase() + "_" + model.name.split("-")[1].split("-")[0];
    const configData = {
      provider: provider,
      voice: model.name,
      language: LANGUAGE_MAP[langCode] || "Unknown Language",
      pythonPath: pythonExe,
      modelPath: path.join(PIPER_MODELS_DIR, `${model.name}.onnx`),
      configPath: path.join(PIPER_MODELS_DIR, `${model.name}.onnx.json`)
    };
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`Generated TTS config: ${model.name}.json\r`);
  }

  logger.info("Piper Python setup complete.");
}

async function setupWhisper() {
  const logger = console;
  const pythonExe = await ensurePortablePython();
  await runCommand(pythonExe, ["-m", "pip", "install", "--upgrade", "pip"]);
  await runCommand(pythonExe, ["-m", "pip", "install", "faster-whisper"]);
  await fs.mkdir(WHISPER_MODELS_DIR, { recursive: true });
  await fs.mkdir(WHISPER_BIN_DIR, { recursive: true });
  logger.info("faster-whisper is installed.");
}

async function setupWakeword() {
  const logger = console;
  const pythonExe = await ensurePortablePython();
  await runCommand(pythonExe, ["-m", "pip", "install", "--upgrade", "pip"]);
  await runCommand(pythonExe, ["-m", "pip", "install", "sherpa-onnx"]);
  logger.info("sherpa-onnx is installed.");
}

module.exports = {
  TOOLS_DIR,
  PYTHON_DIR,
  PYTHON_BIN_DIR,
  PIPER_DIR,
  PIPER_BIN_DIR,
  PIPER_MODELS_DIR,
  PIPER_TTS_CONFIGS_DIR,
  VOSK_DIR,
  VOSK_BIN_DIR,
  VOSK_MODELS_DIR,
  WHISPER_DIR,
  WHISPER_BIN_DIR,
  WHISPER_MODELS_DIR,
  ensurePortablePython,
  ensureVoskModelDownloaded,
  setupPiper,
  setupWhisper,
  setupWakeword
};
