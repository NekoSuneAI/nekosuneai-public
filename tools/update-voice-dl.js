const axios = require("axios");
const fs = require("fs");
const path = require("path");

async function fetchRepoTree() {
  const baseUrl = "https://huggingface.co/api/models/rhasspy/piper-voices/tree/main";
  const all = [];
  let cursor = null;

  while (true) {
    const url = cursor ? `${baseUrl}?recursive=1&cursor=${encodeURIComponent(cursor)}` : `${baseUrl}?recursive=1`;
    const res = await axios.get(url, { timeout: 30000 });
    const data = Array.isArray(res.data) ? res.data : [];
    all.push(...data);

    const link = res.headers?.link || res.headers?.Link || "";
    const match = /<[^>]*[?&]cursor=([^&>]+)[^>]*>\s*;\s*rel="next"/i.exec(link);
    if (match) {
      cursor = decodeURIComponent(match[1]);
      continue;
    }
    break;
  }

  return all;
}

async function main() {
  const files = await fetchRepoTree();
  const paths = new Set(files.map(f => f.path).filter(Boolean));

  const voices = [];
  for (const p of paths) {
    if (!p.endsWith(".onnx")) continue;
    if (!paths.has(`${p}.json`)) continue;
    const name = path.basename(p, ".onnx");
    voices.push({
      name,
      onnx: `https://huggingface.co/rhasspy/piper-voices/resolve/main/${p}`,
      json: `https://huggingface.co/rhasspy/piper-voices/resolve/main/${p}.json`
    });
  }

  voices.sort((a, b) => a.name.localeCompare(b.name));

  const outPath = path.resolve(__dirname, "..", "config", "voice_dl.json");
  fs.writeFileSync(outPath, JSON.stringify(voices, null, 2));
  console.log(`[voice_dl] Wrote ${voices.length} voices to ${outPath}`);
}

main().catch(err => {
  console.error("[voice_dl] Failed:", err?.message || err);
  process.exit(1);
});
