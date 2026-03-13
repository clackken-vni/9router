import { NextResponse } from "next/server";

/**
 * Amp CLI Settings Catch-All Proxy
 * 
 * Proxies ALL /settings/* requests to ampcode.com
 * Handles nested paths like /settings/github/callback, etc.
 */

export async function GET(request, { params }) {
  return proxyRequest(request, params);
}

export async function POST(request, { params }) {
  return proxyRequest(request, params);
}

export async function PUT(request, { params }) {
  return proxyRequest(request, params);
}

export async function DELETE(request, { params }) {
  return proxyRequest(request, params);
}

async function proxyRequest(request, params) {
  try {
    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;
    
    if (!ampUpstreamUrl || !ampUpstreamApiKey) {
      return new Response("Amp upstream not configured", { status: 500 });
    }
    
    const url = new URL(request.url);
    const pathSegments = params.path ? (Array.isArray(params.path) ? params.path : [params.path]) : [];
    const fullPath = pathSegments.join("/");
    const upstreamUrl = `${ampUpstreamUrl}/settings/${fullPath}${url.search}`;
    
    console.log(`[Settings Proxy] ${request.method} ${upstreamUrl}`);
    
    // Build headers
    const headers = {
      "Authorization": `Bearer ${ampUpstreamApiKey}`,
    };
    
    const contentType = request.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;
    
    const accept = request.headers.get("accept");
    if (accept) headers["Accept"] = accept;
    
    // Get body for POST/PUT
    let body = undefined;
    if (["POST", "PUT", "PATCH"].includes(request.method)) {
      body = await request.text();
    }
    
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
    
    // Handle redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const rewrittenLocation = location.replace(ampUpstreamUrl, url.origin);
        return NextResponse.redirect(rewrittenLocation, response.status);
      }
    }
    
    const responseContentType = response.headers.get("content-type") || "text/html";
    const responseBody = await response.text();
    
    // Rewrite URLs in HTML
    let finalBody = responseBody;
    if (responseContentType.includes("text/html")) {
      finalBody = responseBody
        .replace(new RegExp(ampUpstreamUrl, "g"), url.origin)
        .replace(/href="\/(?!api)/g, `href="${url.origin}/`)
        .replace(/src="\/(?!api)/g, `src="${url.origin}/`);
    }
    
    return new Response(finalBody, {
      status: response.status,
      headers: {
        "Content-Type": responseContentType,
        "Cache-Control": "no-cache",
      },
    });
    
  } catch (error) {
    console.error("[Settings Proxy] Error:", error);
    return new Response(error.message, { status: 500 });
  }
}
