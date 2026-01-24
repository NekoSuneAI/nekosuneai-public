const { generateTts } = require("../../VOICEModules/Speak");

const {
  writeToLogFile,
  writeToLogFileMusic
} = require("../../VOICEModules/LogFiles");

const { config } = require("../../../config");
const wav = require("wav");

async function DownloadFile(source, mp3Url, filepath, filename) {
  const axios = require("axios");
  const path = require("path");
  const fs = require("fs");
  const ffmpeg = require("fluent-ffmpeg");
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
  }

  return new Promise(resolve => {
    if (!audioPath) {
      resolve();
      return;
    }

    const fileStream = fs.createReadStream(audioPath);
    const reader = new wav.Reader();

    const finish = () => {
      if (currentSpeakersound) {
        currentSpeakersound = null;
      }
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
  }
}

function playAudioTTS(audioPath) {
  const fs = require("fs");
  const SpeakerCtor = getSpeaker();
  
  if (!audioPath || !SpeakerCtor) return Promise.resolve();

  const fileStream = fs.createReadStream(audioPath);
  const reader = new wav.Reader();

  return new Promise(resolve => {
    // This will be fired when the WAV header is parsed
    reader.on("format", function (format) {
      const speaker = new SpeakerCtor(format);
      reader.pipe(speaker);
      speaker.on("close", () => resolve());
      speaker.on("finish", () => resolve());
    });

    reader.on("end", () => resolve());
    reader.on("error", () => resolve());
    fileStream.on("error", () => resolve());
    fileStream.pipe(reader);
  });
}

module.exports = {
  DownloadFile,
  playAudioSound,
  playAudioTTS,
  stopAudioSound
};
