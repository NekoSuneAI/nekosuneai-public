"""Text cleanup helpers for the chatbox and TTS.

Ported from the Node VOICEModules/Speak.js + Commands/Main.js helpers:
chunking to VRChat's chatbox limit, emoji/markdown/link stripping, and
spelling numbers/currency out so the TTS reads them naturally.
"""

from __future__ import annotations

import re

_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF"
    "\U00002190-\U000021FF\U00002B00-\U00002BFF️‍]+",
    flags=re.UNICODE,
)
_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
_WWW_RE = re.compile(r"\bwww\.\S+", re.IGNORECASE)
_CJK_RE = re.compile(r"[぀-ヿ一-鿿]+")

_DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
_TEEN_WORDS = [
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen",
]
_TENS_WORDS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_SCALE_WORDS = [
    "", "thousand", "million", "billion", "trillion", "quadrillion",
    "quintillion", "sextillion", "septillion", "octillion", "nonillion", "decillion",
]


def strip_emojis(text: str) -> str:
    if not text:
        return ""
    return _EMOJI_RE.sub("", text).strip()


def strip_http_urls(text: str) -> str:
    if not text:
        return ""
    return _URL_RE.sub("", text).strip()


def strip_cjk(text: str) -> str:
    if not text:
        return text
    return re.sub(r"\s{2,}", " ", _CJK_RE.sub(" ", text)).strip()


def has_cjk(text: str) -> bool:
    return bool(text and re.search(r"[぀-ヿ一-鿿]", text))


def strip_links(text: str) -> str:
    """Turn markdown links into plain text and drop URLs / citation markers."""
    if not text:
        return text
    cleaned = re.sub(r"\[([^\]]+)\]\(([^)]*)\)", r"\1", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[([^\]]+)\]\(", r"\1 ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[\s*\d+(?:\s*,\s*\d+)*\s*\]", "", cleaned)
    cleaned = _URL_RE.sub("", cleaned)
    cleaned = _WWW_RE.sub("", cleaned)
    cleaned = re.sub(r"[\[\]\(\)]", " ", cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def strip_markdown(text: str) -> str:
    if not text:
        return text
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"^\s*assistant:\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned


def strip_role_blocks(text: str) -> str:
    if not text:
        return text
    cleaned = re.sub(r"###\s*(user|assistant|system)\s*:", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\s*(user|assistant|system)\s*:\s*", "", cleaned, flags=re.IGNORECASE | re.MULTILINE)
    cleaned = re.sub(r"\bNekoSuneAI\s+says?:\s*", "", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def clean_llm_output(text: str) -> str:
    """Full cleanup pipeline for text shown in chatbox / read aloud."""
    if not text:
        return ""
    cleaned = strip_role_blocks(strip_markdown(text))
    cleaned = strip_links(cleaned)
    if has_cjk(cleaned):
        cleaned = strip_cjk(cleaned)
    return strip_emojis(cleaned)


def split_into_chunks(text: str, max_len: int = 129) -> list[str]:
    """Split text into word-aligned chunks no longer than ``max_len`` chars."""
    words = re.split(r"\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for word in words:
        if not word:
            continue
        candidate = (current + " " + word).strip()
        if len(candidate) > max_len:
            if current:
                chunks.append(current.strip())
            current = word
        else:
            current = candidate
    if current.strip():
        chunks.append(current.strip())
    return chunks


# --- number / currency spelling (lightweight subset of the Node version) ---

def _chunk_to_words(num: int) -> str:
    if num == 0:
        return ""
    if num < 10:
        return _DIGIT_WORDS[num]
    if num < 20:
        return _TEEN_WORDS[num - 10]
    if num < 100:
        tens, ones = divmod(num, 10)
        return f"{_TENS_WORDS[tens]} {_DIGIT_WORDS[ones]}".strip() if ones else _TENS_WORDS[tens]
    hundreds, rest = divmod(num, 100)
    rest_words = f" {_chunk_to_words(rest)}" if rest else ""
    return f"{_DIGIT_WORDS[hundreds]} hundred{rest_words}"


def _integer_to_words(int_string: str) -> str:
    try:
        value = int(int_string)
    except (ValueError, TypeError):
        return ""
    if value == 0:
        return "zero"
    parts: list[str] = []
    scale_index = 0
    while value > 0:
        value, chunk = divmod(value, 1000)
        if chunk:
            chunk_words = _chunk_to_words(chunk)
            scale = _SCALE_WORDS[scale_index] if scale_index < len(_SCALE_WORDS) else ""
            parts.insert(0, f"{chunk_words} {scale}".strip() if scale else chunk_words)
        scale_index += 1
    return " ".join(parts)


def _number_string_to_words(text: str) -> str:
    normalized = text.replace(",", "")
    int_part, _, frac_part = normalized.partition(".")
    int_words = _integer_to_words(int_part)
    if not int_words:
        return ""
    if not frac_part:
        return int_words
    frac_words = " ".join(_DIGIT_WORDS[int(d)] for d in frac_part if d.isdigit())
    return f"{int_words} point {frac_words}"


# Matches comma-grouped numbers (1,234) and plain integers/decimals (1234, 5.5).
_NUMBER_RE = re.compile(r"\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\b")


def numbers_to_words(text: str) -> str:
    return _NUMBER_RE.sub(lambda m: _number_string_to_words(m.group(0)) or m.group(0), text)


def prepare_tts_text(text: str) -> str:
    """Strip URLs and spell numbers out before sending to the TTS engine."""
    if not isinstance(text, str):
        return ""
    return numbers_to_words(strip_http_urls(text))
