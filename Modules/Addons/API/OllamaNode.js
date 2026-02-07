const axios = require("axios");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { config } = require("../../config");
const { setupOllama } = require("../installer");

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
let managedProcess = null;
let managedByUs = false;

function normalizeBaseUrl(url) {
  if (!url) return DEFAULT_BASE_URL;
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getOllamaConfig() {
  const ollama = config?.addons?.AI?.ollama || {};
  const installDir = ollama.installDir
    ? path.resolve(__dirname, "..", "..", "..", ollama.installDir)
    : path.resolve(__dirname, "..", "..", "..", "tools", "ollama");

  return {
    enabled: typeof ollama.enabled === "boolean" ? ollama.enabled : true,
    baseURL: normalizeBaseUrl(ollama.baseURL || DEFAULT_BASE_URL),
    model: ollama.model || "",
    autoPull: typeof ollama.autoPull === "boolean" ? ollama.autoPull : true,
    autoStart: typeof ollama.autoStart === "boolean" ? ollama.autoStart : true,
    autoInstall: typeof ollama.autoInstall === "boolean" ? ollama.autoInstall : false,
    fallbackOnAnyError:
      typeof ollama.fallbackOnAnyError === "boolean" ? ollama.fallbackOnAnyError : true,
    openaiCompat: typeof ollama.openaiCompat === "boolean" ? ollama.openaiCompat : true,
    requestTimeoutMs: typeof ollama.requestTimeoutMs === "number" ? ollama.requestTimeoutMs : 120000,
    pullTimeoutMs: typeof ollama.pullTimeoutMs === "number" ? ollama.pullTimeoutMs : 1800000,
    installDir
  };
}

function normalizeOpenAIEndpoint(baseURL, endpoint) {
  const cleaned = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (baseURL.endsWith("/v1")) return cleaned.startsWith("/v1/") ? cleaned.slice(3) : cleaned;
  return cleaned.startsWith("/v1/") ? cleaned : `/v1${cleaned}`;
}

async function pingOllama(baseURL) {
  try {
    await axios.get(`${baseURL}/api/tags`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function spawnOllamaServer(exePath) {
  return new Promise((resolve) => {
    try {
      const child = spawn(exePath, ["serve"], { stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("exit", () => {
        if (managedProcess === child) {
          managedProcess = null;
          managedByUs = false;
        }
      });
      managedProcess = child;
      managedByUs = true;
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

async function fileExists(filePath) {
  try {
    await require("fs").promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveOllamaExecutable(installDir) {
  const isWin = os.platform() === "win32";
  const candidates = [
    path.join(installDir, isWin ? "ollama.exe" : "ollama"),
    path.join(installDir, "bin", isWin ? "ollama.exe" : "ollama")
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return isWin ? "ollama.exe" : "ollama";
}

async function waitForServer(baseURL, attempts = 12, delayMs = 1000) {
  for (let i = 0; i < attempts; i += 1) {
    if (await pingOllama(baseURL)) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function ensureOllamaReady(cfg) {
  if (await pingOllama(cfg.baseURL)) return true;

  if (cfg.autoInstall) {
    try {
      await setupOllama({ installDir: cfg.installDir });
    } catch (err) {
      console.warn("[Ollama] install failed:", err.message || err);
    }
  }

  if (cfg.autoStart) {
    const exePath = await resolveOllamaExecutable(cfg.installDir);
    const started = await spawnOllamaServer(exePath);
    if (!started) return false;
    return await waitForServer(cfg.baseURL);
  }

  return false;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let num = value;
  while (num >= 1024 && idx < units.length - 1) {
    num /= 1024;
    idx += 1;
  }
  return `${num.toFixed(1)} ${units[idx]}`;
}

async function pullWithProgress(cfg, model) {
  const res = await axios.post(
    `${cfg.baseURL}/api/pull`,
    { name: model, stream: true },
    { timeout: cfg.pullTimeoutMs, responseType: "stream" }
  );

  return new Promise((resolve, reject) => {
    let buffer = "";
    let lastPercent = -1;
    let lastStatus = "";
    const writeLine = (text) => {
      if (process.stdout.isTTY) {
        require("readline").clearLine(process.stdout, 0);
        require("readline").cursorTo(process.stdout, 0);
        process.stdout.write(text);
      } else {
        process.stdout.write(`\r${text}`);
      }
    };

    res.data.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;

        try {
          const msg = JSON.parse(line);
          const status = msg.status || "";
          if (status && status !== lastStatus) {
            writeLine(`[Ollama] ${status}`);
            lastStatus = status;
          }

          if (Number.isFinite(msg.total) && Number.isFinite(msg.completed)) {
            const percent = Math.floor((msg.completed / msg.total) * 100);
            if (percent !== lastPercent) {
              writeLine(
                `[Ollama] Pulling ${model}: ${percent}% (${formatBytes(msg.completed)}/${formatBytes(msg.total)})`
              );
              lastPercent = percent;
            }
          }

          if (msg.error) {
            reject(new Error(msg.error));
            return;
          }
          if (msg.status === "success") {
            if (process.stdout.isTTY) process.stdout.write("\n");
            resolve();
            return;
          }
        } catch {
          // ignore malformed lines
        }
      }
    });

    res.data.on("end", () => {
      if (process.stdout.isTTY) process.stdout.write("\n");
      resolve();
    });
    res.data.on("error", (err) => reject(err));
  });
}

async function ensureOllamaModel(cfg) {
  const model = cfg.model;
  if (!model) return;

  const tagsRes = await axios.get(`${cfg.baseURL}/api/tags`, {
    timeout: 5000
  });
  const models = tagsRes?.data?.models || [];
  const exists = models.some((m) => m.name === model || m.model === model);
  if (exists) return;

  console.log(`[Ollama] Model ${model} not found locally. Pulling...`);
  await pullWithProgress(cfg, model);
}

async function askOllama(endpoint, method = "POST", body = null) {
  const cfg = getOllamaConfig();
  if (!cfg.enabled) {
    throw new Error("Ollama fallback disabled.");
  }

  const ready = await ensureOllamaReady(cfg);
  if (!ready) {
    throw new Error("Ollama server not available.");
  }

  if (cfg.autoPull) {
    await ensureOllamaModel(cfg);
  }

  const endpointPath = cfg.openaiCompat
    ? normalizeOpenAIEndpoint(cfg.baseURL, endpoint)
    : endpoint;
  const url = `${cfg.baseURL}${endpointPath}`;
  const payload = body && typeof body === "object" ? { ...body } : body;

  if (payload && typeof payload === "object") {
    if (!payload.model && cfg.model) payload.model = cfg.model;
  }

  if (method === "GET") {
    const res = await axios.get(url, { timeout: cfg.requestTimeoutMs });
    return res.data;
  }
  if (method === "POST") {
    const res = await axios.post(url, payload, { timeout: cfg.requestTimeoutMs });
    return res.data;
  }
  throw new Error(`Unsupported method: ${method}`);
}

async function startOllamaOnBoot() {
  const cfg = getOllamaConfig();
  if (!cfg.enabled) return { started: false, running: false };

  if (await pingOllama(cfg.baseURL)) {
    if (cfg.autoPull) {
      try {
        await ensureOllamaModel(cfg);
      } catch (err) {
        console.warn("[Ollama] model pull failed:", err.message || err);
      }
    }
    return { started: false, running: true };
  }

  if (cfg.autoInstall) {
    try {
      await setupOllama({ installDir: cfg.installDir });
    } catch (err) {
      console.warn("[Ollama] install failed:", err.message || err);
    }
  }

  if (cfg.autoStart) {
    const exePath = await resolveOllamaExecutable(cfg.installDir);
    const started = await spawnOllamaServer(exePath);
    if (!started) return { started: false, running: false };
    const ready = await waitForServer(cfg.baseURL);
    if (ready && cfg.autoPull) {
      try {
        await ensureOllamaModel(cfg);
      } catch (err) {
        console.warn("[Ollama] model pull failed:", err.message || err);
      }
    }
    return { started, running: ready };
  }

  return { started: false, running: false };
}

async function stopOllamaIfManaged() {
  if (!managedProcess || !managedByUs) return;
  const pid = managedProcess.pid;
  if (!pid) return;
  try {
    if (os.platform() === "win32") {
      await new Promise((resolve) => {
        const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
          stdio: "ignore"
        });
        killer.on("close", () => resolve());
        killer.on("error", () => resolve());
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {
    // best-effort
  }
}

module.exports = {
  askOllama,
  getOllamaConfig,
  startOllamaOnBoot,
  stopOllamaIfManaged
};
