import { callCloudWithMachineId } from "@/shared/utils/cloud.js";
import { handleChat } from "@/sse/handlers/chat.js";
import { initTranslators } from "open-sse/translator/index.js";

let initialized = false;

/**
 * Initialize translators once
 */
async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
    console.log("[SSE] Translators initialized");
  }
}

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

export async function POST(request) {  
  // Debug: Log ALL incoming requests
  try {
    const clonedRequest = request.clone();
    const body = await clonedRequest.json();
    const model = body?.model || "unknown";
    
    // Log all requests for debugging
    console.log("\n" + "=".repeat(60));
    console.log(`[REQUEST] /v1/chat/completions | Model: ${model}`);
    console.log("=".repeat(60));
    
    // Log key headers
    const auth = request.headers.get("authorization");
    const xApiKey = request.headers.get("x-api-key");
    const userAgent = request.headers.get("user-agent");
    const host = request.headers.get("host");
    
    console.log("Host:", host);
    console.log("User-Agent:", userAgent);
    if (auth) console.log("Authorization:", auth.slice(0, 20) + "...");
    if (xApiKey) console.log("X-API-Key:", xApiKey.slice(0, 20) + "...");
    
    // Log body summary
    console.log("Messages:", body.messages?.length || 0);
    console.log("Tools:", body.tools?.length || 0);
    console.log("Stream:", body.stream);
    
    // Check for librarian indicators
    const isLibrarian = 
      model.includes("sonnet") || 
      model.includes("librarian") ||
      String(body?.system || "").toLowerCase().includes("librarian") ||
      String(body?.metadata?.agent || "").includes("librarian");
    
    if (isLibrarian) {
      console.log("\n>>> LIBRARIAN REQUEST DETECTED <<<");
      console.log("Full body:", JSON.stringify(body, null, 2).slice(0, 3000));
    }
    console.log("=".repeat(60) + "\n");
  } catch (e) {
    console.log("[DEBUG] Error logging request:", e.message);
  }

  // Fallback to local handling
  await ensureInitialized();
  
  return await handleChat(request);
}

