const fs = require("fs").promises;
const path = require("path");
const { https } = require("follow-redirects");
const { pipeline } = require("stream");
const util = require("util");
const os = require("os");
const readline = require("readline");
const unzipper = require("unzipper");
const { config } = require("../../config");

const pipelineAsync = util.promisify(pipeline);

const TOOLS_DIR = path.resolve(__dirname, "..", "..", "..", "tools");
const DOWNLOADS_DIR = path.join(TOOLS_DIR, "downloads");
const PYTHON_DIR = path.join(TOOLS_DIR, "python");
const PYTHON_FALLBACK_DIR = path.join(TOOLS_DIR, "python_portable");
const PYTHON_BIN_DIR = path.join(PYTHON_DIR, "bin");
const PYTHON_FALLBACK_BIN_DIR = path.join(PYTHON_FALLBACK_DIR, "bin");

async function resolvePythonDir() {
  const platform = os.platform();
  const primaryExe = platform === "win32"
    ? path.join(PYTHON_DIR, "python.exe")
    : path.join(PYTHON_DIR, "bin", "python3");
  const fallbackExe = platform === "win32"
    ? path.join(PYTHON_FALLBACK_DIR, "python.exe")
    : path.join(PYTHON_FALLBACK_DIR, "bin", "python3");

  if (await fileExists(primaryExe)) return { dir: PYTHON_DIR, exe: primaryExe };
  if (await fileExists(fallbackExe)) return { dir: PYTHON_FALLBACK_DIR, exe: fallbackExe };
  return { dir: PYTHON_DIR, exe: primaryExe, fallbackDir: PYTHON_FALLBACK_DIR, fallbackExe };
}
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
const WAKEWORD_DIR = path.join(TOOLS_DIR, "wakeword");
const WAKEWORD_MODELS_DIR = path.join(WAKEWORD_DIR, "models");
const OLLAMA_DIR = path.join(TOOLS_DIR, "ollama");

const VOICE_MODELS = require("../../../config/voice_dl.json");

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

async function extractTarBz2(archivePath, extractTo) {
  const tar = require("tar");
  const unbzip2 = require("unbzip2-stream");
  const fsNative = require("fs");
  console.log(`Extracting ${archivePath} to ${extractTo}`);
  await fs.mkdir(extractTo, { recursive: true });
  await pipelineAsync(
    fsNative.createReadStream(archivePath),
    unbzip2(),
    tar.x({ cwd: extractTo })
  );
  console.log("Extraction complete.");
}

async function extractTarGz(archivePath, extractTo) {
  const tar = require("tar");
  console.log(`Extracting ${archivePath} to ${extractTo}`);
  await fs.mkdir(extractTo, { recursive: true });
  await tar.x({ file: archivePath, cwd: extractTo });
  console.log("Extraction complete.");
}
function renderProgress(filename, received, total) {
  const barWidth = 30;
  const percent = total ? received / total : 0;
  const filledBar = Math.floor(barWidth * percent);
  const emptyBar = barWidth - filledBar;
  const bar = "#".repeat(filledBar) + "-".repeat(emptyBar);
  const percentage = (percent * 100).toFixed(1);
  const line = `Downloading ${filename} [${bar}] ${percentage}% (${received}/${total} bytes)`;
  if (process.stdout.isTTY) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(line);
  } else {
    process.stdout.write(`\r${line}`);
  }
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

async function directoryHasEntries(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function findAlternateDir(baseDir) {
  for (let i = 2; i <= 5; i += 1) {
    const candidate = `${baseDir}_${i}`;
    if (!(await directoryHasEntries(candidate))) {
      return candidate;
    }
  }
  return null;
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
  const resolved = await resolvePythonDir();
  const pythonExe = resolved.exe;

  const hasPortablePython = await fileExists(pythonExe);
  if (hasPortablePython) {
    return pythonExe;
  }

  let targetDir = resolved.dir;
  const fallbackDir = resolved.fallbackDir || PYTHON_FALLBACK_DIR;
  const targetHasEntries = await directoryHasEntries(targetDir);
  if (targetHasEntries && !(await fileExists(pythonExe))) {
    targetDir = fallbackDir;
  }
  if (await directoryHasEntries(targetDir) && !(await fileExists(platform === "win32"
    ? path.join(targetDir, "python.exe")
    : path.join(targetDir, "bin", "python3")))) {
    const altDir = await findAlternateDir(fallbackDir);
    if (altDir) targetDir = altDir;
  }

  logger.info("Portable Python not found, downloading and extracting...");

  if (platform === "win32") {
    const minicondaUrl = "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe";
    const installerPath = path.join(DOWNLOADS_DIR, "miniconda_installer.exe");

    await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
    await downloadFile(minicondaUrl, installerPath);
    try {
      await runCommand(installerPath, ["/InstallationType=JustMe", "/AddToPath=0", "/RegisterPython=0", "/S", `/D=${targetDir}`]);
    } catch (err) {
      if (String(err.message || "").includes("not empty")) {
        const altDir = await findAlternateDir(PYTHON_FALLBACK_DIR);
        if (altDir) {
          targetDir = altDir;
          await runCommand(installerPath, ["/InstallationType=JustMe", "/AddToPath=0", "/RegisterPython=0", "/S", `/D=${targetDir}`]);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
    await fs.unlink(installerPath);
    logger.info("Extracted portable Python for Windows.");
  } else if (platform === "linux" || platform === "darwin") {
    const minicondaUrl = platform === "linux"
      ? "https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh"
      : "https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh";

    const shPath = path.join(DOWNLOADS_DIR, "miniconda.sh");
    await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
    await downloadFile(minicondaUrl, shPath);
    await fs.chmod(shPath, 0o755);
    await runCommand("bash", [shPath, "-b", "-p", targetDir]);
    await fs.unlink(shPath);
    logger.info("Installed Miniconda portable Python.");
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const finalExe = platform === "win32"
    ? path.join(targetDir, "python.exe")
    : path.join(targetDir, "bin", "python3");
  return finalExe;
}

async function ensureVoskModelDownloaded(voskLoader) {
  const modelName = config.addons.AI.vaskmodel;
  const modelDir = path.join(VOSK_MODELS_DIR, modelName);
  const modelUrl = `https://alphacephei.com/vosk/models/${modelName}.zip`;
  const zipPath = path.join(DOWNLOADS_DIR, `${modelName}.zip`);

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
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
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
  await runCommand(pythonExe, ["-m", "pip", "install", "sentencepiece"]);
  await runCommand(pythonExe, ["-m", "pip", "install", "pypinyin"]);
  logger.info("sherpa-onnx is installed.");

  const wakeCfg = config.addons?.AI?.wakeword || {};
  const localCfg = wakeCfg.local || {};
  const modelUrl = localCfg.modelUrl || "";
  const modelsDir = localCfg.modelsDir || WAKEWORD_MODELS_DIR;
  const modelName = localCfg.modelName || "";
  const modelBase = modelName ? path.join(modelsDir, modelName) : modelsDir;

  if (modelUrl && modelName) {
    const tokensPath = path.join(modelBase, "tokens.txt");
    if (!(await fileExists(tokensPath))) {
      await fs.mkdir(modelsDir, { recursive: true });
      await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
      const archiveName = path.basename(modelUrl);
      const archivePath = path.join(DOWNLOADS_DIR, archiveName);
      logger.info(`Downloading wakeword model ${archiveName}...`);
      await downloadFile(modelUrl, archivePath);
      logger.info("Extracting wakeword model archive...");
      try {
        await runCommand("tar", ["-xvf", archivePath, "-C", modelsDir]);
      } catch (err) {
        logger.warn("System tar failed; using built-in extractor.");
        await extractTarBz2(archivePath, modelsDir);
      }
      await fs.unlink(archivePath);
      logger.info("Wakeword model extracted.");
    } else {
      logger.info("Wakeword model already exists, skipping download.");
    }
  } else {
    logger.warn("Wakeword model URL not configured; skipping model download.");
  }
}

async function setupOllama(options = {}) {
  const logger = console;
  const platform = os.platform();
  const arch = os.arch();
  const installDir = options.installDir || OLLAMA_DIR;

  await fs.mkdir(installDir, { recursive: true });
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });

  if (platform === "win32") {
    const zipUrl = "https://ollama.com/download/ollama-windows-amd64.zip";
    const zipPath = path.join(DOWNLOADS_DIR, "ollama-windows-amd64.zip");
    if (!(await fileExists(path.join(installDir, "ollama.exe")))) {
      logger.info("Downloading Ollama for Windows...");
      await downloadFile(zipUrl, zipPath);
      await extractZip(zipPath, installDir);
      await fs.unlink(zipPath);
      logger.info("Ollama extracted for Windows.");
    } else {
      logger.info("Ollama already installed, skipping download.");
    }
    return;
  }

  if (platform === "linux") {
    const archLabel = arch === "arm64" ? "arm64" : "amd64";
    const tarUrl = `https://ollama.com/download/ollama-linux-${archLabel}.tgz`;
    const tarPath = path.join(DOWNLOADS_DIR, `ollama-linux-${archLabel}.tgz`);
    const binPath = path.join(installDir, "bin", "ollama");

    if (!(await fileExists(binPath))) {
      logger.info(`Downloading Ollama for Linux (${archLabel})...`);
      await downloadFile(tarUrl, tarPath);
      await extractTarGz(tarPath, installDir);
      await fs.unlink(tarPath);
      try {
        await fs.chmod(binPath, 0o755);
      } catch {
        // best-effort
      }
      logger.info("Ollama extracted for Linux.");
    } else {
      logger.info("Ollama already installed, skipping download.");
    }
    return;
  }

  throw new Error(`Unsupported platform for Ollama installer: ${platform}`);
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
  WAKEWORD_DIR,
  WAKEWORD_MODELS_DIR,
  OLLAMA_DIR,
  ensurePortablePython,
  ensureVoskModelDownloaded,
  setupPiper,
  setupWhisper,
  setupWakeword,
  setupOllama
};
