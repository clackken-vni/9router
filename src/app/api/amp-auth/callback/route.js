import { NextResponse } from "next/server";
import { authTokens } from "../start/route";

/**
 * POST /api/amp-auth/callback
 * Callback endpoint for Amp CLI login
 * Called by the browser after successful authentication
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { authToken, apiKey, error } = body;

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

    if (error) {
      // Auth failed
      tokenData.status = "error";
      tokenData.error = error;
      authTokens.set(authToken, tokenData);
      return NextResponse.json({ success: false, error });
    }

    // Auth successful
    tokenData.status = "completed";
    tokenData.apiKey = apiKey;
    authTokens.set(authToken, tokenData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Amp Auth Callback] Error:", error);
    return NextResponse.json(
      { error: error.message || "Callback failed" },
      { status: 500 }
    );
  }
}
