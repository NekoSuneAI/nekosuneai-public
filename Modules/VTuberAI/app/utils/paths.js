import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "..", "..", "data", "vtuberai");
const SQLITE_DIR = join(DATA_DIR, "sqlite");
const TTS_DIR = join(DATA_DIR, "tts");
const MICAUDIO_DIR = join(DATA_DIR, "micaudio");
const INPUT_DIR = join(DATA_DIR, "input");
const TOKENS_DIR = join(DATA_DIR, "tokens");

export {
  DATA_DIR,
  SQLITE_DIR,
  TTS_DIR,
  MICAUDIO_DIR,
  INPUT_DIR,
  TOKENS_DIR
};
