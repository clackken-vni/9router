import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { getProviderConnections } from "@/models";
import { PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";

/**
 * Amp CLI Provider API Proxy
 * Route: /api/provider/{provider}/v1/...
 *
 * Logic:
 * 1. Check if model is configured locally in ampModelMappings
 * 2. If YES: Route to local 9router providers (use existing /api/v1/chat/completions)
 * 3. If NO: Forward to ampcode.com as reverse proxy
 */

export async function POST(request, { params }) {
  try {
    const { provider, path } = await params;
    const pathSegments = Array.isArray(path) ? path : [path];
    const fullPath = pathSegments.join("/");

    // Get settings for Amp configuration
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey, ampModelMappings } = settings;

    // Parse request body to get model
    const body = await request.json();
    const requestedModel = body.model;

    // Check if this model is mapped locally
    const localModel = ampModelMappings?.[requestedModel];

    if (localModel) {
      // Route to local 9router provider
      console.log(`[Amp Proxy] Routing ${requestedModel} to local model: ${localModel}`);

      // Forward to our internal chat completions endpoint
      const internalUrl = new URL("/api/v1/chat/completions", request.url);

      // Update body with mapped model
      const modifiedBody = {
        ...body,
        model: localModel,
      };

      // Get authorization header from original request
      const authHeader = request.headers.get("authorization");

      const response = await fetch(internalUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader && { "Authorization": authHeader }),
        },
        body: JSON.stringify(modifiedBody),
      });

      // Return response
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
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

    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;

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
