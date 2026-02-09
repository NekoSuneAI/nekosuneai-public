const axios = require("axios");
const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");

let ffmpegPathCache = null;

async function pathExists(p) {
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function findFfmpegExe(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFfmpegExe(fullPath);
      if (found) return found;
    } else if (entry.isFile() && entry.name.toLowerCase() === "ffmpeg.exe") {
      return fullPath;
    }
  }
  return null;
}

async function downloadAndExtract(zipUrl, targetDir) {
  await fs.promises.mkdir(targetDir, { recursive: true });
  const zipPath = path.join(targetDir, "ffmpeg.zip");

  const res = await axios.get(zipUrl, { responseType: "stream" });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    res.data.pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
  });

  await new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: targetDir }))
      .on("close", resolve)
      .on("error", reject);
  });

  try {
    await fs.promises.unlink(zipPath);
  } catch (_) {}
}

async function ensureFfmpegPath(options = {}) {
  if (ffmpegPathCache && (await pathExists(ffmpegPathCache))) {
    return ffmpegPathCache;
  }

  try {
    const ffmpegStatic = require("ffmpeg-static");
    if (ffmpegStatic && (await pathExists(ffmpegStatic))) {
      ffmpegPathCache = ffmpegStatic;
      return ffmpegPathCache;
    }
  } catch (_) {}

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const toolsDir = options.toolsDir || path.join(repoRoot, "tools", "ffmpeg");

  let ffmpegExe = await findFfmpegExe(toolsDir);
  if (ffmpegExe) {
    ffmpegPathCache = ffmpegExe;
    return ffmpegPathCache;
  }

  const downloadUrl =
    options.downloadUrl ||
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

  await downloadAndExtract(downloadUrl, toolsDir);
  ffmpegExe = await findFfmpegExe(toolsDir);
  if (!ffmpegExe) {
    throw new Error("ffmpeg.exe not found after download");
  }

  ffmpegPathCache = ffmpegExe;
  return ffmpegPathCache;
}

async function ensureFfmpegForFluent(ffmpeg, options = {}) {
  const ffmpegPath = await ensureFfmpegPath(options);
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
  return ffmpegPath;
}

module.exports = {
  ensureFfmpegPath,
  ensureFfmpegForFluent
};
