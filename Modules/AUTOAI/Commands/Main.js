const { config } = require("../../config");

const checkCondition = text => {
  const lowerText = text.toLowerCase();
  if (
    lowerText.includes("what is time in") ||
    lowerText.includes("what is time at") ||
    lowerText.includes("what is the time like") ||
    lowerText.includes("what is the time like in") ||
    lowerText.includes("what time is it in")
  ) {
    return "timeQuery";
  } else if (
    lowerText.includes("new year") ||
    lowerText.includes("new years") ||
    lowerText.includes("new year's")
  ) {
    return "newYearQuery";
  } else if (
    lowerText.includes("what is weather in") ||
    lowerText.includes("what is weather at") ||
    lowerText.includes("what is the weather at") ||
    lowerText.includes("what is the weather like") ||
    lowerText.includes("what is the weather like in")
  ) {
    return "weatherQuery";
  } else if (
    lowerText.includes("tell me a joke") ||
    lowerText.includes("tell me a funny joke") ||
    lowerText.includes("tell me a joke.") ||
    lowerText.includes("tell me a funny joke.")
  ) {
    return "jokeQuery";
  } else if (
    /^play\s+/i.test(lowerText) ||
    /^queue\s+/i.test(lowerText) ||
    /^add\s+song\s+/i.test(lowerText) ||
    /\bplay (music|song|a song)\b/.test(lowerText) ||
    /\bplay some music\b/.test(lowerText)
  ) {
    return "musicQuery";
  } else if (
    lowerText.includes("reset memory") ||
    lowerText.includes("reset")
  ) {
    return "resetQuery";
  } else if (
    lowerText.startsWith("wiki") || lowerText.includes("search wikipedia")
  ) {
    return "wikiQuery";
  } else if (
    lowerText.startsWith("fandom") || lowerText.includes("search vrchat legends") || lowerText.includes("search vr chat legends")
  ) {
    return "fandomQuery";
  } else if (
    /\bsearch\b/.test(lowerText) ||
    /\blook up\b/.test(lowerText) ||
    /\blookup\b/.test(lowerText) ||
    /\bfind\b/.test(lowerText)
  ) {
    return "searchQuery";
  }
  return "default";
};

const {
  BadWordDetected,
  containsBannedWord
} = require("../AddonsModules/API/BadWordDetected");

const { readAndPrintSentences } = require("../VOICEModules/Speak");

const { sendMSGOSC } = require("../AddonsModules/OSC/Send");

const { writeToLogFile } = require("../VOICEModules/LogFiles");
const e = require("express");

const { resetMemory } = require('./../../Addons/memoryStore');

const { WikipediaGrabber } = require("../AddonsModules/API/WikipediaRest");
const { FandomGrabber } = require("../AddonsModules/API/FandomRest"); 
const { SearxngGrabber } = require("../AddonsModules/API/SearxngRest");

// Split text into chunks of ≤129 characters
function splitIntoChunks(text, maxLen = 129) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > maxLen) {
      chunks.push(current.trim());
      current = word;
    } else {
      current += " " + word;
    }
  }
  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

function extractSearchQuery(text) {
  let cleaned = text.trim();

  cleaned = cleaned.replace(/[?.!]+$/, "").trim();
  cleaned = cleaned.replace(/^(please\s+)?(can you|could you|would you|do you|will you)\s+/i, "");
  cleaned = cleaned.replace(/^(search( for| me| of)?|look up|lookup|find)\s+/i, "");
  cleaned = cleaned.replace(/\s+(can you|could you|would you|do you|will you)\s+search( for| of| me)?$/i, "");
  cleaned = cleaned.replace(/\s+(please|thanks|thank you)$/i, "");

  if (/\bsearch\b|\blook up\b|\blookup\b|\bfind\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/\b(search( for| of| me)?|look up|lookup|find)\b/gi, " ").trim();
  }

  return cleaned.trim();
}

function buildSearchPrompt(query, results) {
  const lines = results
    .map((r, i) => {
      const parts = [`${i + 1}. ${r.title}`];
      if (r.snippet) parts.push(r.snippet);
      return parts.join("\n");
    })
    .join("\n\n");

  return [
    "You are given web search results. Use them to answer the user's question.",
    "Cite sources as [1], [2], etc. If results are not enough, say so and suggest a refined query.",
    "Be careful with sensitive claims (like death). Only state confirmed facts and mention uncertainty.",
    "",
    `User question: \"${query}\"`,
    "",
    "Search results:",
    lines
  ].join("\n");
}

function normalizeForMatch(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearchBlocklist(query) {
  const blocklist = config.addons.AI.SearxNG?.blocklist || [];
  const lowerQuery = (query || "").toLowerCase();
  const normalizedQuery = normalizeForMatch(query);
  for (const term of blocklist) {
    const normalized = (term || "").toString().toLowerCase().trim();
    if (!normalized) continue;
    if (lowerQuery.includes(normalized)) return true;
    const normalizedTerm = normalizeForMatch(term);
    if (normalizedTerm && normalizedQuery.includes(normalizedTerm)) return true;
  }
  return false;
}

function matchesSearchFallbackBlocklist(query) {
  const fallback = [
    "what's going on",
    "whats going on",
    "what is going on",
    "current events",
    "breaking",
    "headline",
    "latest",
    "news",
    "update on",
    "updates on",
    "war",
    "wars",
    "conflict",
    "invasion",
    "attack"
  ];
  const normalizedQuery = normalizeForMatch(query);
  for (const term of fallback) {
    const normalizedTerm = normalizeForMatch(term);
    if (normalizedTerm && normalizedQuery.includes(normalizedTerm)) return true;
  }
  return false;
}

function stripLinks(text) {
  if (!text) return text;
  let cleaned = text;
  // Replace markdown links with just the link text.
  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]*)\)/gi, "$1");
  // Remove dangling markdown link starts like [Title](
  cleaned = cleaned.replace(/\[([^\]]+)\]\(/gi, "$1 ");
  // Remove bracketed citation markers like [1], [1,2].
  cleaned = cleaned.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "");
  // Strip URLs.
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, "");
  cleaned = cleaned.replace(/\bwww\.\S+/gi, "");
  // Remove leftover bracket/parenthesis characters.
  cleaned = cleaned.replace(/[\[\]\(\)]/g, " ");
  // Normalize whitespace.
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

function stripLinksFromArray(items) {
  if (!Array.isArray(items)) return items;
  return items.map(item => stripLinks(item));
}

function extractFirstUrl(text) {
  if (!text) return "";
  const match = text.match(/https?:\/\/\S+/i);
  if (!match) return "";
  return match[0].replace(/[)\].,!?]+$/g, "");
}

function extractMusicQuery(text) {
  let cleaned = (text || "").trim();
  cleaned = cleaned.replace(/[?.!]+$/, "").trim();
  cleaned = cleaned.replace(/^(please\s+)?(can you|could you|would you|do you|will you)\s+/i, "");
  cleaned = cleaned.replace(/^(play|queue|add|enqueue)\s+(music|song|a song)?\s*/i, "");
  cleaned = cleaned.replace(/^[,.\s-]+/, "");
  cleaned = cleaned.replace(/[,_]+/g, " ");
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  return cleaned.trim();
}

async function respondWithGPT(prompt, audioFile, messageid, options = {}) {
  console.log("Thinking.....");
  const { RESPGPT } = require("../AddonsModules/API/GPTNODE");
  const {
    sendToWebhookchatResponse
  } = require("../AddonsModules/API/Webhooks");
  const response = await RESPGPT(
    prompt,
    config.addons.AI.GPTText.gptModel
  );
  //console.log('[gpt api dev]', response)
  if (response.status == 200) {
    const cleanedContent = options.stripLinks
      ? stripLinks(response.content)
      : response.content;
    const baseArray = Array.isArray(response.contentarray) && response.contentarray.length
      ? response.contentarray
      : [response.content];
    const normalizedArray =
      baseArray.length === 1 && typeof baseArray[0] === "string" && baseArray[0].length > 160
        ? splitIntoChunks(baseArray[0])
        : baseArray;
    const cleanedArray = options.stripLinks
      ? stripLinksFromArray(normalizedArray)
      : normalizedArray;

    console.log("[ChatGPT Local] Recognized text:", cleanedContent);
    writeToLogFile("[ChatGPT Local] Recognized text: " + cleanedContent);
    if (containsBannedWord(cleanedContent)) {
      await BadWordDetected(audioFile, messageid);
    } else {
      
      /*if (options.stripLinks) {
        await sendToWebhookchatResponse(cleanedContent, messageid);
      }*/

      await readAndPrintSentences(
        cleanedArray,
        audioFile,
        messageid
      );
    }
  } else if (response.status == 504) {
    console.log("[ChatGPT Local] Recognized text:", response.content);
    writeToLogFile("[ChatGPT Local] Recognized text: " + response.content);
    var responsetext = [
      `Can you say question again? or ChatGPT Local Request timed out`
    ];

    await sendToWebhookchatResponse(
      `Can you say question again? or ChatGPT Local Request timed out`,
      messageid
    );
    sendMSGOSC(responsetext);
    readAndPrintSentences(responsetext, audioFile, messageid);
  } else {
    const {
      startRecordingAndRunDeepSpeech
    } = require("../VOICEModules/Main");
    //console.log(`Server error: ${response.status} ${response.statusText}`);
    // Delete the renamed audio file after recognition.
    fs.unlinkSync(audioFile);
    // Start recording and running DeepSpeech again.
    startRecordingAndRunDeepSpeech();
  }
}

async function respondSearchBlocked(audioFile, messageid) {
  const {
    sendToWebhookchatResponse
  } = require("../AddonsModules/API/Webhooks");
  const responsetext = [
    "Sorry, we are not allowed to search this because we want to keep the VRChat community safe."
  ];
  await sendToWebhookchatResponse(responsetext[0], messageid);
  await readAndPrintSentences(responsetext, audioFile, messageid);
}

async function RunCommands(audioFile, result, messageid) {
  console.log(result)
  switch (checkCondition(result[0].text)) {
    case "timeQuery":
      {
        const { TimezonesGrabber } = require("../AddonsModules/API/Timezones");
        const originalText = result[0].text.toLowerCase();
        try {
          const resp = await TimezonesGrabber(originalText);
          if (!resp || resp.error || !resp.ampm) {
            const msg = "Sorry, I couldn't find that time zone.";
            writeToLogFile("[TimeZone API] Error: " + (resp?.error || "Unknown time zone."));
            await readAndPrintSentences([msg], audioFile, messageid);
            break;
          }
          const datafound = `Time in ${originalText}: ${resp.ampm}`;
          writeToLogFile("[TimeZone API] Recognized: " + datafound);
          const responsetext = [datafound];
          await readAndPrintSentences(responsetext, audioFile, messageid);
        } catch (error) {
          console.error(error);
        }
      }
      break;
    case "newYearQuery":
      {
        const { NewYearCountdownGrabber } = require("../AddonsModules/API/NewYear");
        const originalText = result[0].text.toLowerCase();
        try {
          const resp = await NewYearCountdownGrabber(originalText);
          if (!resp || resp.error) {
            const msg = "Sorry, I couldn't find that location.";
            writeToLogFile("[NewYear] Error: " + (resp?.error || "Unknown location."));
            await readAndPrintSentences([msg], audioFile, messageid);
            break;
          }
          const hasDays = typeof resp.days === "number" && resp.days > 0;
          const datafound = hasDays
            ? `There are ${resp.days} days, ${resp.hours} hours, ${resp.minutes} minutes, and ${resp.seconds} seconds until New Year's in ${resp.location}.`
            : `There are ${resp.hours} hours, ${resp.minutes} minutes, and ${resp.seconds} seconds until New Year's in ${resp.location}.`;
          writeToLogFile("[NewYear] Recognized: " + datafound);
          const responsetext = [datafound];
          await readAndPrintSentences(responsetext, audioFile, messageid);
        } catch (error) {
          console.error(error);
        }
      }
      break;
    /*case "weatherQuery":
      if (
        config.addons.apikey.weather.key == "" ||
        config.addons.apikey.weather.key == null ||
        config.addons.apikey.weather.key == undefined
      ) {
        console.log("[Weather API] Error: No API key found.");
        writeToLogFile("[Weather API] Error: No API key found.");
        var responsetext = ["Error: No API key found for Weather Endpoint."];
        readAndPrintSentences(responsetext, audioFile, messageid);
      } else {
        const { WeatherGrabber } = require("./../AddonsModules/API/Weathers");
        var originalText = result[0].text.toLowerCase();
        WeatherGrabber(originalText.replace("?", ""))
          .then(resp => {
            console.log(resp);
            writeToLogFile("[Weather API] Recognized: " + resp);
            var responsetext = [resp];
            readAndPrintSentences(responsetext, audioFile, messageid);
          })
          .catch(error => {
            console.error(error);
          });
      }
      break;*/
    case "jokeQuery":
      {
        const { JokesGrabber } = require("./../AddonsModules/API/Jokes");
        try {
          const resp = await JokesGrabber(config.addons.filters.explicit.joke);
          await readAndPrintSentences(resp.resp, audioFile, messageid);
          writeToLogFile(resp);
        } catch (error) {
          console.error(error);
        }
      }
      break;
    case "resetQuery":
      await resetMemory();
      await readAndPrintSentences(['Memory has been Reset.'], audioFile, messageid);
      break;
    case "wikiQuery":
      try {
        const resp = await WikipediaGrabber(result[0].text.replace("wiki", "").replace("search wikipedia", "").trim());
        const responsetext = splitIntoChunks(resp);
        await readAndPrintSentences(responsetext, audioFile, messageid);
        writeToLogFile(responsetext);
      } catch (error) {
        console.error(error);
      }
      break;
    case "fandomQuery":
      try {
        const resp = await FandomGrabber(result[0].text.replace("fandom", "").replace("search vrchat legends", "").replace("search vr chat legends", "").trim());
        const responsetext = splitIntoChunks(resp);
        await readAndPrintSentences(responsetext, audioFile, messageid);
        writeToLogFile(responsetext);
      } catch (error) {
        console.error(error);
      }
      break;
    case "musicQuery":
      {
        if (config.addons.music?.toggle === false) {
          await readAndPrintSentences(["Music is disabled to this bot. We cant play music for you."], audioFile, messageid);
          break;
        }
        try {
          const { enqueueMusic } = require("../AddonsModules/Audios/MusicQueue");
          const query = extractMusicQuery(result[0].text);
          const url = extractFirstUrl(result[0].text);
          const input = url || query;
          const enqueueResp = await enqueueMusic(input);
          if (enqueueResp?.error) {
            await readAndPrintSentences([enqueueResp.error], audioFile, messageid);
            break;
          }
        } catch (error) {
          const errorMessage = `Music playback failed: ${error.message}`;
          console.error(errorMessage);
          await readAndPrintSentences([errorMessage], audioFile, messageid);
          writeToLogFile(errorMessage);
        }
      }
      break;
    case "searchQuery":
      {
        const query = extractSearchQuery(result[0].text);
        if (!query) {
          await readAndPrintSentences(["Please say what you want me to search for."], audioFile, messageid);
          break;
        }
        try {
          const maxResults = config.addons.AI.SearxNG?.maxResults || 5;
          const searchData = await SearxngGrabber(query, maxResults);
          if (searchData?.blocked) {
            await respondSearchBlocked(audioFile, messageid);
            break;
          }
          if (searchData?.error) {
            await readAndPrintSentences([searchData.error], audioFile, messageid);
            writeToLogFile(searchData.error);
            break;
          }
          const results = searchData?.results || [];
          if (results.length === 0) {
            await readAndPrintSentences([`No results found for \"${query}\".`], audioFile, messageid);
            break;
          }
          const prompt = buildSearchPrompt(query, results);
          await respondWithGPT(prompt, audioFile, messageid, { stripLinks: true });
        } catch (error) {
          const errorMessage = `Search failed: ${error.message}`;
          console.error(errorMessage);
          await readAndPrintSentences([errorMessage], audioFile, messageid);
          writeToLogFile(errorMessage);
        }
      }
      break;
    default:
      // Your default case
      await respondWithGPT(result[0].text, audioFile, messageid);
      break;
  }
}

module.exports = {
  RunCommands
};
