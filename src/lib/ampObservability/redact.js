import crypto from "crypto";

const DEFAULT_SENSITIVE_KEY_RE = /(authorization|api[-_]?key|token|cookie|password|secret|set-cookie|client_secret|refresh_token|access_key|private_key|credential|bearer|proxy[-_]?authorization)/i;

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function truncateString(value, maxStringLength) {
  if (value.length <= maxStringLength) return value;
  return {
    __truncated: true,
    preview: value.slice(0, maxStringLength),
    size: value.length,
    sha256: hashValue(value),
  };
}

function clipObjectEntries(entries, maxObjectEntries) {
  if (entries.length <= maxObjectEntries) return entries;
  const kept = entries.slice(0, maxObjectEntries);
  kept.push(["__truncated_keys", entries.length - maxObjectEntries]);
  return kept;
}

function clipArrayItems(items, maxArrayItems) {
  if (items.length <= maxArrayItems) return items;
  const kept = items.slice(0, maxArrayItems);
  kept.push({ __truncated_items: items.length - maxArrayItems });
  return kept;
}

export function createRedactor(options = {}) {
  const {
    maxStringLength = 2000,
    maxDepth = 8,
    maxArrayItems = 40,
    maxObjectEntries = 80,
    sensitiveKeyRe = DEFAULT_SENSITIVE_KEY_RE,
    redactedValue = "[REDACTED]",
  } = options;

  function redact(value, depth = 0, keyPath = "") {
    if (value == null) return value;
    if (typeof value === "string") return truncateString(value, maxStringLength);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return String(value);
    if (value instanceof Date) return value.toISOString();

    if (depth >= maxDepth) {
      return {
        __truncated_depth: true,
        type: Array.isArray(value) ? "array" : "object",
      };
    }

    if (Array.isArray(value)) {
      return clipArrayItems(value, maxArrayItems).map((item, index) => redact(item, depth + 1, `${keyPath}[${index}]`));
    }

    if (typeof value === "object") {
      const entries = Object.entries(value);
      const output = {};
      for (const [key, val] of clipObjectEntries(entries, maxObjectEntries)) {
        if (key === "__truncated_keys") {
          output[key] = val;
          continue;
        }
        const nextPath = keyPath ? `${keyPath}.${key}` : key;
        if (sensitiveKeyRe.test(key) || sensitiveKeyRe.test(nextPath)) {
          output[key] = redactedValue;
        } else {
          output[key] = redact(val, depth + 1, nextPath);
        }
      }
      return output;
    }

    return String(value);
  }

  return { redact };
}

const defaultRedactor = createRedactor();

export function redactPayload(value, options = {}) {
  if (!options || Object.keys(options).length === 0) {
    return defaultRedactor.redact(value);
  }
  return createRedactor(options).redact(value);
}
