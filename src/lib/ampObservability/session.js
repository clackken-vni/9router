import { CORRELATION_HEADERS, newId, readHeader } from "@/lib/ampObservability/helpers";

export function resolveCorrelation(headersLike = null, defaults = {}) {
  const session_id = readHeader(headersLike, CORRELATION_HEADERS.sessionId) || defaults.session_id || newId("sess");
  const trace_id = readHeader(headersLike, CORRELATION_HEADERS.traceId) || defaults.trace_id || newId("tr");
  const parent_span_id = readHeader(headersLike, CORRELATION_HEADERS.spanId)
    || readHeader(headersLike, CORRELATION_HEADERS.parentSpanId)
    || defaults.parent_span_id
    || null;
  const span_id = defaults.span_id || newId("sp");

  return {
    session_id,
    trace_id,
    span_id,
    parent_span_id,
  };
}

export function createSpanContext(parentContext = {}, overrides = {}) {
  return {
    session_id: overrides.session_id || parentContext.session_id || newId("sess"),
    trace_id: overrides.trace_id || parentContext.trace_id || newId("tr"),
    parent_span_id: overrides.parent_span_id || parentContext.span_id || null,
    span_id: overrides.span_id || newId("sp"),
  };
}

export function childSpan(parentContext = {}, overrides = {}) {
  return createSpanContext(parentContext, {
    ...overrides,
    parent_span_id: parentContext.span_id || overrides.parent_span_id || null,
  });
}
