import {
  endRequestLifecycle,
  failRequestLifecycle,
  startRequestLifecycle,
} from "@/lib/ampObservability";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const ROUTE_ID = "api.v1.root";

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function GET(request) {
  const flow = await startRequestLifecycle(request, ROUTE_ID);
  try {
    const models = [
      { id: "claude-sonnet-4-20250514", object: "model", owned_by: "anthropic" },
      { id: "claude-3-5-sonnet-20241022", object: "model", owned_by: "anthropic" },
      { id: "gpt-4o", object: "model", owned_by: "openai" },
      { id: "gemini-2.5-pro", object: "model", owned_by: "google" },
    ];

    const response = new Response(JSON.stringify({
      object: "list",
      data: models,
    }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });

    await endRequestLifecycle(flow.requestContext, response, {
      method: "GET",
      path: "/v1",
      startTime: flow.startTime,
      io: { output: { models_count: models.length } },
    });

    return response;
  } catch (error) {
    await failRequestLifecycle(flow.requestContext, error, {
      method: "GET",
      path: "/v1",
      startTime: flow.startTime,
    });
    throw error;
  }
}
