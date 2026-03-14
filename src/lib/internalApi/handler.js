import { NextResponse } from "next/server";
import { validate, fail } from "@/lib/internalApi/auth";
import { readJsonBody, buildRequestInfo } from "@/lib/internalApi/requestInfo";
import { findOverrideConfig, buildOverrideResponse } from "@/lib/internalApi/overrides";
import { proxyToUpstream } from "@/lib/internalApi/proxyToUpstream";
import { handleWebSearch2 } from "@/lib/searchProviders/handleWebSearch2";
import { logInternalApi } from "@/lib/internalApiLogger";
import {
  buildTiming,
  createSpanContext,
  emitLifecycleEnd,
  emitLifecycleError,
  emitLifecycleStart,
  getCorrelationHeaders,
  resolveCorrelation,
} from "@/lib/ampObservability";

function buildEmptyPostBodyResponse() {
  return NextResponse.json({
    ok: true,
    result: {
      skipped: true,
      reason: "empty_post_body",
    },
  }, {
    status: 200,
    headers: {
      "x-9router-skipped": "empty_post_body",
      "cache-control": "no-store",
    },
  });
}

function logRequestClosed(requestInfo, startTime, extra = {}) {
  const duration = Date.now() - startTime;
  logInternalApi.requestClosed({
    method: requestInfo?.internalMethod || "(none)",
    path: requestInfo?.path || "/",
    duration: `${duration}ms`,
    ...extra,
  });
}

export async function handleInternalApiRequest(request, params = {}) {
  const startTime = Date.now();
  const rootContext = resolveCorrelation(request.headers);
  const toolContext = createSpanContext(rootContext);

  try {
    const auth = await validate(request);
    if (!auth.ok) {
      logInternalApi.error({ error: "Unauthorized", status: 401 });
      await emitLifecycleError(toolContext, "Unauthorized", {
        event: "tool.call.error",
        component: "api.internal",
        source: "auth",
        tool: {
          method: "(unauthorized)",
          path: params.path ? `/${params.path.join("/")}` : "/",
          execution_source: "auth_failed",
        },
        meta: { status_code: 401 },
        timing: buildTiming(startTime),
      });
      logRequestClosed(null, startTime, { status: 401, source: "auth_failed" });
      return auth.error;
    }

    const url = new URL(request.url);
    const body = request.method === "POST" ? await readJsonBody(request) : null;
    const requestInfo = buildRequestInfo(request, url, body, auth.token, params);

    await emitLifecycleStart(toolContext, {
      event: "tool.call.start",
      component: "api.internal",
      source: "route",
      tool: {
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        execution_source: "pending",
      },
      io: {
        input: {
          query: requestInfo.query,
          body: requestInfo.body,
          headers: requestInfo.forwardableHeaders,
        },
      },
      meta: {
        http_method: requestInfo.httpMethod,
        source: requestInfo.source,
      },
    });

    logInternalApi.request(requestInfo);

    if (request.method === "POST" && (!body || body === "(none)")) {
      const response = buildEmptyPostBodyResponse();
      const duration = Date.now() - startTime;
      logInternalApi.response({
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        status: response.status,
        duration: `${duration}ms`,
        source: "skipped_empty_post_body",
      });
      await emitLifecycleEnd(toolContext, {
        event: "tool.call.end",
        component: "api.internal",
        source: "route",
        tool: {
          method: requestInfo.internalMethod || "(none)",
          path: requestInfo.path,
          execution_source: "empty_post_body",
        },
        meta: { status_code: response.status, reason: "empty_post_body" },
        timing: buildTiming(startTime),
      });
      logRequestClosed(requestInfo, startTime, { status: response.status, source: "skipped_empty_post_body" });
      return response;
    }

    const override = findOverrideConfig(auth.settings, request.method, requestInfo.path, requestInfo.internalMethod);
    if (override) {
      logInternalApi.overwrite({ key: override.key, path: requestInfo.path, internalMethod: requestInfo.internalMethod });
      await emitLifecycleStart(createSpanContext(toolContext), {
        event: "tool.call.forwarded",
        component: "api.internal",
        source: "route",
        tool: {
          method: requestInfo.internalMethod || "(none)",
          path: requestInfo.path,
          execution_source: "override",
        },
        meta: { override_key: override.key },
      });
      const response = buildOverrideResponse(override);
      const duration = Date.now() - startTime;
      logInternalApi.response({
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        status: response.status,
        duration: `${duration}ms`,
        source: "overwrite",
      });
      await emitLifecycleEnd(toolContext, {
        event: "tool.call.result",
        component: "api.internal",
        source: "route",
        tool: {
          method: requestInfo.internalMethod || "(none)",
          path: requestInfo.path,
          execution_source: "override",
        },
        io: { output: { status_code: response.status } },
        timing: buildTiming(startTime),
      });
      await emitLifecycleEnd(toolContext, {
        event: "tool.call.end",
        component: "api.internal",
        source: "route",
        tool: {
          method: requestInfo.internalMethod || "(none)",
          path: requestInfo.path,
          execution_source: "override",
        },
        meta: { status_code: response.status, override_key: override.key },
        timing: buildTiming(startTime),
      });
      logRequestClosed(requestInfo, startTime, { status: response.status, source: "overwrite", overrideKey: override.key });
      return response;
    }

    const downstreamHeaders = new Headers(request.headers);
    for (const [key, value] of Object.entries(getCorrelationHeaders(toolContext))) {
      if (value) downstreamHeaders.set(key, String(value));
    }
    const downstreamRequest = new Request(request, { headers: downstreamHeaders });

    let executionSource = "upstream-proxy";
    const response = requestInfo.internalMethod === "webSearch2"
      ? await handleWebSearch2(downstreamRequest, {
        url,
        body,
        settings: auth.settings,
        params,
        requestInfo,
        observability: { toolContext, startTime },
      })
      : await proxyToUpstream(downstreamRequest, url, body, auth.settings, params, {
        toolContext,
        executionSource,
      });

    if (requestInfo.internalMethod === "webSearch2") {
      executionSource = response.headers.get("x-9router-search-source") || "local-handler";
    }

    const duration = Date.now() - startTime;
    logInternalApi.response({
      method: requestInfo.internalMethod || "(none)",
      path: requestInfo.path,
      status: response.status,
      duration: `${duration}ms`,
      source: executionSource,
    });

    await emitLifecycleEnd(toolContext, {
      event: "tool.call.result",
      component: "api.internal",
      source: "route",
      tool: {
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        execution_source: executionSource,
      },
      io: { output: { status_code: response.status } },
      timing: buildTiming(startTime),
    });
    await emitLifecycleEnd(toolContext, {
      event: "tool.call.end",
      component: "api.internal",
      source: "route",
      tool: {
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        execution_source: executionSource,
      },
      meta: { status_code: response.status },
      timing: buildTiming(startTime),
    });

    logRequestClosed(requestInfo, startTime, { status: response.status, source: executionSource });

    return response;
  } catch (error) {
    logInternalApi.error({ error: error.message, stack: error.stack });
    await emitLifecycleError(toolContext, error, {
      event: "tool.call.error",
      component: "api.internal",
      source: "route",
      tool: {
        method: "(unknown)",
        path: params.path ? `/${params.path.join("/")}` : "/",
        execution_source: "internal_error",
      },
      timing: buildTiming(startTime),
    });
    logRequestClosed(null, startTime, { status: 500, source: "internal_error", error: error.message });
    return fail(500, "internal_error", error.message || "Internal API request failed");
  }
}
