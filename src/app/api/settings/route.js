import { NextResponse } from "next/server";
import { getSettings, updateSettings, getApiKeys } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { redactSearchProviders, sanitizeSearchProviders } from "@/lib/searchProvidersSettings";
import bcrypt from "bcryptjs";

/**
 * Amp CLI Settings API
 * 
 * For codeHostConnections: proxy to ampcode.com using user's API key
 * AMP CLI polls this endpoint to check GitHub connection status
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const keys = url.searchParams.get("keys");
    
    const settings = await getSettings();
    const { ampUpstreamUrl } = settings;
    
    // If requesting code host connections, proxy to ampcode.com using user's token
    if (keys && (keys.includes("codeHost") || keys.includes("github") || keys.includes("gitlab"))) {
      console.log(`[Settings] Proxying code host connections request to upstream`);
      
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
      
      if (!ampUpstreamUrl) {
        return NextResponse.json({ error: "Amp upstream not configured" }, { status: 500 });
      }
      
      try {
        const upstreamUrl = `${ampUpstreamUrl}/api/settings?keys=${encodeURIComponent(keys)}`;
        
        const response = await fetch(upstreamUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${userApiKey}`,
            "Accept": "application/json",
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`[Settings] Got code host connections from upstream`);
          return NextResponse.json(data);
        } else {
          console.log(`[Settings] Upstream error: ${response.status}`);
          return NextResponse.json(
            { error: `Upstream error: ${response.status}` },
            { status: response.status }
          );
        }
      } catch (err) {
        console.error(`[Settings] Failed to proxy to upstream:`, err.message);
        return NextResponse.json(
          { error: `Failed to connect to upstream: ${err.message}` },
          { status: 502 }
        );
      }
    }
    
    // Return local settings
    const { password, ...safeSettings } = settings;
    const redactedSettings = {
      ...safeSettings,
      searchProviders: redactSearchProviders(safeSettings.searchProviders),
    };
    
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";
    
    return NextResponse.json({ 
      ...redactedSettings, 
      enableRequestLogs,
      enableTranslator,
      hasPassword: !!password
    });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    // If updating password, hash it
    if (body.newPassword) {
      const settings = await getSettings();
      const currentHash = settings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      } else {
        // First time setting password, no current password needed
        // Allow empty currentPassword or default "123456"
        if (body.currentPassword && body.currentPassword !== "123456") {
           return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      delete body.newPassword;
      delete body.currentPassword;
    }

    if (body.searchProviders !== undefined) {
      try {
        body.searchProviders = sanitizeSearchProviders(body.searchProviders);
      } catch (validationError) {
        return NextResponse.json({ error: validationError.message }, { status: 400 });
      }
    }

    const settings = await updateSettings(body);

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }
    const { password, ...safeSettings } = settings;
    return NextResponse.json(safeSettings);
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
