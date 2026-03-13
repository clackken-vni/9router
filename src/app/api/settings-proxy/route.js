import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";

/**
 * Amp CLI Settings Proxy
 * Proxies /api/settings requests to ampcode.com when needed
 * 
 * This handles:
 * - Code host connections (GitHub, GitLab, etc.)
 * - User preferences synced with ampcode.com
 */

// Settings keys that should be proxied to ampcode.com
const UPSTREAM_SETTINGS_KEYS = [
  "codeHostConnections",
  "githubConnections", 
  "gitlabConnections",
  "codeHostTokens",
];

export async function GET(request) {
  try {
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;
    
    // Check if this is a request for code host connections
    const url = new URL(request.url);
    const keys = url.searchParams.get("keys");
    
    // If requesting code host connections, proxy to ampcode.com
    if (keys && UPSTREAM_SETTINGS_KEYS.some(k => keys.includes(k))) {
      if (!ampUpstreamUrl || !ampUpstreamApiKey) {
        return NextResponse.json({ 
          error: "Amp upstream not configured",
          codeHostConnections: {} 
        }, { status: 500 });
      }
      
      console.log(`[Settings Proxy] Fetching code host connections from upstream`);
      
      const upstreamUrl = `${ampUpstreamUrl}/api/settings?keys=${encodeURIComponent(keys)}`;
      
      const response = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${ampUpstreamApiKey}`,
          "Accept": "application/json",
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      } else {
        console.log(`[Settings Proxy] Upstream error: ${response.status}`);
        return NextResponse.json({ 
          error: "Failed to fetch from upstream",
          codeHostConnections: {} 
        }, { status: response.status });
      }
    }
    
    // Return local settings
    const { password, ...safeSettings } = settings;
    return NextResponse.json(safeSettings);
    
  } catch (error) {
    console.error("[Settings Proxy] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;
    
    // Check if this is updating code host connections
    const hasUpstreamKeys = Object.keys(body).some(k => 
      UPSTREAM_SETTINGS_KEYS.includes(k)
    );
    
    if (hasUpstreamKeys && ampUpstreamUrl && ampUpstreamApiKey) {
      console.log(`[Settings Proxy] Syncing code host connections to upstream`);
      
      const upstreamUrl = `${ampUpstreamUrl}/api/settings`;
      
      const response = await fetch(upstreamUrl, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${ampUpstreamApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    }
    
    // Update local settings
    const { updateSettings } = await import("@/lib/localDb");
    const updatedSettings = await updateSettings(body);
    const { password, ...safeSettings } = updatedSettings;
    
    return NextResponse.json(safeSettings);
    
  } catch (error) {
    console.error("[Settings Proxy] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
