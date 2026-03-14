import fs from "fs";
import path from "path";
import { getDatePathPart, getStartedAtStamp, getNowIso, newId } from "@/lib/ampObservability/helpers";
import { normalizeEvent } from "@/lib/ampObservability/schema";
import { redactPayload } from "@/lib/ampObservability/redact";

const ROOT_DIR = path.join(process.cwd(), "logs", "amp-sessions");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveLogPath(sessionId, startedAt = new Date()) {
  const day = getDatePathPart(startedAt);
  const dayDir = path.join(ROOT_DIR, day);
  ensureDir(dayDir);
  return path.join(dayDir, `${getStartedAtStamp(startedAt)}__${sessionId}.jsonl`);
}

const sessionMap = new Map();

function getOrCreateSessionWriter(sessionId) {
  if (sessionMap.has(sessionId)) return sessionMap.get(sessionId);
  const startedAt = new Date();
  const filePath = resolveLogPath(sessionId, startedAt);
  const state = {
    sessionId,
    startedAt: startedAt.toISOString(),
    filePath,
    queue: Promise.resolve(),
  };
  sessionMap.set(sessionId, state);
  return state;
}

async function appendLine(state, line) {
  state.queue = state.queue.then(() => fs.promises.appendFile(state.filePath, `${line}\n`, "utf8"));
  await state.queue;
}

export function getSessionLogPath(sessionId) {
  const existing = sessionMap.get(sessionId);
  if (existing) return existing.filePath;
  return resolveLogPath(sessionId, new Date());
}

export async function writeEvent(event, options = {}) {
  const sessionId = event?.session_id || newId("sess");
  const state = getOrCreateSessionWriter(sessionId);
  const normalized = normalizeEvent({
    ...event,
    timestamp: event?.timestamp || getNowIso(),
  });

  const redacted = redactPayload(normalized, options.redactOptions || {});
  await appendLine(state, JSON.stringify(redacted));
  return { filePath: state.filePath, event: redacted };
}

export async function flushAll() {
  const states = Array.from(sessionMap.values());
  await Promise.all(states.map(async (state) => state.queue));
}

let flushHookReady = false;
export function ensureFlushHooks() {
  if (flushHookReady) return;
  flushHookReady = true;
  const handler = () => {
    flushAll().catch(() => {});
  };
  process.on("beforeExit", handler);
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
