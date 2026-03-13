import { NextResponse } from "next/server";

/**
 * Amp CLI Auth Catch-All Proxy
 * 
 * Proxies ALL /auth/* requests to ampcode.com
 * Handles OAuth flows, sign-in, sign-out, etc.
 */

export async function GET(request, { params }) {
  return proxyAuthRequest(request, await params);
}

export async function POST(request, { params }) {
  return proxyAuthRequest(request, await params);
}

async function proxyAuthRequest(request, params) {
  try {
    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;
    
    if (!ampUpstreamUrl || !ampUpstreamApiKey) {
      return new Response("Amp upstream not configured", { status: 500 });
    }
    
    const url = new URL(request.url);
    const pathSegments = params?.path ? (Array.isArray(params.path) ? params.path : [params.path]) : [];
    const fullPath = pathSegments.join("/");
    const upstreamUrl = `${ampUpstreamUrl}/auth/${fullPath}${url.search}`;
    
    console.log(`[Auth Proxy] ${request.method} ${upstreamUrl}`);
    
    // Build headers - forward cookies and auth
    const headers = {
      "Authorization": `Bearer ${ampUpstreamApiKey}`,
    };
    
    const contentType = request.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;
    
    const accept = request.headers.get("accept");
    if (accept) headers["Accept"] = accept;
    
    const cookie = request.headers.get("cookie");
    if (cookie) headers["Cookie"] = cookie;
    
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
        let rewrittenLocation = location;
        if (location.startsWith("/")) {
          rewrittenLocation = `${url.origin}${location}`;
        } else {
          rewrittenLocation = location.replace(ampUpstreamUrl, url.origin);
        }
        console.log(`[Auth Proxy] Redirect: ${location} -> ${rewrittenLocation}`);
        
        // Forward Set-Cookie headers
        const responseHeaders = new Headers();
        responseHeaders.set("Location", rewrittenLocation);
        const setCookies = response.headers.getSetCookie();
        setCookies.forEach(cookie => responseHeaders.append("Set-Cookie", cookie));
        
        return new Response(null, {
          status: response.status,
          headers: responseHeaders,
        });
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
        .replace(/src="\/(?!api)/g, `src="${url.origin}/`)
        .replace(/action="\/auth/g, `action="${url.origin}/auth`);
    }
    
    // Forward Set-Cookie headers
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", responseContentType);
    responseHeaders.set("Cache-Control", "no-cache");
    const setCookies = response.headers.getSetCookie();
    setCookies.forEach(cookie => responseHeaders.append("Set-Cookie", cookie));
    
    return new Response(finalBody, {
      status: response.status,
      headers: responseHeaders,
    });
    
  } catch (error) {
    console.error("[Auth Proxy] Error:", error);
    return new Response(error.message, { status: 500 });
  }
}
