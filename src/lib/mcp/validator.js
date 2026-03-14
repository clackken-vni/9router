import fs from "node:fs/promises";
import path from "node:path";

const ENV_KEY_REGEX = /^[A-Z_][A-Z0-9_]*$/;
const SHELL_META_REGEX = /[;&|`]/;
const DANGEROUS_COMMANDS = new Set([
  "rm",
  "mkfs",
  "dd",
  "shutdown",
  "reboot",
  "poweroff",
  "halt",
  "init",
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value;
}

function validateCommand(command) {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("command is required");
  }

  const trimmed = command.trim();
  if (SHELL_META_REGEX.test(trimmed)) {
    throw new Error("command contains shell metacharacters");
  }

  const commandBase = path.basename(trimmed).toLowerCase();
  if (DANGEROUS_COMMANDS.has(commandBase)) {
    throw new Error("command is blocked by security policy");
  }

  return trimmed;
}

function validateArgs(args) {
  if (!Array.isArray(args)) {
    throw new Error("args must be an array of strings");
  }

  for (let i = 0; i < args.length; i += 1) {
    if (typeof args[i] !== "string") {
      throw new Error(`args[${i}] must be a string`);
    }
  }

  return args;
}

async function validateCwd(cwd) {
  if (cwd === undefined || cwd === null || cwd === "") {
    return undefined;
  }

  if (typeof cwd !== "string") {
    throw new Error("cwd must be a string");
  }

  const trimmed = cwd.trim();
  if (!trimmed) {
    throw new Error("cwd must be a non-empty string");
  }

  try {
    await fs.access(trimmed);
  } catch {
    throw new Error("cwd does not exist");
  }

  return trimmed;
}

function validateEnv(env) {
  if (env === undefined) return undefined;
  if (!isPlainObject(env)) {
    throw new Error("env must be an object");
  }

  const next = {};
  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_REGEX.test(key)) {
      throw new Error(`env key '${key}' is invalid`);
    }
    if (typeof value !== "string") {
      throw new Error(`env['${key}'] must be a string`);
    }
    next[key] = value;
  }

  return next;
}

function validateSecretRefs(secretRefs) {
  if (secretRefs === undefined) return undefined;
  if (!Array.isArray(secretRefs)) {
    throw new Error("secretRefs must be an array of strings");
  }

  const deduped = [];
  const seen = new Set();
  for (let i = 0; i < secretRefs.length; i += 1) {
    const value = secretRefs[i];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`secretRefs[${i}] must be a non-empty string`);
    }
    const key = value.trim();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(key);
    }
  }

  return deduped;
}

function validateRestartPolicy(restartPolicy) {
  if (restartPolicy === undefined) return undefined;
  if (!isPlainObject(restartPolicy)) {
    throw new Error("restartPolicy must be an object");
  }

  const mode = restartPolicy.mode ?? "on-failure";
  if (!["never", "on-failure", "always"].includes(mode)) {
    throw new Error("restartPolicy.mode must be one of never,on-failure,always");
  }

  return {
    mode,
    maxRetries: restartPolicy.maxRetries === undefined ? 5 : assertNonNegativeInteger(restartPolicy.maxRetries, "restartPolicy.maxRetries"),
    backoffMs: restartPolicy.backoffMs === undefined ? 1000 : assertNonNegativeInteger(restartPolicy.backoffMs, "restartPolicy.backoffMs"),
    maxBackoffMs: restartPolicy.maxBackoffMs === undefined ? 30000 : assertNonNegativeInteger(restartPolicy.maxBackoffMs, "restartPolicy.maxBackoffMs"),
  };
}

function validateHealth(health) {
  if (health === undefined) return undefined;
  if (!isPlainObject(health)) {
    throw new Error("health must be an object");
  }

  const next = {};

  if (health.startupTimeoutMs !== undefined) {
    next.startupTimeoutMs = assertNonNegativeInteger(health.startupTimeoutMs, "health.startupTimeoutMs");
  }

  if (health.readyPattern !== undefined) {
    if (typeof health.readyPattern !== "string") {
      throw new Error("health.readyPattern must be a string");
    }
    next.readyPattern = health.readyPattern;
  }

  return next;
}

export async function validateMcpServerProfile(input) {
  if (!isPlainObject(input)) {
    throw new Error("payload must be an object");
  }

  if (input.transport !== "stdio") {
    throw new Error("transport must be 'stdio'");
  }

  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new Error("name is required");
  }

  const sanitized = {
    name: input.name.trim(),
    transport: "stdio",
    command: validateCommand(input.command),
    args: validateArgs(input.args ?? []),
    enabled: input.enabled === undefined ? true : !!input.enabled,
    autostart: input.autostart === undefined ? false : !!input.autostart,
    allowCustomCommand: input.allowCustomCommand === true,
    restartPolicy: validateRestartPolicy(input.restartPolicy) ?? {
      mode: "on-failure",
      maxRetries: 5,
      backoffMs: 1000,
      maxBackoffMs: 30000,
    },
    health: validateHealth(input.health) ?? {
      startupTimeoutMs: 15000,
      readyPattern: "",
    },
    env: validateEnv(input.env) ?? {},
    secretRefs: validateSecretRefs(input.secretRefs) ?? [],
  };

  const cwd = await validateCwd(input.cwd);
  if (cwd !== undefined) {
    sanitized.cwd = cwd;
  }

  return sanitized;
}
