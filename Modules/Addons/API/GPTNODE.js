const { config } = require("../../config");
const axios = require("axios");
const { askOllama, getOllamaConfig } = require("./OllamaNode");

function shouldFallbackToOllama(error) {
  const cfg = getOllamaConfig();
  if (!cfg.enabled) return false;
  const status = error?.response?.status;
  if (!status) return true;
  if (status >= 500 || status === 429) return true;
  return cfg.fallbackOnAnyError;
}

async function askGPT(endpoint, method = "POST", body = null) {
  try {
    if (method === "POST") {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.addons.AI.GPTText.apiKey}`
      };
      const res = await axios.post(
        `${config.addons.AI.GPTText.baseURL}${endpoint}`,
        body,
        { headers }
      );
      return res.data;
    }
    if (method === "GET") {
      const res = await axios.get(`${config.addons.AI.GPTText.baseURL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${config.addons.AI.GPTText.apiKey}`
        }
      });
      return res.data;
    }
    throw new Error(`Unsupported method: ${method}`);
  } catch (error) {
    if (!shouldFallbackToOllama(error)) {
      throw error;
    }
    console.warn("[GPTNODE] GPT endpoint failed, falling back to local Ollama.");
    return await askOllama(endpoint, method, body);
  }
}

module.exports = {
  askGPT
};
