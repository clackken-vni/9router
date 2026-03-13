import { NextResponse } from "next/server";
import { getSettings, getApiKeys } from "@/lib/localDb";

/**
 * Code Host Connections API
 * 
 * Returns GitHub/GitLab connection status by checking /api/user
 * AMP CLI polls this endpoint to check if GitHub is connected
 */
export async function GET(request) {
  try {
    const settings = await getSettings();
    const { ampUpstreamUrl } = settings;
    
    // Get user's API key from request
    const authHeader = request.headers.get("authorization");
    const userApiKey = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : "";
    
    if (!userApiKey) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 });
    }
    
    // Validate API key locally
    const apiKeys = await getApiKeys();
    const validKey = apiKeys.find(k => k.key === userApiKey && k.isActive !== false)
      || userApiKey === "sk_9router"
      || userApiKey.startsWith("sgamp_");
    
    if (!validKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    
    // For sgamp_ keys, check githubLogin from ampcode.com
    if (userApiKey.startsWith("sgamp_") && ampUpstreamUrl) {
      try {
        const response = await fetch(`${ampUpstreamUrl}/api/user`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${userApiKey}`,
            "Accept": "application/json",
          },
        });
        
        if (response.ok) {
          const userData = await response.json();
          const githubLogin = userData.githubLogin;
          const gitlabLogin = userData.gitlabLogin || null;
          
          return NextResponse.json({
            codeHostConnections: {
              github: githubLogin ? {
                connected: true,
                login: githubLogin,
              } : { connected: false },
              gitlab: gitlabLogin ? {
                connected: true,
                login: gitlabLogin,
              } : { connected: false },
            },
            github: { 
              connected: !!githubLogin,
              login: githubLogin || null,
            },
            gitlab: { 
              connected: !!gitlabLogin,
              login: gitlabLogin || null,
            },
          });
        }
      } catch (err) {
        console.error(`[Code Host] Failed to fetch from upstream:`, err.message);
      }
    }
    
    // Fallback: return not connected
    return NextResponse.json({
      codeHostConnections: {
        github: { connected: false },
        gitlab: { connected: false },
      },
      github: { connected: false },
      gitlab: { connected: false },
    });
  } catch (error) {
    console.error("[Code Host] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
