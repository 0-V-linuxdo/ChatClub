# ChatClub

ChatClub is a browser extension for working with multiple AI chat platforms in one workspace. It lets you send one prompt to several chat apps, compare answers, collect summaries, optimize prompts, and keep reusable prompt snippets close at hand.

## Features

- Multi-AI workspace with configurable chat groups and tabs.
- Shared prompt composer with send history and keyboard shortcuts.
- Prompt optimization through configurable API profiles and templates.
- Summary panel for collecting chat context and asking follow-up questions.
- Prompt Library for saving, editing, ordering, and inserting reusable prompts.
- Custom Config support for adding chat targets and selectors.
- Import / Export for portable ChatClub settings backups.
- Customizable top bar layout.

## Installation

1. Clone or download this repository.
2. Open your browser extension management page.
3. Enable developer mode.
4. Load this folder as an unpacked extension.
5. Open ChatClub from the extension action or the options page.

## Project Structure

- `app/` - Main options-page application controllers and UI flows.
- `background/` - MV3 service worker and extension-level actions.
- `content/` - Content scripts and page-world summary bridge code.
- `shared/` - Shared storage, constants, i18n, shortcuts, and top bar helpers.
- `styles/` - ChatClub application styles.
- `ui/` - Small DOM, component, and tooltip helpers.
- `userscripts/` - Built-in summary collectors for supported AI sites.
- `_locales/` - Extension metadata translations.

## Development

The app is implemented with plain JavaScript modules, CSS, and Chrome Extension Manifest V3 APIs. There is no build step required for local development.

After editing files, reload the unpacked extension from the browser extension management page to test the latest changes.

## Repository

GitHub: https://github.com/0-V-linuxdo/ChatClub
