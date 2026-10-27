// FunctionalAnomalies (background): the single writer of the `functionalAnomalies` list (v2 06 §12.1).

import { KEY, addRecord } from "./model.js";

const local = () => chrome.storage.local;
let chain = Promise.resolve();
const serial = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};
const read = async () => {
  const raw = (await local().get(KEY))[KEY];
  return Array.isArray(raw) ? raw : [];
};
const isReport = (r) => r && typeof r === "object" && typeof r.feature === "string" && r.feature.trim();

export default {
  handlers: {
    recordFunctionalAnomalies: {
      sender: ["extensionPage", "chatFrame"],
      validate: (p) => p && Array.isArray(p.records) && p.records.length > 0 && p.records.length <= 20 && p.records.every(isReport),
      handle: (p) => serial(async () => {
        let list = await read();
        const ids = [];
        for (const r of p.records) {
          const res = addRecord(list, r);
          list = res.records;
          ids.push(res.record.id);
        }
        await local().set({ [KEY]: list });
        return { ids };
      }),
    },
    listFunctionalAnomalies: {
      sender: "extensionPage",
      validate: () => true,
      handle: async () => ({ records: await read() }),
    },
    removeFunctionalAnomalies: {
      sender: "extensionPage",
      validate: (p) => p && Array.isArray(p.ids) && p.ids.every((x) => typeof x === "string"),
      handle: (p) => serial(async () => {
        const drop = new Set(p.ids);
        const list = (await read()).filter((r) => !drop.has(r.id));
        await local().set({ [KEY]: list });
        return { count: list.length };
      }),
    },
    clearFunctionalAnomalies: {
      sender: "extensionPage",
      validate: () => true,
      handle: () => serial(async () => {
        await local().set({ [KEY]: [] });
        return { count: 0 };
      }),
    },
  },
};
