const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
try {
  const ffmpegPath = require("ffmpeg-static");
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
} catch (err) {
  console.warn("[Music] ffmpeg-static not available:", err?.message || err);
}
const { config } = require("../../../config");
const { writeToLogFileMusic } = require("../../VOICEModules/LogFiles");

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || "").replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeUrl(raw) {
  if (!raw) return "";
  return raw.replace(/[)\].,!?]+$/g, "");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function createJob(link, uploadDest) {
  const baseUrl = normalizeBaseUrl(config.addons.music?.baseURL);
  if (!baseUrl) {
    return { error: "Music baseURL is not configured." };
  }
  const apiKey = (config.addons.music?.apiKey || "").trim();
  if (!apiKey) {
    return { error: "Music API key is not configured." };
  }
  const url = `${baseUrl}/api/mp3/jobs`;
  const payload = {
    link,
    upload_dest: uploadDest
  };
  const res = await axios.post(url, payload, {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      Authorization: `Bearer ${apiKey}`
    }
  });
  const jobId = res?.data?.job_id;
  if (!jobId) {
    return { error: "Music job did not return a job_id." };
  }
  return { jobId, baseUrl };
}

async function pollJob(baseUrl, jobId, maxPolls, pollIntervalMs) {
  const url = `${baseUrl}/api/jobs/${jobId}`;
  const apiKey = (config.addons.music?.apiKey || "").trim();
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const res = await axios.get(url, {
      headers: apiKey
        ? {
            "x-api-key": apiKey,
            Authorization: `Bearer ${apiKey}`
          }
        : undefined
    });
    const data = res?.data || {};
    const status = (data.status || "").toLowerCase();
    if (status === "done") {
      return { data };
    }
    if (status === "error" || status === "failed") {
      return { error: `Music job failed with status: ${status}` };
    }
    await sleep(pollIntervalMs);
  }
  return { error: "Music job timed out." };
}

async function downloadFile(url, destPath) {
  const response = await axios.get(url, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    const stream = response.data.pipe(fs.createWriteStream(destPath));
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function convertMp3ToWav(mp3Path, wavPath) {
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

async function fetchMusicWavFromUrl(link) {
  try {
    const safeLink = safeUrl(link);
    if (!safeLink) {
      return { error: "Invalid music link." };
    }

    const uploadDest = config.addons.music?.uploadDest || "cdn";
    const maxPolls = Number(config.addons.music?.maxPolls) || 90;
    const pollIntervalMs = Number(config.addons.music?.pollIntervalMs) || 2000;
    const downloadDir = config.addons.music?.downloadDir || "music";

    const job = await createJob(safeLink, uploadDest);
    if (job.error) return job;

    writeToLogFileMusic(`[Music] Job started: ${job.jobId}`);

    const poll = await pollJob(job.baseUrl, job.jobId, maxPolls, pollIntervalMs);
    if (poll.error) return poll;

    const fileUrl = poll.data?.url;
    if (!fileUrl) {
      return { error: "Music job finished but no file URL was returned." };
    }

    ensureDir(downloadDir);
    const mp3Path = path.join(downloadDir, `${job.jobId}.mp3`);
    const wavPath = path.join(downloadDir, `${job.jobId}.wav`);

    await downloadFile(fileUrl, mp3Path);
    await convertMp3ToWav(mp3Path, wavPath);
    try {
      fs.unlinkSync(mp3Path);
    } catch (err) {}

    writeToLogFileMusic(`[Music] Ready: ${wavPath}`);

    return { wavPath, jobId: job.jobId, url: fileUrl };
  } catch (error) {
    console.error("[Music] Error:", error);
    return { error: "Music download failed." };
  }
}

module.exports = {
  fetchMusicWavFromUrl
};
