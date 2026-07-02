const labels = ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"];
const trigger = api.topRightMenuTrigger({
  labels: ["More", "More actions", "Menu", "Options", "更多", "菜单"]
});
if (!trigger) return api.result(false, "grokMirror", "conversation menu trigger not found");
if (!await api.openTriggerAndClickDelete(trigger, labels)) {
  return api.result(false, "grokMirror", "delete menu item not found");
}
await api.clickDeleteConfirmIfPresent(3600);
return api.result(true, "grokMirror");
