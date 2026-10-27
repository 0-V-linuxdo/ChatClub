// Downloads online theme CSS for extension pages (works regardless of page CSP).

export default {
  handlers: {
    fetchCss: {
      sender: "extensionPage",
      validate: (payload) => typeof payload?.url === "string" && /^https:\/\//i.test(payload.url),
      async handle({ url }) {
        const response = await fetch(url, { credentials: "omit", cache: "no-cache" });
        const text = response.ok ? await response.text() : "";
        return { ok: response.ok, status: response.status, text };
      },
    },
  },
};
