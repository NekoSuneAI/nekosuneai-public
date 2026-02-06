const path = require("path");
const baseConfig = require("../config/config.json");

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function resolveAddonEnabled(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (isPlainObject(value) && typeof value.enabled === "boolean") return value.enabled;
  return fallback;
}

function buildWakewordConfig(aiAddon) {
  if (!aiAddon || !isPlainObject(aiAddon.wakeword)) return undefined;
  const ww = aiAddon.wakeword;
  const local = ww.local || {};
  const models = local.models || {};
  const keywords = local.keywords || {};

  const modelDir = models.dir || "";
  const modelName = models.name || "";
  const modelBase = modelDir && modelName ? path.join(modelDir, modelName) : modelDir;

  return {
    enabled: toBool(ww.enabled, false),
    provider: ww.provider || "local",
    phrases: Array.isArray(ww.phrases) ? ww.phrases : [],
    chunkSeconds: typeof ww.chunkSeconds === "number" ? ww.chunkSeconds : 2.5,
    cooldownMs: typeof ww.cooldownMs === "number" ? ww.cooldownMs : 1500,
    sensitivity: ww.sensitivity || "high",
    local: {
      backend: local.backend || "sherpa-onnx",
      modelsDir: modelDir,
      modelName: modelName,
      tokensType: "bpe",
      bpeModel: models.bpe ? path.join(modelBase, models.bpe) : "",
      tokens: models.tokens ? path.join(modelBase, models.tokens) : "",
      encoder: models.encoder ? path.join(modelBase, models.encoder) : "",
      decoder: models.decoder ? path.join(modelBase, models.decoder) : "",
      joiner: models.joiner ? path.join(modelBase, models.joiner) : "",
      keywordsRaw: keywords.raw || "",
      keywordsFile: keywords.compiled || "",
      detectRegex: keywords.regex || "keyword|wake|trigger",
      provider: local.provider || "cpu",
      numThreads: typeof local.threads === "number" ? local.threads : 2
    },
    api: {
      url: (ww.api && ww.api.url) || ""
    }
  };
}

function buildLegacyConfig(config) {
  const engineActive = config.engine?.activeMode || "normal";
  const engineMode = config.engine?.modes?.[engineActive] || {};
  const runtimeActive = config.runtime?.activeMode || "vrchatai";
  const runtimeMode = config.runtime?.modes?.[runtimeActive] || {};
  const globalAddons = config.globalAddons || {};

  const runtimeAddons = runtimeMode.addons || {};
  const platforms = runtimeMode.platforms || {};
  const vrchat = platforms.vrchat || {};
  const discord = platforms.discord || {};

  const aiEnabled = resolveAddonEnabled(runtimeAddons.ai, toBool(globalAddons.ai?.enabled, true));
  const musicEnabled = resolveAddonEnabled(runtimeAddons.music, toBool(globalAddons.music?.enabled, false));
  const friendsEnabled = resolveAddonEnabled(runtimeAddons.friendsSystem, false);

  const wakeword = buildWakewordConfig(isPlainObject(runtimeAddons.ai) ? runtimeAddons.ai : null);

  return {
    mode: runtimeActive,
    engineMode: engineActive,
    clientname: config.clientname || "",
    clientavatar: config.clientavatar || "",
    VRCACC: {
      username: vrchat.credentials?.username || "",
      password: vrchat.credentials?.password || "",
      twofatoken: vrchat.credentials?.twofa || "",
      OSC_TARGET_ADDRESS: vrchat.osc?.targetAddress || "127.0.0.1",
      OSC_TARGET_PORT: vrchat.osc?.targetPort || 9000,
      OSC_READ_PORT: vrchat.osc?.readPort || 9001
    },
    discord: {
      toggle: toBool(discord.enabled, false),
      token: discord.auth?.token || "",
      TestingServerID: discord.testing?.serverID || "",
      TestingServerCID: discord.testing?.channelID || "",
      developerID: Array.isArray(discord.developerIDs) ? discord.developerIDs : [""],
      randomMessages_Cooldown: Array.isArray(discord.cooldownMessages) ? discord.cooldownMessages : [],
      sql: {
        host: discord.database?.host || "127.0.0.1",
        port: discord.database?.port || 3306,
        user: discord.database?.user || "root",
        password: discord.database?.password || "password",
        dialect: discord.database?.dialect || "sqlite"
      },
      API: {
        MYAPIKEY: discord.api?.customKey || "",
        twitchuser: discord.api?.twitchUser || ""
      }
    },
    datacfg: {
      sql: {
        database: discord.database?.database || "nekosuneai"
      }
    },
    addons: {
      discord: {
        toggle: toBool(discord.enabled, false),
        webhookerror: discord.webhooks?.error || "",
        webhookchat: discord.webhooks?.chat || "",
        webhookreply: discord.webhooks?.reply || "",
        authbearer: discord.auth?.bearer || "AUTHTOKEN",
        serverid: discord.serverID || "DISCORDSERVERID"
      },
      FriendsSystem: {
        toggle: friendsEnabled
      },
      AI: {
        toggle: aiEnabled,
        voice: globalAddons.ai?.voice || "en_US-lessac-medium",
        sttProvider: engineMode.ai?.sttProvider || "vosk",
        ttsProvider: engineMode.ai?.ttsProvider || "piper",
        whisperModel: engineMode.ai?.whisper?.model || "base",
        whisperDevice: globalAddons.ai?.whisper?.device || "cpu",
        whisperComputeType: globalAddons.ai?.whisper?.compute || "int8",
        vaskmodel: engineMode.ai?.voskModel || "vosk-model-en-us-0.22",
        ApiNodeFallback: engineMode.ai?.apiFallback || "http://localhost:3456",
        RVCAPINODE: globalAddons.ai?.rvc?.api || "http://localhost:5050",
        AudioVRCPath: globalAddons.ai?.audio?.device || "",
        waitSoundVolume: globalAddons.ai?.audio?.waitVolume ?? 0.3,
        GPTText: {
          apiKey: globalAddons.ai?.gpt?.apiKey || "",
          baseURL: globalAddons.ai?.gpt?.baseURL || "",
          gptModel: globalAddons.ai?.gpt?.model || "",
          systemmsg: globalAddons.ai?.gpt?.systemMessage || ""
        },
        SearxNG: {
          baseURL: globalAddons.search?.baseURL || "",
          maxResults: globalAddons.search?.maxResults || 5,
          blocklist: Array.isArray(globalAddons.search?.blocklist)
            ? globalAddons.search.blocklist
            : []
        },
        OPENAI: {
          apiKey: globalAddons.apiKeys?.openai?.key || "",
          baseURL: globalAddons.apiKeys?.openai?.baseURL || ""
        },
        wakeword
      },
      apikey: {
        weather: {
          key: globalAddons.apiKeys?.weather || ""
        },
        timeapi: {
          key: globalAddons.apiKeys?.time || ""
        }
      },
      filters: {
        explicit: {
          joke: toBool(globalAddons.filters?.explicit?.jokes, false)
        }
      },
      music: {
        toggle: musicEnabled,
        apiKey: globalAddons.music?.apiKey || "",
        baseURL: globalAddons.music?.baseURL || "",
        uploadDest: globalAddons.music?.uploadDest || "cdn",
        downloadDir: globalAddons.music?.downloadDir || "music",
        pollIntervalMs: globalAddons.music?.poll?.intervalMs || 2000,
        maxPolls: globalAddons.music?.poll?.max || 90
      },
      vrcapi: {
        toggles: vrchat.api?.toggles || { blfr: true, blscan: true, wlreq: true },
        whitelist: Array.isArray(vrchat.api?.whitelist) ? vrchat.api.whitelist : []
      }
    }
  };
}

const legacyConfig = buildLegacyConfig(baseConfig);

module.exports = {
  config: legacyConfig,
  rawConfig: baseConfig,
  badwords: require("../config/badwords.json"),
  timezone: require("../config/timezone.json"),
  packageJson: require("../package.json")
};
