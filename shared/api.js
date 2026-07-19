import { API_PROFILE_ENDPOINT_DEFAULT, API_PROFILE_MODEL_DEFAULT } from "./constants.js";
import { normalizeApiOptions } from "./api-options.js";

function resolveApiProfile(options, purpose) {
  const normalized = normalizeApiOptions(options || {});
  const id = purpose === "summary" ? normalized.summaryApiProfileId : normalized.optimizeApiProfileId;
  return normalized.apiProfiles.find((profile) => profile.id === id) || normalized.apiProfiles[0] || {
    id: "default",
    name: "Default API",
    endpoint: API_PROFILE_ENDPOINT_DEFAULT,
    apiKey: "",
    model: API_PROFILE_MODEL_DEFAULT
  };
}

function resolvePromptTemplate(options, purpose) {
  const normalized = normalizeApiOptions(options || {});
  if (purpose === "summary") {
    return normalized.summaryPromptTemplates.find((item) => item.id === normalized.summaryPromptTemplateId)
      || normalized.summaryPromptTemplates[0];
  }
  return normalized.optimizePromptTemplates.find((item) => item.id === normalized.optimizePromptTemplateId)
    || normalized.optimizePromptTemplates[0];
}

async function chatCompletion(profile, messages) {
  if (!profile?.apiKey) throw new Error("API key is not configured");
  const endpoint = profile.endpoint || API_PROFILE_ENDPOINT_DEFAULT;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${profile.apiKey}`
    },
    body: JSON.stringify({
      model: profile.model || API_PROFILE_MODEL_DEFAULT,
      messages
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed with HTTP ${response.status}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
  if (!content) throw new Error("API response did not include message content");
  return String(content).trim();
}

function extractMessageContent(data) {
  return data?.choices?.[0]?.delta?.content
    || data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || "";
}

function parseJsonContent(text) {
  try {
    return extractMessageContent(JSON.parse(text));
  } catch {
    return "";
  }
}

async function chatCompletionStream(profile, messages, onDelta, attrs = {}) {
  if (!profile?.apiKey) throw new Error("API key is not configured");
  const endpoint = profile.endpoint || API_PROFILE_ENDPOINT_DEFAULT;
  const response = await fetch(endpoint, {
    method: "POST",
    signal: attrs.signal,
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${profile.apiKey}`
    },
    body: JSON.stringify({
      model: profile.model || API_PROFILE_MODEL_DEFAULT,
      messages,
      stream: true
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed with HTTP ${response.status}`);
  }
  if (!response.body) {
    const data = await response.json();
    const content = String(extractMessageContent(data) || "").trim();
    if (!content) throw new Error("API response did not include message content");
    onDelta?.(content);
    return content;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let output = "";
  let sawStreamData = false;

  const emit = (text) => {
    if (!text) return;
    output += text;
    onDelta?.(text);
  };
  const parseEvent = (eventText) => {
    const lines = eventText.split(/\r?\n/);
    const payload = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!payload) return false;
    sawStreamData = true;
    if (payload === "[DONE]") return true;
    const content = parseJsonContent(payload);
    emit(content);
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    raw += chunk;
    buffer += chunk;
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    let shouldStop = false;
    for (const eventText of events) {
      if (parseEvent(eventText)) {
        shouldStop = true;
        break;
      }
    }
    if (shouldStop) break;
  }
  const tail = decoder.decode();
  if (tail) {
    raw += tail;
    buffer += tail;
  }
  if (buffer.trim()) parseEvent(buffer);
  const fallback = !sawStreamData ? parseJsonContent(raw) : "";
  if (fallback) emit(fallback);
  const content = output.trim();
  if (!content) throw new Error("API response did not include message content");
  return content;
}

export async function optimizePromptStream(options, input, onDelta, attrs = {}) {
  const prompt = String(input || "").trim();
  if (!prompt) return "";
  const profile = resolveApiProfile(options, "optimize");
  const template = resolvePromptTemplate(options, "optimize");
  return chatCompletionStream(profile, [
    { role: "system", content: template.prompt },
    { role: "user", content: prompt }
  ], onDelta, attrs);
}

export async function summarizeContexts(options, contexts, question = "") {
  const profile = resolveApiProfile(options, "summary");
  const template = resolvePromptTemplate(options, "summary");
  const body = (contexts || []).map((context, index) => {
    const title = context.title || context.href || `Source ${index + 1}`;
    const messages = (context.messages || []).map((message) => `${message.role}: ${message.text}`).join("\n\n");
    return `# ${title}\n${messages}`;
  }).join("\n\n---\n\n");
  const userContent = question.trim()
    ? `Question:\n${question.trim()}\n\nContext:\n${body}`
    : `Context:\n${body}`;
  return chatCompletion(profile, [
    { role: "system", content: template.prompt },
    { role: "user", content: userContent }
  ]);
}
