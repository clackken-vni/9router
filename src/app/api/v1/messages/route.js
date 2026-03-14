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

const ROUTE_ID = "api.v1.messages";
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
    console.log("[SSE] Translators initialized for /v1/messages");
  }
}

function wrapStreamResponse(response, streamContext, requestContext, requestStartMs) {
  if (!response?.body) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) return response;

  let chunkCount = 0;
  let streamedBytes = 0;

  const transformer = new TransformStream({
    async transform(chunk, controller) {
      const bytes = chunk?.byteLength || 0;
      chunkCount += 1;
      streamedBytes += bytes;
      await emitRequestStreamChunk(streamContext, bytes, chunkCount);
      controller.enqueue(chunk);
    },
    async flush() {
      await emitLifecycleEnd(streamContext, {
        event: "model.response.end",
        component: ROUTE_ID,
        source: "route",
        timing: buildTiming(requestStartMs, { stream: true, streamed_bytes: streamedBytes, chunk_count: chunkCount }),
      });
      await endRequestLifecycle(requestContext, response, {
        method: "POST",
        path: "/v1/messages",
        startTime: requestStartMs,
        io: { output: { stream: true, streamed_bytes: streamedBytes, chunk_count: chunkCount } },
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
  const requestFlow = await startRequestLifecycle(request, ROUTE_ID);
  const startMs = requestFlow.startTime;
  const body = requestFlow.body || {};
  const requestContext = requestFlow.requestContext;
  const modelContext = createSpanContext(requestContext, { tool_call_id: "tool_handle_chat_messages" });

  try {
    await ensureInitialized();

    await emitLifecycleStart(modelContext, {
      event: "model.request.start",
      component: ROUTE_ID,
      source: "route",
      model: { raw: body?.model || "unknown" },
      io: {
        input: {
          body: {
            stream: !!body?.stream,
            message_count: body?.messages?.length || 0,
            tool_count: body?.tools?.length || 0,
          },
        },
      },
    });

    const downstreamHeaders = new Headers(request.headers);
    for (const [key, value] of Object.entries(getCorrelationHeaders(modelContext))) {
      if (value) downstreamHeaders.set(key, String(value));
    }

    const downstreamRequest = new Request(request, { headers: downstreamHeaders });
    const response = await handleChat(downstreamRequest);

    if (body?.stream) {
      return wrapStreamResponse(response, modelContext, requestContext, startMs);
    }

    await emitLifecycleEnd(modelContext, {
      event: "model.response.end",
      component: ROUTE_ID,
      source: "route",
      meta: { status_code: response.status },
      timing: buildTiming(startMs, { stream: false }),
    });

    await endRequestLifecycle(requestContext, response, {
      method: "POST",
      path: "/v1/messages",
      startTime: startMs,
      io: { output: { stream: false, status_code: response.status } },
    });

    return response;
  } catch (error) {
    await emitLifecycleError(modelContext, error, {
      event: "model.response.error",
      component: ROUTE_ID,
      source: "route",
      timing: buildTiming(startMs),
    });
    await failRequestLifecycle(requestContext, error, {
      method: "POST",
      path: "/v1/messages",
      startTime: startMs,
    });
    throw error;
  }
}
