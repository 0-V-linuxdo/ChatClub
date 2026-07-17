import globals from "globals";

const domExtensionGlobals = Object.freeze({
  ...globals.browser,
  ...globals.webextensions
});
const backgroundExtensionGlobals = Object.freeze({
  ...globals.serviceworker,
  ...globals.webextensions
});
const sharedRuntimeGlobals = Object.freeze(Object.fromEntries(
  [
    ...Object.entries(globals.browser)
      .filter(([name]) => Object.hasOwn(globals.serviceworker, name)),
    ...Object.entries(globals.webextensions)
  ]
));
const allKnownRealmGlobalNames = new Set([
  ...Object.keys(globals.browser),
  ...Object.keys(globals.serviceworker),
  ...Object.keys(globals.webextensions),
  ...Object.keys(globals.node)
]);

function forbiddenRealmGlobals(allowedGlobals) {
  return Object.freeze(
    [...allKnownRealmGlobalNames].filter((name) => !Object.hasOwn(allowedGlobals, name)).sort()
  );
}

function staticString(node) {
  if (!node) return "";
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.map((part) => part.value.cooked ?? part.value.raw).join("");
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = staticString(node.left);
    const right = staticString(node.right);
    return left && right ? left + right : "";
  }
  return "";
}

function memberPropertyName(node) {
  if (!node?.computed && node?.property?.type === "Identifier") return node.property.name;
  return staticString(node?.property);
}

const REALM_GLOBAL_ROOTS = new Set(["globalThis", "self", "window"]);
const INDIRECT_GLOBAL_PROPERTY_METHODS = new Set([
  "defineProperty",
  "deleteProperty",
  "get",
  "getOwnPropertyDescriptor",
  "has",
  "hasOwn",
  "set"
]);
const realmGuardPlugin = Object.freeze({
  rules: Object.freeze({
    "no-cross-realm-global": Object.freeze({
      meta: Object.freeze({
        type: "problem",
        schema: [Object.freeze({
          type: "object",
          properties: Object.freeze({
            forbidden: Object.freeze({ type: "array", items: Object.freeze({ type: "string" }), uniqueItems: true }),
            realm: Object.freeze({ type: "string" }),
            forbidAliases: Object.freeze({ type: "boolean" })
          }),
          additionalProperties: false
        })],
        messages: Object.freeze({
          forbidden: "{{name}} is not available in the {{realm}} runtime realm.",
          alias: "Aliasing the realm global object can bypass {{realm}} runtime checks."
        })
      }),
      create(context) {
        const forbidden = new Set(context.options[0]?.forbidden || []);
        const realm = String(context.options[0]?.realm || "selected");
        const forbidAliases = context.options[0]?.forbidAliases === true;
        const isGlobalRoot = (node) => {
          if (node?.type === "ChainExpression") return isGlobalRoot(node.expression);
          if (node?.type === "Identifier") return REALM_GLOBAL_ROOTS.has(node.name);
          return Boolean(
            node?.type === "CallExpression"
            && node.callee?.type === "Identifier"
            && node.callee.name === "Object"
            && node.arguments.length === 1
            && isGlobalRoot(node.arguments[0])
          );
        };
        const reportPattern = (pattern) => {
          if (!pattern || pattern.type !== "ObjectPattern") return;
          for (const property of pattern.properties) {
            if (property.type === "RestElement") {
              if (forbidAliases) context.report({ node: property, messageId: "alias", data: { realm } });
              continue;
            }
            const name = property.computed ? staticString(property.key) : property.key?.name || property.key?.value;
            if (forbidden.has(String(name || ""))) {
              context.report({ node: property, messageId: "forbidden", data: { name, realm } });
            }
          }
        };
        return {
          MemberExpression(node) {
            if (!isGlobalRoot(node.object)) return;
            const name = memberPropertyName(node);
            if (forbidden.has(name)) {
              context.report({ node, messageId: "forbidden", data: { name, realm } });
            }
          },
          CallExpression(node) {
            if (node.callee?.type !== "MemberExpression") return;
            const owner = node.callee.object;
            if (owner?.type !== "Identifier" || !new Set(["Object", "Reflect"]).has(owner.name)) return;
            const method = memberPropertyName(node.callee);
            if (!INDIRECT_GLOBAL_PROPERTY_METHODS.has(method) || !isGlobalRoot(node.arguments[0])) return;
            const name = staticString(node.arguments[1]);
            if (forbidden.has(name)) {
              context.report({ node, messageId: "forbidden", data: { name, realm } });
            }
          },
          VariableDeclarator(node) {
            if (!isGlobalRoot(node.init)) return;
            if (node.id.type === "Identifier" && forbidAliases) {
              context.report({ node, messageId: "alias", data: { realm } });
            } else {
              reportPattern(node.id);
            }
          },
          AssignmentExpression(node) {
            if (!isGlobalRoot(node.right)) return;
            if (node.left.type === "Identifier" && forbidAliases) {
              context.report({ node, messageId: "alias", data: { realm } });
            } else {
              reportPattern(node.left);
            }
          },
          AssignmentPattern(node) {
            if (forbidAliases && isGlobalRoot(node.right) && node.left.type === "Identifier") {
              context.report({ node, messageId: "alias", data: { realm } });
            }
          }
        };
      }
    })
  })
});

const runtimeRules = Object.freeze({
  "getter-return": "error",
  "no-async-promise-executor": "error",
  "no-class-assign": "error",
  "no-const-assign": "error",
  "no-dupe-args": "error",
  "no-dupe-class-members": "error",
  "no-dupe-else-if": "error",
  "no-dupe-keys": "error",
  "no-eval": "error",
  "no-func-assign": "error",
  "no-global-assign": "error",
  "no-import-assign": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-obj-calls": "error",
  "no-promise-executor-return": "error",
  "no-redeclare": "error",
  "no-self-assign": "error",
  "no-setter-return": "error",
  "no-shadow-restricted-names": "error",
  "no-unreachable": "error",
  "no-unreachable-loop": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-undef": "error",
  "no-with": "error",
  "require-yield": "error",
  "use-isnan": "error",
  "valid-typeof": "error"
});

function runtimeRealm(files, realmGlobals, realm, forbiddenGlobals = [], forbidAliases = false) {
  return {
    files,
    plugins: { "chatclub-realm": realmGuardPlugin },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: realmGlobals
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error"
    },
    rules: {
      ...runtimeRules,
      "chatclub-realm/no-cross-realm-global": ["error", { forbidden: forbiddenGlobals, realm, forbidAliases }]
    }
  };
}

export default [
  {
    ignores: [
      "content/**",
      "topic-delete-userscripts/**",
      "userscripts/**",
      "background/firefox-content-fallbacks.generated.js",
      "dist/**",
      "output/**",
      "node_modules/**"
    ]
  },
  runtimeRealm(
    ["app/**/*.js", "ui/**/*.js"],
    domExtensionGlobals,
    "DOM",
    forbiddenRealmGlobals(domExtensionGlobals),
    true
  ),
  runtimeRealm(
    ["background/**/*.js"],
    backgroundExtensionGlobals,
    "background",
    forbiddenRealmGlobals(backgroundExtensionGlobals),
    true
  ),
  runtimeRealm(
    ["content-src/**/*.js"],
    domExtensionGlobals,
    "content DOM",
    forbiddenRealmGlobals(domExtensionGlobals),
    true
  ),
  runtimeRealm(
    ["shared/**/*.js"],
    sharedRuntimeGlobals,
    "shared DOM/background intersection",
    forbiddenRealmGlobals(sharedRuntimeGlobals),
    true
  ),
  runtimeRealm(
    ["build-src/**/*.js"],
    globals.node,
    "build",
    forbiddenRealmGlobals(globals.node),
    true
  )
];
