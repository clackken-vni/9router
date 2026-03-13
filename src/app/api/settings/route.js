import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import bcrypt from "bcryptjs";

/**
 * Amp CLI Settings API
 * 
 * Proxies code host connections to ampcode.com when:
 * - User clicks "Connect GitHub" from Amp CLI
 * - Amp CLI requests code host connection status
 * 
 * Query params:
 * - ?keys=codeHostConnections - Fetch from ampcode.com
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const keys = url.searchParams.get("keys");
    
    const settings = await getSettings();
    const { ampUpstreamUrl, ampUpstreamApiKey } = settings;
    
    // If requesting code host connections, proxy to ampcode.com
    if (keys && (keys.includes("codeHost") || keys.includes("github") || keys.includes("gitlab"))) {
      console.log(`[Settings] Proxying code host connections request to upstream`);
      
      if (ampUpstreamUrl && ampUpstreamApiKey) {
        try {
          const upstreamUrl = `${ampUpstreamUrl}/api/settings?keys=${encodeURIComponent(keys)}`;
          
          const response = await fetch(upstreamUrl, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${ampUpstreamApiKey}`,
              "Accept": "application/json",
              "User-Agent": "9Router/1.0",
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log(`[Settings] Got code host connections from upstream`);
            return NextResponse.json(data);
          } else {
            console.log(`[Settings] Upstream error: ${response.status}`);
          }
        } catch (err) {
          console.error(`[Settings] Failed to proxy to upstream:`, err.message);
        }
      }
      
      // Fallback: return empty code host connections
      return NextResponse.json({
        codeHostConnections: {},
        github: { connected: false },
        gitlab: { connected: false },
      });
    }
    
    // Return local settings
    const { password, ...safeSettings } = settings;
    
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";
    
    return NextResponse.json({ 
      ...safeSettings, 
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
