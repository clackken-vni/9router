import { handleChat } from "@/sse/handlers/chat.js";
import {
  buildTiming,
  createSpanContext,
  emitLifecycleEnd,
  emitLifecycleError,
  emitLifecycleStart,
  getCorrelationHeaders,
  resolveCorrelation,
} from "@/lib/ampObservability";
import { initTranslators } from "open-sse/translator/index.js";

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
    console.log("[SSE] Translators initialized for /v1/responses");
  }
}

function extractModelMeta(body = {}) {
  const model = body?.model;
  if (!model || typeof model !== "string") return { raw: model || "unknown" };
  const [provider, ...rest] = model.split("/");
  return {
    raw: model,
    provider: rest.length ? provider : undefined,
    name: rest.length ? rest.join("/") : model,
  };
}

function wrapStreamResponse(response, streamContext, startMs) {
  if (!response?.body) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) return response;

  const transformer = new TransformStream({
    start() {
      streamContext.streamed_bytes = 0;
    },
    transform(chunk, controller) {
      streamContext.streamed_bytes += chunk?.byteLength || 0;
      controller.enqueue(chunk);
    },
    async flush() {
      await emitLifecycleEnd(streamContext, {
        event: "model.response.end",
        component: "api.v1.responses",
        source: "route",
        timing: buildTiming(startMs, { stream: true, streamed_bytes: streamContext.streamed_bytes }),
      });
      await emitLifecycleEnd(createSpanContext(streamContext), {
        event: "session.end",
        component: "api.v1.responses",
        source: "route",
        timing: buildTiming(startMs, { stream: true, streamed_bytes: streamContext.streamed_bytes }),
      });
    },
  });

  return new Response(response.body.pipeThrough(transformer), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function POST(request) {
  const startMs = Date.now();
  let body = {};
  try {
    body = await request.clone().json();
  } catch {}

  const rootContext = resolveCorrelation(request.headers);
  const sessionContext = createSpanContext(rootContext);
  const modelContext = createSpanContext(rootContext);

  await emitLifecycleStart(sessionContext, {
    event: "session.start",
    component: "api.v1.responses",
    source: "route",
    meta: { endpoint: "/v1/responses" },
  });

  await emitLifecycleStart(modelContext, {
    event: "model.request.start",
    component: "api.v1.responses",
    source: "route",
    model: extractModelMeta(body),
    meta: {
      stream: !!body?.stream,
      input_count: body?.input?.length || body?.messages?.length || 0,
      tool_count: body?.tools?.length || 0,
      tool_call_requested: !!body?.tools?.length,
    },
  });

  if (body?.stream) {
    await emitLifecycleStart(createSpanContext(modelContext), {
      event: "model.request.stream.start",
      component: "api.v1.responses",
      source: "route",
      model: extractModelMeta(body),
      meta: { mode: "sse" },
    });
  }

  const downstreamHeaders = new Headers(request.headers);
  for (const [key, value] of Object.entries(getCorrelationHeaders(modelContext))) {
    if (value) downstreamHeaders.set(key, String(value));
  }

  const downstreamRequest = new Request(request, { headers: downstreamHeaders });

  try {
    await ensureInitialized();
    const response = await handleChat(downstreamRequest);

    if (body?.stream) return wrapStreamResponse(response, modelContext, startMs);

    await emitLifecycleEnd(modelContext, {
      event: "model.response.end",
      component: "api.v1.responses",
      source: "route",
      model: extractModelMeta(body),
      meta: { status_code: response.status },
      timing: buildTiming(startMs, { stream: false }),
    });
    await emitLifecycleEnd(createSpanContext(sessionContext), {
      event: "session.end",
      component: "api.v1.responses",
      source: "route",
      meta: { status_code: response.status },
      timing: buildTiming(startMs, { stream: false }),
    });

    return response;
  } catch (error) {
    await emitLifecycleError(modelContext, error, {
      event: "model.response.error",
      component: "api.v1.responses",
      source: "route",
      model: extractModelMeta(body),
      timing: buildTiming(startMs),
    });
    await emitLifecycleError(createSpanContext(sessionContext), error, {
      event: "session.end",
      component: "api.v1.responses",
      source: "route",
      timing: buildTiming(startMs),
    });
    throw error;
  }
}
