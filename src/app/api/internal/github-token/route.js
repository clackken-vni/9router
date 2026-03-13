import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/localDb";

/**
 * GitHub Token Endpoint
 * 
 * Returns GitHub access token for AMP CLI/Librarian
 * AMP CLI may need this to make GitHub API calls directly
 */
export async function GET(request) {
  try {
    // Validate API key
    const authHeader = request.headers.get("authorization");
    const apiKey = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : "";
    
    if (!apiKey) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 });
    }
    
    // Get GitHub connection
    const connections = await getProviderConnections({ 
      provider: "github-code-host", 
      isActive: true 
    });
    
    const connection = connections[0];
    
    if (!connection?.accessToken) {
      return NextResponse.json({ 
        error: "GitHub not connected",
        message: "Please connect your GitHub account at /settings"
      }, { status: 404 });
    }
    
    // Return token info
    return NextResponse.json({
      access_token: connection.accessToken,
      token_type: "bearer",
      scope: "read:user user:email repo",
      login: connection.providerSpecificData?.githubLogin || connection.name,
    });
    
  } catch (error) {
    console.error("[GitHub Token] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
