import { CORRELATION_HEADERS, getNowIso, sanitizeStatus } from "@/lib/ampObservability/helpers";

export function normalizeEvent(input = {}) {
  const {
    timestamp = getNowIso(),
    session_id,
    trace_id,
    span_id,
    parent_span_id,
    event,
    status = "ok",
    component = "unknown",
    source = "unknown",
    model,
    tool,
    io,
    timing,
    error,
    meta,
  } = input;

  return {
    timestamp,
    session_id,
    trace_id,
    span_id,
    parent_span_id,
    event,
    status: sanitizeStatus(status),
    component,
    source,
    model: model || undefined,
    tool: tool || undefined,
    io: io || undefined,
    timing: timing || undefined,
    error: error || undefined,
    meta: meta || undefined,
  };
}

export function getCorrelationHeaders(context = {}) {
  return {
    [CORRELATION_HEADERS.sessionId]: context.session_id,
    [CORRELATION_HEADERS.traceId]: context.trace_id,
    [CORRELATION_HEADERS.spanId]: context.span_id,
    [CORRELATION_HEADERS.parentSpanId]: context.parent_span_id,
  };
}
