const TOPIC_TITLE_MAX_LENGTH = 48;
const GENERIC_TOPIC_TITLE = /^(?:chatclub(?:\s+\d+)?|prompt)$/i;

export function isGenericTopicTitle(value) {
  return GENERIC_TOPIC_TITLE.test(String(value || "").trim());
}

export function sanitizeTopicTitle(value) {
  let text = String(value || "").replace(/\r\n/g, "\n");
  text = text.split("\n").map((line) => line.trim()).find(Boolean) || "";
  text = text.replace(/^[*_`#>\-\s]+/, "").replace(/[*_`]+$/g, "");
  text = text.replace(/^["'`“”‘’「」『』]+/, "").replace(/["'`“”‘’「」『』]+$/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text || isGenericTopicTitle(text)) return "";
  if (text.length > TOPIC_TITLE_MAX_LENGTH) {
    text = text.slice(0, TOPIC_TITLE_MAX_LENGTH).trim();
    const cut = text.lastIndexOf(" ");
    if (cut >= 16) text = text.slice(0, cut).trim();
    text = text.replace(/[.,;:：、，；]+$/g, "").trim();
  }
  return text && !isGenericTopicTitle(text) ? text : "";
}

export function topicTitleFromPrompt(value) {
  return sanitizeTopicTitle(value);
}
