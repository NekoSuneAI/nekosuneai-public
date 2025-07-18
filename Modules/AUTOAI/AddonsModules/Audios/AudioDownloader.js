const { generateTts } = require("../../VOICEModules/Speak");

const {
  writeToLogFile,
  writeToLogFileMusic
} = require("../../VOICEModules/LogFiles");

const { config } = require("../../../config");

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
      `audios/aiout_${Date.now()}.wav`
    );
    playAudioSound(audioFileAi);
  }
}

const Speaker = require("speaker");

// Function to audio
function playAudioSound(audioPath) {
  const fs = require("fs");
  var currentSpeakersound;
  if (currentSpeakersound) {
    currentSpeakersound.end();
    currentSpeakersound.close();
    console.log("Audio playback stopped.");
    writeToLogFileMusic("Audio playback stopped.");
    // Reset the currentSpeaker variable
    currentSpeakersound = null;
  }

  // Check if audioPath is not an empty string
  if (audioPath !== "") {
    // Create a speaker instance only if audioPath is not empty
    const speaker = new Speaker({
      channels: 2,
      bitDepth: 16,
      sampleRate: 48000
    });

    // Set the current speaker instance
    currentSpeakersound = speaker;

    // Read the audio file and it
    const audioData = fs.readFileSync(audioPath);
    speaker.write(audioData);

    // Event handler for 'close' event
    speaker.on("close", () => {
      console.log("Audio playback has stopped.");
    });
  }
}

module.exports = {
  DownloadFile,
  playAudioSound
};
