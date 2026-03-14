import crypto from "crypto";

export const CORRELATION_HEADERS = {
  sessionId: "x-9router-session-id",
  traceId: "x-9router-trace-id",
  spanId: "x-9router-span-id",
  parentSpanId: "x-9router-parent-span-id",
  requestId: "x-9router-request-id",
  routeId: "x-9router-route-id",
  toolCallId: "x-9router-tool-call-id",
};

export function newId(prefix = "") {
  const value = crypto.randomUUID().replaceAll("-", "");
  return prefix ? `${prefix}_${value}` : value;
}

export function getNowIso() {
  return new Date().toISOString();
}

export function getDatePathPart(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getHourBucketInfo(date = new Date()) {
  const d = new Date(date);
  const hour = d.getUTCHours();
  const start = String(hour).padStart(2, "0");
  return {
    day: getDatePathPart(d),
    hour,
    fileName: `${start}.jsonl`,
  };
}

export function getStartedAtStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function resolveDurationMs(startTimeMs) {
  if (!startTimeMs || Number.isNaN(startTimeMs)) return undefined;
  return Math.max(0, Date.now() - Number(startTimeMs));
}

export function normalizeError(error) {
  if (!error) return undefined;
  if (typeof error === "string") return { message: error };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

export function sanitizeStatus(status) {
  if (!status) return "ok";
  return String(status);
}

export function readHeader(headersLike, key) {
  if (!headersLike) return null;
  if (typeof headersLike.get === "function") return headersLike.get(key);
  return headersLike[key] || headersLike[key.toLowerCase()] || null;
}

export function pickCorrelationFields(context = {}) {
  return {
    session_id: context.session_id,
    trace_id: context.trace_id,
    span_id: context.span_id,
    parent_span_id: context.parent_span_id,
    request_id: context.request_id,
    route_id: context.route_id,
    tool_call_id: context.tool_call_id,
  };
}

export function summarizeHeaders(headersLike) {
  if (!headersLike) return {};
  const out = {};
  const pushEntry = (name, value) => {
    const key = String(name || "").toLowerCase();
    if (!key) return;
    out[key] = value;
  };

  if (typeof headersLike.entries === "function") {
    for (const [name, value] of headersLike.entries()) {
      pushEntry(name, value);
    }
    return out;
  }

  for (const [name, value] of Object.entries(headersLike || {})) {
    pushEntry(name, value);
  }
  return out;
}

