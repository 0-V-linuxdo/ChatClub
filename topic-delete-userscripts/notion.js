if (api.findDeleteConfirmButton()) {
  const confirmedExisting = await api.clickDeleteConfirmIfPresent(6500);
  return confirmedExisting
    ? api.result(true, "notion")
    : api.result(false, "notion", "delete confirmation did not close");
}
const labels = ["Delete", "Delete topic", "删除", "删除话题"];
const trigger = api.findNotionDeleteMenuTrigger();
if (!trigger) return api.result(false, "notion", "conversation menu trigger not found");
if (!await api.openTriggerAndClickDelete(trigger, labels)) {
  return api.result(false, "notion", "delete menu item not found");
}
const confirmed = await api.clickDeleteConfirmIfPresent(6500);
if (!confirmed && api.deleteDialogRoots().length) {
  return api.result(false, "notion", "delete confirmation did not close");
}
return api.result(true, "notion");
