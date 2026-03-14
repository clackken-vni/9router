import {
  endRequestLifecycle,
  failRequestLifecycle,
  startRequestLifecycle,
} from "@/lib/ampObservability";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const ROUTE_ID = "api.v1.messages.count_tokens";

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function POST(request) {
  const flow = await startRequestLifecycle(request, ROUTE_ID);
  const body = flow.body;

  try {
    if (!body) {
      const bad = new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
      await endRequestLifecycle(flow.requestContext, bad, {
        method: "POST",
        path: "/v1/messages/count_tokens",
        startTime: flow.startTime,
      });
      return bad;
    }

    const messages = body.messages || [];
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text" && part.text) {
            totalChars += part.text.length;
          }
        }
      }
    }

    const inputTokens = Math.ceil(totalChars / 4);

    const response = new Response(JSON.stringify({
      input_tokens: inputTokens,
    }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });

    await endRequestLifecycle(flow.requestContext, response, {
      method: "POST",
      path: "/v1/messages/count_tokens",
      startTime: flow.startTime,
      io: { output: { input_tokens: inputTokens } },
    });

    return response;
  } catch (error) {
    await failRequestLifecycle(flow.requestContext, error, {
      method: "POST",
      path: "/v1/messages/count_tokens",
      startTime: flow.startTime,
    });
    throw error;
  }
}
