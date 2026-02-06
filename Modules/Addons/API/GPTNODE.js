const { config } = require("../../config");
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
}

module.exports = {
  askGPT
};
