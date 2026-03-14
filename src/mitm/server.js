const https = require("https");
const fs = require("fs");
const path = require("path");
const dns = require("dns");
const crypto = require("crypto");
const { promisify } = require("util");

const INTERNAL_REQUEST_HEADER = { name: "x-request-source", value: "local" };
const CORRELATION_HEADERS = {
  sessionId: "x-9router-session-id",
  traceId: "x-9router-trace-id",
  spanId: "x-9router-span-id",
  parentSpanId: "x-9router-parent-span-id",
};

const AMP_OBS_DIR = path.join(__dirname, "../../logs/amp-sessions");

// All intercepted domains across all tools
const TARGET_HOSTS = [
  "daily-cloudcode-pa.googleapis.com",
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.sandbox.googleapis.com",
  "api.individual.githubcopilot.com",
];

const LOCAL_PORT = 443;
const ROUTER_PORT = process.env.ROUTER_PORT || process.env.PORT || "20127";
// Strip any path from ROUTER_URL (legacy values may include /v1/chat/completions)
const _rawRouterUrl = process.env.ROUTER_URL || `http://localhost:${ROUTER_PORT}`;
const ROUTER_BASE = _rawRouterUrl.replace(/\/v1\/.*$/, "");
const ROUTER_CHAT_URL = `${ROUTER_BASE}/v1/chat/completions`;
const ROUTER_RESPONSES_URL = `${ROUTER_BASE}/v1/responses`;
const API_KEY = process.env.ROUTER_API_KEY;
const { DATA_DIR, MITM_DIR } = require("./paths");
const DB_FILE = path.join(DATA_DIR, "db.json");

const ENABLE_FILE_LOG = false;

if (!API_KEY) {
  console.error("❌ ROUTER_API_KEY required");
  process.exit(1);
}

const { getCertForDomain } = require("./cert/generate");
const { generateRootCA } = require("./cert/rootCA");

// Certificate cache for performance
const certCache = new Map();

// SNI callback for dynamic certificate generation
function sniCallback(servername, cb) {
  try {
    // Check cache first
    if (certCache.has(servername)) {
      const cached = certCache.get(servername);
      return cb(null, cached);
    }

    // Generate new cert for this domain
    const certData = getCertForDomain(servername);
    if (!certData) {
      return cb(new Error(`Failed to generate cert for ${servername}`));
    }

    // Create secure context
    const ctx = require("tls").createSecureContext({
      key: certData.key,
      cert: certData.cert
    });

    // Cache it
    certCache.set(servername, ctx);
    console.log(`✅ Generated cert for: ${servername}`);

    cb(null, ctx);
  } catch (error) {
    console.error(`❌ SNI error for ${servername}:`, error.message);
    cb(error);
  }
}

// Load Root CA for default context
const certDir = MITM_DIR;
const rootCAKeyPath = path.join(certDir, "rootCA.key");
const rootCACertPath = path.join(certDir, "rootCA.crt");

let sslOptions;
try {
  sslOptions = {
    key: fs.readFileSync(rootCAKeyPath),
    cert: fs.readFileSync(rootCACertPath),
    SNICallback: sniCallback
  };
} catch (e) {
  console.error(`❌ Root CA not found in ${certDir}: ${e.message}`);
  process.exit(1);
}

// Antigravity: Gemini generateContent endpoints
const ANTIGRAVITY_URL_PATTERNS = [":generateContent", ":streamGenerateContent"];
// Copilot: OpenAI-compatible + Anthropic endpoints
const COPILOT_URL_PATTERNS = ["/chat/completions", "/v1/messages", "/responses"];

const LOG_DIR = path.join(__dirname, "../../logs/mitm");
if (ENABLE_FILE_LOG && !fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function sanitizeHeaders(headers = {}) {
  const out = {};
  for (const [key, val] of Object.entries(headers || {})) {
    if (/(authorization|cookie|token|api-key|password|secret)/i.test(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = String(val).length > 300 ? `${String(val).slice(0, 300)}...[truncated]` : val;
  }
  return out;
}

function sanitizeBodyBuffer(buffer) {
  if (!buffer || !buffer.length) return undefined;
  const raw = buffer.toString();
  if (raw.length > 2000) {
    return {
      preview: raw.slice(0, 2000),
      size: raw.length,
      sha256: crypto.createHash("sha256").update(raw).digest("hex"),
      truncated: true,
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function resolveCorrelationFromReq(req) {
  const headers = req.headers || {};
  const session_id = headers[CORRELATION_HEADERS.sessionId] || newId("sess");
  const trace_id = headers[CORRELATION_HEADERS.traceId] || newId("tr");
  const parent_span_id = headers[CORRELATION_HEADERS.spanId] || headers[CORRELATION_HEADERS.parentSpanId] || null;
  const span_id = newId("sp");
  return { session_id, trace_id, parent_span_id, span_id };
}

function resolveSessionLogPath(sessionId) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const startedAt = now.toISOString().replace(/[:.]/g, "-");
  const dir = path.join(AMP_OBS_DIR, day);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${startedAt}__${sessionId}.jsonl`);
}

const mitmSessionPaths = new Map();
function getSessionLogPath(sessionId) {
  if (mitmSessionPaths.has(sessionId)) return mitmSessionPaths.get(sessionId);
  const p = resolveSessionLogPath(sessionId);
  mitmSessionPaths.set(sessionId, p);
  return p;
}

function emitMitmEvent(context, payload = {}) {
  try {
    const filePath = getSessionLogPath(context.session_id);
    const line = {
      timestamp: new Date().toISOString(),
      session_id: context.session_id,
      trace_id: context.trace_id,
      span_id: payload.span_id || context.span_id || newId("sp"),
      parent_span_id: payload.parent_span_id || context.parent_span_id || null,
      event: payload.event,
      status: payload.status || "ok",
      component: "mitm.server",
      source: payload.source || "mitm",
      model: payload.model,
      tool: payload.tool,
      io: payload.io,
      timing: payload.timing,
      error: payload.error,
      meta: payload.meta,
    };
    fs.appendFileSync(filePath, `${JSON.stringify(line)}\n`, "utf8");
  } catch {}
}

function createChildContext(parentContext = {}) {
  return {
    session_id: parentContext.session_id || newId("sess"),
    trace_id: parentContext.trace_id || newId("tr"),
    parent_span_id: parentContext.span_id || null,
    span_id: newId("sp"),
  };
}

function saveRequestLog(url, bodyBuffer) {
  if (!ENABLE_FILE_LOG) return;
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const urlSlug = url.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 60);
    const filePath = path.join(LOG_DIR, `${ts}_${urlSlug}.json`);
    const body = JSON.parse(bodyBuffer.toString());
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2));
  } catch { /* ignore */ }
}

const cachedTargetIPs = {};
async function resolveTargetIP(hostname) {
  if (cachedTargetIPs[hostname]) return cachedTargetIPs[hostname];
  const resolver = new dns.Resolver();
  resolver.setServers(["8.8.8.8"]);
  const resolve4 = promisify(resolver.resolve4.bind(resolver));
  const addresses = await resolve4(hostname);
  cachedTargetIPs[hostname] = addresses[0];
  return cachedTargetIPs[hostname];
}

function collectBodyRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Extract model from URL path (Gemini) or body (OpenAI/Anthropic)
function extractModel(url, body) {
  const urlMatch = url.match(/\/models\/([^/:]+)/);
  if (urlMatch) return urlMatch[1];
  try { return JSON.parse(body.toString()).model || null; } catch { return null; }
}

function normalizeModelKey(name) {
  if (!name) return "";
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/[\s_]+/g, "-");
}

function getMappedModel(tool, model) {
  if (!model) return null;
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    const toolMappings = db.mitmAlias?.[tool] || {};
    const meta = toolMappings.__meta__ || {};

    if (toolMappings[model]) return toolMappings[model];

    const normalizedModel = normalizeModelKey(model);
    for (const [alias, target] of Object.entries(toolMappings)) {
      if (alias === "__meta__") continue;
      if (normalizeModelKey(alias) === normalizedModel) {
        return target;
      }
    }

    if (meta.alwaysFallbackEnabled && meta.alwaysFallbackModel) {
      return meta.alwaysFallbackModel;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Determine which tool this request belongs to based on hostname
 */
function getToolForHost(host) {
  const h = (host || "").split(":")[0];
  if (h === "api.individual.githubcopilot.com") return "copilot";
  if (h === "daily-cloudcode-pa.googleapis.com" || h === "cloudcode-pa.googleapis.com" || h === "daily-cloudcode-pa.sandbox.googleapis.com") return "antigravity";
  return null;
}

async function passthrough(req, res, bodyBuffer, context = {}) {
  const startAt = Date.now();
  const targetHost = (req.headers.host || TARGET_HOSTS[0]).split(":")[0];
  const targetIP = await resolveTargetIP(targetHost);

  emitMitmEvent(context, {
    event: "mitm.intercept.passthrough",
    source: "mitm",
    tool: { name: getToolForHost(req.headers.host) || "unknown" },
    io: {
      input: {
        method: req.method,
        host: req.headers.host,
        url: req.url,
        headers: sanitizeHeaders(req.headers),
        body: sanitizeBodyBuffer(bodyBuffer),
      },
    },
    meta: { target_host: targetHost, target_ip: targetIP },
  });

  const forwardReq = https.request({
    hostname: targetIP,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: targetHost },
    servername: targetHost,
    rejectUnauthorized: false
  }, (forwardRes) => {
    emitMitmEvent(context, {
      event: "mitm.intercept.end",
      source: "mitm",
      tool: { name: getToolForHost(req.headers.host) || "unknown" },
      timing: { duration_ms: Date.now() - startAt },
      meta: { mode: "passthrough", status_code: forwardRes.statusCode || 200 },
    });
    res.writeHead(forwardRes.statusCode, forwardRes.headers);
    forwardRes.pipe(res);
  });

  forwardReq.on("error", (err) => {
    emitMitmEvent(context, {
      event: "mitm.intercept.error",
      status: "error",
      source: "mitm",
      tool: { name: getToolForHost(req.headers.host) || "unknown" },
      timing: { duration_ms: Date.now() - startAt },
      error: { message: err.message },
      meta: { mode: "passthrough" },
    });
    console.error(`❌ Passthrough error: ${err.message}`);
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad Gateway");
  });

  if (bodyBuffer.length > 0) forwardReq.write(bodyBuffer);
  forwardReq.end();
}

async function intercept(req, res, bodyBuffer, mappedModel, context = {}) {
  const startAt = Date.now();
  try {
    const body = JSON.parse(bodyBuffer.toString());

    if (req.url.includes(":streamGenerateContent")) {
      body.stream = true;
    }

    const isResponsesApi = req.url.includes("/responses");
    const routerUrl = isResponsesApi ? ROUTER_RESPONSES_URL : ROUTER_CHAT_URL;

    console.log("[MITM Server] Request stream mode:", body.stream);
    body.model = mappedModel;

    const downstreamHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      [CORRELATION_HEADERS.sessionId]: context.session_id,
      [CORRELATION_HEADERS.traceId]: context.trace_id,
      [CORRELATION_HEADERS.parentSpanId]: context.span_id,
      [CORRELATION_HEADERS.spanId]: newId("sp"),
    };

    emitMitmEvent(context, {
      event: "mitm.intercept.forward",
      source: "mitm",
      model: { raw: mappedModel },
      tool: { name: getToolForHost(req.headers.host) || "unknown" },
      io: {
        input: {
          original_model: extractModel(req.url, bodyBuffer),
          mapped_model: mappedModel,
          stream: !!body.stream,
          body: sanitizeBodyBuffer(Buffer.from(JSON.stringify(body))),
        },
      },
      meta: {
        target_host: req.headers.host,
        router_url: routerUrl,
      },
    });

    const response = await fetch(routerUrl, {
      method: "POST",
      headers: downstreamHeaders,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`9Router ${response.status}: ${errText}`);
    }

    console.log("[MITM Server] 9Router response status:", response.status);
    console.log("[MITM Server] 9Router response headers:", Object.fromEntries(response.headers.entries()));

    const ct = response.headers.get("content-type") || "application/json";
    const resHeaders = { "Content-Type": ct, "Cache-Control": "no-cache", "Connection": "keep-alive" };
    if (ct.includes("text/event-stream")) resHeaders["X-Accel-Buffering"] = "no";
    res.writeHead(200, resHeaders);

    let streamedBytes = 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) { res.end(); break; }
      streamedBytes += value?.byteLength || 0;
      res.write(decoder.decode(value, { stream: true }));
    }

    emitMitmEvent(context, {
      event: "mitm.intercept.end",
      source: "mitm",
      model: { raw: mappedModel },
      tool: { name: getToolForHost(req.headers.host) || "unknown" },
      timing: { duration_ms: Date.now() - startAt },
      meta: { mode: "intercept", status_code: response.status, streamed_bytes: streamedBytes },
    });
  } catch (error) {
    emitMitmEvent(context, {
      event: "mitm.intercept.error",
      status: "error",
      source: "mitm",
      model: { raw: mappedModel || null },
      tool: { name: getToolForHost(req.headers.host) || "unknown" },
      timing: { duration_ms: Date.now() - startAt },
      error: { message: error.message },
      meta: { mode: "intercept" },
    });
    console.error(`❌ ${error.message}`);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
  }
}

// Main async initialization
(async () => {
  try {
    // Ensure Root CA exists before starting server
    await generateRootCA();
  } catch (error) {
    console.error("❌ Failed to generate Root CA:", error.message);
    process.exit(1);
  }

  const server = https.createServer(sslOptions, async (req, res) => {
    console.log(`[MITM Server] Incoming: ${req.method} ${req.headers.host}${req.url}`);

    if (req.url === "/_mitm_health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, pid: process.pid }));
      return;
    }

    const baseContext = resolveCorrelationFromReq(req);
    emitMitmEvent(baseContext, {
      event: "mitm.intercept.start",
      source: "mitm",
      tool: { name: getToolForHost(req.headers.host) || "unknown" },
      io: {
        input: {
          method: req.method,
          host: req.headers.host,
          url: req.url,
          headers: sanitizeHeaders(req.headers),
        },
      },
      meta: { internal_request: req.headers[INTERNAL_REQUEST_HEADER.name] === INTERNAL_REQUEST_HEADER.value },
    });

    const bodyBuffer = await collectBodyRaw(req);
    if (bodyBuffer.length > 0) saveRequestLog(req.url, bodyBuffer);

    if (req.headers[INTERNAL_REQUEST_HEADER.name] === INTERNAL_REQUEST_HEADER.value) {
      return passthrough(req, res, bodyBuffer, createChildContext(baseContext));
    }

    const tool = getToolForHost(req.headers.host);
    if (!tool) return passthrough(req, res, bodyBuffer, createChildContext(baseContext));

    const isChat = tool === "antigravity"
      ? ANTIGRAVITY_URL_PATTERNS.some(p => req.url.includes(p))
      : COPILOT_URL_PATTERNS.some(p => req.url.includes(p));

    if (!isChat) return passthrough(req, res, bodyBuffer, createChildContext(baseContext));

    const model = extractModel(req.url, bodyBuffer);
    console.log("[MITM Server] Extracted model:", model);
    const mappedModel = getMappedModel(tool, model);
    console.log("[MITM Server] Mapped model:", mappedModel);

    if (!mappedModel) {
      console.log("[MITM Server] No mapping found, using passthrough");
      return passthrough(req, res, bodyBuffer, createChildContext(baseContext));
    }

    console.log("[MITM Server] Intercepting request, replacing model:", model, "→", mappedModel);
    return intercept(req, res, bodyBuffer, mappedModel, createChildContext(baseContext));
  });

  server.listen(LOCAL_PORT, () => {
    console.log(`🚀 MITM ready on :${LOCAL_PORT}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`❌ Port ${LOCAL_PORT} already in use`);
    } else if (error.code === "EACCES") {
      console.error(`❌ Permission denied for port ${LOCAL_PORT}`);
    } else {
      console.error(`❌ ${error.message}`);
    }
    process.exit(1);
  });

  const shutdown = () => { server.close(() => process.exit(0)); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  if (process.platform === "win32") {
    process.on("SIGBREAK", shutdown);
  }
})();
