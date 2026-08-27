export const DEFAULT_SHORTCUT_CONFIG = {
  schemaVersion: 2,
  profiles: {
    mac: {
      sendKeyMode: "enter",
      shortcuts: {
        focusInput: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyK" },
        openNewWorkspaceTab: { disabled: false, command: true, control: false, option: true, shift: true, code: "KeyN" },
        toggleWorkspaceTabsSidebar: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyB" },
        openSettings: { disabled: false, command: true, control: false, option: true, shift: true, code: "KeyS" },
        openAppPicker: { disabled: false, command: true, control: false, option: true, shift: true, code: "KeyA" },
        openSettingsMenu: { disabled: false, command: true, control: false, option: true, shift: true, code: "KeyJ" },
        newChat: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyN" },
        newChatAll: { disabled: false, command: true, control: false, option: false, shift: true, code: "KeyN" },
        deleteThread: { disabled: false, command: false, control: false, option: true, shift: true, code: "KeyD" },
        optimizePrompt: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyO" },
        openSummaryPanel: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyS" },
        openSharePanel: { disabled: false, command: false, control: false, option: true, shift: true, code: "KeyS" },
        openPocketPanel: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyP" },
        openHistoryPanel: { disabled: false, command: false, control: false, option: true, shift: true, code: "KeyH" },
        toggleMessageNavigator: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyM" },
        closeChat: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyW" },
        refreshPage: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyR" },
        reloadChat: { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyH" },
        enterFullscreen: { disabled: false, command: false, control: false, option: true, shift: false, code: "KeyF" },
        insertPrompt: { disabled: false, command: false, control: false, option: true, shift: false, codePattern: "Digit" },
        switchLayout: { disabled: false, command: true, control: false, option: false, shift: true, codePattern: "Digit" },
        switchPlatformTab: { disabled: false, command: true, control: false, option: false, shift: false, codePattern: "Digit" }
      }
    },
    windows: {
      sendKeyMode: "enter",
      shortcuts: {
        focusInput: { disabled: false, control: false, alt: true, shift: false, code: "KeyK" },
        openNewWorkspaceTab: { disabled: false, control: true, alt: true, shift: true, code: "KeyN" },
        toggleWorkspaceTabsSidebar: { disabled: false, control: true, alt: false, shift: false, code: "KeyB" },
        openSettings: { disabled: false, control: true, alt: true, shift: true, code: "KeyS" },
        openAppPicker: { disabled: false, control: true, alt: true, shift: true, code: "KeyA" },
        openSettingsMenu: { disabled: false, control: true, alt: true, shift: true, code: "KeyJ" },
        newChat: { disabled: false, control: true, alt: false, shift: false, code: "KeyN" },
        newChatAll: { disabled: false, control: true, alt: false, shift: true, code: "KeyN" },
        deleteThread: { disabled: false, control: false, alt: true, shift: true, code: "KeyD" },
        optimizePrompt: { disabled: false, control: false, alt: true, shift: false, code: "KeyO" },
        openSummaryPanel: { disabled: false, control: false, alt: true, shift: false, code: "KeyS" },
        openSharePanel: { disabled: false, control: false, alt: true, shift: true, code: "KeyS" },
        openPocketPanel: { disabled: false, control: true, alt: false, shift: false, code: "KeyP" },
        openHistoryPanel: { disabled: false, control: false, alt: true, shift: true, code: "KeyH" },
        toggleMessageNavigator: { disabled: false, control: true, alt: false, shift: false, code: "KeyM" },
        closeChat: { disabled: false, control: false, alt: true, shift: false, code: "KeyW" },
        refreshPage: { disabled: false, control: true, alt: false, shift: false, code: "KeyR" },
        reloadChat: { disabled: false, control: true, alt: false, shift: false, code: "KeyH" },
        enterFullscreen: { disabled: false, control: false, alt: true, shift: false, code: "KeyF" },
        insertPrompt: { disabled: false, control: false, alt: true, shift: false, codePattern: "Digit" },
        switchLayout: { disabled: false, control: true, alt: false, shift: true, codePattern: "Digit" },
        switchPlatformTab: { disabled: false, control: true, alt: false, shift: false, codePattern: "Digit" }
      }
    }
  }
};
