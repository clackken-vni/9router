import fs from "fs";
import path from "path";
import zlib from "zlib";
import { promisify } from "util";
import { getSettingsSnapshot } from "@/lib/localDb";
import { getDatePathPart, getHourBucketInfo, getNowIso } from "@/lib/ampObservability/helpers";
import { normalizeEvent } from "@/lib/ampObservability/schema";
import { redactPayload } from "@/lib/ampObservability/redact";

const gzip = promisify(zlib.gzip);

const ROOT_DIR = path.join(process.cwd(), "logs", "amp-sessions");
const DEFAULT_RAW_RETENTION_DAYS = Number(process.env.AMP_OBS_RAW_RETENTION_DAYS || 7);
const DEFAULT_GZ_RETENTION_DAYS = Number(process.env.AMP_OBS_GZ_RETENTION_DAYS || 30);
const DEFAULT_COMPRESS_THRESHOLD_BYTES = Number(process.env.AMP_OBS_COMPRESS_THRESHOLD_BYTES || 5 * 1024 * 1024);
const DEFAULT_MAINTENANCE_INTERVAL_MS = Number(process.env.AMP_OBS_MAINTENANCE_INTERVAL_MS || 6 * 60 * 60 * 1000);
const MAX_RAW_FILES_PER_DAY = 24;

function isAmpSessionLoggingEnabled() {
  if (process.env.ENABLE_REQUEST_LOGS !== "true") return false;
  const settings = getSettingsSnapshot();
  return settings?.ampSessionLogsEnabled !== false;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveDayDir(date = new Date()) {
  const day = getDatePathPart(date);
  const dayDir = path.join(ROOT_DIR, day);
  ensureDir(dayDir);
  return dayDir;
}

function resolveBucketPathByDate(date = new Date()) {
  const dayDir = resolveDayDir(date);
  const bucket = getHourBucketInfo(date);
  return path.join(dayDir, bucket.fileName);
}

const fileMap = new Map();

function getOrCreateFileWriter(filePath) {
  if (fileMap.has(filePath)) return fileMap.get(filePath);
  const state = {
    filePath,
    queue: Promise.resolve(),
  };
  fileMap.set(filePath, state);
  return state;
}

async function appendLine(state, line) {
  state.queue = state.queue.then(() => fs.promises.appendFile(state.filePath, `${line}\n`, "utf8"));
  await state.queue;
}

export function getSessionLogPath() {
  return resolveBucketPathByDate(new Date());
}

async function enforceDailyRawCap(dayDir) {
  let files = [];
  try {
    files = (await fs.promises.readdir(dayDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => entry.name);
  } catch {
    return;
  }

  const allowed = new Set(Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}.jsonl`));
  for (const name of files) {
    if (!allowed.has(name)) {
      await fs.promises.unlink(path.join(dayDir, name)).catch(() => {});
    }
  }

  const rawFiles = files.filter((name) => allowed.has(name)).sort();
  if (rawFiles.length <= MAX_RAW_FILES_PER_DAY) return;
  const toDelete = rawFiles.slice(0, rawFiles.length - MAX_RAW_FILES_PER_DAY);
  for (const fileName of toDelete) {
    await fs.promises.unlink(path.join(dayDir, fileName)).catch(() => {});
  }
}

export async function writeEvent(event, options = {}) {
  if (!isAmpSessionLoggingEnabled()) {
    return { filePath: null, event: null, skipped: true };
  }

  const normalized = normalizeEvent({
    ...event,
    timestamp: event?.timestamp || getNowIso(),
  });

  const eventDate = new Date(normalized.timestamp);
  const filePath = resolveBucketPathByDate(eventDate);
  const state = getOrCreateFileWriter(filePath);
  const redacted = redactPayload(normalized, options.redactOptions || {});

  await appendLine(state, JSON.stringify(redacted));
  await enforceDailyRawCap(resolveDayDir(eventDate));

  return { filePath: state.filePath, event: redacted };
}

export async function flushAll() {
  const states = Array.from(fileMap.values());
  await Promise.all(states.map(async (state) => state.queue));
}

async function walkFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(fullPath));
    else out.push(fullPath);
  }
  return out;
}

async function safeUnlink(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch {}
}

function isActiveFile(filePath) {
  for (const state of fileMap.values()) {
    if (state.filePath === filePath) return true;
  }
  return false;
}

async function compressJsonl(filePath, stat) {
  if (!filePath.endsWith(".jsonl")) return false;
  if (isActiveFile(filePath)) return false;
  if (stat.size < DEFAULT_COMPRESS_THRESHOLD_BYTES) return false;

  const gzPath = `${filePath}.gz`;
  try {
    await fs.promises.access(gzPath);
    return false;
  } catch {}

  try {
    const raw = await fs.promises.readFile(filePath);
    const compressed = await gzip(raw, { level: zlib.constants.Z_BEST_SPEED });
    await fs.promises.writeFile(gzPath, compressed);
    await safeUnlink(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupByRetention(filePath, stat, nowMs) {
  const ageMs = nowMs - stat.mtimeMs;
  const rawRetentionMs = DEFAULT_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const gzRetentionMs = DEFAULT_GZ_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  if (filePath.endsWith(".jsonl") && ageMs > rawRetentionMs && !isActiveFile(filePath)) {
    await safeUnlink(filePath);
    return true;
  }
  if (filePath.endsWith(".jsonl.gz") && ageMs > gzRetentionMs) {
    await safeUnlink(filePath);
    return true;
  }
  return false;
}

let maintenanceRunning = false;
export async function runMaintenance() {
  if (maintenanceRunning) return;
  maintenanceRunning = true;
  try {
    ensureDir(ROOT_DIR);
    const nowMs = Date.now();
    const files = await walkFiles(ROOT_DIR);
    for (const filePath of files) {
      let stat;
      try {
        stat = await fs.promises.stat(filePath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) continue;
      await compressJsonl(filePath, stat);
      await cleanupByRetention(filePath, stat, nowMs);
    }
  } finally {
    maintenanceRunning = false;
  }
}

export function runMaintenanceBestEffort() {
  runMaintenance().catch(() => {});
}

let flushHookReady = false;
let maintenanceInterval = null;
export function ensureFlushHooks() {
  if (flushHookReady) return;
  flushHookReady = true;
  const handler = () => {
    flushAll().catch(() => {});
    runMaintenanceBestEffort();
  };
  process.on("beforeExit", handler);
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);

  runMaintenanceBestEffort();
  if (DEFAULT_MAINTENANCE_INTERVAL_MS > 0) {
    maintenanceInterval = setInterval(runMaintenanceBestEffort, DEFAULT_MAINTENANCE_INTERVAL_MS);
    if (typeof maintenanceInterval.unref === "function") maintenanceInterval.unref();
  }
}
