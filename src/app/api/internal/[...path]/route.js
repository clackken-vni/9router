import {
  endRequestLifecycle,
  failRequestLifecycle,
  startRequestLifecycle,
} from "@/lib/ampObservability";
import { handleInternalApiRequest } from "@/lib/internalApi/handler";

async function run(request, params, method) {
  const resolvedParams = await params;
  const path = Array.isArray(resolvedParams?.path) ? `/${resolvedParams.path.join("/")}` : "/";
  const flow = await startRequestLifecycle(request, "api.internal.catchall");

  try {
    const response = await handleInternalApiRequest(request, resolvedParams || {});
    await endRequestLifecycle(flow.requestContext, response, {
      method,
      path: `/internal${path}`,
      startTime: flow.startTime,
    });
    return response;
  } catch (error) {
    await failRequestLifecycle(flow.requestContext, error, {
      method,
      path: `/internal${path}`,
      startTime: flow.startTime,
    });
    throw error;
  }
}

export async function POST(request, { params }) {
  return run(request, params, "POST");
}

export async function GET(request, { params }) {
  return run(request, params, "GET");
}
