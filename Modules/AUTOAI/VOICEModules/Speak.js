const { sendMSGOSC } = require("../AddonsModules/OSC/Send");
const { playAudioSound, playAudioTTS, stopAudioSound } = require("../AddonsModules/Audios/AudioDownloader");

const { writeToLogFile } = require("./LogFiles");
const { isAdminPromptActive } = require("./VoiceState");

const { config } = require("../../config");

const { writeFile } = require("fs").promises;

const fsn = require("fs");
const path = require("path");
const axios = require("axios");
const { Blob } = require("buffer");
const fetch = global.fetch;

function requireFetch() {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available. Use Node.js 20+ or install a fetch polyfill.");
  }
  return fetch;
}

async function runTTSRVC(text, voicegender, voice, TTS_DIR) {
    await fsn.promises.mkdir(TTS_DIR, { recursive: true });

    // -----------------------------
    // 1. Determine voice gender
    // -----------------------------
    let gender;
    let rvcModel;
    let pitch;

    if (voice == "gordon-ramsay") {
        rvcModel = "GordonRamsay"
        gender = "en_GB-alan-medium"
        pitch = 0
    } else if (voice == "rocket-guardian-of-the-galaxy") {
        rvcModel = "Rocket"
        gender = "en_GB-alan-medium"
        pitch = 3.5
    }  else if (voice == "paimon-genshin") {
        rvcModel = "Paimon"
        gender = "en_US-amy-medium"
        pitch = 9.5
    }  else if (voice == "shylilly-vtuber") {
        rvcModel = "Shylilly"
        gender = "en_US-amy-medium"
        pitch = 9.5
    } else if (voice == "filian-vtuber") {
        rvcModel = "Fillian"
        gender = "en_US-amy-medium"
        pitch = 9.5
    } else if (voice == "nightlightsai") {
        rvcModel = "VaresaGIJP"
        gender = "en_US-amy-medium"
        pitch = 9.5
    } else if (voice == "fallout-76-price-checker") {
        rvcModel = "Codsworth"
        gender = "en_GB-alan-medium"
        pitch = 0
    } else if (voice == "franklin-gta5") {
        rvcModel = "Franklin"
        gender = "en_GB-alan-medium"
        pitch = 0
    } else {
        rvcModel = "Nekoo"
        gender = "en_US-amy-medium"
        pitch = 11
    }
  
    // -----------------------------
    // 2. Generate Base TTS
    // -----------------------------
    const rawFile = path.join(TTS_DIR, `${Date.now()}-RAW-${voice}.wav`);

    const ttsRes = await axios.post(
        `${config.addons.AI.ApiNodeFallback}/tts`,
        { text, voice: gender },
        { responseType: "arraybuffer" }
    );

    await fsn.promises.writeFile(rawFile, ttsRes.data);

    console.log(`Using RVC model: ${rvcModel}`);
    
    // -----------------------------
    // 3. Convert using RVC API
    // -----------------------------
    const baseAudioBuffer = await fsn.promises.readFile(rawFile);
    const base64Audio = fsn.readFileSync(rawFile).toString("base64");
    
    // -----------------------------------
    // 3. Send to Gradio RVC server
    // -----------------------------------
    const { Client } = await import("@gradio/client");
    const client = await Client.connect(`${config.addons.AI.RVCAPINODE}`);

    // Convert buffer → Blob for Gradio API
    const audioBlob = new Blob([baseAudioBuffer], { type: "audio/wav" });

    const result = await client.predict("/process_audio", {
        audio_path: audioBlob,
        model_name: rvcModel,
        pitch: pitch,
        f0method: "harvest",
        index_rate: 0.5,
        filter_radius: 3,
        rms_mix_rate: 1,
        protect: 0.33,
        device: "cuda:0",
    });

    // Gradio output = result.data[0] = FileData
    const fileUrl = result.data[0].url;
    console.log("Gradio file URL:", fileUrl);

    // -----------------------------------
    // 4. Download final WAV file
    // -----------------------------------
    const fetchImpl = requireFetch();
    const res = await fetchImpl(fileUrl);
    if (!res.ok) {
      throw new Error(`Failed to download TTS file: ${res.status}`);
    }
    const finalBuffer = Buffer.from(await res.arrayBuffer());

    const finalFile = path.join(
        TTS_DIR,
        `${Date.now()}-${voice}-FINAL.wav`
    );

    await fsn.promises.writeFile(finalFile, finalBuffer);

    console.log("Saved final file:", finalFile);
    try {
      await fsn.promises.unlink(rawFile);
    } catch (err) {
      console.log("Failed to delete RAW TTS file:", err.message);
    }
    return finalFile;
}

let stopRenderInterval = null;
let stopWaitLoop = null;

function startRenderProgress(durationSeconds = 60) {
  if (stopRenderInterval) {
    stopRenderInterval();
    stopRenderInterval = null;
  }
  if (stopWaitLoop) {
    stopWaitLoop();
    stopWaitLoop = null;
  }

  const totalSeconds = Math.max(1, durationSeconds);
  let elapsed = 0;
  let lastSentAt = 0;
  const minSendIntervalMs = 3000;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const playRandomWaitSound = async () => {
    try {
      const soundsDir = path.join("Modules", "sounds");
      const entries = await fsn.promises.readdir(soundsDir, { withFileTypes: true });
      const wavFiles = entries
        .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === ".wav")
        .map(entry => entry.name);

      if (wavFiles.length === 0) {
        return;
      }

      const pick = wavFiles[Math.floor(Math.random() * wavFiles.length)];
      await playAudioSound(path.join(soundsDir, pick), 0.3);
    } catch (err) {
      console.log("Wait sound skipped:", err.message);
    }
  };

  const sendProgress = () => {
    const now = Date.now();
    if (now - lastSentAt < minSendIntervalMs) {
      return;
    }
    lastSentAt = now;
    const remaining = Math.max(0, totalSeconds - elapsed);
    const barLength = 12;
    const progress = Math.min(elapsed / totalSeconds, 1);
    const filled = Math.round(progress * barLength);
    const bar = `${"★".repeat(filled)}${"☆".repeat(barLength - filled)}`;
    const percent = Math.round(progress * 100).toString().padStart(3, "0");
    sendMSGOSC(
      `[${bar}] ${percent}% loaded.\n` +
      `Please wait up to ${totalSeconds} seconds...\n` +
      `I'm thinking of a response... Depends my Hardware\n` +
      `${remaining}s remaining`
    );
  };

  sendProgress();
  let cancelled = false;
  stopWaitLoop = () => {
    cancelled = true;
    stopAudioSound();
  };
  (async () => {
    while (!cancelled) {
      await playRandomWaitSound();
      if (!cancelled) {
        await wait(500);
      }
    }
  })();
  const interval = setInterval(() => {
    elapsed += 1;
    if (elapsed > totalSeconds) {
      elapsed = 0;
    }
    sendProgress();
  }, 1000);

  stopRenderInterval = () => clearInterval(interval);
  return stopRenderInterval;
}

function stopRenderWaitSounds() {
  if (stopWaitLoop) {
    stopWaitLoop();
    stopWaitLoop = null;
  }
}

function stopRenderProgress(options = {}) {
  const force = options && options.force === true;
  if (isAdminPromptActive() && !force) {
    stopRenderWaitSounds();
    stopAudioSound();
    return;
  }
  if (stopRenderInterval) {
    stopRenderInterval();
    stopRenderInterval = null;
  }
  stopRenderWaitSounds();
  stopAudioSound();
}

// Generate TTS audio using piper-tts
async function generateTts(
  text,
  provider,
  outputFile = `audio/output_${Date.now()}.wav`
) {
  const voice = provider || "en_US-lessac-medium";

  try {
    const axios = require("axios");
    const res = await axios.post(
      `${config.addons.AI.ApiNodeFallback}/tts`,
      { text, voice },
      { responseType: "arraybuffer" }
    );

    await writeFile(outputFile, res.data); // use promises API
    return outputFile;
  } catch (err) {
    throw new Error(`TTS request failed: ${err.message}`);
  }
}

function stripEmojis(text) {
  return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\uFE0F]+/gu, '').trim();
}

const digitWords = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine'
];
const teenWords = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen'
];
const tensWords = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety'
];
const scaleWords = [
  '',
  'thousand',
  'million',
  'billion',
  'trillion',
  'quadrillion',
  'quintillion',
  'sextillion',
  'septillion',
  'octillion',
  'nonillion',
  'decillion'
];

function stripHttpUrls(text) {
  return text.replace(/https?:\/\/\S+/gi, '').trim();
}

function chunkToWords(num) {
  if (num === 0) return '';
  if (num < 10) return digitWords[num];
  if (num < 20) return teenWords[num - 10];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return ones ? `${tensWords[tens]} ${digitWords[ones]}` : tensWords[tens];
  }
  const hundreds = Math.floor(num / 100);
  const rest = num % 100;
  const restWords = rest ? ` ${chunkToWords(rest)}` : '';
  return `${digitWords[hundreds]} hundred${restWords}`;
}

function integerToWords(intString) {
  let value;
  try {
    value = BigInt(intString);
  } catch (err) {
    return '';
  }
  if (value === 0n) return 'zero';

  const parts = [];
  let scaleIndex = 0;
  while (value > 0n) {
    const chunk = Number(value % 1000n);
    if (chunk) {
      const chunkWords = chunkToWords(chunk);
      const scale = scaleWords[scaleIndex] || '';
      parts.unshift(scale ? `${chunkWords} ${scale}` : chunkWords);
    }
    value = value / 1000n;
    scaleIndex += 1;
  }
  return parts.join(' ');
}

function numberStringToWords(text) {
  const normalized = text.replace(/,/g, '');
  const parts = normalized.split('.');
  const intPart = parts[0];
  const intWords = integerToWords(intPart);
  if (!intWords) return '';
  if (parts.length === 1) return intWords;
  const fracPart = parts[1] || '';
  if (!fracPart) return intWords;
  const fracWords = fracPart
    .split('')
    .map(d => digitWords[Number(d)])
    .join(' ');
  return `${intWords} point ${fracWords}`;
}

function currencyNumberToWords(numberText, currencyWord, useCents) {
  const normalized = numberText.replace(/,/g, '');
  const parts = normalized.split('.');
  const intWords = integerToWords(parts[0]);
  if (!intWords) return '';
  const major = `${intWords} ${currencyWord}`;
  if (!useCents || parts.length === 1) return major;
  const frac = parts[1] || '';
  if (!frac) return major;
  const centsValue = frac.slice(0, 2);
  const centsWords = integerToWords(centsValue);
  if (!centsWords || centsValue === '00') return major;
  return `${major} and ${centsWords} cents`;
}

function replaceCurrencyValues(text) {
  const symbolMap = {
    '$': { word: 'dollars', cents: true },
    '£': { word: 'pounds', cents: true },
    '€': { word: 'euros', cents: true },
    '¥': { word: 'yen', cents: false },
    '₽': { word: 'rubles', cents: true },
    '₹': { word: 'rupees', cents: true },
    '₩': { word: 'won', cents: false },
    '₺': { word: 'lira', cents: true },
    '₫': { word: 'dong', cents: false },
    '₱': { word: 'pesos', cents: true },
    '฿': { word: 'baht', cents: true },
    '₪': { word: 'shekels', cents: true },
    '₴': { word: 'hryvnia', cents: true },
    '₦': { word: 'naira', cents: true },
    'R$': { word: 'reals', cents: true },
    '₪': { word: 'shekels', cents: true },
    '₡': { word: 'colones', cents: true },
    '₲': { word: 'guarani', cents: true },
    '₵': { word: 'cedis', cents: true }
  };

  const codeMap = {
    USD: { word: 'US dollars', cents: true },
    GBP: { word: 'pounds', cents: true },
    EUR: { word: 'euros', cents: true },
    JPY: { word: 'yen', cents: false },
    RUB: { word: 'rubles', cents: true },
    CAD: { word: 'Canadian dollars', cents: true },
    AUD: { word: 'Australian dollars', cents: true },
    NZD: { word: 'New Zealand dollars', cents: true },
    CHF: { word: 'francs', cents: true },
    CNY: { word: 'yuan', cents: true },
    HKD: { word: 'Hong Kong dollars', cents: true },
    SGD: { word: 'Singapore dollars', cents: true },
    INR: { word: 'rupees', cents: true },
    BRL: { word: 'reals', cents: true },
    MXN: { word: 'pesos', cents: true },
    ZAR: { word: 'rand', cents: true },
    KRW: { word: 'won', cents: false },
    TRY: { word: 'lira', cents: true },
    PLN: { word: 'zloty', cents: true },
    CZK: { word: 'koruna', cents: true },
    HUF: { word: 'forint', cents: false },
    RON: { word: 'lei', cents: true },
    BGN: { word: 'lev', cents: true },
    NOK: { word: 'krone', cents: true },
    SEK: { word: 'krona', cents: true },
    DKK: { word: 'krone', cents: true },
    AED: { word: 'dirhams', cents: true },
    SAR: { word: 'riyals', cents: true },
    QAR: { word: 'riyals', cents: true },
    KWD: { word: 'dinars', cents: true },
    BHD: { word: 'dinars', cents: true },
    OMR: { word: 'rials', cents: true },
    ILS: { word: 'shekels', cents: true },
    THB: { word: 'baht', cents: true },
    IDR: { word: 'rupiah', cents: true },
    MYR: { word: 'ringgit', cents: true },
    PHP: { word: 'pesos', cents: true },
    VND: { word: 'dong', cents: false },
    CLP: { word: 'pesos', cents: false },
    COP: { word: 'pesos', cents: true },
    ARS: { word: 'pesos', cents: true },
    PEN: { word: 'soles', cents: true },
    UAH: { word: 'hryvnia', cents: true },
    NGN: { word: 'naira', cents: true },
    EGP: { word: 'Egyptian pounds', cents: true },
    ISK: { word: 'krona', cents: false }
  };

  const symbolKeys = Object.keys(symbolMap)
    .sort((a, b) => b.length - a.length)
    .map(s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const symbolPattern = new RegExp(`(${symbolKeys.join('|')})\\s*(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)`, 'g');

  const codeKeys = Object.keys(codeMap).join('|');
  const codePrefixPattern = new RegExp(`\\b(${codeKeys})\\s*(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)`, 'gi');
  const codeSuffixPattern = new RegExp(`\\b(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)\\s*(${codeKeys})\\b`, 'gi');

  let result = text.replace(symbolPattern, (_, symbol, number) => {
    const entry = symbolMap[symbol];
    const words = currencyNumberToWords(number, entry.word, entry.cents);
    return words || `${symbol} ${number}`;
  });

  result = result.replace(codePrefixPattern, (_, code, number) => {
    const entry = codeMap[code.toUpperCase()];
    const words = currencyNumberToWords(number, entry.word, entry.cents);
    return words || `${code} ${number}`;
  });

  result = result.replace(codeSuffixPattern, (_, number, code) => {
    const entry = codeMap[code.toUpperCase()];
    const words = currencyNumberToWords(number, entry.word, entry.cents);
    return words || `${number} ${code}`;
  });

  return result;
}

function numbersToWords(text) {
  const numberPattern = /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g;
  return text.replace(numberPattern, match => {
    const words = numberStringToWords(match);
    return words || match;
  });
}

function prepareTtsText(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const withoutUrls = stripHttpUrls(text);
  const withCurrencies = replaceCurrencyValues(withoutUrls);
  return numbersToWords(withCurrencies);
}

function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readAndPrintSentencesAdminCmds(sentences, audioFile, messageid) {
  const {
    sendToWebhookchatResponse
  } = require("../AddonsModules/API/Webhooks");
  // This was added to fixed a issues with the Error: startRecordingAndRunDeepSpeech is not a function

  const safeSentences = Array.isArray(sentences) ? sentences : [sentences];
  const cleanedSentences = safeSentences
    .map(sentence => {
      if (typeof sentence !== "string") {
        return String(sentence || "");
      }
      return sentence;
    })
    .map(sentence => stripEmojis(sentence).trim())
    .filter(Boolean);
  if (cleanedSentences.length === 0) {
    return;
  }
  const totalPages = cleanedSentences.length;
  const audioFiles = [];

  for (const cleanSentence of cleanedSentences) {
    const audioFileAi = await runTTSRVC(
      prepareTtsText(cleanSentence.replace('[BROADCAST] ', '').replace('\n', '')),
      null,
      config.addons.AI.GPTText.gptModel,
      `audio/`
    );
    audioFiles.push(audioFileAi);
  }

  stopRenderProgress({ force: true });
  stopRenderWaitSounds();

  for (let i = 0; i < cleanedSentences.length; i++) {
    const sentence = cleanedSentences[i];
    console.log(`Reading: Page ${i + 1}/${totalPages}: ${sentence}`);
    writeToLogFile(`Reading: Page ${i + 1}/${totalPages}: ${sentence}`);
    sendToWebhookchatResponse(
      `Page ${i + 1}/${totalPages}: ${sentence}`,
      messageid
    ).then(datauwu => {
      console.log("Responded Message to Discord");
    });
    sendMSGOSC(`${sentence} \n⏪${i + 1}/${totalPages}⏩`);
    console.log(audioFiles[i])
    await playAudioTTS(audioFiles[i]);
    try {
      await fsn.promises.unlink(audioFiles[i]);
    } catch (err) {
      console.log("Failed to delete TTS file:", err.message);
    }
    await waitMs(3500);
  }

  console.log("Finished reading all sentences.");
  writeToLogFile("Finished reading all sentences.");
  if (audioFile && fsn.existsSync(audioFile)) {
    // Delete the renamed audio file after recognition.
    fsn.unlinkSync(audioFile);
  }
}

async function readAndPrintSentences(sentences, audioFile, messageid) {
  const { startRecordingAndRunDeepSpeech } = require("../VOICEModules/Main");
  const { isMicDisabled } = require("./VoiceState");
  const {
    sendToWebhookchatResponse
  } = require("../AddonsModules/API/Webhooks");
  // This was added to fixed a issues with the Error: startRecordingAndRunDeepSpeech is not a function

  const safeSentences = Array.isArray(sentences) ? sentences : [sentences];
  const cleanedSentences = safeSentences
    .map(sentence => {
      if (typeof sentence !== "string") {
        return String(sentence || "");
      }
      return sentence;
    })
    .map(sentence => stripEmojis(sentence).trim())
    .filter(Boolean);
  if (cleanedSentences.length === 0) {
    return;
  }
  const totalPages = cleanedSentences.length;
  const audioFiles = [];

  for (const cleanSentence of cleanedSentences) {
    const audioFileAi = await runTTSRVC(
      prepareTtsText(cleanSentence.replace('[BROADCAST] ', '').replace('\n', '')),
      null,
      config.addons.AI.GPTText.gptModel,
      `audio/`
    );
    audioFiles.push(audioFileAi);
  }

  stopRenderProgress({ force: true });
  stopRenderWaitSounds();

  for (let i = 0; i < cleanedSentences.length; i++) {
    const sentence = cleanedSentences[i];
    console.log(`Reading: Page ${i + 1}/${totalPages}: ${sentence}`);
    writeToLogFile(`Reading: Page ${i + 1}/${totalPages}: ${sentence}`);
    sendToWebhookchatResponse(
      `Page ${i + 1}/${totalPages}: ${sentence}`,
      messageid
    ).then(datauwu => {
      console.log("Responded Message to Discord");
    });
    sendMSGOSC(`${sentence} \n⏪${i + 1}/${totalPages}⏩`);
    await playAudioTTS(audioFiles[i]);
    try {
      await fsn.promises.unlink(audioFiles[i]);
    } catch (err) {
      console.log("Failed to delete TTS file:", err.message);
    }
    await waitMs(3500);
  }

  console.log("Finished reading all sentences.");
  writeToLogFile("Finished reading all sentences.");
  if (audioFile && fsn.existsSync(audioFile)) {
    // Delete the renamed audio file after recognition.
    fsn.unlinkSync(audioFile);
  }
  if (!isMicDisabled()) {
    // Start recording and running DeepSpeech again.
    startRecordingAndRunDeepSpeech();
  }
}

module.exports = {
  readAndPrintSentences,
  generateTts,
  startRenderProgress,
  stopRenderProgress,
  stopRenderWaitSounds,
  readAndPrintSentencesAdminCmds
};
