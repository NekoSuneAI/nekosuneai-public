const { config } = require("../../../config");

const axios = require("axios");

async function askGPT(endpoint, method = "POST", body = null) {
  if (method === "POST") {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.addons.AI.OPENAI.apiKey}`
    };
    const res = await axios.post(
      `${config.addons.AI.OPENAI.baseURL}${endpoint}`,
      body,
      { headers }
    );
    return res.data.choices[0].message;
  } else if (method === "GET") {
    const res = await axios.get(`${config.addons.AI.OPENAI.baseURL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${config.addons.AI.OPENAI.apiKey}`
      }
    });
    return res.data;
  }
}

async function RESPGPT(prompt, model) {
  try {
    const awser = await askGPT("/chat/completions", "POST", {
      model: model,
      messages: [
        { role: "system", content: config.addons.AI.OPENAI.systemmsg },
        { role: "user", content: prompt }
      ],
      stream: false
    });

    // Check for rate limit
    if (awser.content === "Request failed with status code 429") {
      return {
        status: 429,
        message: "Too many Requests from this IP, please try again after 5 minutes"
      };
    }

    // Split the text into words
    const sentences = awser.content.split(/\s+/);
    const filteredSentences = [];

    for (const word of sentences) {
      if (
        filteredSentences.length === 0 ||
        filteredSentences[filteredSentences.length - 1].length + word.length + 1 > 129
      ) {
        filteredSentences.push(word);
      } else {
        filteredSentences[filteredSentences.length - 1] += " " + word;
      }
    }

    return {
      status: 200,
      role: "assistant",
      content: awser.content,
      contentarray: filteredSentences
    };

  } catch (error) {
    return {
      status: 504,
      role: "assistant",
      content: "Request timed out"
    };
  }
}

module.exports = {
  RESPGPT
};
