import { NextResponse } from "next/server";
import { getSettings, getApiKeys, getProviderConnections } from "@/lib/localDb";

/**
 * Code Host Connections API
 * 
 * Returns GitHub/GitLab connection status from local DB
 * AMP CLI polls this endpoint to check if GitHub is connected
 * 
 * Connection is established via /api/oauth/github-code-host/device-code flow
 */
export async function GET(request) {
  try {
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
      || userApiKey === "sk-9router-local"  // For local settings page
      || userApiKey.startsWith("sgamp_");
    
    if (!validKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    
    // Get GitHub code host connection from local DB
    const githubConnections = await getProviderConnections({ 
      provider: "github-code-host", 
      isActive: true 
    });
    
    const githubConnection = githubConnections[0];
    
    // Get GitHub login from connection
    const githubLogin = githubConnection?.providerSpecificData?.githubLogin 
      || githubConnection?.name 
      || null;
    
    const githubConnected = !!githubConnection && !!githubLogin;
    
    return NextResponse.json({
      codeHostConnections: {
        github: githubConnected ? {
          connected: true,
          login: githubLogin,
          name: githubConnection?.providerSpecificData?.githubName || githubLogin,
          email: githubConnection?.providerSpecificData?.githubEmail || null,
          avatarUrl: githubConnection?.providerSpecificData?.githubAvatarUrl || null,
        } : { connected: false },
        gitlab: { connected: false },
      },
      github: { 
        connected: githubConnected,
        login: githubLogin,
      },
      gitlab: { connected: false },
    });
  } catch (error) {
    console.error("[Code Host] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
