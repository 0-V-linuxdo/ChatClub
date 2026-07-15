#!/usr/bin/env node

const SUPPORTED_NODE_MAJORS = Object.freeze([22, 24]);

function nodeMajor(version = process.versions.node) {
  return Number(String(version || "").split(".", 1)[0]);
}

function supportedNodeVersion(version = process.versions.node) {
  return SUPPORTED_NODE_MAJORS.includes(nodeMajor(version));
}

function nodeVersionMessage(context, version = process.versions.node) {
  return `${context} requires Node.js 22.x or 24.x; current runtime is ${version}. Run \`nvm use\` (the repository pins Node 24) before generating release artifacts.`;
}

function enforceNodeVersion({
  context = "ChatClub tooling",
  strict = true,
  version = process.versions.node,
  warn = console.warn
} = {}) {
  if (supportedNodeVersion(version)) return true;
  const message = nodeVersionMessage(context, version);
  if (strict) throw new Error(message);
  warn(`Warning: ${message}`);
  return false;
}

if (require.main === module) {
  try {
    enforceNodeVersion({ strict: !process.argv.includes("--warn") });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  SUPPORTED_NODE_MAJORS,
  nodeMajor,
  supportedNodeVersion,
  nodeVersionMessage,
  enforceNodeVersion
};
