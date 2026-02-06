const fs = require("fs");
let ytSearch = null;
const { config } = require("../../../../config");
const { fetchMusicWavFromUrl } = require("../../../../Addons/API/MusicRest");
const { playAudioSound, playAudioTTS, stopAudioSound } = require("../Audios/AudioDownloader");
const { generateTts } = require("../../VOICEModules/Speak");
const { startRecordingAndRunDeepSpeech } = require("../../VOICEModules/Main");
const { isMicDisabled } = require("../../../../Addons/VoiceState");
const { writeToLogFileMusic } = require("../../VOICEModules/LogFiles");

const queue = [];
let isPlaying = false;
let initStarted = false;
const playbackTimeoutMs = Number(config.addons.music?.playbackTimeoutMs) || 10 * 60 * 1000;
const {
  addQueueItem,
  getPendingItems,
  markPlaying,
  markDone,
  markFailed
} = require("./musicQueueStore");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isUrl(text) {
  return /^https?:\/\//i.test(text || "");
}

function cleanupTitle(text) {
  if (!text) return "";
  return text
    .replace(/\s*[\[(].*?[\])]\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitArtistTitle(title) {
  const cleaned = cleanupTitle(title);
  const parts = cleaned.split(" - ");
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const track = parts.slice(1).join(" - ").trim();
    if (artist && track) {
      return { artist, title: track };
    }
  }
  return { artist: "", title: cleaned };
}

function scoreVideo(video) {
  if (!video) return -999;
  const title = (video.title || "").toLowerCase();
  let score = 0;
  const badTokens = [
    "official video",
    "live",
    "cover",
    "remix",
    "instrumental",
    "karaoke",
    "nightcore",
    "sped up",
    "slowed",
    "reaction"
  ];
  const goodTokens = [
    "lyrics",
    "lyric",
    "official audio",
    "audio"
  ];
  for (const token of badTokens) {
    if (title.includes(token)) score -= 3;
  }
  for (const token of goodTokens) {
    if (title.includes(token)) score += 3;
  }
  if (title.includes(" - ")) score += 1;
  const seconds = Number(video.seconds || 0);
  if (seconds >= 60 && seconds <= 420) score += 2;
  if (seconds > 900) score -= 2;
  const author = (video.author?.name || "").toLowerCase();
  if (author.includes("topic")) score += 1;
  return score;
}

function pickBestVideo(videos) {
  let best = null;
  let bestScore = -999;
  for (const video of videos) {
    const score = scoreVideo(video);
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }
  return best || videos[0];
}

async function resolveYoutubeVideo(query) {
  if (!ytSearch) {
    try {
      ytSearch = require("yt-search");
    } catch (err) {
      return { error: "yt-search is not installed. Run npm install." };
    }
  }
  const result = await ytSearch({ query, pages: 1 });
  const videos = Array.isArray(result?.videos) ? result.videos : [];
  if (!videos.length) {
    return { error: "No matching songs found." };
  }
  const picked = pickBestVideo(videos);
  if (!picked || !picked.url) {
    return { error: "No matching songs found." };
  }
  return { video: picked };
}

async function speakNowPlaying(text) {
  const voice = config.addons.AI.voice || "en_US-lessac-medium";
  const path = require("path");
  const { ensureDir, getModeDataDir } = require("../../../../Addons/DataPaths");
  const ttsFile = await generateTts(
    text,
    voice,
    path.join(ensureDir(path.join(getModeDataDir(), "audio")), `aiout_${Date.now()}.wav`)
  );
  await playAudioTTS(ttsFile);
  try {
    fs.unlinkSync(ttsFile);
  } catch (err) {}
  await sleep(350);
}

async function playAudioWithTimeout(filePath) {
  let timedOut = false;
  await Promise.race([
    playAudioSound(filePath),
    sleep(playbackTimeoutMs).then(() => {
      timedOut = true;
    })
  ]);
  if (timedOut) {
    try {
      stopAudioSound();
    } catch (err) {}
    throw new Error("Playback timed out.");
  }
}

async function playQueue() {
  if (isPlaying) return;
  isPlaying = true;
  while (true) {
    const item = queue.shift();
    if (!item) break;
    try {
      if (item.id) {
        await markPlaying(item.id);
      }
      writeToLogFileMusic(`[Music] Searching: ${item.queryOrUrl}`);
      let video = null;
      if (isUrl(item.queryOrUrl)) {
        video = { url: item.queryOrUrl, title: item.queryOrUrl };
      } else {
        const resolved = await resolveYoutubeVideo(item.queryOrUrl);
        if (resolved.error) {
          await speakNowPlaying(resolved.error);
          if (item.id) {
            await markFailed(item.id);
          }
          writeToLogFileMusic(`[Music] ${resolved.error}`);
          continue;
        }
        video = resolved.video;
      }

      const fromTitle = splitArtistTitle(video.title || "");
      const artist = fromTitle.artist || video.author?.name || "";
      const title = fromTitle.title || cleanupTitle(video.title) || "Unknown title";
      const download = await fetchMusicWavFromUrl(video.url);
      if (download?.error) {
        writeToLogFileMusic(`[Music] ${download.error}`);
        await speakNowPlaying(download.error);
        if (item.id) {
          await markFailed(item.id);
        }
        continue;
      }

      const nowPlayingText = artist
        ? `Now playing: ${artist} - ${title}`
        : `Now playing: ${title}`;

      writeToLogFileMusic(`[Music] ${nowPlayingText}`);
      await speakNowPlaying(nowPlayingText);
      writeToLogFileMusic(`[Music] Source: ${video.url}`);

      try {
        await playAudioWithTimeout(download.wavPath);
      } finally {
        try {
          fs.unlinkSync(download.wavPath);
        } catch (err) {}
      }
      if (item.id) {
        await markDone(item.id);
      }
    } catch (err) {
      writeToLogFileMusic(`[Music] Playback failed: ${err.message}`);
      if (item.id) {
        await markFailed(item.id);
      }
    }
  }
  isPlaying = false;
  if (queue.length > 0) {
    playQueue();
    return;
  }
  if (!isMicDisabled()) {
    startRecordingAndRunDeepSpeech();
  }
}

async function enqueueMusic(queryOrUrl) {
  if (!queryOrUrl || !queryOrUrl.trim()) {
    return { error: "Please provide a song name or URL." };
  }
  const payload = { queryOrUrl: queryOrUrl.trim() };
  try {
    const item = await addQueueItem(payload.queryOrUrl);
    if (item && item.id) {
      payload.id = item.id;
    }
  } catch (err) {}
  queue.push(payload);
  writeToLogFileMusic(`[Music] Queued: ${payload.queryOrUrl}`);
  playQueue();
  return { queued: true, position: queue.length };
}

async function initQueueFromStorage() {
  if (initStarted) return;
  initStarted = true;
  try {
    const pending = await getPendingItems();
    for (const item of pending) {
      queue.push({ id: item.id, queryOrUrl: item.query });
    }
    if (queue.length > 0) {
      playQueue();
    }
  } catch (err) {
    writeToLogFileMusic(`[Music] Failed to load queue: ${err.message}`);
  }
}

module.exports = {
  enqueueMusic,
  initQueueFromStorage
};
