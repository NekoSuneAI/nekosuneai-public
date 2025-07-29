function normalizeText(text) {
  return text.toLowerCase().replace(/[?.,!]/g, "").trim();
}

const { config } = require("../../../config");

function playSound(audioFile, result) {
  const normalizedText = normalizeText(result[0].text.replace(config.addons.AI.onwakeword.toLowerCase(), ''));

  switch (normalizedText) {
    case "thug life":
    case "meme 1":
    case "meme one":
    case "meme, one":
    case "meme, 1":
      playThugLife(audioFile);
      return { resp: "SoundBoard Found!" };

    case "despacito":
    case "meme 2":
    case "meme two":
    case "meme, two":
    case "meme, 2":
      playDespacito(audioFile);
      return { resp: "SoundBoard Found!" };

    case "execute order 66":
    case "meme 3":
    case "meme three":
    case "meme, three":
    case "meme, 3":
      playExecuteOrder66(audioFile);
      return { resp: "SoundBoard Found!" };

    case "trip to valhalla":
    case "meme 4":
    case "meme four":
    case "meme, four":
    case "meme, 4":
      playTripToValhalla(audioFile);
      return { resp: "SoundBoard Found!" };

    case "emotional damage":
    case "meme 5":
    case "meme five":
    case "meme, five":
    case "meme, 5":
      playEmotionalDamage(audioFile);
      return { resp: "SoundBoard Found!" };

    default:
      return { resp: "NO MATCH DATA!" };
  }
}

function playThugLife(audioFile) {
  const { sendMSGOSC } = require("../OSC/Send");

  const { DownloadFile } = require("./AudioDownloader");

  const { startRecordingAndRunDeepSpeech } = require("../../VOICEModules/Main");

  sendMSGOSC(`SoundBoard: THUG LIFE!`);
  let value = 1;
  let valueoff = 0;
  console.log("Sending OSC message for avatar interaction (start)");
  sendOSC("/avatar/parameters/asset/interactive/", value, valueoff);
  DownloadFile(
    "memes",
    "https://www.myinstants.com/media/sounds/dr-dre-nuthin-but-a-g-thang.mp3",
    "memes",
    "thug_life"
  );

  startRecordingAndRunDeepSpeech();
}

function playDespacito(audioFile) {
  const { sendMSGOSC } = require("../OSC/Send");

  const { DownloadFile } = require("./AudioDownloader");

  const { startRecordingAndRunDeepSpeech } = require("../../VOICEModules/Main");

  sendMSGOSC(`SoundBoard: Despacito`);
  DownloadFile(
    "memes",
    "https://www.myinstants.com/media/sounds/despacito.mp3",
    "memes",
    "despacito"
  );

  startRecordingAndRunDeepSpeech();
}

function playExecuteOrder66(audioFile) {
  const { sendMSGOSC } = require("../OSC/Send");

  const { DownloadFile } = require("./AudioDownloader");

  const { startRecordingAndRunDeepSpeech } = require("../../VOICEModules/Main");

  sendMSGOSC(`SoundBoard: Execute Order 66`);
  DownloadFile(
    "memes",
    "https://www.myinstants.com/media/sounds/order66.mp3",
    "memes",
    "order66"
  );

  startRecordingAndRunDeepSpeech();
}

function playTripToValhalla(audioFile) {
  const { sendMSGOSC } = require("../OSC/Send");

  const { DownloadFile } = require("./AudioDownloader");

  const { startRecordingAndRunDeepSpeech } = require("../../VOICEModules/Main");

  sendMSGOSC(`SoundBoard: Trip To Valhalla!!`);
  DownloadFile(
    "memes",
    "https://www.myinstants.com/media/sounds/trip-to-valhalla.mp3",
    "memes",
    "TripToValhalla"
  );

  startRecordingAndRunDeepSpeech();
}

function generateRandomArray(soundDataArray) {
  const randomIndex = Math.floor(Math.random() * soundDataArray.length);
  return soundDataArray[randomIndex];
}

function playEmotionalDamage(audioFile) {
  const { sendMSGOSC } = require("../OSC/Send");

  const { DownloadFile } = require("./AudioDownloader");

  const { startRecordingAndRunDeepSpeech } = require("../../VOICEModules/Main");

  sendMSGOSC(`SoundBoard: Emotional Damage`);
  const randomUrlArray = [
    {
      name: "emotional_damage_remix",
      url:
        "https://www.myinstants.com/media/sounds/emotional-damage-remix-better-audio.mp3"
    },
    {
      name: "thats_alot_of_emotional_damage",
      url:
        "https://www.myinstants.com/media/sounds/thats-alot-of-emotional-damage.mp3"
    },
    {
      name: "pompeii_emotional_damage",
      url:
        "https://www.myinstants.com/media/sounds/emotional-damage-x-pompeii.mp3"
    },
    {
      name: "emotional_damage",
      url:
        "https://www.myinstants.com/media/sounds/emotional-damage_svaNMfN.mp3"
    }
  ];

  const randomSoundData = generateRandomArray(randomUrlArray);
  DownloadFile(
    "memes",
    randomSoundData.url,
    "memes",
    randomSoundData.name.toLowerCase().replace(/\s/g, "_")
  );
  startRecordingAndRunDeepSpeech();
}

module.exports = { playSound };
