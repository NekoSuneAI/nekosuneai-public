const { config } = require("../../../config");
const { addMessage, getMemory } = require('./../../../Addons/memoryStore');
const axios = require("axios");

async function askGPT(endpoint, method = "POST", body = null) {
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
    return res.data.choices[0].message;
  } else if (method === "GET") {
    const res = await axios.get(`${config.addons.AI.GPTText.baseURL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${config.addons.AI.GPTText.apiKey}`
      }
    });
    return res.data;
  }
}

async function RESPGPT(prompt, model) {
  try {
    // Save the user message
    await addMessage('user', prompt);

    // Fetch recent conversation
    const history = await getMemory(50);
    const messages = history.map(m => ({ role: m.role, content: m.content }));

    // Build the payload
    const payload = {
      model,
      messages: [
        { role: 'system', content: config.addons.AI.GPTText.systemmsg },
        ...messages
      ],
      stream: false
    };

    // Call the API
    const awser = await askGPT('/chat/completions', 'POST', payload);

    // Handle rate limit or errors returned by askGPT
    if (awser.status === 429) {
      return {
        status: 429,
        message: 'Too many requests — try again in a few minutes.'
      };
    }
    if (awser.status && awser.status !== 200) {
      return {
        status: awser.status,
        message: awser.message || 'Unexpected error from GPT endpoint'
      };
    }

    let text = awser.content || '';
    // Strip common assistant labels that sometimes leak into model output.
    text = text.replace(/^\s*#{1,3}\s*Assistant:\s*/i, "");
    text = text.replace(/^\s*Assistant:\s*/i, "");
    await addMessage('assistant', text);

    // Split long text into ≤129-character chunks
    const words = text.split(/\s+/);
    const chunks = [];
    for (const word of words) {
      if (
        chunks.length === 0 ||
        chunks[chunks.length - 1].length + word.length + 1 > 129
      ) {
        chunks.push(word);
      } else {
        chunks[chunks.length - 1] += ' ' + word;
      }
    }

    return {
      status: 200,
      role: 'assistant',
      content: text,
      contentarray: chunks
    };
  } catch (error) {
    console.error('[RESPGPT] error:', error);
    return {
      status: 504,
      role: 'assistant',
      content: 'Request timed out or failed.'
    };
  }
}

module.exports = {
  RESPGPT
};
