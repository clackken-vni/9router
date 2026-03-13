import { NextResponse } from "next/server";
import { logInternalApi } from "@/lib/internalApiLogger";
import { fail } from "@/lib/internalApi/auth";

export async function proxyToUpstream(request, url, body, settings, params = {}) {
  const upstreamToken = settings.ampUpstreamApiKey;

  if (!settings?.ampUpstreamUrl || !upstreamToken) {
    logInternalApi.error({
      error: "Upstream not configured",
      hasUrl: !!settings?.ampUpstreamUrl,
      hasToken: !!upstreamToken,
    });
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

    if (contentType.includes("application/json")) {
      const data = await res.json();
      logInternalApi.response({
        status: res.status,
        contentType,
        source: "upstream",
        upstreamUrl,
        responseBody: data,
      });
      return NextResponse.json(data, { status: res.status });
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
      },
    });
  } catch (err) {
    clearTimeout(timeout);

    if (err.name === "AbortError") {
      logInternalApi.error({ error: "Upstream timeout", upstreamUrl });
      return fail(504, "upstream_timeout", "Upstream internal API timed out");
    }

    logInternalApi.error({ error: err.message, upstreamUrl });
    return fail(502, "upstream_request_failed", err.message || "Upstream request failed");
  }
}
