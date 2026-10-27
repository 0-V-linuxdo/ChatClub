// App page entry: hand the plugin list to the kernel. The kernel itself never imports plugins.
import { bootApp } from "../kernel/app-boot.js";
import { PLUGINS } from "../plugins/all.app.js";
import { BUILD } from "../build-info.js";

bootApp({ plugins: PLUGINS, isDev: BUILD.isDev });
