import { CORRELATION_HEADERS, getNowIso, newId, sanitizeStatus } from "@/lib/ampObservability/helpers";

export function normalizeEvent(input = {}) {
  const {
    timestamp = getNowIso(),
    event_id = newId("evt"),
    event_version = "v1",
    session_id,
    trace_id,
    span_id,
    parent_span_id,
    request_id,
    route_id,
    tool_call_id,
    event,
    status = "ok",
    component = "unknown",
    source = "unknown",
    model,
    tool,
    route,
    request,
    response,
    io,
    timing,
    error,
    actor,
    tags,
    meta,
  } = input;

  return {
    timestamp,
    event_id,
    event_version,
    session_id,
    trace_id,
    span_id,
    parent_span_id,
    request_id: request_id || undefined,
    route_id: route_id || undefined,
    tool_call_id: tool_call_id || undefined,
    event,
    status: sanitizeStatus(status),
    component,
    source,
    model: model || undefined,
    tool: tool || undefined,
    route: route || undefined,
    request: request || undefined,
    response: response || undefined,
    io: io || undefined,
    timing: timing || undefined,
    error: error || undefined,
    actor: actor || undefined,
    tags: tags || undefined,
    meta: meta || undefined,
  };
}

export function getCorrelationHeaders(context = {}) {
  return {
    [CORRELATION_HEADERS.sessionId]: context.session_id,
    [CORRELATION_HEADERS.traceId]: context.trace_id,
    [CORRELATION_HEADERS.spanId]: context.span_id,
    [CORRELATION_HEADERS.parentSpanId]: context.parent_span_id,
    [CORRELATION_HEADERS.requestId]: context.request_id,
    [CORRELATION_HEADERS.routeId]: context.route_id,
    [CORRELATION_HEADERS.toolCallId]: context.tool_call_id,
  };
}
