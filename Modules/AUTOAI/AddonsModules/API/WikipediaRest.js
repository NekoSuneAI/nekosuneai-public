const fetch = require("node-fetch");

/**
 * Fetch article text from Wikipedia REST API
 * and clean it up into plain readable text.
 */
async function WikipediaGrabber(query) {
  try {
    const url = `https://en.wikipedia.org/rest.php/v1/page/${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikipedia REST error: ${res.status}`);
    const data = await res.json();

    if (!data || !data.source) {
      return "No content found on Wikipedia.";
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
    console.error("[WikipediaGrabber] Error:", err);
    return "Error fetching from Wikipedia REST API.";
  }
}

module.exports = { WikipediaGrabber };
