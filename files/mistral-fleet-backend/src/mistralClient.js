const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

/**
 * Calls the Mistral chat completions endpoint.
 *
 * @param {object} params
 * @param {string} params.model
 * @param {Array}  params.messages   - chat history, OpenAI-style {role, content, tool_call_id?, tool_calls?}
 * @param {Array}  [params.tools]    - tool specs from tools.js, scoped to the calling agent
 * @returns {Promise<object>} the raw Mistral response body
 */
export async function chatCompletion({ model, messages, tools }) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not set. Copy .env.example to .env and add your key.");
  }

  const body = {
    model,
    messages,
    ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
  };

  const res = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mistral API error ${res.status}: ${text}`);
  }

  return res.json();
}
