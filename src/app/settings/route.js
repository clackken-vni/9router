import { NextResponse } from "next/server";

/**
 * Amp CLI Settings Redirect
 * 
 * Redirects to ampcode.com/settings for OAuth flows
 * AMP CLI polls /api/settings?keys=codeHostConnections for status
 */
export async function GET(request) {
  try {
    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    const { ampUpstreamUrl } = settings;
    
    if (!ampUpstreamUrl) {
      return new Response("Amp upstream not configured", { status: 500 });
    }
    
    const url = new URL(request.url);
    const hash = url.hash || "#code-host-connections";
    
    // Redirect directly to ampcode.com for OAuth
    // OAuth flow needs to happen on ampcode.com for session/cookie to work
    const redirectUrl = `${ampUpstreamUrl}/settings${hash}`;
    
    console.log(`[Settings] Redirecting to: ${redirectUrl}`);
    
    return Response.redirect(redirectUrl, 302);
  } catch (error) {
    console.error("[Settings] Error:", error);
    return new Response(error.message, { status: 500 });
  }
}

// Also handle POST for settings updates - redirect not applicable
export async function POST(request) {
  return NextResponse.json({ 
    error: "POST to /settings not supported. Use /api/settings for API calls." 
  }, { status: 400 });
}
