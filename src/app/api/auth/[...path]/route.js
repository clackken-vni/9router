import { NextResponse } from "next/server";
import { getSettings, getApiKeys } from "@/lib/localDb";

/**
 * Amp CLI Management API Proxy
 * Routes: /api/auth, /api/user, /api/threads, etc.
 *
 * Logic:
 * 1. Authenticate with CLIProxyAPI's api-keys (from our 9router API keys)
 * 2. Optional localhost restriction check
 * 3. Reverse proxy to ampcode.com using upstream-api-key
 * 4. Auto-decompress gzipped responses
 */

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Get settings for Amp configuration
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey, ampRestrictManagementToLocalhost } = settings;

    if (!ampUpstreamUrl || !ampUpstreamApiKey) {
      return NextResponse.json(
        { error: "Amp upstream not configured. Please configure in Settings." },
        { status: 500 }
      );
    }

    // Check localhost restriction
    if (ampRestrictManagementToLocalhost) {
      const host = request.headers.get("host") || "";
      const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("::1");

      if (!isLocalhost) {
        return NextResponse.json(
          { error: "Management API restricted to localhost" },
          { status: 403 }
        );
      }
    }

    // Authenticate with our API keys
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const apiKeys = await getApiKeys();
    const validKey = apiKeys.find(k => k.key === token && k.isActive !== false);

    if (!validKey) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    // Forward to ampcode.com
    const upstreamUrl = `${ampUpstreamUrl}${pathname}${url.search}`;
    console.log(`[Amp Management Proxy] Forwarding to: ${upstreamUrl}`);

    const body = await request.json();

    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ampUpstreamApiKey}`,
      },
      body: JSON.stringify(body),
    });

    // Handle gzip decompression if needed
    let data;
    const contentEncoding = response.headers.get("content-encoding");
    if (contentEncoding === "gzip") {
      const arrayBuffer = await response.arrayBuffer();
      const decompressed = await new Response(
        new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"))
      ).text();
      data = JSON.parse(decompressed);
    } else {
      data = await response.json();
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Amp Management Proxy] Error:", error);
    return NextResponse.json(
      { error: error.message || "Proxy request failed" },
      { status: 500 }
    );
  }
}

// Support GET for management endpoints
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey, ampRestrictManagementToLocalhost } = settings;

    if (!ampUpstreamUrl || !ampUpstreamApiKey) {
      return NextResponse.json(
        { error: "Amp upstream not configured" },
        { status: 500 }
      );
    }

    // Check localhost restriction
    if (ampRestrictManagementToLocalhost) {
      const host = request.headers.get("host") || "";
      const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("::1");

      if (!isLocalhost) {
        return NextResponse.json(
          { error: "Management API restricted to localhost" },
          { status: 403 }
        );
      }
    }

    // Authenticate
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const apiKeys = await getApiKeys();
    const validKey = apiKeys.find(k => k.key === token && k.isActive !== false);

    if (!validKey) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    const upstreamUrl = `${ampUpstreamUrl}${pathname}${url.search}`;

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${ampUpstreamApiKey}`,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Amp Management Proxy] Error:", error);
    return NextResponse.json(
      { error: error.message || "Proxy request failed" },
      { status: 500 }
    );
  }
}
