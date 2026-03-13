import { NextResponse } from "next/server";
import { getSettings, getApiKeys } from "@/lib/localDb";
import { logInternalApi } from "@/lib/internalApiLogger";
import { AMP_INTERNAL_OVERRIDE_DEFINITIONS } from "@/shared/constants/ampInternal";

function extractToken(request) {
  const authHeader = request.headers.get("authorization");
  return authHeader ? authHeader.replace(/^Bearer\s+/i, "") : (request.headers.get("x-api-key") || "");
}

function ok(result) {
  return NextResponse.json({ ok: true, result });
}

function fail(status, code, message) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

async function validate(request) {
  const token = extractToken(request);
  if (!token) {
    return { ok: false, error: fail(401, "unauthorized", "Authorization required") };
  }

  const settings = await getSettings();
  const { ampUpstreamApiKey } = settings;

  const apiKeys = await getApiKeys();
  const validKey = apiKeys.find(k => k.key === token && k.isActive !== false)
    || token === "sk_9router"
    || token === ampUpstreamApiKey
    || token.startsWith("sgamp_user");

  if (!validKey) {
    return { ok: false, error: fail(401, "invalid_api_key", "Invalid API key") };
  }

  return { ok: true, token, settings };
}

async function readJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;

  try {
    return await request.json();
  } catch {
    return null;
  }
}

function deriveInternalMethod(url, body) {
  if (body?.method && typeof body.method === "string") {
    return body.method;
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "_" && key !== "t") {
      return key;
    }
  }
  return null;
}

function buildRequestInfo(request, url, body, token, params = {}) {
  const userAgent = request?.headers?.get("user-agent") || "(none)";
  const xClient = request?.headers?.get("x-client") || "(none)";
  const xAmp = request?.headers?.get("x-amp-version") || "(none)";
  
  const isAmpCli = userAgent.toLowerCase().includes("amp") || 
                   userAgent.toLowerCase().includes("go-http") ||
                   xClient.toLowerCase().includes("amp");
  
  const source = isAmpCli ? "AMP-CLI" : 
                 userAgent.includes("Mozilla") ? "Browser" : 
                 userAgent.includes("node") ? "Node.js" : "Unknown";
  
  const tokenType = token?.startsWith("sgamp_user") ? "sgamp_user" :
                    token === "sk_9router" ? "sk_9router" :
                    token?.startsWith("sk_") ? "sk_*" : "unknown";

  const path = params.path ? `/${params.path.join("/")}` : "/";
  const internalMethod = deriveInternalMethod(url, body);

  return {
    source,
    httpMethod: request.method,
    path,
    internalMethod,
    query: url.search || "(none)",
    body: body || "(none)",
    userAgent,
    xClient,
    xAmp,
    tokenType,
    tokenPreview: token?.substring(0, 20) + "...",
  };
}

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

function findOverrideConfig(settings, requestMethod, path, internalMethod) {
  const overrides = settings?.ampInternalOverrides || {};
  const definition = AMP_INTERNAL_OVERRIDE_DEFINITIONS.find((item) => (
    item.httpMethod === requestMethod && item.path === path && item.internalMethod === internalMethod
  ));
  if (!definition) return null;
  const config = overrides[definition.key];
  if (!config?.enabled) return null;
  return { key: definition.key, config, definition };
}

function buildOverrideResponse(override) {
  const status = Number(override.config?.status) || 200;
  const rawBody = override.config?.body || "{}";
  try {
    const parsed = JSON.parse(rawBody);
    return NextResponse.json(parsed, {
      status,
      headers: {
        "x-9router-overwrite": override.key,
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response(rawBody, {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-9router-overwrite": override.key,
        "cache-control": "no-store",
      },
    });
  }
}

// Proxy to upstream with proper token
async function proxyToUpstream(request, url, body, settings, params = {}) {
  const upstreamToken = settings.ampUpstreamApiKey;
  
  if (!settings?.ampUpstreamUrl || !upstreamToken) {
    logInternalApi.error({
      error: "Upstream not configured",
      hasUrl: !!settings?.ampUpstreamUrl,
      hasToken: !!upstreamToken
    });
    return fail(500, "upstream_not_configured", "Amp upstream URL/API key not configured");
  }

  const fullPath = params.path ? `/${params.path.join("/")}` : "";
  const upstreamUrl = `${settings.ampUpstreamUrl}/api/internal${fullPath}${url.search}`;

  logInternalApi.proxy({
    upstreamUrl,
    method: request.method,
    body: body || "(none)",
    tokenPreview: upstreamToken.substring(0, 20) + "..."
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
      source: "upstream"
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
        "x-9router-proxy": "upstream"
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

export async function POST(request, { params }) {
  const startTime = Date.now();
  
  try {
    const auth = await validate(request);
    const resolvedParams = await params;
    
    if (!auth.ok) {
      logInternalApi.error({ error: "Unauthorized", status: 401 });
      return auth.error;
    }

    const url = new URL(request.url);
    const body = await readJsonBody(request);
    const requestInfo = buildRequestInfo(request, url, body, auth.token, resolvedParams);

    logInternalApi.request(requestInfo);

    if (!body || body === "(none)") {
      const response = buildEmptyPostBodyResponse();
      const duration = Date.now() - startTime;
      logInternalApi.response({
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        status: response.status,
        duration: `${duration}ms`,
        source: "skipped_empty_post_body"
      });
      return response;
    }

    const override = findOverrideConfig(auth.settings, request.method, requestInfo.path, requestInfo.internalMethod);
    if (override) {
      logInternalApi.overwrite({ key: override.key, path: requestInfo.path, internalMethod: requestInfo.internalMethod });
      const response = buildOverrideResponse(override);
      const duration = Date.now() - startTime;
      logInternalApi.response({
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        status: response.status,
        duration: `${duration}ms`,
        source: "overwrite"
      });
      return response;
    }

    // Proxy to upstream
    const response = await proxyToUpstream(request, url, body, auth.settings, resolvedParams);
    
    const duration = Date.now() - startTime;
    logInternalApi.response({
      method: requestInfo.internalMethod || "(none)",
      path: requestInfo.path,
      status: response.status,
      duration: `${duration}ms`,
      source: "upstream"
    });

    return response;
  } catch (error) {
    logInternalApi.error({ error: error.message, stack: error.stack });
    return fail(500, "internal_error", error.message || "Internal API request failed");
  }
}

export async function GET(request, { params }) {
  const startTime = Date.now();
  
  try {
    const auth = await validate(request);
    const resolvedParams = await params;
    
    if (!auth.ok) {
      logInternalApi.error({ error: "Unauthorized", status: 401 });
      return auth.error;
    }

    const url = new URL(request.url);
    const requestInfo = buildRequestInfo(request, url, null, auth.token, resolvedParams);

    logInternalApi.request(requestInfo);

    const override = findOverrideConfig(auth.settings, request.method, requestInfo.path, requestInfo.internalMethod);
    if (override) {
      logInternalApi.overwrite({ key: override.key, path: requestInfo.path, internalMethod: requestInfo.internalMethod });
      const response = buildOverrideResponse(override);
      const duration = Date.now() - startTime;
      logInternalApi.response({
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        status: response.status,
        duration: `${duration}ms`,
        source: "overwrite"
      });
      return response;
    }

    // Proxy to upstream
    const response = await proxyToUpstream(request, url, null, auth.settings, resolvedParams);
    
    const duration = Date.now() - startTime;
    logInternalApi.response({
      method: requestInfo.internalMethod || "(none)",
      path: requestInfo.path,
      status: response.status,
      duration: `${duration}ms`,
      source: "upstream"
    });

    return response;
  } catch (error) {
    logInternalApi.error({ error: error.message, stack: error.stack });
    return fail(500, "internal_error", error.message || "Internal API request failed");
  }
}
