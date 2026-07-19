const identifier = /^[A-Za-z_$][\w$]*$/;

function escapedRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionStart(source, name, mode) {
  if (!identifier.test(name)) throw new TypeError(`Invalid function name: ${name}`);
  const indent = typeof mode === "string" ? escapedRegExp(mode) : "[\\t ]*";
  const asyncToken = mode === true ? "async\\s+" : "(?:async\\s+)?";
  const pattern = new RegExp(`^${indent}(?:export\\s+)?${asyncToken}function\\s+${escapedRegExp(name)}\\s*\\(`, "m");
  const match = pattern.exec(source);
  if (!match) throw new Error(`${name} must exist`);
  const functionOffset = match[0].lastIndexOf("function");
  if (functionOffset < 0) throw new Error(`${name} function keyword is missing`);
  const asyncOffset = match[0].lastIndexOf("async", functionOffset);
  return match.index + (asyncOffset >= 0 ? asyncOffset : functionOffset);
}

function scanFunctionBodyStart(source, start, name) {
  const parametersStart = source.indexOf("(", start);
  if (parametersStart < 0) throw new Error(`${name} parameters are missing`);
  let parentheses = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = parametersStart; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") {
      parentheses -= 1;
      if (parentheses === 0) {
        const bodyStart = source.indexOf("{", index + 1);
        if (bodyStart < 0) throw new Error(`${name} body is missing`);
        return bodyStart;
      }
    }
  }
  throw new Error(`${name} parameters did not close`);
}

function functionEnd(source, bodyStart, name) {
  let braces = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") braces += 1;
    else if (character === "}" && --braces === 0) return index + 1;
  }
  throw new Error(`${name} body did not close`);
}

function functionSource(source, name, mode = null) {
  const input = String(source || "");
  const start = functionStart(input, String(name || ""), mode);
  const bodyStart = scanFunctionBodyStart(input, start, name);
  return input.slice(start, functionEnd(input, bodyStart, name));
}

module.exports = { functionSource };
