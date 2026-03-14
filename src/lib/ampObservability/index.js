import { resolveCorrelation, createSpanContext, childSpan } from "@/lib/ampObservability/session";
import { getCorrelationHeaders } from "@/lib/ampObservability/schema";
import { normalizeError, resolveDurationMs } from "@/lib/ampObservability/helpers";
import { writeEvent, flushAll, ensureFlushHooks, getSessionLogPath } from "@/lib/ampObservability/writer";

export {
  resolveCorrelation,
  createSpanContext,
  childSpan,
  getCorrelationHeaders,
  getSessionLogPath,
};

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
