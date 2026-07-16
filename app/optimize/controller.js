import { optimizePromptStream } from "../../shared/api.js";
import { t } from "../../shared/i18n.js";
import { button, el, iconButton, taskModal, textarea, toast } from "../../ui/dom.js";
import { validateControllerContract } from "../controller-contract.js";

export function createOptimizeController(ctx) {
  const {
    state,
    svgIcon,
    syncPromptInputNode,
    ensurePromptInputReady
  } = validateControllerContract(ctx, "Optimize controller", {
    state: "object", svgIcon: "function", syncPromptInputNode: "function", ensurePromptInputReady: "function"
  });

  async function optimizeCurrentPrompt() {
    const original = state.promptText;
    const source = original.trim();
    if (!source) return;
    let controller = null;
    let requestId = 0;
    let comparison;
    const run = async () => {
      if (!ensurePromptInputReady()) return;
      requestId += 1;
      const activeRequestId = requestId;
      controller?.abort();
      controller = new AbortController();
      comparison.start();
      try {
        await optimizePromptStream(state.options, source, (chunk) => {
          if (activeRequestId === requestId) comparison.append(chunk);
        }, { signal: controller.signal });
        if (activeRequestId === requestId) comparison.finish();
      } catch (error) {
        if (controller.signal.aborted || activeRequestId !== requestId || !comparison.isOpen()) return;
        comparison.fail(error.message || t("optimize.failed"));
      }
    };
    comparison = openOptimizeCompareDialog(original, "", {
      loading: true,
      onCancel: () => controller?.abort(),
      onRetry: () => run()
    });
    await run();
  }

  function openOptimizeCompareDialog(original, optimized = "", attrs = {}) {
    let dialog;
    let closed = false;
    let loading = Boolean(attrs.loading);
    let output = optimized;
    const optimizedCount = el("span", {}, t("optimize.charCount", { count: optimized.length }));
    const optimizedStatus = el("span", {
      class: loading ? "optimize-compare-status streaming" : "optimize-compare-status"
    }, loading ? t("optimize.streaming") : t("optimize.ready"));
    const errorMessage = el("p", { class: "optimize-compare-error", hidden: true });
    const applyButton = button(t("optimize.useOptimized"), apply, "primary");
    const retryButton = iconButton(t("optimize.retryOptimization"), svgIcon("reload"), () => attrs.onRetry?.(), "optimize-compare-retry", t("optimize.retryOptimization"), "", "optimize.retry");
    applyButton.disabled = !optimized.trim();
    retryButton.disabled = loading;
    const optimizedInput = textarea(optimized, {
      class: "textarea optimize-compare-textarea",
      spellcheck: "true",
      placeholder: loading ? t("optimize.optimizedPlaceholder") : "",
      "aria-label": t("optimize.optimizedAria"),
      oninput: (event) => {
        output = event.target.value;
        updateStatus();
      }
    });
    function updateStatus(message = "") {
      optimizedCount.textContent = t("optimize.charCount", { count: optimizedInput.value.length });
      optimizedStatus.textContent = message || (loading ? t("optimize.streaming") : t("optimize.ready"));
      optimizedStatus.classList.toggle("streaming", loading);
      optimizedStatus.classList.toggle("failed", message === t("optimize.failed"));
      applyButton.disabled = !optimizedInput.value.trim();
      retryButton.disabled = loading;
    }
    function close() {
      if (closed) return;
      closed = true;
      if (loading) attrs.onCancel?.();
      dialog?.remove();
    }
    function apply() {
      if (!ensurePromptInputReady()) return;
      state.promptText = optimizedInput.value;
      state.promptSelection = {
        start: state.promptText.length,
        end: state.promptText.length,
        direction: "none"
      };
      syncPromptInputNode({ focus: true });
      close();
      toast(t("toast.promptOptimized"), "success");
    }
    function append(chunk) {
      if (closed || !chunk) return;
      output += chunk;
      optimizedInput.value = output;
      optimizedInput.scrollTop = optimizedInput.scrollHeight;
      updateStatus();
    }
    function start() {
      if (closed) return;
      loading = true;
      output = "";
      optimizedInput.value = "";
      optimizedInput.placeholder = t("optimize.optimizedPlaceholder");
      errorMessage.hidden = true;
      errorMessage.textContent = "";
      updateStatus();
    }
    function finish() {
      if (closed) return;
      loading = false;
      optimizedInput.placeholder = "";
      updateStatus();
      setTimeout(() => optimizedInput.focus({ preventScroll: true }), 30);
    }
    function fail(message) {
      if (closed) return;
      loading = false;
      errorMessage.hidden = false;
      errorMessage.textContent = message;
      updateStatus(t("optimize.failed"));
      toast(message, "error");
    }
    dialog = taskModal(t("optimize.title"), el("div", { class: "ui-dialog optimize-compare-dialog" },
      el("p", { class: "optimize-compare-lead" }, t("optimize.lead")),
      el("div", { class: "optimize-compare-grid" },
        el("section", { class: "ui-card optimize-compare-panel" },
          el("div", { class: "ui-card-header optimize-compare-panel-header" },
            el("h3", {}, t("optimize.original")),
            el("span", {}, t("optimize.charCount", { count: original.length }))
          ),
          textarea(original, {
            class: "textarea optimize-compare-textarea",
            readonly: true,
            "aria-label": t("optimize.originalAria")
          })
        ),
        el("section", { class: "ui-card optimize-compare-panel optimize-compare-panel-result" },
          el("div", { class: "ui-card-header optimize-compare-panel-header" },
            el("h3", {}, t("optimize.optimized")),
            el("div", { class: "optimize-compare-meta" }, optimizedStatus, optimizedCount, retryButton)
          ),
          optimizedInput,
          errorMessage
        )
      ),
      el("div", { class: "settings-dialog-actions optimize-compare-actions" },
        button(t("optimize.keepOriginal"), close),
        applyButton
      )
    ), close, true, t("common.close"));
    dialog.querySelector(".modal")?.classList.add("optimize-compare-modal");
    updateStatus();
    if (!loading) setTimeout(() => optimizedInput.focus({ preventScroll: true }), 30);
    return {
      start,
      append,
      finish,
      fail,
      isOpen: () => !closed
    };
  }

  return {
    optimizeCurrentPrompt,
    openOptimizeCompareDialog
  };
}
