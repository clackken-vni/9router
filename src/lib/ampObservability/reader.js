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

function matchesText(actual, expected) {
  if (!expected) return true;
  return String(actual || "").toLowerCase().includes(String(expected || "").toLowerCase());
}

function matchesFilter(event, filters) {
  if (!matchesText(event.status, filters.status)) return false;
  if (!matchesText(event.component, filters.component)) return false;
  if (!matchesText(event.source, filters.source)) return false;
  if (!matchesText(event.event, filters.event)) return false;
  if (!matchesText(event.session_id, filters.session_id)) return false;
  if (!matchesText(event.trace_id, filters.trace_id)) return false;
  if (!matchesText(event.request_id, filters.request_id)) return false;
  if (!matchesText(event.route_id, filters.route_id)) return false;
  if (!matchesText(event.tool_call_id, filters.tool_call_id)) return false;
  if (!matchesText(event?.tool?.method, filters.tool_method)) return false;
  if (!matchesText(event?.model?.name, filters.model)) return false;
  if (!matchesText(event?.model?.provider, filters.provider)) return false;

  if (filters.from) {
    const ts = parseDate(event.timestamp);
    if (!ts || ts < filters.from) return false;
  }
  if (filters.to) {
    const ts = parseDate(event.timestamp);
    if (!ts || ts > filters.to) return false;
  }

  if (filters.q) {
    const hay = JSON.stringify(event || {}).toLowerCase();
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
  const FACET_LIMIT = 200;
  const facetSets = {
    status: new Set(),
    component: new Set(),
    source: new Set(),
    event: new Set(),
    session_id: new Set(),
    trace_id: new Set(),
    request_id: new Set(),
    route_id: new Set(),
    tool_call_id: new Set(),
    tool_method: new Set(),
    model: new Set(),
    provider: new Set(),
  };

  const addFacet = (name, value) => {
    if (!value) return;
    const set = facetSets[name];
    if (!set || set.size >= FACET_LIMIT) return;
    set.add(String(value));
  };

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

      addFacet("status", event.status);
      addFacet("component", event.component);
      addFacet("source", event.source);
      addFacet("event", event.event);
      addFacet("session_id", event.session_id);
      addFacet("trace_id", event.trace_id);
      addFacet("request_id", event.request_id);
      addFacet("route_id", event.route_id);
      addFacet("tool_call_id", event.tool_call_id);
      addFacet("tool_method", event?.tool?.method);
      addFacet("model", event?.model?.name);
      addFacet("provider", event?.model?.provider);

      if (!matchesFilter(event, filters)) continue;
      events.push(event);
      if (events.length >= limit) break;
    }
    if (events.length >= limit) break;
  }

  events.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));

  const facets = {
    status: Array.from(facetSets.status).sort(),
    component: Array.from(facetSets.component).sort(),
    source: Array.from(facetSets.source).sort(),
    event: Array.from(facetSets.event).sort(),
    session_id: Array.from(facetSets.session_id).sort(),
    trace_id: Array.from(facetSets.trace_id).sort(),
    request_id: Array.from(facetSets.request_id).sort(),
    route_id: Array.from(facetSets.route_id).sort(),
    tool_call_id: Array.from(facetSets.tool_call_id).sort(),
    tool_method: Array.from(facetSets.tool_method).sort(),
    model: Array.from(facetSets.model).sort(),
    provider: Array.from(facetSets.provider).sort(),
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
