#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const {
    createFolder,
    deleteFolder,
    moveFolder,
    moveTabToFolder,
    pruneFolderMembers,
    removeTabFromFolder,
    renameFolder,
    serializeFolders
  } = await import(moduleUrl("app/workspace/tabs-sidebar-folders.js"));
  const { buildSidebarTree, folderIdForItem } = await import(moduleUrl("app/workspace/tabs-sidebar-sort.js"));

  let folders = createFolder([], "Research");
  assert.equal(folders.length, 1);
  assert.equal(folders[0].name, "Research");
  assert.match(folders[0].id, /^folder-/);
  folders = moveTabToFolder(folders, "page-aaaaaaaaaaaa", folders[0].id);
  folders = moveTabToFolder(folders, "page-bbbbbbbbbbbb", folders[0].id, "before", "page-aaaaaaaaaaaa");
  assert.deepEqual(folders[0].workspaceIds, ["page-bbbbbbbbbbbb", "page-aaaaaaaaaaaa"]);
  folders = removeTabFromFolder(folders, "page-bbbbbbbbbbbb");
  assert.deepEqual(folders[0].workspaceIds, ["page-aaaaaaaaaaaa"]);
  folders = createFolder(folders, "Archive");
  folders = moveFolder(folders, folders[1].id, folders[0].id, "before");
  assert.deepEqual(folders.map((folder) => folder.name), ["Archive", "Research"]);
  folders = renameFolder(folders, folders[1].id, "  Deep research  ");
  assert.equal(folders[1].name, "Deep research");
  const pruned = pruneFolderMembers(folders, ["page-aaaaaaaaaaaa"]);
  assert.deepEqual(pruned[1].workspaceIds, ["page-aaaaaaaaaaaa"]);
  assert.deepEqual(pruneFolderMembers(folders, [])[1].workspaceIds, []);
  const remaining = deleteFolder(pruned, pruned[0].id);
  assert.deepEqual(remaining.map((folder) => folder.name), ["Deep research"]);
  assert.deepEqual(
    JSON.parse(serializeFolders([{ id: "bad", name: "Nope" }, remaining[0], remaining[0]])).map((folder) => folder.id),
    [remaining[0].id]
  );

  const tree = buildSidebarTree({
    items: [
      { workspaceId: "page-aaaaaaaaaaaa", live: true, topicTitle: "Nested", updatedAt: Date.now() },
      { workspaceId: "page-cccccccccccc", live: true, topicTitle: "Loose", updatedAt: Date.now() }
    ],
    folders: remaining,
    mode: "time"
  });
  assert.equal(tree[0].type, "folder");
  assert.equal(tree[0].items[0].workspaceId, "page-aaaaaaaaaaaa");
  assert.equal(folderIdForItem({ workspaceId: "page-aaaaaaaaaaaa" }, remaining), remaining[0].id);
  assert.equal(folderIdForItem({ workspaceId: "page-cccccccccccc" }, remaining), "");

  console.log("tabs sidebar folders: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
