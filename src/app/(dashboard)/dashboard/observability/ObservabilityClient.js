"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select } from "@/shared/components";

const statusOptions = [
  { value: "", label: "All status" },
  { value: "start", label: "start" },
  { value: "ok", label: "ok" },
  { value: "error", label: "error" },
];

function formatJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return String(value || "");
  }
}

export default function ObservabilityClient() {
  const [filters, setFilters] = useState({
    day: new Date().toISOString().slice(0, 10),
    q: "",
    status: "",
    component: "",
    event: "",
    session_id: "",
    trace_id: "",
    limit: "100",
  });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ events: [], summary: {}, files: [] });
  const [expandedIndex, setExpandedIndex] = useState(-1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (String(v || "").trim() !== "") params.set(k, String(v));
    });
    return params.toString();
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/observability?${queryString}`);
      const json = await res.json();
      if (json?.ok) setData(json);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Observability Logs" subtitle="Filter and inspect AMP observability events" icon="monitoring">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <Input label="Day" type="date" value={filters.day} onChange={(e) => setFilters({ ...filters, day: e.target.value })} />
          <Input label="Search" placeholder="timeout, tool.call.error..." value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <Select label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} options={statusOptions} placeholder="All status" />
          <Input label="Component" placeholder="api.internal" value={filters.component} onChange={(e) => setFilters({ ...filters, component: e.target.value })} />
          <Input label="Event" placeholder="tool.call.error" value={filters.event} onChange={(e) => setFilters({ ...filters, event: e.target.value })} />
          <Input label="Session ID" placeholder="sess_..." value={filters.session_id} onChange={(e) => setFilters({ ...filters, session_id: e.target.value })} />
          <Input label="Trace ID" placeholder="tr_..." value={filters.trace_id} onChange={(e) => setFilters({ ...filters, trace_id: e.target.value })} />
          <Input label="Limit" type="number" min="1" max="500" value={filters.limit} onChange={(e) => setFilters({ ...filters, limit: e.target.value })} />
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="primary" icon="filter_alt" onClick={fetchData} loading={loading}>Apply</Button>
          <Button variant="outline" icon="refresh" onClick={fetchData} loading={loading}>Refresh</Button>
        </div>
      </Card>

      <Card title="Summary" icon="analytics">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>Files scanned: <b>{data.summary?.scannedFiles || 0}</b></div>
          <div>Lines scanned: <b>{data.summary?.scannedLines || 0}</b></div>
          <div>Matched: <b>{data.summary?.matchedLines || 0}</b></div>
          <div>Malformed: <b>{data.summary?.malformedLines || 0}</b></div>
        </div>
      </Card>

      <Card title="Events" icon="list_alt" padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Event</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Component</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Session</th>
                <th className="text-left p-3">Trace</th>
                <th className="text-center p-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="p-6 text-center text-text-muted">Loading...</td></tr>
              ) : data.events?.length ? (
                data.events.map((evt, idx) => (
                  <>
                    <tr key={`${evt.timestamp}-${idx}`} className="border-b border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                      <td className="p-3 whitespace-nowrap">{evt.timestamp}</td>
                      <td className="p-3 font-mono">{evt.event}</td>
                      <td className="p-3">{evt.status}</td>
                      <td className="p-3">{evt.component}</td>
                      <td className="p-3">{evt.source}</td>
                      <td className="p-3 font-mono">{evt.session_id}</td>
                      <td className="p-3 font-mono">{evt.trace_id}</td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="outline" onClick={() => setExpandedIndex(expandedIndex === idx ? -1 : idx)}>
                          {expandedIndex === idx ? "Hide" : "View"}
                        </Button>
                      </td>
                    </tr>
                    {expandedIndex === idx && (
                      <tr>
                        <td colSpan="8" className="p-3 bg-black/[0.03] dark:bg-white/[0.03] border-b border-black/5 dark:border-white/5">
                          <pre className="text-xs overflow-auto whitespace-pre-wrap">{formatJson({ io: evt.io, timing: evt.timing, error: evt.error, meta: evt.meta, tool: evt.tool, model: evt.model })}</pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              ) : (
                <tr><td colSpan="8" className="p-6 text-center text-text-muted">No observability events.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
