// Built-in Summary userscript: ChatGPT (chatgpt)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 54; global config version: 60
// Hosts: chatgpt.com, *.chatgpt.com, chat.openai.com, *.chat.openai.com
// Path prefixes: (none)
// Run mode: pageWorldFirst; timeout: 24000
// This is a Simple Chat Hub Summary bridge body, not a standalone browser userscript.

const opts = {
  copyButtonSelector: 'button[data-testid="copy-turn-action-button"],button[aria-label="Copy message"],button[aria-label="Copy response"]',
  maxButtons: 80
};
const closest = (node, selector) => {
  try {
    return api.closest(node, selector);
  } catch (error) {
    return null;
  }
};
const turnScope = node => closest(node, 'article,[data-testid^="conversation-turn"],[data-testid*="conversation-turn"]') || node;
const centerY = rect => (rect.top + rect.bottom) / 2;
const visibleRect = node => {
  try {
    const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch (error) {
    return null;
  }
};
const roleLabel = role => role === 'user' ? /^copy message$/i : /^copy response$/i;
const candidateScore = (button, scope, role) => {
  const buttonRect = visibleRect(button);
  const scopeRect = visibleRect(scope);
  if (!buttonRect || !scopeRect) return Number.POSITIVE_INFINITY;
  const aria = String(button.getAttribute('aria-label') || '').trim();
  const testId = String(button.getAttribute('data-testid') || '').trim();
  const correctLabel = roleLabel(role).test(aria);
  const copyTurnButton = testId === 'copy-turn-action-button';
  if (!correctLabel && !copyTurnButton) return Number.POSITIVE_INFINITY;
  const verticalOverlap = buttonRect.bottom >= scopeRect.top - 32 && buttonRect.top <= scopeRect.bottom + 120;
  const horizontalDistance = buttonRect.left < scopeRect.left - 120 || buttonRect.left > scopeRect.right + 180 ? 5000 : 0;
  return (correctLabel ? 0 : 1000) + (verticalOverlap ? 0 : 10000) + horizontalDistance + Math.abs(centerY(buttonRect) - centerY(scopeRect)) + Math.abs(buttonRect.left - scopeRect.left) / 20;
};
const copyForTurn = async (scope, role) => {
  api.reveal(scope);
  await api.sleep(160);
  const buttons = api.qsa(opts.copyButtonSelector, document, { all: true })
    .filter(api.visible)
    .map(button => ({ button, score: candidateScore(button, scope, role) }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score)
    .slice(0, opts.maxButtons);
  for (const item of buttons) {
    const copied = await api.copy(item.button);
    const text = api.normalize(copied);
    if (text) return text;
    await api.sleep(80);
  }
  return '';
};
const turns = api.qsa('[data-message-author-role]', document, { all: true })
  .filter(api.visible)
  .map(node => ({ node, role: String(node.getAttribute('data-message-author-role') || '').toLowerCase() }))
  .filter(turn => turn.role === 'user' || turn.role === 'assistant')
  .filter((turn, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.role === turn.role && other.node !== turn.node && other.node.contains && other.node.contains(turn.node)));
const out = [];
for (const turn of turns) {
  const scope = turnScope(turn.node);
  const text = await copyForTurn(scope, turn.role);
  if (text) out.push({ role: turn.role, text });
  await api.sleep(120);
}
const merged = api.merge(out);
return merged.some(message => message.role === 'user') && merged.some(message => message.role === 'assistant') ? merged : [];
