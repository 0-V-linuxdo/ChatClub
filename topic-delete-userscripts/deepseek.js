if (!await api.ensureDeepSeekSidebarOpen()) {
  return api.result(false, "deepseek", "sidebar could not be opened");
}
const bridged = await api.requestDeepSeekDeleteBridge(10500);
if (bridged?.ok) return api.result(true, "deepseek");
const bridgeReason = bridged?.reason || "";
if (bridgeReason && !/bridge timeout|bridge failed/i.test(bridgeReason)) {
  const confirmedAfterBridge = await api.clickDeleteConfirmIfPresent(1800);
  if (confirmedAfterBridge) return api.result(true, "deepseek");
}
const root = api.deepSeekSidebarRoot();
const hints = api.deepSeekDeleteHints(data);
const row = api.deepSeekTopicRows(root, hints)[0] || null;
if (!row) return api.result(false, "deepseek", bridgeReason || "current topic row not found");
const moreButton = await api.waitFor(() => api.deepSeekTopicMoreButton(row), 1600, 100);
if (!moreButton) return api.result(false, "deepseek", bridgeReason || "topic menu trigger not found");
const labels = ["Delete", "删除"];
if (!await api.openTriggerAndClickDelete(moreButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true })) {
  return api.result(false, "deepseek", bridgeReason || "delete menu item not found");
}
const confirmed = await api.clickDeleteConfirmIfPresent(6500);
if (!confirmed) return api.result(false, "deepseek", bridgeReason || "delete confirmation button not found");
return api.result(true, "deepseek");
