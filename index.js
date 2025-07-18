const { config } = require("./Modules/config");

const {
  startRecordingAndRunDeepSpeech,
  voskLoader
} = require("./Modules/AUTOAI/VOICEModules/Main");

const {
  sendToWebhookerror
} = require("./Modules/AUTOAI/AddonsModules/API/Webhooks");

const fs = require('fs').promises;
const path = require('path');
const { https } = require('follow-redirects');
const { pipeline } = require('stream');
const util = require('util');
const pipelineAsync = util.promisify(pipeline);
const os = require('os');
const logger = console;
const readline = require('readline');
const unzipper = require('unzipper');
const {loadTtsConfigs} = require("./Modules/AUTOAI/VOICEModules/Speak");

const PIPER_DIR = 'piper';
const MODELS_DIR = path.join(PIPER_DIR, 'models');


const MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip';
const ZIP_PATH = config.addons.AI.vaskmodel || "./model/vosk-model-en-us-0.22";
const EXTRACT_PATH = './model/';

// Voice model download URLs (from Hugging Face)
const VOICE_MODELS = require('./voice_dl.json');

// Language mapping for TTS configs
const LANGUAGE_MAP = {
    'de_DE': 'German (Germany)',
    'en_US': 'English (United States)',
    'en_GB': 'English (United Kingdom)',
    'es_ES': 'Spanish (Spain)',
    'fr_FR': 'French (France)',
    'sv_SE': 'Swedish (Sweden)',
    'nl_NL': 'Dutch (Netherlands)',
    'da_DK': 'Danish (Denmark)',
    'it_IT': 'Italian (Italy)',
    'ru_RU': 'Russian (Russia)',
    'pt_BR': 'Portuguese (Brazil)',
    'pl_PL': 'Polish (Poland)',
};

// Unzip the downloaded model into ./model/
async function extractZip(zipPath, extractTo) {
    console.log(`Extracting ${zipPath} to ${extractTo}`);
    await pipelineAsync(
        fs.open(zipPath, 'r').then(f => f.createReadStream()),
        unzipper.Extract({ path: extractTo })
    );
    console.log('Extraction complete.');
}

// Helper function to render a progress bar
function renderProgress(filename, received, total) {
    const barWidth = 30;
    const percent = total ? received / total : 0;
    const filledBar = Math.floor(barWidth * percent);
    const emptyBar = barWidth - filledBar;
    const bar = '█'.repeat(filledBar) + '░'.repeat(emptyBar);
    const percentage = (percent * 100).toFixed(1);
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`Downloading ${filename} [${bar}] ${percentage}% (${received}/${total} bytes)`);
}

// Download file from URL to destination with progress bar
async function downloadFile(url, dest) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const file = await fs.open(dest, 'w');
    const stream = file.createWriteStream();
    const filename = path.basename(dest);

    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (response) => {
            if (response.statusCode === 404) {
                reject(new Error(`Download skipped due to 404: ${url}`));
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: Status ${response.statusCode}`));
                return;
            }

            const totalBytes = parseInt(response.headers['content-length'], 10);
            let receivedBytes = 0;

            response.on('data', (chunk) => {
                receivedBytes += chunk.length;
                if (totalBytes) {
                    renderProgress(filename, receivedBytes, totalBytes);
                }
            });

            response.on('end', () => {
                process.stdout.write('\n'); // move to next line after done
            });

            pipelineAsync(response, stream)
                .then(resolve)
                .catch((error) => reject(new Error(`Download error for ${url}: ${error.message}`)));
        }).on('error', (error) => reject(new Error(`Download error for ${url}: ${error.message}`)));
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
    const child = require('child_process').spawn(cmd, args, options);
    let stdout = '';
    let stderr = '';

    if (child.stdout) child.stdout.on('data', (d) => (stdout += d));
    if (child.stderr) child.stderr.on('data', (d) => (stderr += d));

    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function ensureVoskModelDownloaded() {
    const modelDir = path.join(EXTRACT_PATH, 'vosk-model-en-us-0.22');

    try {
        // Check if model already exists
        await fs.access(modelDir);
        console.log('Model already exists, skipping download.');
        const model = await voskLoader();
        await loadTtsConfigs()

        startRecordingAndRunDeepSpeech();
        LoadsReadOSC();
        return;
    } catch {
        // Directory does not exist — proceed with download and extraction
    }

    try {
        // Download zip
        await downloadFile(MODEL_URL, ZIP_PATH);

        // Extract it
        await extractZip(ZIP_PATH, EXTRACT_PATH);

        // Optionally delete zip after extraction
        await fs.unlink(ZIP_PATH);

        console.log('Model is ready.');

        const model = await voskLoader();

        await loadTtsConfigs()

        startRecordingAndRunDeepSpeech();
        LoadsReadOSC();

    } catch (err) {
        console.error('Failed to set up Vosk model:', err.message);
    }
}


async function setupPiper() {
  try {
    const platform = os.platform();

    // Define portable python path (adjust for your structure)
    const portablePythonDir = path.resolve(__dirname, 'python-portable');
    const pythonExe = platform === 'win32'
      ? path.join(portablePythonDir, 'python.exe')
      : path.join(portablePythonDir, 'bin', 'python3');

    // Check if portable python exists
    const hasPortablePython = await fileExists(pythonExe);

    if (!hasPortablePython) {
  logger.info('Portable Python not found, downloading and extracting...');

  if (platform === 'win32') {
    // Download official Python embeddable zip for Windows (adjust version/url if needed)
    const minicondaUrl = 'https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe';
    const installerPath = path.join(__dirname, 'miniconda_installer.exe');

    await downloadFile(minicondaUrl, installerPath);

    // Run silent install to your portablePythonDir
    await runCommand(installerPath, ['/InstallationType=JustMe', '/AddToPath=0', `/RegisterPython=0`, `/S`, `/D=${portablePythonDir}`]);

    await fs.unlink(installerPath);

    logger.info('Extracted portable Python for Windows.');

  } else if (platform === 'linux' || platform === 'darwin') {
    // For Linux/macOS, you can download Miniconda installer and install silently to portablePythonDir
    // Example for Linux x86_64 Miniconda:
    const minicondaUrl = platform === 'linux'
      ? 'https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh'
      : 'https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh';

    const shPath = path.join(__dirname, 'miniconda.sh');
    await downloadFile(minicondaUrl, shPath);

    // Make installer executable and run silently
    await fs.chmod(shPath, 0o755);
    await runCommand('bash', [shPath, '-b', '-p', portablePythonDir]);
    await fs.unlink(shPath);

    logger.info('Installed Miniconda portable Python.');
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}


    // Check if piper-tts installed
    let piperInstalled = false;
    try {
      await runCommand(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip']);
      await runCommand(pythonExe, ['-m', 'pip', 'show', 'piper-tts']);
      piperInstalled = true;
    } catch {
      logger.info('piper-tts not installed in portable Python. Installing...');
      await runCommand(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip']);
      await runCommand(pythonExe, ['-m', 'pip', 'install', 'piper-tts']);
      piperInstalled = true;
    }

    if (!piperInstalled) {
      throw new Error('Failed to install piper-tts');
    }
    logger.info('piper-tts is installed.');

    // Ensure models directory
    await fs.mkdir(MODELS_DIR, { recursive: true });

    // Download voice models if missing
    for (const model of VOICE_MODELS) {
      const onnxPath = path.join(MODELS_DIR, `${model.name}.onnx`);
      const jsonPath = path.join(MODELS_DIR, `${model.name}.onnx.json`);

      if (!(await fileExists(onnxPath))) {
        logger.info(`Downloading voice model ${model.name}.onnx...`);
        await downloadFile(model.onnx, onnxPath);
      }
      if (!(await fileExists(jsonPath))) {
        logger.info(`Downloading voice model metadata ${model.name}.onnx.json...`);
        await downloadFile(model.json, jsonPath);
      }
    }

    // Generate TTS config files for each voice model
    await fs.mkdir('tts_configs', { recursive: true });
    for (const model of VOICE_MODELS) {
      const configPath = path.join('tts_configs', `${model.name}.json`);
      const langCode = model.name.split('-')[0];
      const provider = langCode.toLowerCase() + '_' + model.name.split('-')[1].split('-')[0];
      const config = {
        provider: provider,
        voice: model.name,
        language: LANGUAGE_MAP[langCode] || 'Unknown Language',
        pythonPath: pythonExe,
        modelPath: path.join(MODELS_DIR, `${model.name}.onnx`),
        configPath: path.join(MODELS_DIR, `${model.name}.onnx.json`),
      };
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); process.stdout.write(`Generated TTS config: ${model.name}.json\r`);
    }

    logger.info('Piper Python setup complete.');
    await ensureVoskModelDownloaded();
  } catch (error) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`Error setting up Piper TTS: ${error.message}\r`);
    process.exit(1);
  }
}

const { LoadsReadOSC } = require("./Modules/AUTOAI/AddonsModules/OSC/Recieved");

//////////////////////////////////////////////////
//AI SYSTEM
require("log-timestamp"); //npm log-timestamp
const chalk = require("chalk");

//////////////////////////////////////////////////

if (config.addons.AI.toggle == true) {
  setupPiper();
}

if (config.addons.FriendsSystem.toggle == true) {
  const { VRCFriends } = require("./Modules/FriendsSystem/Modules/VRChat");

  VRCFriends();
}

// ———————————————[Error Handling]———————————————
process.on("unhandledRejection", (reason, p) => {
  if (
    reason ===
    "Error [INTERACTION_ALREADY_REPLIED]: The reply to this interaction has already been sent or deferred."
  )
    return;

  console.log(chalk.gray("—————————————————————————————————"));
  console.log(
    chalk.white("["),
    chalk.red.bold("AntiCrash"),
    chalk.white("]"),
    chalk.gray(" : "),
    chalk.white.bold("Unhandled Rejection/Catch")
  );
  console.log(chalk.gray("—————————————————————————————————"));

  sendToWebhookerror(`NekoSuneAI Error (unhandledRejection)`, reason);
  console.log(reason, p);
  startRecordingAndRunDeepSpeech();
});
process.on("uncaughtException", (err, origin) => {
  console.log(chalk.gray("—————————————————————————————————"));
  console.log(
    chalk.white("["),
    chalk.red.bold("AntiCrash"),
    chalk.white("]"),
    chalk.gray(" : "),
    chalk.white.bold("Uncaught Exception/Catch")
  );
  console.log(chalk.gray("—————————————————————————————————"));

  sendToWebhookerror(`NekoSuneAI Error (uncaughtException)`, err);
  console.log(err, origin);
  startRecordingAndRunDeepSpeech();
});
