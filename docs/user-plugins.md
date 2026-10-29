# User plugins

ChatClub can load plugins you write yourself. Open **Settings → Plugins → User plugins** and click **Import plugin** to load a local `.js` file, a URL, or pasted code. Imported plugins are listed in the same tab. You can turn each one on or off, update it, export it, or uninstall it there.

A user plugin runs in its own sandboxed page (`sandbox.html`). It cannot touch the ChatClub page or the chat sites directly. Everything goes through the `chatclub` object, and every ability beyond the basics has to be declared with `@grant`. The import dialog lists these abilities for you to approve.

## File format

A plugin is a plain script with a metadata block at the top:

```js
// ==ChatClubPlugin==
// @name            WordCount          (required, PascalCase, must not clash with a built-in plugin)
// @description:zh  中文说明            (required: @description, or :zh / :en variants)
// @description:en  English description
// @version         1.0.0
// @author          Your name
// @icon            fileText           (a ChatClub icon name; defaults to "plug")
// @grant           ui                 (one per line, or several separated by spaces)
// ==/ChatClubPlugin==

await chatclub.topbar.addButton({ id: "hello", label: "Hello", onClick: () => chatclub.notify("Hi!") });
```

The body runs when the plugin starts, and top-level `await` works. When the plugin is turned off, ChatClub removes everything it added: buttons, shortcuts, styles and event listeners. It then drops the sandbox page. Use `chatclub.onStop(fn)` for any other cleanup.

The size limit is 512 KB. See [`user-plugins/word-count.js`](user-plugins/word-count.js) for a complete example.

## API

Every call returns a Promise. Values passed back and forth must be plain JSON data.

| Call | Grant | What it does |
| --- | --- | --- |
| `chatclub.meta` | – | The parsed metadata block. |
| `chatclub.log(...args)` | – | Writes to the console under the plugin's name. |
| `chatclub.notify(message, type?)` | – | Shows a toast. `type` is `success`, `error` or `warning`. |
| `chatclub.storage.get(key)` / `.set(key, value)` / `.remove(key)` / `.keys()` | – | The plugin's own saved data. It is deleted when the plugin is uninstalled. |
| `chatclub.onStop(fn)` | – | Runs `fn` when the plugin is turned off. |
| `chatclub.css.add(cssText)` → id, `chatclub.css.remove(id)` | `css` | Adds or removes styles on the ChatClub page. |
| `chatclub.topbar.addButton({ id, label, icon, onClick })`, `chatclub.topbar.remove(id)` | `ui` | Adds or removes a top bar button. |
| `chatclub.shortcuts.add({ id, label, run })`, `chatclub.shortcuts.remove(id)` | `ui` | Registers an action that can be bound in the Shortcuts settings. |
| `chatclub.composer.getText()` / `.setText(text)` / `.insert(text)` / `.send(text?)` | `composer` | Reads or changes the composer draft, or sends it. |
| `chatclub.workspace.tabs()` | `workspace` | Lists columns and tabs as `{ groupId, active, tabs: [{ tabId, appId, url }] }`. |
| `chatclub.workspace.currentUrl()` / `.open(url, tabId?)` / `.refresh(tabId?)` | `workspace` | Reads the current URL, or opens or reloads a URL in a tab (defaults to the current column). |
| `chatclub.on(event, fn)` → off | `events` | Listens to a ChatClub event, such as `pluginToggle`. |
| `chatclub.fetch(url, { method, headers, body })` | `network` | Fetches a URL as the extension and resolves to `{ ok, status, headers, text }`. |

The sandbox has no network access of its own (`default-src 'none'`). Network requests have to go through `chatclub.fetch`, which needs the `network` grant.
