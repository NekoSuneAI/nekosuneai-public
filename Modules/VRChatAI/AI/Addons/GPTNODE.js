const { config } = require("../../../config");
const { addMessage, getMemory } = require("./DB/memoryStore");
const { askGPT } = require("../../../Addons/API/GPTNODE");

function stripLinks(text) {
  if (!text) return text;
  let cleaned = text;
  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]*)\)/gi, "$1");
  cleaned = cleaned.replace(/\[([^\]]+)\]\(/gi, "$1 ");
  cleaned = cleaned.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "");
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, "");
  cleaned = cleaned.replace(/\bwww\.\S+/gi, "");
  cleaned = cleaned.replace(/[\[\]\(\)]/g, " ");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

async function RESPGPT(prompt, model) {
  try {
    await addMessage("user", prompt);
    const history = await getMemory(50);
    const messages = history.map(m => ({ role: m.role, content: m.content }));

    const payload = {
      model,
      messages: [
        { role: "system", content: config.addons.AI.GPTText.systemmsg },
        ...messages
      ],
      stream: false
    };

    const response = await askGPT("/chat/completions", "POST", payload);
    const message = response?.choices?.[0]?.message || response;

    if (message?.status === 429) {
      return { status: 429, message: "Too many requests — try again in a few minutes." };
    }
    if (message?.status && message.status !== 200) {
      return { status: message.status, message: message.message || "Unexpected error from GPT endpoint" };
    }

    let text = message?.content || "";
    text = text.replace(/^\s*#{1,3}\s*Assistant:\s*/i, "");
    text = text.replace(/^\s*Assistant:\s*/i, "");
    text = stripLinks(text);
    await addMessage("assistant", text);

    const words = text.split(/\s+/);
    const chunks = [];
    for (const word of words) {
      if (chunks.length === 0 || chunks[chunks.length - 1].length + word.length + 1 > 129) {
        chunks.push(word);
      } else {
        chunks[chunks.length - 1] += " " + word;
      }
    }

    return {
      status: 200,
      role: "assistant",
      content: text,
      contentarray: chunks
    };
  } catch (error) {
    console.error("[RESPGPT] error:", error);
    return {
      status: 504,
      role: "assistant",
      content: "Request timed out or failed."
    };
  }
}

module.exports = {
  RESPGPT
};
