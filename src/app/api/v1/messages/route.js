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
    console.log("[SSE] Translators initialized for /v1/messages");
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

/**
 * POST /v1/messages - Claude format (auto convert via handleChat)
 */
export async function POST(request) {
  await ensureInitialized();
  const isInternalProxy = request.headers.get("x-internal-proxy") === "true";

  // Debug: Log incoming request for Librarian
  try {
    const clonedRequest = request.clone();
    const body = await clonedRequest.json();
    const model = body?.model || "unknown";
    
    // Check if this is a Librarian-related request
    const isLibrarian = 
      model.includes("sonnet") || 
      model.includes("librarian") ||
      String(body?.system || "").toLowerCase().includes("librarian") ||
      String(body?.metadata?.agent || "").includes("librarian");

    if (isLibrarian) {
      const headers = {};
      for (const [key, value] of request.headers.entries()) {
        if (key.toLowerCase().includes("auth") || key.toLowerCase().includes("api-key")) {
          headers[key] = value ? String(value).slice(0, 20) + "..." : "(empty)";
        } else {
          headers[key] = value;
        }
      }

      console.log("\n" + "=".repeat(80));
      console.log("[LIBRARIAN DEBUG] /v1/messages");
      console.log("=".repeat(80));
      console.log("Model:", model);
      console.log("Internal Proxy:", isInternalProxy);
      console.log("Headers:", JSON.stringify(headers, null, 2));
      
      const bodyPreview = { ...body };
      if (bodyPreview.messages?.length > 3) {
        bodyPreview.messages = [...bodyPreview.messages.slice(0, 2), `... (${bodyPreview.messages.length - 2} more)`];
      }
      if (bodyPreview.tools?.length > 3) {
        bodyPreview.tools = [...bodyPreview.tools.slice(0, 2), `... (${bodyPreview.tools.length - 2} more)`];
      }
      console.log("Body:", JSON.stringify(bodyPreview, null, 2).slice(0, 2000));
      console.log("=".repeat(80) + "\n");
    }
  } catch (e) {
    // Ignore errors in debug logging
  }

  return await handleChat(request);
}

