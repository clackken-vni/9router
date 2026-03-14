import { handleEmbeddings } from "@/sse/handlers/embeddings.js";
import {
  endRequestLifecycle,
  failRequestLifecycle,
  startRequestLifecycle,
} from "@/lib/ampObservability";

const ROUTE_ID = "api.v1.embeddings";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function POST(request) {
  const flow = await startRequestLifecycle(request, ROUTE_ID);
  try {
    const response = await handleEmbeddings(request);
    await endRequestLifecycle(flow.requestContext, response, {
      method: "POST",
      path: "/v1/embeddings",
      startTime: flow.startTime,
    });
    return response;
  } catch (error) {
    await failRequestLifecycle(flow.requestContext, error, {
      method: "POST",
      path: "/v1/embeddings",
      startTime: flow.startTime,
    });
    throw error;
  }
}
