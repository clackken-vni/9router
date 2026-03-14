import { resolveCorrelation, createSpanContext, childSpan } from "@/lib/ampObservability/session";
import { ensureSettingsLoaded } from "@/lib/settingsCache";
import { getCorrelationHeaders } from "@/lib/ampObservability/schema";
import {
  normalizeError,
  resolveDurationMs,
  pickCorrelationFields,
  summarizeHeaders,
} from "@/lib/ampObservability/helpers";
import { writeEvent, flushAll, ensureFlushHooks, getSessionLogPath, runMaintenance } from "@/lib/ampObservability/writer";
export {
  startRequestLifecycle,
  endRequestLifecycle,
  failRequestLifecycle,
  emitRequestStreamChunk,
} from "@/lib/ampObservability/http";

export {
  resolveCorrelation,
  createSpanContext,
  childSpan,
  getCorrelationHeaders,
  getSessionLogPath,
  pickCorrelationFields,
  summarizeHeaders,
};

ensureSettingsLoaded().catch(() => {});
ensureFlushHooks();

export async function emitEvent(payload, options = {}) {
  return writeEvent(payload, options);
}

export async function emitLifecycleStart(context, payload = {}) {
  return emitEvent({
    ...context,
    ...payload,
    status: payload.status || "start",
  });
}

export async function emitLifecycleEnd(context, payload = {}) {
  return emitEvent({
    ...context,
    ...payload,
    status: payload.status || "ok",
  });
}

export async function emitLifecycleError(context, error, payload = {}) {
  return emitEvent({
    ...context,
    ...payload,
    status: payload.status || "error",
    error: payload.error || normalizeError(error),
  });
}

export function buildTiming(startTimeMs, extra = {}) {
  return {
    duration_ms: resolveDurationMs(startTimeMs),
    ...extra,
  };
}

export async function flushObservability() {
  return flushAll();
}

export async function runObservabilityMaintenance() {
  return runMaintenance();
}
