const {
  writeToLogFile,
  writeToLogFileMusic
} = require("../../VOICEModules/LogFiles");

const { config } = require("../../../config");
const ffmpeg = require("fluent-ffmpeg");
try {
  const ffmpegPath = require("ffmpeg-static");
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
} catch (err) {
  console.warn("[Audio] ffmpeg-static not available:", err?.message || err);
}
const wav = require("wav");

async function DownloadFile(source, mp3Url, filepath, filename) {
  const axios = require("axios");
  const path = require("path");
  const fs = require("fs");
  const inputMP3File = `${filename}.mp3`;
  const outputWavFile = `${filename}.wav`;

  // Create the path to write recordings to.
  if (!fs.existsSync("./download")) {
    fs.mkdirSync("./download");
  }
  if (!fs.existsSync("./memes")) {
    fs.mkdirSync("./memes");
  }

  // Create the path to write recordings to.
  if (!fs.existsSync(filepath)) {
    fs.mkdirSync(filepath);
  }

  if (source == "memes") {
    const mp3FilePath = path.join("./download", inputMP3File);
    const outputWavPath = path.join("./memes", outputWavFile);

    if (fs.existsSync(outputWavPath)) {
      playAudioSound(filepath + "/" + outputWavFile);
    } else {
      try {
        // Download MP3 file
        const response = await axios.get(mp3Url, {
          responseType: "stream"
        });
        const mp3Stream = response.data;
        const mp3FileWriteStream = fs.createWriteStream(mp3FilePath);
        mp3Stream.pipe(mp3FileWriteStream);

        mp3FileWriteStream.on("finish", () => {
          // Conversion
          ffmpeg()
            .input(mp3FilePath)
            .audioCodec("pcm_s16le")
            .audioBitrate(1411)
            .on("end", () => {
              console.log("Conversion finished!");
              writeToLogFile("Conversion finished!");
              writeToLogFileMusic("Conversion finished!");

              playAudioSound(filepath + "/" + outputWavFile);
              fs.unlinkSync(mp3FilePath);
            })
            .on("error", err => {
              console.error("Error:", err);
            })
            .save(outputWavPath);
        });
      } catch (error) {
        console.error("Error downloading MP3 file:", error);
        writeToLogFileMusic("Error downloading MP3 file: " + error);
      }
    }
  } else {
    const { generateTts } = require("../../VOICEModules/Speak");
    const audioFileAi = generateTts(
      `This Invalid Command for Audio, Please say or stop with song name or meme number`,
      config.addons.AI.voice || "en_US-lessac-medium",
      `audio/aiout_${Date.now()}.wav`
    );
    playAudioSound(audioFileAi);
  }
}

let Speaker = null;
let speakerLoadError = null;
let speakerWarned = false;
try {
  Speaker = require("speaker");
} catch (err) {
  speakerLoadError = err;
}

function getSpeaker() {
  if (Speaker) return Speaker;
  if (!speakerWarned) {
    speakerWarned = true;
    console.warn(
      "[Audio] 'speaker' module is unavailable. Install it to enable local playback.",
      speakerLoadError ? speakerLoadError.message : ""
    );
  }
  return null;
}

let currentSpeakersound = null;
let currentAudioLabel = null;
let currentReader = null;
let currentFileStream = null;

function clearActiveStreams() {
  if (currentReader) {
    try {
      currentReader.removeAllListeners();
    } catch (err) {}
    currentReader = null;
  }
  if (currentFileStream) {
    try {
      currentFileStream.destroy();
    } catch (err) {}
    currentFileStream = null;
  }
}

function playWithWindowsSoundPlayer(audioPath) {
  const { spawn } = require("child_process");
  const path = require("path");
  if (process.platform !== "win32") {
    return Promise.resolve(false);
  }
  return new Promise(resolve => {
    const absPath = path.resolve(audioPath);
    const escapedPath = absPath.replace(/'/g, "''");
    const psCommand = [
      "try {",
      "$player = New-Object System.Media.SoundPlayer",
      `$player.SoundLocation = '${escapedPath}'`,
      "$player.Load()",
      "$player.PlaySync()",
      "exit 0",
      "} catch {",
      "exit 1",
      "}"
    ].join(" ");
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", psCommand], {
      windowsHide: true,
      stdio: "ignore"
    });
    child.on("error", err => {
      console.warn("[Audio] System player spawn failed:", err?.message || err);
      resolve(false);
    });
    child.on("exit", code => {
      if (code !== 0) {
        console.warn("[Audio] System player exit code:", code);
      }
      resolve(code === 0);
    });
  });
}

// Function to audio
function playAudioSound(audioPath, volume = 1) {
  const fs = require("fs");
  const wav = require("wav");
  const { Transform } = require("stream");
  const SpeakerCtor = getSpeaker();
  if (!SpeakerCtor) {
    return Promise.resolve();
  }
  if (currentSpeakersound) {
    currentSpeakersound.end();
    currentSpeakersound.close();
    console.log("Audio playback stopped.");
    writeToLogFileMusic("Audio playback stopped.");
    // Reset the currentSpeaker variable
    currentSpeakersound = null;
    currentAudioLabel = null;
    clearActiveStreams();
  }

  return new Promise(resolve => {
    if (!audioPath) {
      resolve();
      return;
    }

    const fileStream = fs.createReadStream(audioPath);
    const reader = new wav.Reader();
    currentFileStream = fileStream;
    currentReader = reader;

    const finish = () => {
      if (currentSpeakersound) {
        currentSpeakersound = null;
        currentAudioLabel = null;
      }
      clearActiveStreams();
      resolve();
    };

    reader.on("format", function (format) {
      const safeVolume = Math.max(0, Math.min(1, volume));
      let audioStream = reader;
      if (safeVolume !== 1 && format.bitDepth === 16) {
        audioStream = reader.pipe(new Transform({
          transform(chunk, encoding, callback) {
            const buffer = Buffer.from(chunk);
            for (let i = 0; i < buffer.length; i += 2) {
              const sample = buffer.readInt16LE(i);
              let scaled = Math.round(sample * safeVolume);
              if (scaled > 32767) scaled = 32767;
              if (scaled < -32768) scaled = -32768;
              buffer.writeInt16LE(scaled, i);
            }
            callback(null, buffer);
          }
        }));
      }
      const speaker = new SpeakerCtor(format);
      currentSpeakersound = speaker;
      currentAudioLabel = "sound";
      audioStream.pipe(speaker);
      speaker.on("close", finish);
      speaker.on("finish", finish);
      speaker.on("error", finish);
    });

    reader.on("end", finish);
    reader.on("error", finish);
    fileStream.on("error", finish);
    fileStream.pipe(reader);
  });
}

function stopAudioSound() {
  if (currentSpeakersound) {
    currentSpeakersound.end();
    currentSpeakersound.close();
    console.log("Audio playback stopped.");
    writeToLogFileMusic("Audio playback stopped.");
    currentSpeakersound = null;
    currentAudioLabel = null;
  }
  clearActiveStreams();
}

function stopWaitAudio() {
  if (currentAudioLabel !== "sound") {
    return;
  }
  stopAudioSound();
}

async function convertToPcmWav(inputPath) {
  try {
    const fs = require("fs");
    const path = require("path");
    const base = path.basename(inputPath, path.extname(inputPath));
    const outPath = path.join(path.dirname(inputPath), `${base}-pcm.wav`);
    if (fs.existsSync(outPath)) {
      return outPath;
    }
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .audioCodec("pcm_s16le")
        .audioBitrate(1411)
        .format("wav")
        .on("end", resolve)
        .on("error", reject)
        .save(outPath);
    });
    return outPath;
  } catch (err) {
    console.warn("[Audio] PCM convert failed:", err?.message || err);
    return null;
  }
}

function playAudioTTS(audioPath, options = {}) {
  const fs = require("fs");
  const path = require("path");
  const SpeakerCtor = getSpeaker();
  
  if (!audioPath || !SpeakerCtor) return Promise.resolve();
  const allowPcmRetry = options.allowPcmRetry !== false;

  stopWaitAudio();

  const resolvedPath = path.resolve(audioPath);
  console.log(`[Audio] TTS start: ${resolvedPath}`);
  let playbackPath = resolvedPath;
  let cleanupPath = null;
  try {
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`[Audio] TTS file missing: ${resolvedPath}`);
      return Promise.resolve();
    }
    const size = fs.statSync(resolvedPath).size;
    if (size < 44) {
      console.warn(`[Audio] TTS file too small to play: ${resolvedPath}`);
      return Promise.resolve();
    }
  } catch (err) {
    console.warn("[Audio] TTS file check failed:", err.message || err);
    return Promise.resolve();
  }

  const fileStream = fs.createReadStream(playbackPath);
  const reader = new wav.Reader();
  currentFileStream = fileStream;
  currentReader = reader;

  return new Promise(resolve => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(watchdog);
      clearTimeout(startupWatchdog);
      resolve();
    };

    const startupWatchdog = setTimeout(async () => {
      console.warn("[Audio] TTS did not start playback; trying system player.");
      try {
        clearActiveStreams();
        const ok = await playWithWindowsSoundPlayer(playbackPath);
        if (ok) {
          console.log("[Audio] TTS played via system player.");
          return done();
        }
      } catch (err) {
        console.warn("[Audio] System player failed:", err?.message || err);
      }
      try {
        if (allowPcmRetry && !resolvedPath.toLowerCase().endsWith("-pcm.wav")) {
          const converted = await convertToPcmWav(resolvedPath);
          if (converted) {
            console.log(`[Audio] Retrying TTS with PCM WAV: ${converted}`);
            playbackPath = converted;
            cleanupPath = converted;
            return playAudioTTS(playbackPath, { allowPcmRetry: false }).then(done);
          }
        }
      } catch (err) {
        console.warn("[Audio] PCM retry failed:", err?.message || err);
      }
      console.warn("[Audio] TTS did not start playback; skipping.");
      stopWaitAudio();
      done();
    }, 15000);

    const watchdog = setTimeout(() => {
      console.warn("[Audio] TTS playback timeout; skipping.");
      stopWaitAudio();
      done();
    }, 5 * 60 * 1000);

    // This will be fired when the WAV header is parsed
    reader.on("format", function (format) {
      clearTimeout(startupWatchdog);
      console.log("[Audio] TTS format:", JSON.stringify({
        audioFormat: format.audioFormat,
        bitDepth: format.bitDepth,
        sampleRate: format.sampleRate,
        channels: format.channels,
        float: format.float
      }));
      let audioStream = reader;
      let outFormat = format;
      if (format.float || format.audioFormat === 3 || format.bitDepth !== 16) {
        outFormat = {
          ...format,
          audioFormat: 1,
          bitDepth: 16,
          signed: true
        };
        const { Transform } = require("stream");
        audioStream = reader.pipe(new Transform({
          transform(chunk, encoding, callback) {
            try {
              let buffer;
              if (format.float || format.audioFormat === 3) {
                const floatArray = new Float32Array(chunk.buffer, chunk.byteOffset, Math.floor(chunk.length / 4));
                buffer = Buffer.alloc(floatArray.length * 2);
                for (let i = 0; i < floatArray.length; i++) {
                  let sample = Math.max(-1, Math.min(1, floatArray[i]));
                  const intSample = Math.round(sample * 32767);
                  buffer.writeInt16LE(intSample, i * 2);
                }
              } else if (format.bitDepth === 32) {
                const sampleCount = Math.floor(chunk.length / 4);
                buffer = Buffer.alloc(sampleCount * 2);
                for (let i = 0; i < sampleCount; i++) {
                  const int32 = chunk.readInt32LE(i * 4);
                  const int16 = Math.max(-32768, Math.min(32767, int32 >> 16));
                  buffer.writeInt16LE(int16, i * 2);
                }
              } else {
                buffer = chunk;
              }
              callback(null, buffer);
            } catch (err) {
              callback(err);
            }
          }
        }));
      }
      const speaker = new SpeakerCtor(outFormat);
      currentSpeakersound = speaker;
      currentAudioLabel = "tts";
      audioStream.pipe(speaker);
      const finish = () => {
        if (currentSpeakersound === speaker) {
          currentSpeakersound = null;
          currentAudioLabel = null;
        }
        clearActiveStreams();
        console.log("[Audio] TTS finished.");
        if (cleanupPath) {
          try {
            fs.unlinkSync(cleanupPath);
          } catch (err) {}
        }
        done();
      };
      speaker.on("close", finish);
      speaker.on("finish", finish);
      speaker.on("error", finish);
    });

    reader.on("end", done);
    reader.on("error", err => {
      console.warn("[Audio] TTS reader error:", err?.message || err);
      done();
    });
    fileStream.on("error", err => {
      console.warn("[Audio] TTS file error:", err?.message || err);
      done();
    });
    fileStream.pipe(reader);
  });
}

module.exports = {
  DownloadFile,
  playAudioSound,
  playAudioTTS,
  stopAudioSound,
  stopWaitAudio,
  isAudioPlaying: () => Boolean(currentSpeakersound),
  currentAudioLabel: () => currentAudioLabel
};
