import { handleChat } from "@/sse/handlers/chat.js";
import {
  buildTiming,
  createSpanContext,
  emitLifecycleEnd,
  emitLifecycleError,
  emitLifecycleStart,
  emitRequestStreamChunk,
  endRequestLifecycle,
  failRequestLifecycle,
  getCorrelationHeaders,
  startRequestLifecycle,
} from "@/lib/ampObservability";
import { initTranslators } from "open-sse/translator/index.js";

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
    console.log("[SSE] Translators initialized");
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

function wrapStreamResponse(response, streamContext, requestContext, startMs) {
  if (!response?.body) return response;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) return response;

  let chunkCount = 0;
  const transformer = new TransformStream({
    start() {
      streamContext.streamed_bytes = 0;
    },
    async transform(chunk, controller) {
      const size = chunk?.byteLength || 0;
      streamContext.streamed_bytes += size;
      chunkCount += 1;
      await emitRequestStreamChunk(streamContext, size, chunkCount);
      controller.enqueue(chunk);
    },
    async flush() {
      await emitLifecycleEnd(streamContext, {
        event: "model.response.end",
        component: "api.v1.chat.completions",
        source: "route",
        timing: buildTiming(startMs, { stream: true, streamed_bytes: streamContext.streamed_bytes, chunk_count: chunkCount }),
      });
      await emitLifecycleEnd(createSpanContext(streamContext), {
        event: "session.end",
        component: "api.v1.chat.completions",
        source: "route",
        timing: buildTiming(startMs, { stream: true, streamed_bytes: streamContext.streamed_bytes, chunk_count: chunkCount }),
      });
      await endRequestLifecycle(requestContext, response, {
        method: "POST",
        path: "/v1/chat/completions",
        startTime: startMs,
        io: { output: { stream: true, streamed_bytes: streamContext.streamed_bytes, chunk_count: chunkCount } },
      });
    },
  });

  const piped = response.body.pipeThrough(transformer);
  return new Response(piped, {
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
  const requestFlow = await startRequestLifecycle(request, "api.v1.chat.completions");
  const startMs = requestFlow.startTime;
  const body = requestFlow.body || {};

  const requestContext = requestFlow.requestContext;
  const sessionContext = createSpanContext(requestContext);
  const modelContext = createSpanContext(requestContext, { tool_call_id: "tool_handle_chat_completions" });

  await emitLifecycleStart(sessionContext, {
    event: "session.start",
    component: "api.v1.chat.completions",
    source: "route",
    meta: { endpoint: "/v1/chat/completions" },
  });

  await emitLifecycleStart(modelContext, {
    event: "model.request.start",
    component: "api.v1.chat.completions",
    source: "route",
    model: extractModelMeta(body),
    meta: {
      stream: !!body?.stream,
      message_count: body?.messages?.length || body?.input?.length || 0,
      tool_count: body?.tools?.length || 0,
      tool_call_requested: !!body?.tools?.length,
    },
  });

  if (body?.stream) {
    await emitLifecycleStart(createSpanContext(modelContext), {
      event: "model.request.stream.start",
      component: "api.v1.chat.completions",
      source: "route",
      model: extractModelMeta(body),
      meta: { mode: "sse" },
    });
  }

  const downstreamHeaders = new Headers(request.headers);
  const correlationHeaders = getCorrelationHeaders(modelContext);
  for (const [key, value] of Object.entries(correlationHeaders)) {
    if (value) downstreamHeaders.set(key, String(value));
  }

  const downstreamRequest = new Request(request, { headers: downstreamHeaders });

  try {
    await ensureInitialized();
    const response = await handleChat(downstreamRequest);

    if (body?.stream) {
      return wrapStreamResponse(response, modelContext, requestContext, startMs);
    }

    await emitLifecycleEnd(modelContext, {
      event: "model.response.end",
      component: "api.v1.chat.completions",
      source: "route",
      model: extractModelMeta(body),
      meta: { status_code: response.status },
      timing: buildTiming(startMs, { stream: false }),
    });
    await emitLifecycleEnd(createSpanContext(sessionContext), {
      event: "session.end",
      component: "api.v1.chat.completions",
      source: "route",
      meta: { status_code: response.status },
      timing: buildTiming(startMs, { stream: false }),
    });

    await endRequestLifecycle(requestContext, response, {
      method: "POST",
      path: "/v1/chat/completions",
      startTime: startMs,
      io: { output: { stream: false, status_code: response.status } },
    });

    return response;
  } catch (error) {
    await emitLifecycleError(modelContext, error, {
      event: "model.response.error",
      component: "api.v1.chat.completions",
      source: "route",
      model: extractModelMeta(body),
      timing: buildTiming(startMs),
    });
    await emitLifecycleError(createSpanContext(sessionContext), error, {
      event: "session.end",
      component: "api.v1.chat.completions",
      source: "route",
      timing: buildTiming(startMs),
    });
    await failRequestLifecycle(requestContext, error, {
      method: "POST",
      path: "/v1/chat/completions",
      startTime: startMs,
    });
    throw error;
  }
}
