import fs from "fs";
import path from "path";
import zlib from "zlib";

const ROOT_DIR = path.join(process.cwd(), "logs", "amp-sessions");

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getDayFromDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readLinesFromFile(filePath) {
  try {
    if (filePath.endsWith(".gz")) {
      const compressed = fs.readFileSync(filePath);
      const content = zlib.gunzipSync(compressed).toString("utf8");
      return content.split("\n").filter(Boolean);
    }
    const content = fs.readFileSync(filePath, "utf8");
    return content.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function discoverFiles({ day, from, to }) {
  const days = [];
  if (day) {
    days.push(day);
  } else if (from || to) {
    const start = from || new Date(to);
    const end = to || new Date(from);
    const cur = new Date(start);
    while (cur <= end) {
      days.push(getDayFromDate(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  } else {
    days.push(getDayFromDate(new Date()));
  }

  const out = [];
  for (const d of days) {
    const dirPath = path.join(ROOT_DIR, d);
    const entries = safeReadDir(dirPath);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".jsonl") && !entry.name.endsWith(".jsonl.gz")) continue;
      out.push(path.join(dirPath, entry.name));
    }
  }
  return out.sort().reverse();
}

function matchesFilter(event, filters) {
  if (filters.status && event.status !== filters.status) return false;
  if (filters.component && event.component !== filters.component) return false;
  if (filters.source && event.source !== filters.source) return false;
  if (filters.event && event.event !== filters.event) return false;
  if (filters.session_id && event.session_id !== filters.session_id) return false;
  if (filters.trace_id && event.trace_id !== filters.trace_id) return false;
  if (filters.request_id && event.request_id !== filters.request_id) return false;
  if (filters.route_id && event.route_id !== filters.route_id) return false;
  if (filters.tool_call_id && event.tool_call_id !== filters.tool_call_id) return false;
  if (filters.tool_method && event?.tool?.method !== filters.tool_method) return false;
  if (filters.model && event?.model?.name !== filters.model) return false;
  if (filters.provider && event?.model?.provider !== filters.provider) return false;

  if (filters.from) {
    const ts = parseDate(event.timestamp);
    if (!ts || ts < filters.from) return false;
  }
  if (filters.to) {
    const ts = parseDate(event.timestamp);
    if (!ts || ts > filters.to) return false;
  }

  if (filters.q) {
    const hay = [
      event.event,
      event.component,
      event.source,
      event.request_id,
      event.route_id,
      event.tool_call_id,
      event.error?.message,
      event?.tool?.method,
      event?.model?.name,
      event?.model?.provider,
      JSON.stringify(event.tool || {}),
      JSON.stringify(event.model || {}),
      JSON.stringify(event.request || {}),
      JSON.stringify(event.response || {}),
      JSON.stringify(event.meta || {}),
    ].join(" ").toLowerCase();
    if (!hay.includes(filters.q.toLowerCase())) return false;
  }

  return true;
}

export function queryObservabilityEvents(params = {}) {
  const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 500);
  const filters = {
    day: params.day || "",
    from: parseDate(params.from),
    to: parseDate(params.to),
    q: params.q || "",
    status: params.status || "",
    component: params.component || "",
    source: params.source || "",
    event: params.event || "",
    session_id: params.session_id || "",
    trace_id: params.trace_id || "",
    request_id: params.request_id || "",
    route_id: params.route_id || "",
    tool_call_id: params.tool_call_id || "",
    tool_method: params.tool_method || "",
    model: params.model || "",
    provider: params.provider || "",
  };

  const files = discoverFiles(filters);
  const events = [];
  let scannedLines = 0;
  let malformedLines = 0;

  for (const filePath of files) {
    const lines = readLinesFromFile(filePath);
    for (const line of lines) {
      scannedLines += 1;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        malformedLines += 1;
        continue;
      }
      if (!matchesFilter(event, filters)) continue;
      events.push(event);
      if (events.length >= limit) break;
    }
    if (events.length >= limit) break;
  }

  events.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));

  const unique = (arr) => Array.from(new Set(arr.filter(Boolean))).sort();
  const facets = {
    status: unique(events.map((event) => event.status)),
    component: unique(events.map((event) => event.component)),
    source: unique(events.map((event) => event.source)),
    event: unique(events.map((event) => event.event)),
    session_id: unique(events.map((event) => event.session_id)),
    trace_id: unique(events.map((event) => event.trace_id)),
    request_id: unique(events.map((event) => event.request_id)),
    route_id: unique(events.map((event) => event.route_id)),
    tool_call_id: unique(events.map((event) => event.tool_call_id)),
    tool_method: unique(events.map((event) => event?.tool?.method)),
    model: unique(events.map((event) => event?.model?.name)),
    provider: unique(events.map((event) => event?.model?.provider)),
  };

  return {
    ok: true,
    filters: {
      day: filters.day || null,
      from: filters.from?.toISOString() || null,
      to: filters.to?.toISOString() || null,
      q: filters.q || null,
      status: filters.status || null,
      component: filters.component || null,
      source: filters.source || null,
      event: filters.event || null,
      session_id: filters.session_id || null,
      trace_id: filters.trace_id || null,
      request_id: filters.request_id || null,
      route_id: filters.route_id || null,
      tool_call_id: filters.tool_call_id || null,
      tool_method: filters.tool_method || null,
      model: filters.model || null,
      provider: filters.provider || null,
      limit,
    },
    facets,
    summary: {
      scannedFiles: files.length,
      scannedLines,
      matchedLines: events.length,
      malformedLines,
    },
    files,
    events,
  };
}
