import { CORRELATION_HEADERS, newId, readHeader } from "@/lib/ampObservability/helpers";

export function resolveCorrelation(headersLike = null, defaults = {}) {
  const session_id = readHeader(headersLike, CORRELATION_HEADERS.sessionId) || defaults.session_id || newId("sess");
  const trace_id = readHeader(headersLike, CORRELATION_HEADERS.traceId) || defaults.trace_id || newId("tr");
  const parent_span_id = readHeader(headersLike, CORRELATION_HEADERS.spanId)
    || readHeader(headersLike, CORRELATION_HEADERS.parentSpanId)
    || defaults.parent_span_id
    || null;
  const span_id = defaults.span_id || newId("sp");
  const request_id = readHeader(headersLike, CORRELATION_HEADERS.requestId) || defaults.request_id || newId("req");
  const route_id = readHeader(headersLike, CORRELATION_HEADERS.routeId) || defaults.route_id || null;
  const tool_call_id = readHeader(headersLike, CORRELATION_HEADERS.toolCallId) || defaults.tool_call_id || null;

  return {
    session_id,
    trace_id,
    span_id,
    parent_span_id,
    request_id,
    route_id,
    tool_call_id,
  };
}

export function createSpanContext(parentContext = {}, overrides = {}) {
  return {
    session_id: overrides.session_id || parentContext.session_id || newId("sess"),
    trace_id: overrides.trace_id || parentContext.trace_id || newId("tr"),
    parent_span_id: overrides.parent_span_id || parentContext.span_id || null,
    span_id: overrides.span_id || newId("sp"),
    request_id: overrides.request_id || parentContext.request_id || newId("req"),
    route_id: overrides.route_id || parentContext.route_id || null,
    tool_call_id: overrides.tool_call_id || parentContext.tool_call_id || null,
  };
}

export function childSpan(parentContext = {}, overrides = {}) {
  return createSpanContext(parentContext, {
    ...overrides,
    parent_span_id: parentContext.span_id || overrides.parent_span_id || null,
  });
}
