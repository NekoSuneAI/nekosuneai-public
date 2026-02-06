import rawConfig from "../../../../config/config.json" with { type: "json" };

const runtime = rawConfig?.runtime?.modes?.vtuberai || {};
const globalGpt = rawConfig?.globalAddons?.ai?.gpt || {};
const globalVoice = rawConfig?.globalAddons?.ai?.voice || "";

const baseURL = globalGpt.baseURL || "";
const normalizedBase = baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
const derivedGptURL = normalizedBase ? `${normalizedBase}/chat/completions` : "";

const config = {
  discordbotcfg: runtime.discordbotcfg || {},
  mic: runtime.mic || {},
  VRCACC: runtime.VRCACC || {},
  tts: runtime.tts || {},
  rvc: runtime.rvc || {},
  vtuberai: {
    gptURL: runtime.vtuberai?.gptURL || derivedGptURL,
    gptModel: runtime.vtuberai?.gptModel || globalGpt.model || "",
    voice: runtime.vtuberai?.voice || globalVoice || "",
    gptKey: runtime.vtuberai?.gptKey || globalGpt.apiKey || ""
  },
  streamlabs: runtime.streamlabs || {},
  streamElements: Array.isArray(runtime.streamElements) ? runtime.streamElements : [],
  twitchchat: runtime.twitchchat || {},
  filters: runtime.filters || {},
  vnyan: runtime.vnyan || {}
};

export default config;
