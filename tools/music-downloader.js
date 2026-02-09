const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { ensureFfmpegForFluent } = require("../Modules/Addons/API/FFmpeg");
let runtimeConfig = {};
try {
  const { config } = require("../Modules/config");
  runtimeConfig = config || {};
} catch (_) {}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--out" && argv[i + 1]) {
      args.out = argv[++i];
    } else if (token === "--base" && argv[i + 1]) {
      args.base = argv[++i];
    } else if (token === "--poll" && argv[i + 1]) {
      args.poll = Number(argv[++i]);
    } else if (token === "--max" && argv[i + 1]) {
      args.max = Number(argv[++i]);
    } else {
      args._.push(token);
    }
  }
  return args;
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || "").replace(/\/+$/, "");
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFile(url, destPath) {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const response = await axios.get(url, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    const stream = response.data.pipe(fs.createWriteStream(destPath));
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function convertMp3ToWav(mp3Path, wavPath) {
  await ensureFfmpegForFluent(ffmpeg);
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(mp3Path)
      .audioCodec("pcm_s16le")
      .audioBitrate(1411)
      .on("end", resolve)
      .on("error", reject)
      .save(wavPath);
  });
}

function buildHeaders(apiKey) {
  const headers = {};
  if (apiKey) {
    headers["x-api-key"] = apiKey;
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

async function createJob(baseUrl, link, uploadDest, apiKey) {
  const url = `${baseUrl}/api/mp3/jobs`;
  const payload = { link, upload_dest: uploadDest };
  const res = await axios.post(url, payload, { headers: buildHeaders(apiKey) });
  return res.data;
}

async function pollJob(baseUrl, jobId, maxPolls, pollIntervalMs, apiKey) {
  const url = `${baseUrl}/api/jobs/${jobId}`;
  for (let i = 0; i < maxPolls; i++) {
    const res = await axios.get(url, { headers: buildHeaders(apiKey) });
    const data = res.data || {};
    const status = data.status || "unknown";
    const dl = data.download?.label || "";
    const cv = data.convert?.label || "";
    const up = data.upload?.label || "";
    process.stdout.write(
      `\r[${status}] ${dl} ${cv} ${up}`.trim()
    );
    if (status === "done" && data.url) {
      process.stdout.write("\n");
      return data;
    }
    if (status === "error" || status === "failed") {
      process.stdout.write("\n");
      throw new Error("Job failed");
    }
    await sleep(pollIntervalMs);
  }
  throw new Error("Job timed out");
}

async function main() {
  const args = parseArgs(process.argv);
  const musicCfg = runtimeConfig?.addons?.music || {};
  const link = args._[0];
  const uploadDest = musicCfg.uploadDest || "ipfs";
  const baseUrl = normalizeBaseUrl(musicCfg.baseURL || "https://dl.nekosunevr.co.uk");
  const apiKey = (musicCfg.apiKey || "").trim();

  const repoRoot = path.resolve(__dirname, "..");
  const outDir = path.join(repoRoot, "Modules", "sounds");

  const pollIntervalMs = musicCfg.pollIntervalMs || 2000;
  const maxPolls = musicCfg.maxPolls || 90;

  if (!link) {
    console.log("Usage:");
    console.log("  node tools/music-downloader.js <link>");
    process.exit(1);
  }

  console.log(`[Music] Creating job at ${baseUrl}`);
  const job = await createJob(baseUrl, link, uploadDest, apiKey);
  const jobId = job.job_id || job.jobId;
  if (!jobId) {
    throw new Error("No job_id returned");
  }
  console.log(`[Music] Job ID: ${jobId}`);

  const result = await pollJob(baseUrl, jobId, maxPolls, pollIntervalMs, apiKey);
  const fileUrl = result.url;
  if (!fileUrl) {
    throw new Error("No download URL returned");
  }

  const downloadsDir = path.join(__dirname, "..", "tools", "downloads");
  const mp3Path = path.join(downloadsDir, `${jobId}.mp3`);
  const wavPath = path.join(outDir, `${jobId}.wav`);

  console.log(`[Music] Downloading: ${fileUrl}`);
  await downloadFile(fileUrl, mp3Path);
  console.log("[Music] Converting to WAV...");
  await convertMp3ToWav(mp3Path, wavPath);

  try {
    await fs.promises.unlink(mp3Path);
  } catch (_) {}

  console.log(`[Music] Saved: ${wavPath}`);
}

main().catch(err => {
  console.error("[Music] Error:", err.message || err);
  process.exit(1);
});
