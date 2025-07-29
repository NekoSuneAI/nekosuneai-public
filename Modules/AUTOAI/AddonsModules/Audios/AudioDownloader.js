const { generateTts } = require("../../VOICEModules/Speak");

const {
  writeToLogFile,
  writeToLogFileMusic
} = require("../../VOICEModules/LogFiles");

const { config } = require("../../../config");
const wav = require("wav");


let currentAudioProcess = null;

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

const { exec } = require('child_process');

function playAudioSound(audioPath) {
  if (!audioPath) return;

  // Stop currently playing audio if any
  if (currentAudioProcess) {
    currentAudioProcess.kill();
    currentAudioProcess = null;
    console.log("Previous audio playback stopped.");
  }

  // Start new mp3 playback
  currentAudioProcess = exec(`mpg123 "${audioPath}"`, (error, stdout, stderr) => {
    if (error) {
      if (error.killed) {
        console.log("MP3 playback was stopped.");
      } else {
        console.error(`Error playing MP3: ${error.message}`);
      }
      return;
    }
    console.log("MP3 playback finished.");
    currentAudioProcess = null;
  });
}

function playAudioTTS(audioPath) {
  if (!audioPath) return;

  exec(`aplay "${audioPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error playing WAV: ${error.message}`);
      return;
    }
    console.log("WAV playback finished.");
  });
}

module.exports = {
  DownloadFile,
  playAudioSound,
  playAudioTTS
};
