// Service worker entry. Listeners are registered synchronously inside bootBackground.
import { bootBackground } from "../kernel/background-boot.js";
import { PLUGINS } from "../plugins/all.background.js";
import { BUILD } from "../build-info.js";

bootBackground({ plugins: PLUGINS, isDev: BUILD.isDev });
