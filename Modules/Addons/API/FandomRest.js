const fetch = global.fetch;

function requireFetch() {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available. Use Node.js 20+ or install a fetch polyfill.");
  }
  return fetch;
}

/**
 * Fetch article text from VRChat-Legends Fandom REST API
 * and clean it up into plain readable text.
 */
async function FandomGrabber(query) {
  try {
    const url = `https://vrchat-legends.fandom.com/rest.php/v1/page/${encodeURIComponent(query)}`;
    const fetchImpl = requireFetch();
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Fandom REST error: ${res.status}`);
    const data = await res.json();

    if (!data || !data.source) {
      return "No content found on VRChat-Legends Fandom.";
    }

    let text = data.source;

    // ---- Cleanup formatting ----
    text = text
      // Remove Infobox or other templates {{...}}
      .replace(/\{\{[^}]+\}\}/g, "")
      // Remove file/image tags [[File:...]]
      .replace(/\[\[File:[^\]]+\]\]/g, "")
      // Remove categories [[Category:...]]
      .replace(/\[\[Category:[^\]]+\]\]/g, "")
      // Convert internal wiki links [[Page|Label]] → Label
      .replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2")
      // Strip bold/italic quotes '''text''' or ''text''
      .replace(/''+/g, "")
      // Remove headings == Heading ==
      .replace(/={2,}\s*(.*?)\s*={2,}/g, "\n$1\n")
      // Remove <u>...</u>
      .replace(/<\/?u>/g, "")
      // Collapse extra newlines
      .replace(/\n{3,}/g, "\n\n")
      .replace(/()/g, "")
      .trim();

    return text;
  } catch (err) {
    console.error("[FandomGrabber] Error:", err);
    return "Error fetching from VRChat-Legends Fandom REST API.";
  }
}

module.exports = { FandomGrabber };
