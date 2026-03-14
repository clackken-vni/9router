import {
  buildTiming,
  createSpanContext,
  emitEvent,
  emitLifecycleEnd,
  emitLifecycleError,
  emitLifecycleStart,
  pickCorrelationFields,
  resolveCorrelation,
  summarizeHeaders,
} from "@/lib/ampObservability";

function summarizeJsonBody(body) {
  if (body == null) return undefined;
  if (Array.isArray(body)) {
    return {
      type: "array",
      length: body.length,
      preview: body.slice(0, 3),
    };
  }
  if (typeof body === "object") {
    const keys = Object.keys(body);
    return {
      type: "object",
      keys: keys.slice(0, 20),
      key_count: keys.length,
      preview: keys.slice(0, 10).reduce((acc, key) => {
        acc[key] = body[key];
        return acc;
      }, {}),
    };
  }
  if (typeof body === "string") {
    return {
      type: "string",
      length: body.length,
      preview: body.slice(0, 2000),
    };
  }
  return {
    type: typeof body,
    value: body,
  };
}

async function parseBodySafe(request) {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return null;
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

export async function startRequestLifecycle(request, routeId, payload = {}) {
  const startTime = Date.now();
  const rootContext = resolveCorrelation(request.headers, {
    route_id: routeId,
  });
  const requestContext = createSpanContext(rootContext, {
    route_id: routeId,
  });
  const body = payload.body !== undefined ? payload.body : await parseBodySafe(request);

  await emitLifecycleStart(requestContext, {
    event: "request.received",
    component: routeId,
    source: "route",
    route: {
      id: routeId,
      method: request.method,
      path: new URL(request.url).pathname,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: summarizeHeaders(request.headers),
      body: summarizeJsonBody(body),
    },
    meta: payload.meta || undefined,
  });

  return {
    startTime,
    body,
    requestContext,
    rootContext,
  };
}

export async function emitRequestStreamChunk(context, chunkBytes, chunkCount) {
  return emitEvent({
    ...pickCorrelationFields(context),
    event: "stream.chunk",
    status: "ok",
    component: context.route_id || "unknown.route",
    source: "route",
    route: { id: context.route_id },
    io: {
      output: {
        chunk_count: chunkCount,
        chunk_bytes: chunkBytes,
      },
    },
  });
}

export async function endRequestLifecycle(context, response, payload = {}) {
  await emitLifecycleEnd(context, {
    event: "request.responded",
    component: context.route_id || "unknown.route",
    source: "route",
    route: {
      id: context.route_id,
      method: payload.method,
      path: payload.path,
    },
    response: {
      status_code: response?.status,
      headers: summarizeHeaders(response?.headers),
    },
    io: payload.io,
    meta: payload.meta,
    timing: buildTiming(payload.startTime),
  });
}

export async function failRequestLifecycle(context, error, payload = {}) {
  await emitLifecycleError(context, error, {
    event: "request.failed",
    component: context.route_id || "unknown.route",
    source: "route",
    route: {
      id: context.route_id,
      method: payload.method,
      path: payload.path,
    },
    meta: payload.meta,
    timing: buildTiming(payload.startTime),
  });
}
