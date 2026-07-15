const { transform } = require("esbuild");

const NATIVE_BROWSER_TARGETS = Object.freeze(["chrome120", "firefox136"]);

async function normalizedTransform(source, sourcefile, target) {
  return transform(source, {
    sourcefile,
    loader: "js",
    format: "esm",
    platform: "browser",
    target,
    charset: "utf8",
    legalComments: "inline",
    minify: false,
    sourcemap: false
  });
}

async function nativeEsmSyntaxRequiresLowering(source, sourcefile = "native-module.js", targets = NATIVE_BROWSER_TARGETS) {
  const [native, targeted] = await Promise.all([
    normalizedTransform(source, sourcefile, "esnext"),
    normalizedTransform(source, sourcefile, targets)
  ]);
  return Object.freeze({
    requiresLowering: native.code !== targeted.code,
    nativeCode: native.code,
    targetedCode: targeted.code
  });
}

module.exports = { NATIVE_BROWSER_TARGETS, nativeEsmSyntaxRequiresLowering };
