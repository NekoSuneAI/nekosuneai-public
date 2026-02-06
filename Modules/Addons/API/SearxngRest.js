const fetch = global.fetch;
const { config } = require("../../config");

function requireFetch() {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available. Use Node.js 20+ or install a fetch polyfill.");
  }
  return fetch;
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || "").replace(/\/+$/, "");
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
  const normalizedQuery = normalizeForMatch(query);
  for (const term of blocklist) {
    const normalizedTerm = normalizeForMatch(term);
    if (!normalizedTerm) continue;
    if (normalizedQuery.includes(normalizedTerm)) return true;
  }
  return false;
}

function trimSnippet(text, maxLen = 280) {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

async function SearxngGrabber(query, maxResults = 5) {
  try {
    if (matchesSearchBlocklist(query)) {
      return { blocked: true };
    }
    const baseUrl = normalizeBaseUrl(config.addons.AI.SearxNG?.baseURL);
    if (!baseUrl) {
      return { error: "SearxNG baseURL is not configured." };
    }
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
    const fetchImpl = requireFetch();
    const res = await fetchImpl(url);
    if (!res.ok) {
      return { error: `SearxNG error: ${res.status}` };
    }
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const trimmed = results.slice(0, Math.max(1, maxResults)).map(r => ({
      title: r.title || "Untitled",
      snippet: trimSnippet(r.content || r.snippet || r.description || "")
    }));

    return { results: trimmed };
  } catch (error) {
    console.error("[SearxngGrabber] Error:", error);
    return { error: "Error fetching from SearxNG." };
  }
}

module.exports = { SearxngGrabber };
