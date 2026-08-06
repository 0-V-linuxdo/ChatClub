const NOTION_SOURCE_INDICATOR_SELECTORS = Object.freeze([
  '[data-testid="unified-chat-search-scope-button"]',
  '[role="button"][aria-haspopup="menu"]',
  'button[aria-haspopup="menu"]'
]);
const NOTION_SOURCE_NON_INDICATOR_TEST_IDS = new Set([
  "unified-chat-plus-menu-button",
  "unified-chat-start-recording-button",
  "agent-send-message-button"
]);
const NOTION_SOURCE_NON_INDICATOR_LABELS = new Set([
  "give context",
  "add context",
  "attach files",
  "start voice recording",
  "submit ai message",
  "send message",
  "添加上下文",
  "附件",
  "开始录音",
  "提交 ai 消息",
  "发送消息"
]);
// Notion renders this locale-neutral icon only for its standard ai-knowledge (Sources off) state.
// Its official scopeName values are All sources I can access / No sources / Web search only.
const NOTION_SOURCE_DISABLED_ICON_SELECTOR = 'svg.teamspaceSlashSmall[role="graphics-symbol"]';

const NOTION_SOURCE_ENABLED_LABELS = new Set([
  "all sources i can access",
  "all sources",
  "我可以访问的所有来源",
  "我能访问的所有来源",
  "所有我可以访问的来源",
  "所有来源",
  "全部来源",
  "所有资料源",
  "全部资料源"
]);

const NOTION_SOURCE_DISABLED_LABELS = new Set([
  "web search only",
  "no sources",
  "仅限网页搜索",
  "仅限网络搜索",
  "仅使用网页搜索",
  "仅使用网络搜索",
  "只搜索网页",
  "只搜索网络",
  "无来源",
  "没有来源",
  "无资料源",
  "没有资料源"
]);

export function createPreferredNotionSourceIndicator(deps = {}) {
  const {
    notionText,
    visibleSelectorElements,
    modelRect,
    findNotionComposerRoot,
    isNotionControlNearMainComposer,
    findNotionSourcesTrigger,
    waitForPreferredModelWithinDeadline,
    assertPreferredModelRun
  } = deps;

  function notionSourceIndicatorLabel(element) {
    for (const name of ["aria-label", "aria-valuetext", "title"]) {
      const value = notionText(element?.getAttribute?.(name));
      if (value) return value;
    }
    return "";
  }

  function notionSourceStateFromLabel(label) {
    if (NOTION_SOURCE_ENABLED_LABELS.has(label)) return true;
    if (NOTION_SOURCE_DISABLED_LABELS.has(label)) return false;
    return null;
  }

  function notionSourceIndicatorIsSettings(element) {
    const testId = notionText(element?.getAttribute?.("data-testid"));
    const label = notionSourceIndicatorLabel(element);
    return testId === "unified-chat-mode-menu-button"
      || label === "settings"
      || label === "设置";
  }

  function notionSourceIndicatorIsNonSourceControl(element) {
    const testId = notionText(element?.getAttribute?.("data-testid"));
    if (NOTION_SOURCE_NON_INDICATOR_TEST_IDS.has(testId)) return true;
    return NOTION_SOURCE_NON_INDICATOR_LABELS.has(notionSourceIndicatorLabel(element));
  }

  function notionSourceIndicatorIsModelControl(element) {
    const testId = notionText(element?.getAttribute?.("data-testid"));
    const label = notionSourceIndicatorLabel(element);
    return testId === "unified-chat-model-button"
      || testId.includes("model")
      || /^(?:select |open )?models?$/.test(label)
      || /^(?:选择|打开)?模型$/.test(label);
  }

  function notionSourceIndicatorCandidates(composerRoot, composerRect) {
    const candidates = visibleSelectorElements(NOTION_SOURCE_INDICATOR_SELECTORS)
      .filter((element) => isNotionControlNearMainComposer(element, composerRoot, composerRect))
      .filter((element) => !notionSourceIndicatorIsSettings(element))
      .filter((element) => !notionSourceIndicatorIsModelControl(element))
      .filter((element) => !notionSourceIndicatorIsNonSourceControl(element));
    return [...new Set(candidates)];
  }

  function notionSourceButtonForDisabledIcon(icon) {
    let node = icon?.parentElement || null;
    while (node && node.nodeType === 1) {
      if (
        String(node.getAttribute?.("role") || "").toLowerCase() === "button"
        && (
          String(node.getAttribute?.("aria-haspopup") || "").toLowerCase() === "menu"
          || notionSourceIndicatorIsNonSourceControl(node)
        )
      ) return node;
      node = node.parentElement || null;
    }
    return null;
  }

  function observeNotionMainSourceState() {
    const composer = findNotionComposerRoot();
    const composerRect = modelRect(composer);
    const trigger = findNotionSourcesTrigger();
    if (!composer || !composerRect || !trigger) {
      return { state: null, reason: "sources indicator is not ready" };
    }
    const candidates = notionSourceIndicatorCandidates(composer, composerRect);
    const disabledIcons = visibleSelectorElements(NOTION_SOURCE_DISABLED_ICON_SELECTOR)
      .map((icon) => ({ icon, indicator: notionSourceButtonForDisabledIcon(icon) }))
      .filter(({ indicator }) => indicator && (
        composer.contains?.(indicator)
        || isNotionControlNearMainComposer(indicator, composer, composerRect)
      ));
    if (disabledIcons.length > 1) {
      return { state: null, reason: "sources disabled indicator is ambiguous" };
    }
    if (disabledIcons.length === 1) {
      const { icon, indicator } = disabledIcons[0];
      const candidateMatches = candidates.length === 1 && candidates[0] === indicator;
      // In Fable 5, Sources-off is rendered as an explicit slash icon inside
      // the Give context control. Give context is intentionally excluded from
      // the generic Sources candidates, so the icon itself must be the source
      // proof when its owner is that known non-Sources control.
      const explicitDisabledMarkerOwner = notionSourceIndicatorIsNonSourceControl(indicator)
        && !notionSourceIndicatorIsSettings(indicator)
        && !notionSourceIndicatorIsModelControl(indicator);
      if (!candidateMatches && !explicitDisabledMarkerOwner) {
        return { state: null, reason: "sources indicator is ambiguous" };
      }
      if (notionSourceStateFromLabel(notionSourceIndicatorLabel(indicator)) === true) {
        return { state: null, reason: "sources indicator state conflicts" };
      }
      return { state: false, proofElement: icon, indicator, composer, trigger, reason: "" };
    }
    if (candidates.length > 1) {
      return { state: null, reason: "sources indicator is ambiguous" };
    }
    const indicator = candidates[0] || null;
    if (!indicator) {
      return { state: true, proofElement: null, indicator: null, composer, trigger, reason: "" };
    }
    const state = notionSourceStateFromLabel(notionSourceIndicatorLabel(indicator));
    return {
      state,
      proofElement: indicator,
      indicator,
      composer,
      trigger,
      reason: state === null ? "sources indicator state is unreadable" : ""
    };
  }

  function sameNotionSourceIndicator(first, second) {
    if (!first || !second || first.state !== second.state) return false;
    if (first.proofElement || second.proofElement) return first.proofElement === second.proofElement;
    // Fable 5's current composer has no main Sources indicator when it is in
    // Notion's default All Sources state.  Closing Settings can replace the
    // composer subtree, so the absence proof must be sampled twice without
    // requiring React to preserve the same wrapper node.
    if (!first.indicator && !second.indicator) return true;
    return first.composer === second.composer && first.trigger === second.trigger;
  }

  async function waitNotionMainSourceState(context, desiredState = null, timeoutMs = 1000) {
    let previous = null;
    let samples = 0;
    const observation = await waitForPreferredModelWithinDeadline(context, () => {
      const current = observeNotionMainSourceState();
      if (current.state === null || (desiredState !== null && current.state !== desiredState)) {
        previous = null;
        samples = 0;
        return null;
      }
      if (!sameNotionSourceIndicator(previous, current)) {
        previous = current;
        samples = 1;
        return null;
      }
      samples += 1;
      previous = current;
      return samples >= 2 ? current : null;
    }, timeoutMs, 120);
    assertPreferredModelRun(context);
    return observation || null;
  }

  return Object.freeze({ observeNotionMainSourceState, waitNotionMainSourceState });
}
