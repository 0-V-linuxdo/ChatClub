// OpenAI-compatible chat/completions client (v2 03 §7, 04 §2): streaming SSE with a JSON fallback.

export class ApiError extends Error {
  constructor(message, { status = 0, code = "API_ERROR" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const messageFromBody = (text) => {
  try {
    const json = JSON.parse(text);
    return json?.error?.message || json?.message || text;
  } catch {
    return text;
  }
};

/** Sends one chat completion. With `stream`, calls onDelta(chunk, full) as text arrives. Returns the full text. */
export async function chatCompletion({ endpoint, apiKey, model, messages, stream = false, signal, onDelta, extraBody } = {}) {
  if (!endpoint) throw new ApiError("No endpoint configured", { code: "NO_ENDPOINT" });
  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ model, messages, ...(stream ? { stream: true } : {}), ...(extraBody ?? {}) }), signal });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError(String(error?.message || error), { code: "NETWORK" });
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(`${response.status} ${messageFromBody(body).slice(0, 300)}`.trim(), { status: response.status, code: "HTTP" });
  }
  const type = response.headers.get("content-type") || "";
  if (!stream || !type.includes("text/event-stream") || !response.body) {
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // A server that answered SSE without the header.
      if (stream && text.includes("data:")) return parseSseText(text, onDelta);
      throw new ApiError("The response is not JSON", { code: "BAD_RESPONSE" });
    }
    const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? "";
    if (stream && content) onDelta?.(content, content);
    return String(content);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return full;
      const chunk = deltaOf(data);
      if (chunk) {
        full += chunk;
        onDelta?.(chunk, full);
      }
    }
  }
  return full;
}

function deltaOf(data) {
  try {
    const json = JSON.parse(data);
    return json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

function parseSseText(text, onDelta) {
  let full = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") break;
    const chunk = deltaOf(data);
    if (chunk) {
      full += chunk;
      onDelta?.(chunk, full);
    }
  }
  return full;
}
