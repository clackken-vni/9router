import { NextResponse } from "next/server";
import crypto from "crypto";

// In-memory store for auth tokens (in production, use Redis or similar)
const authTokens = new Map();

/**
 * POST /api/amp-auth/start
 * Start Amp CLI login flow - generate auth token
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { ampUpstreamUrl } = body;

    // Generate a random auth token
    const authToken = crypto.randomBytes(32).toString("hex");

    // Store the token with pending status
    authTokens.set(authToken, {
      status: "pending",
      createdAt: Date.now(),
      ampUpstreamUrl: ampUpstreamUrl || "https://ampcode.com",
    });

    // Clean up old tokens (older than 15 minutes)
    const now = Date.now();
    for (const [token, data] of authTokens.entries()) {
      if (now - data.createdAt > 15 * 60 * 1000) {
        authTokens.delete(token);
      }
    }

    return NextResponse.json({
      success: true,
      authToken,
      loginUrl: `${ampUpstreamUrl || "https://ampcode.com"}/auth/cli-login?authToken=${authToken}`,
      expiresIn: 900, // 15 minutes
    });
  } catch (error) {
    console.error("[Amp Auth Start] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start auth flow" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/amp-auth/start
 * Poll for auth result
 */
export async function GET(request) {
  const url = new URL(request.url);
  const authToken = url.searchParams.get("authToken");

  if (!authToken) {
    return NextResponse.json(
      { error: "authToken is required" },
      { status: 400 }
    );
  }

  const tokenData = authTokens.get(authToken);

  if (!tokenData) {
    return NextResponse.json(
      { error: "Invalid or expired auth token" },
      { status: 404 }
    );
  }

  // Check if token expired
  if (Date.now() - tokenData.createdAt > 15 * 60 * 1000) {
    authTokens.delete(authToken);
    return NextResponse.json(
      { error: "Auth token expired" },
      { status: 410 }
    );
  }

  return NextResponse.json({
    status: tokenData.status,
    apiKey: tokenData.apiKey || null,
  });
}

// Export for callback to set the result
export { authTokens };
