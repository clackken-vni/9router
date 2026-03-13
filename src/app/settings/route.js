import { NextResponse } from "next/server";

/**
 * Amp CLI Settings Page Proxy
 * 
 * Proxies ALL /settings requests to ampcode.com
 * This includes HTML page and any API calls for code host connections
 * 
 * Amp CLI opens: http://localhost:20127/settings#code-host-connections
 * We proxy to: https://ampcode.com/settings#code-host-connections
 */

export async function GET(request) {
  try {
    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;
    
    if (!ampUpstreamUrl || !ampUpstreamApiKey) {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head><title>Settings - Not Configured</title></head>
        <body style="background:#1a1a2e;color:#fff;font-family:system-ui;padding:2rem;">
          <h1>Amp Upstream Not Configured</h1>
          <p>Please configure ampUpstreamUrl and ampUpstreamApiKey in 9router Settings.</p>
          <p><a href="/" style="color:#00d9ff">Go to 9router Dashboard</a></p>
        </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html" },
      });
    }
    
    const url = new URL(request.url);
    const upstreamUrl = `${ampUpstreamUrl}${url.pathname}${url.search}`;
    
    console.log(`[Settings Proxy] Proxying to: ${upstreamUrl}`);
    
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${ampUpstreamApiKey}`,
        "Accept": request.headers.get("accept") || "text/html",
        "User-Agent": request.headers.get("user-agent") || "9Router/1.0",
        "Cookie": request.headers.get("cookie") || "",
      },
      redirect: "manual", // Don't follow redirects automatically
    });
    
    // Handle redirects (for OAuth flows)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        // Handle relative URLs - prepend origin
        let rewrittenLocation = location;
        if (location.startsWith("/")) {
          rewrittenLocation = `${url.origin}${location}`;
        } else {
          rewrittenLocation = location.replace(ampUpstreamUrl, url.origin);
        }
        console.log(`[Settings Proxy] Redirect: ${location} -> ${rewrittenLocation}`);
        
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
    
    const contentType = response.headers.get("content-type") || "text/html";
    const body = await response.text();
    
    // Rewrite any absolute URLs in HTML to go through proxy
    let rewrittenBody = body;
    if (contentType.includes("text/html")) {
      rewrittenBody = body
        .replace(new RegExp(ampUpstreamUrl, "g"), url.origin)
        .replace(/href="\/(?!api)/g, `href="${url.origin}/`)
        .replace(/src="\/(?!api)/g, `src="${url.origin}/`);
    }
    
    // Forward Set-Cookie headers
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Cache-Control", "no-cache");
    const setCookies = response.headers.getSetCookie();
    setCookies.forEach(cookie => responseHeaders.append("Set-Cookie", cookie));
    
    return new Response(rewrittenBody, {
      status: response.status,
      headers: responseHeaders,
    });
    
  } catch (error) {
    console.error("[Settings Proxy] Error:", error);
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head><title>Settings Error</title></head>
      <body style="background:#1a1a2e;color:#fff;font-family:system-ui;padding:2rem;">
        <h1>Settings Proxy Error</h1>
        <p style="color:#ff6b6b">${error.message}</p>
        <p><a href="/" style="color:#00d9ff">Go to 9router Dashboard</a></p>
      </body>
      </html>
    `, {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }
}

// Also handle POST for settings updates
export async function POST(request) {
  try {
    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;
    
    if (!ampUpstreamUrl || !ampUpstreamApiKey) {
      return NextResponse.json({ error: "Amp upstream not configured" }, { status: 500 });
    }
    
    const url = new URL(request.url);
    const upstreamUrl = `${ampUpstreamUrl}${url.pathname}${url.search}`;
    
    const body = await request.text();
    
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ampUpstreamApiKey}`,
        "Content-Type": request.headers.get("content-type") || "application/json",
        "Accept": request.headers.get("accept") || "application/json",
      },
      body,
    });
    
    const contentType = response.headers.get("content-type") || "application/json";
    const responseBody = await response.text();
    
    return new Response(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
      },
    });
    
  } catch (error) {
    console.error("[Settings Proxy] POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
