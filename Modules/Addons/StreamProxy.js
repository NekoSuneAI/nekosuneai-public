const http = require("http");
const https = require("https");
const express = require("express");
const { URL } = require("url");
const { config } = require("../config");

let started = false;

function getProxyConfig() {
  const cfg = config?.globalAddons?.streamProxy || config?.globalAddons?.music?.streamProxy || {};
  const musicBase = config?.globalAddons?.music?.baseURL || "";
  let baseURL = cfg.baseURL || musicBase || "";
  let port = Number(cfg.port || 26900);
  if (baseURL) {
    try {
      const parsed = new URL(baseURL);
      if (parsed.port) {
        port = Number(parsed.port);
      } else if (parsed.protocol === "http:") {
        port = 80;
      } else if (parsed.protocol === "https:") {
        port = 443;
      }
    } catch {
      baseURL = "";
    }
  }
  return {
    enabled: cfg.enabled !== false,
    port,
    allowedHosts: Array.isArray(cfg.allowedHosts) ? cfg.allowedHosts : [],
    baseURL
  };
}

function isHostAllowed(host, allowedHosts) {
  if (!allowedHosts || allowedHosts.length === 0) return true;
  return allowedHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

function isYouTubeHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be";
}

function startStreamProxy() {
  if (started) return;
  const { enabled, port, allowedHosts, baseURL } = getProxyConfig();
  if (!enabled) return;

  const app = express();

  app.get("/api/stream", async (req, res) => {
    let target = req.query.url;
    const query = req.query.q;
    if (!target && !query) {
      res.status(400).json({ error: "Missing url or q" });
      return;
    }

    if (query) {
      try {
        let ytSearch;
        try {
          ytSearch = require("yt-search");
        } catch (err) {
          res.status(501).json({ error: "yt-search not installed" });
          return;
        }
        const results = await ytSearch(String(query));
        const video = results?.videos?.[0];
        if (!video || !video.url) {
          res.status(404).json({ error: "No results" });
          return;
        }
        target = video.url;
      } catch (err) {
        res.status(500).json({ error: "Search failed", detail: err.message });
        return;
      }
    }

    let parsed;
    try {
      parsed = new URL(String(target));
    } catch {
      res.status(400).json({ error: "Invalid url" });
      return;
    }

    if (!/^https?:$/.test(parsed.protocol)) {
      res.status(400).json({ error: "Unsupported protocol" });
      return;
    }

    if (!isHostAllowed(parsed.hostname, allowedHosts)) {
      res.status(403).json({ error: "Host not allowed" });
      return;
    }

    if (isYouTubeHost(parsed.hostname)) {
      res.status(400).json({ error: "YouTube streaming requires ytdl-core (not enabled)" });
      return;
    }

    const client = parsed.protocol === "https:" ? https : http;
    const upstream = client.request(
      parsed,
      {
        headers: {
          "User-Agent": "NekoSuneAI-StreamProxy",
          "Accept": "*/*"
        }
      },
      upstreamRes => {
        res.status(upstreamRes.statusCode || 200);
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        }
        upstreamRes.pipe(res);
      }
    );

    upstream.on("error", err => {
      res.status(502).json({ error: "Upstream error", detail: err.message });
    });

    upstream.end();
  });

  app.listen(port, () => {
    const label = baseURL || `http://localhost:${port}`;
    console.log(`[StreamProxy] Listening on ${label}/api/stream`);
  });

  started = true;
}

module.exports = {
  startStreamProxy
};
