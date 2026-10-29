// ==ChatClubPlugin==
// @name            WordCount
// @description:zh  在顶栏加一个按钮，显示输入框里有多少字，并记录点了几次。
// @description:en  Adds a top bar button that shows how long the draft is and counts the clicks.
// @version         1.0.0
// @author          ChatClub
// @icon            fileText
// @grant           ui
// @grant           composer
// @grant           css
// ==/ChatClubPlugin==

const show = async () => {
  const text = await chatclub.composer.getText();
  const clicks = ((await chatclub.storage.get("clicks")) ?? 0) + 1;
  await chatclub.storage.set("clicks", clicks);
  chatclub.notify(`${[...text].length} chars (click #${clicks})`, "success");
};

await chatclub.topbar.addButton({ id: "count", label: "Word count", icon: "fileText", onClick: show });
await chatclub.shortcuts.add({ id: "count", label: "WordCount: show draft length", run: show });
await chatclub.css.add(`[data-tip-id="topbar.WordCount.count"] svg { color: var(--primary); }`);
chatclub.onStop(() => chatclub.log("WordCount stopped"));
