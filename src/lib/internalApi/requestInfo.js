export async function readJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;

  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function deriveInternalMethod(url, body) {
  if (body?.method && typeof body.method === "string") {
    return body.method;
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "_" && key !== "t") {
      return key;
    }
  }
  return null;
}

export function buildRequestInfo(request, url, body, token, params = {}) {
  const userAgent = request?.headers?.get("user-agent") || "(none)";
  const xClient = request?.headers?.get("x-client") || "(none)";
  const xAmp = request?.headers?.get("x-amp-version") || "(none)";

  const isAmpCli = userAgent.toLowerCase().includes("amp")
    || userAgent.toLowerCase().includes("go-http")
    || xClient.toLowerCase().includes("amp");

  const source = isAmpCli
    ? "AMP-CLI"
    : userAgent.includes("Mozilla")
      ? "Browser"
      : userAgent.includes("node")
        ? "Node.js"
        : "Unknown";

  const tokenType = token?.startsWith("sgamp_user")
    ? "sgamp_user"
    : token === "sk_9router"
      ? "sk_9router"
      : token?.startsWith("sk_")
        ? "sk_*"
        : "unknown";

  const path = params.path ? `/${params.path.join("/")}` : "/";
  const internalMethod = deriveInternalMethod(url, body);

  return {
    source,
    httpMethod: request.method,
    path,
    internalMethod,
    query: url.search || "(none)",
    body: body || "(none)",
    userAgent,
    xClient,
    xAmp,
    tokenType,
    tokenPreview: token?.substring(0, 20) + "...",
  };
}
