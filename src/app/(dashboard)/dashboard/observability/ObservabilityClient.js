"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select } from "@/shared/components";

const viewOptions = [
  { value: "list", label: "List" },
  { value: "timeline", label: "Timeline" },
  { value: "trace", label: "Request Trace" },
];

const filterFieldLabels = {
  status: "Status",
  component: "Component",
  source: "Source",
  event: "Event",
  session_id: "Session ID",
  trace_id: "Trace ID",
  request_id: "Request ID",
  route_id: "Route ID",
  tool_call_id: "Tool Call ID",
  tool_method: "Tool Method",
  model: "Model",
  provider: "Provider",
};

const filterFieldOrder = [
  "status",
  "component",
  "source",
  "event",
  "session_id",
  "trace_id",
  "request_id",
  "route_id",
  "tool_call_id",
  "tool_method",
  "model",
  "provider",
];

const toSelectOptions = (values = []) => [{ value: "", label: "All" }, ...values.map((value) => ({ value, label: value }))];

function getEventDisplayName(evt) {
  if (evt?.event?.startsWith("tool.call") && evt?.tool?.method) {
    return `${evt.event}.${evt.tool.method}`;
  }
  return evt?.event || "-";
}

function formatJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return String(value || "");
  }
}

function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ObservabilityClient() {
  const [filters, setFilters] = useState({
    day: new Date().toISOString().slice(0, 10),
    q: "",
    status: "",
    component: "",
    source: "",
    event: "",
    session_id: "",
    trace_id: "",
    request_id: "",
    route_id: "",
    tool_call_id: "",
    tool_method: "",
    model: "",
    provider: "",
    limit: "200",
  });
  const [viewMode, setViewMode] = useState("list");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({ events: [], summary: {}, files: [], facets: {} });
  const [selectedIdx, setSelectedIdx] = useState(-1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (String(v || "").trim() !== "") params.set(k, String(v));
    });
    return params.toString();
  }, [filters]);

  const groupedByRequest = useMemo(() => {
    const groups = new Map();
    for (const evt of data.events || []) {
      const key = evt.request_id || evt.trace_id || "(no-request-id)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(evt);
    }
    return Array.from(groups.entries()).map(([key, events]) => ({
      key,
      events: events.slice().sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || ""))),
    }));
  }, [data.events]);

  const selectedEvent = selectedIdx >= 0 ? data.events?.[selectedIdx] : null;

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/observability?${queryString}`);
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load observability events");
      }
      setData(json);
      setSelectedIdx(json.events?.length ? 0 : -1);
    } catch (e) {
      setError(e.message || "Failed to load observability events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const applyField = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  const clearFilters = () => {
    setFilters({
      day: new Date().toISOString().slice(0, 10),
      q: "",
      status: "",
      component: "",
      source: "",
      event: "",
      session_id: "",
      trace_id: "",
      request_id: "",
      route_id: "",
      tool_call_id: "",
      tool_method: "",
      model: "",
      provider: "",
      limit: "200",
    });
  };

  const facetKeys = useMemo(() => filterFieldOrder, []);

  const facetSelectOptions = useMemo(() => {
    const entries = {};
    for (const key of facetKeys) {
      entries[key] = toSelectOptions(data.facets?.[key] || []);
    }
    return entries;
  }, [data.facets, facetKeys]);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Observability Logs" subtitle="Filter, trace and inspect captured request/tool events" icon="monitoring">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Input label="Day" type="date" value={filters.day} onChange={applyField("day")} />
          <Input label="Keyword" placeholder="Any keyword in payload/meta/tool/model" value={filters.q} onChange={applyField("q")} />
          {facetKeys.map((field) => (
            <div key={`filter-${field}`} className="flex flex-col gap-1.5">
              <Select
                label={filterFieldLabels[field]}
                value={filters[field]}
                onChange={applyField(field)}
                options={facetSelectOptions[field] || [{ value: "", label: "All" }]}
                placeholder="All"
              />
              <Input
                placeholder={`Type ${filterFieldLabels[field].toLowerCase()}`}
                value={filters[field]}
                onChange={applyField(field)}
              />
            </div>
          ))}
          <Input label="Limit" type="number" min="1" value={filters.limit} onChange={applyField("limit")} />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="primary" icon="filter_alt" onClick={fetchData} loading={loading}>Apply</Button>
          <Button variant="outline" icon="refresh" onClick={fetchData} loading={loading}>Refresh</Button>
          <Button variant="outline" icon="ink_eraser" onClick={clearFilters}>Clear Filters</Button>
          <Button
            variant="outline"
            icon="download"
            disabled={!data.events?.length}
            onClick={() => downloadJson(`observability-${Date.now()}.json`, data.events || [])}
          >
            Export JSON
          </Button>
        </div>
      </Card>

      <Card title="Summary" icon="analytics">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
          <div>Files: <b>{data.summary?.scannedFiles || 0}</b></div>
          <div>Scanned: <b>{data.summary?.scannedLines || 0}</b></div>
          <div>Matched: <b>{data.summary?.matchedLines || 0}</b></div>
          <div>Malformed: <b>{data.summary?.malformedLines || 0}</b></div>
          <div>Requests: <b>{groupedByRequest.length}</b></div>
          <div>View: <b>{viewMode}</b></div>
        </div>
      </Card>

      <Card title="Views" icon="view_agenda">
        <div className="flex flex-wrap gap-2">
          {viewOptions.map((option) => (
            <Button
              key={option.value}
              variant={viewMode === option.value ? "primary" : "outline"}
              onClick={() => setViewMode(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </Card>

      {error ? (
        <Card title="Error" icon="error" className="border border-red-500/40">
          <div className="text-sm text-red-500">{error}</div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title={viewMode === "trace" ? "Request Trace" : "Events"} icon="list_alt" padding="none" className="overflow-hidden xl:col-span-2">
          {loading ? (
            <div className="p-6 text-center text-text-muted">Loading observability events...</div>
          ) : !data.events?.length ? (
            <div className="p-6 text-center text-text-muted">No events found for current filters.</div>
          ) : viewMode === "timeline" ? (
            <div className="p-4 space-y-3">
              {data.events.map((evt, idx) => (
                <button
                  key={`${evt.event_id || evt.timestamp}-${idx}`}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`w-full text-left border rounded-xl p-3 transition ${selectedIdx === idx ? "border-primary-500 bg-primary-500/5" : "border-black/10 dark:border-white/10"}`}
                >
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="font-mono text-xs">{evt.timestamp}</div>
                    <div className="text-xs px-2 py-0.5 rounded bg-black/5 dark:bg-white/10">{evt.status}</div>
                  </div>
                  <div className="mt-2 font-mono text-sm">{getEventDisplayName(evt)}</div>
                  <div className="text-xs text-text-muted mt-1">{evt.component} · {evt.source}</div>
                </button>
              ))}
            </div>
          ) : viewMode === "trace" ? (
            <div className="p-4 space-y-4">
              {groupedByRequest.map((group) => (
                <div key={group.key} className="border rounded-xl border-black/10 dark:border-white/10">
                  <div className="px-3 py-2 border-b border-black/5 dark:border-white/5 flex flex-wrap gap-2 items-center justify-between">
                    <div className="font-mono text-xs">{group.key}</div>
                    <div className="text-xs text-text-muted">{group.events.length} events</div>
                  </div>
                  <div className="p-3 space-y-2">
                    {group.events.map((evt) => {
                      const idx = data.events.findIndex((e) => e.event_id === evt.event_id || (e.timestamp === evt.timestamp && e.event === evt.event));
                      return (
                        <button
                          key={`${evt.event_id || evt.timestamp}-${evt.event}`}
                          type="button"
                          onClick={() => setSelectedIdx(idx)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedIdx === idx ? "bg-primary-500/10" : "bg-black/[0.02] dark:bg-white/[0.02]"}`}
                        >
                          <div className="font-mono">{getEventDisplayName(evt)}</div>
                          <div className="text-xs text-text-muted">{evt.timestamp}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
                    <th className="text-left p-3">Time</th>
                    <th className="text-left p-3">Event</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Request</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((evt, idx) => (
                    <Fragment key={`${evt.event_id || evt.timestamp}-${idx}`}>
                      <tr
                        className={`border-b border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] ${selectedIdx === idx ? "bg-primary-500/10" : ""}`}
                        onClick={() => setSelectedIdx(idx)}
                      >
                        <td className="p-3 whitespace-nowrap">{evt.timestamp}</td>
                        <td className="p-3 font-mono">{getEventDisplayName(evt)}</td>
                        <td className="p-3">{evt.status}</td>
                        <td className="p-3 font-mono text-xs">{evt.request_id || evt.trace_id || "-"}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Event Detail" icon="plagiarism" className="overflow-hidden h-fit xl:sticky xl:top-4 self-start xl:max-h-[calc(100vh-2rem)]">
          {!selectedEvent ? (
            <div className="text-sm text-text-muted">Select an event to inspect full payload.</div>
          ) : (
            <div className="space-y-3 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">
              <div className="text-xs text-text-muted">{selectedEvent.timestamp}</div>
              <div className="font-mono text-sm break-all">{getEventDisplayName(selectedEvent)}</div>
              <div className="grid grid-cols-1 gap-2 text-xs">
                <div><b>request_id:</b> <span className="font-mono">{selectedEvent.request_id || "-"}</span></div>
                <div><b>trace_id:</b> <span className="font-mono">{selectedEvent.trace_id || "-"}</span></div>
                <div><b>session_id:</b> <span className="font-mono">{selectedEvent.session_id || "-"}</span></div>
                <div><b>route_id:</b> <span className="font-mono">{selectedEvent.route_id || "-"}</span></div>
                <div><b>tool_call_id:</b> <span className="font-mono">{selectedEvent.tool_call_id || "-"}</span></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon="content_copy"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(formatJson(selectedEvent));
                    } catch {}
                  }}
                >
                  Copy JSON
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon="travel_explore"
                  onClick={() => {
                    setFilters((prev) => ({
                      ...prev,
                      request_id: selectedEvent.request_id || prev.request_id,
                      trace_id: selectedEvent.trace_id || prev.trace_id,
                    }));
                    setViewMode("trace");
                  }}
                >
                  Focus Trace
                </Button>
              </div>
              <pre className="text-xs overflow-auto whitespace-pre-wrap bg-black/[0.03] dark:bg-white/[0.03] rounded-lg p-3">{formatJson(selectedEvent)}</pre>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
