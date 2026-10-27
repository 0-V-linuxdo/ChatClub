// PromptHandoff (page): open a new workspace tab that sends the current draft (v2 02 §13).

export default {
  start(ctx) {
    const t = ctx.t;
    const workspace = ctx.services.get("workspace");
    const composer = ctx.services.get("composer");
    const shellUi = ctx.services.get("ui");
    if (!workspace || !composer) return;

    // ---- source side
    const pending = new Map(); // handoff id -> { draftVersion }
    let inFlightVersion = null;
    const openWithDraft = async () => {
      const draft = composer.getDraft();
      if (!draft.text.trim() && !draft.images.length) return ctx.services.get("workspaceSession")?.openWorkspaceTab({});
      const version = composer.draftVersion();
      if (inFlightVersion === version) return null; // same draft: only one new tab
      inFlightVersion = version;
      const appIds = workspace.groups().map((g) => g.tabs[g.activeIndex]?.appId).filter(Boolean);
      try {
        const result = await ctx.background.request("open", { text: draft.text, images: draft.images, appIds });
        if (!result?.ok) throw new Error("not opened");
        pending.set(result.id, { draftVersion: version });
        return result;
      } catch (error) {
        inFlightVersion = null;
        ctx.logger.warn("Opening a workspace with the draft failed:", error?.message || error);
        shellUi.toast(t("handoff.openFailed"), "error");
        return null;
      }
    };
    const onMessage = (message, sender) => {
      if (message?.type !== "chatclub.handoffSettled" || sender.id !== chrome.runtime.id || sender.tab) return;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (inFlightVersion === entry.draftVersion) inFlightVersion = null;
      if (message.accepted) {
        if (composer.draftVersion() === entry.draftVersion) composer.clear();
      } else if (message.reason !== "closed") {
        shellUi.toast(t("handoff.failed"), "error");
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    ctx.onDispose(() => chrome.runtime.onMessage.removeListener(onMessage));

    // ---- target side: a page opened with #…&handoff=<id>
    const handoffId = /[#&]handoff=([0-9a-f-]{36})/i.exec(location.hash)?.[1] ?? null;
    let claimed = null;
    if (handoffId) {
      ctx.contribute("workspace.contentProvider", {
        id: "PromptHandoff:layout",
        order: 50,
        async provide({ workspaceId }) {
          const result = await ctx.background.request("claim", { id: handoffId, workspaceId }).catch(() => null);
          if (!result?.ok) return null;
          claimed = result;
          return {
            schemaVersion: 1,
            layout: { type: "temporary", presetId: null, name: t("handoff.layoutName") },
            groups: result.appIds.map((appId) => ({ tabs: [{ appId }], activeIndex: 0 })),
            fullscreenGroupIndex: null,
            topicTitle: "",
            topicTitleCustom: false,
          };
        },
      });
      ctx.events.on("Workspace:ready", async () => {
        // Drop the handoff marker from the address so a refresh doesn't replay it.
        workspace.setWorkspaceId(workspace.workspaceId());
        if (!claimed) return;
        await workspace.waitForFramesLoaded(45000);
        composer.setDraft({ text: claimed.text, images: claimed.images }, { focus: true });
        let accepted = false;
        try {
          const outcome = await composer.send({ source: "handoff" });
          // A send that may have gone through counts as accepted: the source must not keep a duplicate.
          accepted = !!outcome?.results?.some?.((r) => r?.status === "sent" || (r?.status === "failed" && r.uncertain));
        } catch (error) {
          ctx.logger.warn("Sending the handed-off draft failed:", error?.message || error);
        }
        await ctx.background.request("settle", { id: handoffId, accepted }).catch(() => {});
      });
    }

    ctx.services.provide("promptHandoff", { openWithDraft });
  },
};
