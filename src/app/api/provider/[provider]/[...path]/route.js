import { NextResponse } from "next/server";
import { getSettings, getApiKeys } from "@/lib/localDb";
import { addDebugLog } from "@/app/api/debug-logs/route";

/**
 * Amp CLI Provider API Proxy
 * Route: /api/provider/{provider}/v1/...
 *
 * Logic:
 * 1. Check if model is configured locally in ampModelMappings
 * 2. If YES: Route to local 9router providers (preserve API shape)
 * 3. If NO: Forward to ampcode.com as reverse proxy
 */

// Debug: Log ALL Amp CLI requests
const DEBUG_ALL_REQUESTS = true;

// Agent detection based on model
const MODEL_TO_AGENT = {
  "claude-opus-4-6": "smart",
  "gpt-5.3-codex": "deep",
  "claude-sonnet-4-5": "librarian",
  "claude-sonnet-4-5-20241022": "librarian",
  "claude-sonnet-4-6": "librarian",
  "claude-haiku-4-5": "rush",
  "claude-haiku-4-5-20251001": "rush",
  "gemini-3-flash-preview": "search",
  "gpt-5.2": "oracle",
  "gpt-5.4": "oracle",
  "gemini-3-pro-preview": "review",
  "gemini-2.5-flash": "handoff",
  "gemini-2.5-flash-lite-preview-09-2025": "topics",
};

function detectAgent(body) {
  const model = body?.model || "";
  
  // Check metadata.agent
  if (body?.metadata?.agent) {
    return body.metadata.agent;
  }
  
  // Check model mapping
  if (MODEL_TO_AGENT[model]) {
    return MODEL_TO_AGENT[model];
  }
  
  // Check system prompt for agent hints
  const system = String(body?.system || "").toLowerCase();
  if (system.includes("librarian")) return "librarian";
  if (system.includes("oracle")) return "oracle";
  if (system.includes("search")) return "search";
  
  return "unknown";
}

function logRequest(provider, fullPath, body, headers, response = null) {
  const model = body?.model || "unknown";
  const agent = detectAgent(body);
  const timestamp = new Date().toISOString();
  
  // Check for special tools that need external auth
  const toolNames = (body?.tools || []).map(t => t?.function?.name || t?.name || "unknown");
  const needsGitHub = toolNames.some(t => 
    t.includes("github") || t.includes("commit_search") || t.includes("list_repositories")
  );
  
  // Build log entry
  const logEntry = {
    timestamp,
    provider,
    path: `/api/provider/${provider}/${fullPath}`,
    model,
    agent,
    method: "POST",
    needsGitHub,
    headers: {},
    bodySummary: {
      messages: body?.messages?.length || 0,
      tools: body?.tools?.length || 0,
      toolNames: toolNames.slice(0, 10),
      stream: body?.stream,
      max_tokens: body?.max_tokens,
    },
    metadata: body?.metadata || null,
    systemHint: body?.system ? String(body?.system).slice(0, 200) + "..." : null,
    firstMessage: body?.messages?.[0]?.content ? 
      String(body.messages[0].content).slice(0, 300) + "..." : null,
    response: response ? {
      status: response.status,
      type: response.type,
    } : null,
  };

  // Capture headers (redact sensitive)
  for (const [key, value] of Object.entries(headers || {})) {
    const k = key.toLowerCase();
    if (k.includes("auth") || k.includes("api-key") || k.includes("token")) {
      logEntry.headers[key] = value ? String(value).slice(0, 20) + "..." : "(empty)";
    } else if (k === "host" || k === "user-agent" || k === "content-type" || k === "accept") {
      logEntry.headers[key] = value;
    }
  }

  // Console output with AGENT highlighted
  console.log("\n" + "═".repeat(70));
  console.log(`[${timestamp}] [AMP CLI] ${"█".repeat(20)}`);
  console.log(`► AGENT: ${agent.toUpperCase()}`);
  console.log(`► Model: ${model}`);
  console.log(`► Provider: ${provider}`);
  if (needsGitHub) {
    console.log(`► ⚠️ NEEDS GITHUB AUTH`);
  }
  console.log("═".repeat(70));
  console.log(`Path: ${logEntry.path}`);
  console.log(`Tools (${logEntry.bodySummary.tools}):`, logEntry.bodySummary.toolNames.join(", "));
  if (logEntry.metadata) {
    console.log(`Metadata:`, JSON.stringify(logEntry.metadata));
  }
  if (logEntry.firstMessage) {
    console.log(`First msg: ${logEntry.firstMessage}`);
  }
  if (response) {
    console.log(`Response: ${response.status}`);
  }
  console.log("═".repeat(70) + "\n");

  // Save to debug API
  try {
    addDebugLog("amp-request", logEntry);
  } catch (e) {}

  return logEntry;
}

function extractApiKeyFromRequest(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader) return authHeader.replace(/^Bearer\s+/i, "");
  return request.headers.get("x-api-key") || "";
}

function isGenerationEndpoint(fullPath) {
  return fullPath.includes("v1/chat/completions")
    || fullPath.includes("v1/responses")
    || fullPath.includes("v1/messages");
}

function applyAmpStreamDefault(body, fullPath) {
  if (!body || typeof body !== "object") return body;
  if (body.stream !== undefined) return body;
  if (!isGenerationEndpoint(fullPath)) return body;
  return { ...body, stream: true };
}

function buildForwardHeaders(request, extra = {}) {
  const headers = { ...extra };
  const accept = request.headers.get("accept");
  const userAgent = request.headers.get("user-agent");
  if (accept) headers.Accept = accept;
  if (userAgent) headers["User-Agent"] = userAgent;
  return headers;
}

function buildProxyResponseHeaders(response) {
  const headers = {
    "Content-Type": response.headers.get("Content-Type") || "application/json",
    "Cache-Control": "no-cache",
  };

  if (headers["Content-Type"].includes("text/event-stream")) {
    headers.Connection = "keep-alive";
    headers["Access-Control-Allow-Origin"] = "*";
    headers["X-Accel-Buffering"] = "no";
  }

  return headers;
}

function resolveMappedModel(ampModelMappings, requestedModel) {
  if (!requestedModel || !ampModelMappings) return null;

  // Direct mapping (new style where key is exact Amp model id)
  if (ampModelMappings[requestedModel]) return ampModelMappings[requestedModel];

  // Backward compatibility: legacy slot keys (smart/rush/oracle/...)
  const legacySlotByModel = {
    // Smart - Claude Opus 4.6
    "claude-opus-4-6": "smart",
    // Deep - GPT-5.3 Codex
    "gpt-5.3-codex": "deep",
    // Librarian - Claude Sonnet 4.5/4.6
    "claude-sonnet-4-5": "librarian",
    "claude-sonnet-4-5-20241022": "librarian",
    "claude-sonnet-4-6": "librarian",
    // Rush - Claude Haiku 4.5
    "claude-haiku-4-5": "rush",
    "claude-haiku-4-5-20251001": "rush",
    // Search - Gemini 3 Flash
    "gemini-3-flash-preview": "search",
    // Oracle - GPT-5.2/5.4
    "gpt-5.2": "oracle",
    "gpt-5.4": "oracle",
    // Review - Gemini 3 Pro
    "gemini-3-pro-preview": "review",
    // Handoff - Gemini 2.5 Flash
    "gemini-2.5-flash": "handoff",
    // Topics - Gemini 2.5 Flash-Lite
    "gemini-2.5-flash-lite-preview-09-2025": "topics",
  };

  const legacySlot = legacySlotByModel[requestedModel];
  if (legacySlot && ampModelMappings[legacySlot]) return ampModelMappings[legacySlot];

  return null;
}

export async function POST(request, { params }) {
  try {
    const { provider, path } = await params;
    const pathSegments = Array.isArray(path) ? path : [path];
    const fullPath = pathSegments.join("/");

    // Validate authentication
    const apiKey = extractApiKeyFromRequest(request);
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing authorization header" },
        { status: 401 }
      );
    }

    // Get settings for Amp configuration
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey, ampModelMappings } = settings;

    // Validate API key (check against locally stored keys or default)
    const apiKeys = await getApiKeys();
    const validKey = apiKeys.find(k => k.key === apiKey && k.isActive !== false)
      || apiKey === "sk_9router"
      || apiKey === ampUpstreamApiKey
      || apiKey.startsWith("sgamp_user");
    if (!validKey) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    // Parse request body to get model
    const body = await request.json();
    const requestedModel = body.model;

    // Debug logging for ALL Amp CLI requests
    const requestHeaders = Object.fromEntries(request.headers.entries());
    logRequest(provider, fullPath, body, requestHeaders);

    // Check if this model is mapped locally
    const localModel = resolveMappedModel(ampModelMappings, requestedModel);
    
    // Check if request needs GitHub (Librarian tools)
    const toolNames = (body?.tools || []).map(t => t?.function?.name || t?.name || "unknown");
    const needsGitHub = toolNames.some(t => 
      t.includes("github") || t.includes("commit_search") || t.includes("list_repositories") ||
      t.includes("glob_github") || t.includes("read_github") || t.includes("search_github") ||
      t.includes("diff") || t.includes("list_directory_github")
    );

    const effectiveBody = applyAmpStreamDefault(body, fullPath);

    // If needs GitHub, forward to ampcode.com (they have GitHub integration)
    if (needsGitHub && ampUpstreamUrl && ampUpstreamApiKey) {
      console.log(`[Amp Proxy] Forwarding ${requestedModel} to upstream (needs GitHub): ${ampUpstreamUrl}`);
      
      const upstreamUrl = `${ampUpstreamUrl}/api/provider/${provider}/${fullPath}`;

      const response = await fetch(upstreamUrl, {
        method: "POST",
        headers: buildForwardHeaders(request, {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ampUpstreamApiKey}`,
        }),
        body: JSON.stringify(effectiveBody),
      });

      console.log(`[Amp Proxy] Upstream Response: ${response.status} for ${requestedModel}`);

      return new Response(response.body, {
        status: response.status,
        headers: buildProxyResponseHeaders(response),
      });
    }

    if (localModel) {
      // Route to local 9router provider
      console.log(`[Amp Proxy] Routing ${requestedModel} to local model: ${localModel}`);

      // Preserve original API shape so format detection stays correct
      const originalUrl = new URL(request.url);
      const internalPath = fullPath ? `/api/${fullPath}` : "/api/v1/chat/completions";
      const internalUrl = new URL(`${internalPath}${originalUrl.search}`, request.url);

      // Update body with mapped model
      const modifiedBody = {
        ...effectiveBody,
        model: localModel,
      };

      // Use special internal proxy header to bypass auth
      const response = await fetch(internalUrl.toString(), {
        method: "POST",
        headers: buildForwardHeaders(request, {
          "Content-Type": "application/json",
          "X-Internal-Proxy": "true",
        }),
        body: JSON.stringify(modifiedBody),
      });

      // Log response status for debugging
      console.log(`[Amp Proxy] Response: ${response.status} for ${requestedModel}`);

      return new Response(response.body, {
        status: response.status,
        headers: buildProxyResponseHeaders(response),
      });
    } else {
      // Forward to ampcode.com
      console.log(`[Amp Proxy] Forwarding ${requestedModel} to upstream: ${ampUpstreamUrl}`);

      if (!ampUpstreamUrl || !ampUpstreamApiKey) {
        return NextResponse.json(
          { error: "Amp upstream not configured. Please configure in Settings." },
          { status: 500 }
        );
      }

      const upstreamUrl = `${ampUpstreamUrl}/api/provider/${provider}/${fullPath}`;

      const response = await fetch(upstreamUrl, {
        method: "POST",
        headers: buildForwardHeaders(request, {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ampUpstreamApiKey}`,
        }),
        body: JSON.stringify(effectiveBody),
      });

      // Log response status for debugging
      console.log(`[Amp Proxy] Upstream Response: ${response.status} for ${requestedModel}`);

      return new Response(response.body, {
        status: response.status,
        headers: buildProxyResponseHeaders(response),
      });
    }
  } catch (error) {
    console.error("[Amp Proxy] Error:", error);
    return NextResponse.json(
      { error: error.message || "Proxy request failed" },
      { status: 500 }
    );
  }
}

// Support GET for model listing endpoints
export async function GET(request, { params }) {
  try {
    const { provider, path } = await params;
    const pathSegments = Array.isArray(path) ? path : [path];
    const fullPath = pathSegments.join("/");

    const apiKey = extractApiKeyFromRequest(request);
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing authorization header" },
        { status: 401 }
      );
    }

    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;

    const apiKeys = await getApiKeys();
    const validKey = apiKeys.find(k => k.key === apiKey && k.isActive !== false)
      || apiKey === "sk_9router"
      || apiKey === ampUpstreamApiKey
      || apiKey.startsWith("sgamp_user");
    if (!validKey) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    if (!ampUpstreamUrl || !ampUpstreamApiKey) {
      return NextResponse.json(
        { error: "Amp upstream not configured" },
        { status: 500 }
      );
    }

    const upstreamUrl = `${ampUpstreamUrl}/api/provider/${provider}/${fullPath}`;

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${ampUpstreamApiKey}`,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Amp Proxy] Error:", error);
    return NextResponse.json(
      { error: error.message || "Proxy request failed" },
      { status: 500 }
    );
  }
}
