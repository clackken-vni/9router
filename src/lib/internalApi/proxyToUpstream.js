import { NextResponse } from "next/server";
import { logInternalApi } from "@/lib/internalApiLogger";
import { fail } from "@/lib/internalApi/auth";
import {
  buildTiming,
  createSpanContext,
  emitLifecycleEnd,
  emitLifecycleError,
  emitLifecycleStart,
  getCorrelationHeaders,
} from "@/lib/ampObservability";

export async function proxyToUpstream(request, url, body, settings, params = {}, observability = {}) {
  const upstreamToken = settings.ampUpstreamApiKey;
  const toolContext = observability.toolContext ? createSpanContext(observability.toolContext) : null;

  if (!settings?.ampUpstreamUrl || !upstreamToken) {
    logInternalApi.error({
      error: "Upstream not configured",
      hasUrl: !!settings?.ampUpstreamUrl,
      hasToken: !!upstreamToken,
    });
    if (toolContext) {
      await emitLifecycleError(toolContext, "Upstream not configured", {
        event: "tool.call.error",
        component: "internalApi.proxy",
        source: "upstream",
        tool: { execution_source: "upstream-proxy" },
      });
    }
    return fail(500, "upstream_not_configured", "Amp upstream URL/API key not configured");
  }

  const fullPath = params.path ? `/${params.path.join("/")}` : "";
  const upstreamUrl = `${settings.ampUpstreamUrl}/api/internal${fullPath}${url.search}`;

  logInternalApi.proxy({
    upstreamUrl,
    method: request.method,
    body: body || "(none)",
    tokenPreview: upstreamToken.substring(0, 20) + "...",
  });

  if (toolContext) {
    await emitLifecycleStart(toolContext, {
      event: "tool.call.forwarded",
      component: "internalApi.proxy",
      source: "upstream",
      tool: { execution_source: "upstream-proxy", path: fullPath || "/" },
      meta: { upstream_url: upstreamUrl, method: request.method },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${upstreamToken}`);
    headers.set("Content-Type", "application/json");

    for (const name of ["accept", "user-agent", "x-client", "x-amp-version"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    for (const [name, value] of Object.entries(getCorrelationHeaders(observability.toolContext || {}))) {
      if (value) headers.set(name, String(value));
    }

    const res = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") || "";

    logInternalApi.response({
      status: res.status,
      contentType,
      source: "upstream",
    });

    if (toolContext) {
      await emitLifecycleEnd(toolContext, {
        event: "tool.call.result",
        component: "internalApi.proxy",
        source: "upstream",
        tool: { execution_source: "upstream-proxy", path: fullPath || "/" },
        io: { output: { status_code: res.status, content_type: contentType } },
        timing: buildTiming(observability.startTime),
      });
    }

    if (contentType.includes("application/json")) {
      const data = await res.json();
      logInternalApi.response({
        status: res.status,
        contentType,
        source: "upstream",
        upstreamUrl,
        responseBody: data,
      });
      return NextResponse.json(data, {
        status: res.status,
        headers: {
          "x-9router-search-source": "upstream-proxy",
        },
      });
    }

    const text = await res.text();
    logInternalApi.response({
      status: res.status,
      contentType,
      source: "upstream",
      upstreamUrl,
      responseBody: text.substring(0, 2000),
    });

    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": contentType || "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-9router-proxy": "upstream",
        "x-9router-search-source": "upstream-proxy",
      },
    });
  } catch (err) {
    clearTimeout(timeout);

    if (err.name === "AbortError") {
      logInternalApi.error({ error: "Upstream timeout", upstreamUrl });
      if (toolContext) {
        await emitLifecycleError(toolContext, err, {
          event: "tool.call.error",
          component: "internalApi.proxy",
          source: "upstream",
          tool: { execution_source: "upstream-proxy", path: fullPath || "/" },
          meta: { reason: "timeout", upstream_url: upstreamUrl },
        });
      }
      return fail(504, "upstream_timeout", "Upstream internal API timed out");
    }

    logInternalApi.error({ error: err.message, upstreamUrl });
    if (toolContext) {
      await emitLifecycleError(toolContext, err, {
        event: "tool.call.error",
        component: "internalApi.proxy",
        source: "upstream",
        tool: { execution_source: "upstream-proxy", path: fullPath || "/" },
        meta: { upstream_url: upstreamUrl },
      });
    }
    return fail(502, "upstream_request_failed", err.message || "Upstream request failed");
  }
}
