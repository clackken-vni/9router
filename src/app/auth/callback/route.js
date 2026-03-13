import { NextResponse } from "next/server";

/**
 * Amp CLI Auth Callback Proxy
 * 
 * Proxies /auth/callback requests to ampcode.com
 * This is the OAuth callback endpoint after user authenticates
 * 
 * Flow:
 * 1. User clicks "Connect GitHub" from AMP CLI
 * 2. Browser opens http://localhost:20127/settings#code-host-connections
 * 3. User authenticates with GitHub via ampcode.com
 * 4. GitHub redirects to ampcode.com/auth/callback?code=xxx&state=xxx
 * 5. ampcode.com redirects to our proxy: http://localhost:20127/auth/callback?code=xxx&state=xxx
 * 6. We proxy to ampcode.com to complete the OAuth flow
 * 7. AMP CLI receives the result
 */

export async function GET(request) {
  try {
    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;
    
    if (!ampUpstreamUrl || !ampUpstreamApiKey) {
      return new Response("Amp upstream not configured", { status: 500 });
    }
    
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const hash = url.hash; // e.g., #code-host-connections
    
    console.log(`[Auth Callback] Code: ${code?.substring(0, 10)}..., State: ${state?.substring(0, 20)}...`);
    
    // Forward to ampcode.com
    const upstreamUrl = `${ampUpstreamUrl}/auth/callback${url.search}${hash}`;
    
    console.log(`[Auth Callback] Proxying to: ${upstreamUrl}`);
    
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${ampUpstreamApiKey}`,
        "Accept": "text/html,application/json",
        "Cookie": request.headers.get("cookie") || "",
      },
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
        console.log(`[Auth Callback] Redirect: ${location} -> ${rewrittenLocation}`);
        
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
    
    // Rewrite URLs in HTML
    let rewrittenBody = body;
    if (contentType.includes("text/html")) {
      rewrittenBody = body
        .replace(new RegExp(ampUpstreamUrl, "g"), url.origin)
        .replace(/href="\/(?!api)/g, `href="${url.origin}/`)
        .replace(/src="\/(?!api)/g, `src="${url.origin}/`)
        .replace(/action="\/auth/g, `action="${url.origin}/auth`);
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
    console.error("[Auth Callback] Error:", error);
    return new Response(error.message, { status: 500 });
  }
}
