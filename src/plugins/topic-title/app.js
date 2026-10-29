// TopicTitle: names a workspace from its first prompt or from the open conversation (v2 02 §14).

import { isGenericTitle } from "../../lib/titles.js";
import { DEFAULT_ENDPOINT } from "../api-profiles/model.js";
import { titleFromText, titleFromDocument } from "./rules.js";

const BACKOFF_MS = [900, 2600, 6000, 12000];
const SYSTEM_PROMPT = "Write a short title (at most 48 characters) for a conversation that starts with the user's message below. Use the message's language. Reply with the title only, without quotes or punctuation at the end.";

export default {
  start(ctx) {
    const workspace = ctx.services.get("workspace");
    if (!workspace) return;
    // ApiProfiles is optional: without it titles come from the prompt.
    const api = () => ctx.services.get("apiProfiles");
    const apps = ctx.services.get("apps");
    const transport = ctx.services.get("frames.transport");
    const frames = ctx.services.get("frames");

    ctx.contribute("apiConsumer", {
      id: "topicTitle",
      labelKey: "topicTitle.consumer",
      order: 30,
      getSelection: () => ({ profileId: ctx.settings.topicTitleApiProfileId, model: ctx.settings.topicTitleApiModel }),
      setSelection: ({ profileId, model }) => {
        ctx.settings.topicTitleApiProfileId = profileId;
        ctx.settings.topicTitleApiModel = model ?? "";
      },
    });

    const hasTitle = () => !isGenericTitle(workspace.getTopic().title);
    let generating = null; // { workspaceId, promise }

    /** An API is "available" when the chosen provider is configured beyond the empty default. */
    const apiAvailable = () => {
      const { profile } = api()?.resolve("topicTitle") ?? {};
      return !!profile && (!!profile.apiKey || profile.endpoint !== DEFAULT_ENDPOINT);
    };
    const generate = async (text) => {
      const fallback = titleFromText(text);
      if (!apiAvailable()) return fallback;
      try {
        const { text: answer } = await api().chat("topicTitle", { messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: String(text).slice(0, 4000) }] });
        return titleFromText(answer) || fallback;
      } catch (error) {
        ctx.logger.warn("Generating a topic title failed; using the prompt:", error?.message || error);
        return fallback;
      }
    };
    /** Sets an automatic title unless the workspace changed or already has one meanwhile. */
    const nameFrom = (text, workspaceId = workspace.workspaceId()) => {
      if (hasTitle() || generating) return generating?.promise ?? null;
      const promise = generate(text).then((title) => {
        if (title && workspace.workspaceId() === workspaceId && !hasTitle()) workspace.setTopic({ title, custom: false });
        return title;
      }).finally(() => {
        generating = null;
      });
      generating = { workspaceId, promise };
      return promise;
    };

    // 1) The first prompt sent from the composer.
    ctx.events.on("Composer:accepted", (payload) => {
      if (payload.source !== "composer" && payload.source !== "handoff") return;
      if (!String(payload.text ?? "").trim()) return;
      nameFrom(payload.text, payload.workspaceId);
    });

    // 2) A conversation opened without the composer (02 §14.2).
    let attempt = null; // { workspaceId, tabId, href, step, timer }
    const stopAttempts = () => {
      if (attempt) clearTimeout(attempt.timer);
      attempt = null;
    };
    const candidate = () => {
      for (const group of workspace.groups()) {
        const tab = group.tabs[group.activeIndex];
        if (!tab || tab.pendingNewChat || !/^https?:/i.test(tab.href || "")) continue;
        if (workspace.isNewTopicUrl(tab.appId, tab.href)) continue;
        if (!tab.frameKey || !frames.isRegistered(tab.frameKey)) continue;
        return tab;
      }
      return null;
    };
    const tryOnce = async () => {
      const a = attempt;
      if (!a) return;
      const tab = workspace.tab?.(a.tabId);
      if (workspace.workspaceId() !== a.workspaceId || hasTitle() || !tab || tab.href !== a.href) return stopAttempts();
      if (generating) return schedule(a.step); // a generation is running: try again later
      const app = apps.get(tab.appId);
      try {
        const meta = await transport.send(tab.frameKey, { capability: "base", command: "getPageMeta" }, { timeoutMs: 1800 });
        const m = meta?.result ?? meta;
        let host = "";
        try {
          host = new URL(m?.url || tab.href).hostname;
        } catch {
          host = "";
        }
        const title = titleFromDocument(m?.title, { appName: app?.name, provider: app?.provider, hostname: host });
        if (attempt !== a || hasTitle()) return;
        if (title && (!m?.url || sameConversation(m.url, a.href))) {
          workspace.setTopic({ title, custom: false });
          return stopAttempts();
        }
        if (ctx.services.get("messageNavigator")?.supports?.(tab.appId)) {
          const opening = await transport.send(tab.frameKey, { capability: "message-navigator", command: "getConversationOpening" }, { timeoutMs: 2500 }).catch(() => null);
          const o = opening?.result ?? opening;
          if (attempt === a && o?.text && (!o.url || sameConversation(o.url, a.href))) {
            await nameFrom(o.text, a.workspaceId);
            if (hasTitle()) return stopAttempts();
          }
        }
      } catch {
        // try again later
      }
      schedule(a.step + 1);
    };
    const schedule = (step) => {
      if (!attempt) return;
      if (step >= BACKOFF_MS.length) return stopAttempts();
      attempt.step = step;
      clearTimeout(attempt.timer);
      attempt.timer = setTimeout(tryOnce, BACKOFF_MS[step]);
    };
    const sameConversation = (a, b) => {
      try {
        const x = new URL(a);
        const y = new URL(b);
        return x.origin === y.origin && x.pathname.replace(/\/+$/, "") === y.pathname.replace(/\/+$/, "") && x.search === y.search;
      } catch {
        return a === b;
      }
    };
    const consider = () => {
      if (hasTitle()) return stopAttempts();
      const tab = candidate();
      if (!tab) return stopAttempts();
      const id = workspace.workspaceId();
      if (attempt && attempt.tabId === tab.id && attempt.href === tab.href && attempt.workspaceId === id) return;
      stopAttempts();
      attempt = { workspaceId: id, tabId: tab.id, href: tab.href, step: 0, timer: null };
      schedule(0);
    };
    ctx.events.on("Workspace:changed", consider);
    ctx.events.on("frameRegistered", consider);
    ctx.events.on("NewChat:started", stopAttempts);
    ctx.onDispose(stopAttempts);

    ctx.services.provide("topicTitle", {
      fromText: (text) => nameFrom(text),
      titleFromText,
      titleFromDocument,
    });
  },
};
