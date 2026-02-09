const path = require("path");

async function main() {
  const { ensureFfmpegPath } = require(path.join(__dirname, "..", "Modules", "Addons", "API", "FFmpeg"));
  const ffmpegPath = await ensureFfmpegPath();
  console.log(`[FFmpeg] Ready: ${ffmpegPath}`);
}

main().catch(err => {
  console.error("[FFmpeg] Failed:", err?.message || err);
  process.exit(1);
});
