const { Mistral } = require("@mistralai/mistralai");

let client = null;

function getClient() {
  if (!client) {
    const key = process.env.MISTRAL_API_KEY;
    if (!key || key === "your_mistral_api_key_here") {
      throw new Error("MISTRAL_API_KEY is not configured. Add it to backend/.env");
    }
    client = new Mistral({ apiKey: key });
  }
  return client;
}

const MODEL = () => process.env.MISTRAL_MODEL || "mistral-small-latest";

/**
 * Generic chat completion helper.
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ temperature?: number, max_tokens?: number }} options
 * @returns {Promise<string>} AI text response
 */
async function chat(messages, options = {}) {
  try {
    const response = await getClient().chat.complete({
      model:       MODEL(),
      messages,
      temperature: options.temperature  ?? 0.7,
      max_tokens:  options.max_tokens   ?? 500,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("[AI] Mistral API error:", error.message);
    throw new Error("AI service unavailable. Please try again later.");
  }
}

module.exports = { chat };
