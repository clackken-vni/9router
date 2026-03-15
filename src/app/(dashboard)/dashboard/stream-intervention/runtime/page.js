"use client";

import { useMemo, useState } from "react";
import StreamInterventionTabs from "../components/StreamInterventionTabs";
import SectionHeader from "../components/SectionHeader";
import { Badge, Button, Card, Input, Select, Toggle } from "@/shared/components";

const sampleEvents = [
  { seq: 1, request_id: "req_1", provider: "openai", model: "gpt-4.1", type: "amp.status", phase: "provider.attempt", tool_name: "", terminal: false, ts: "10:00:00" },
  { seq: 2, request_id: "req_1", provider: "openai", model: "gpt-4.1", type: "amp.tool", phase: "tool.intercept.start", tool_name: "search_docs", terminal: false, ts: "10:00:01" },
  { seq: 3, request_id: "req_1", provider: "openai", model: "gpt-4.1", type: "amp.tool", phase: "tool.intercept.success", tool_name: "search_docs", terminal: false, ts: "10:00:02" },
  { seq: 4, request_id: "req_1", provider: "openai", model: "gpt-4.1", type: "amp.status", phase: "stream.done", tool_name: "", terminal: true, ts: "10:00:03" },
  { seq: 1, request_id: "req_2", provider: "claude", model: "claude-opus-4-6", type: "amp.status", phase: "provider.fallback", tool_name: "", terminal: false, ts: "10:05:00" },
  { seq: 2, request_id: "req_2", provider: "claude", model: "claude-opus-4-6", type: "amp.error", phase: "stream.error", tool_name: "", terminal: false, ts: "10:05:01" },
  { seq: 3, request_id: "req_2", provider: "claude", model: "claude-opus-4-6", type: "amp.status", phase: "stream.done", tool_name: "", terminal: true, ts: "10:05:02" }
];

function toTranscript(events) {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}`).join("\n\n");
}

export default function StreamInterventionRuntimePage() {
  const [requestId, setRequestId] = useState("");
  const [provider, setProvider] = useState("all");
  const [toolName, setToolName] = useState("");
  const [phase, setPhase] = useState("all");
  const [verbosity, setVerbosity] = useState(false);

  const filtered = useMemo(() => {
    return sampleEvents.filter((event) => {
      if (requestId && !event.request_id.includes(requestId)) return false;
      if (provider !== "all" && event.provider !== provider) return false;
      if (toolName && !String(event.tool_name || "").includes(toolName)) return false;
      if (phase !== "all" && event.phase !== phase) return false;
      return true;
    });
  }, [requestId, provider, toolName, phase]);

  const transcript = toTranscript(filtered);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Runtime Console" subtitle="Timeline, filters, verbosity, and raw SSE inspector" help="Basic mode hides envelope detail; Debug mode shows full event payload." />
      <StreamInterventionTabs />

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Input placeholder="request_id" value={requestId} onChange={(e) => setRequestId(e.target.value)} />
          <Select value={provider} onChange={(e) => setProvider(e.target.value)} options={[{ value: "all", label: "All providers" }, { value: "openai", label: "openai" }, { value: "claude", label: "claude" }]} />
          <Input placeholder="tool_name" value={toolName} onChange={(e) => setToolName(e.target.value)} />
          <Select value={phase} onChange={(e) => setPhase(e.target.value)} options={[{ value: "all", label: "All phases" }, { value: "provider.attempt", label: "provider.attempt" }, { value: "provider.fallback", label: "provider.fallback" }, { value: "tool.intercept.start", label: "tool.intercept.start" }, { value: "tool.intercept.success", label: "tool.intercept.success" }, { value: "stream.error", label: "stream.error" }, { value: "stream.done", label: "stream.done" }]} />
          <div className="flex items-center justify-between border border-border rounded-lg px-3">
            <span className="text-sm text-text-muted">Debug mode</span>
            <Toggle checked={verbosity} onChange={() => setVerbosity((v) => !v)} />
          </div>
        </div>
      </Card>

      <Card title="Timeline" subtitle="Rendered in seq order">
        <div className="space-y-3">
          {filtered.map((event) => (
            <div key={`${event.request_id}-${event.seq}`} className="p-3 border border-border rounded-lg">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge size="sm" variant={event.type === "amp.error" ? "error" : event.type === "amp.tool" ? "info" : "default"}>{event.type}</Badge>
                <Badge size="sm" variant={event.terminal ? "success" : "default"}>seq {event.seq}</Badge>
                <span className="text-sm font-medium">{event.phase}</span>
                {event.terminal ? <Badge size="sm" variant="success">terminal</Badge> : null}
                <span className="text-xs text-text-muted ml-auto">{event.ts}</span>
              </div>
              <p className="text-xs text-text-muted mt-2">{event.request_id} · {event.provider}/{event.model}{event.tool_name ? ` · ${event.tool_name}` : ""}</p>
              {verbosity ? <pre className="mt-2 text-xs overflow-auto rounded bg-bg p-2">{JSON.stringify(event, null, 2)}</pre> : null}
              {event.phase === "stream.error" ? <div className="mt-2 text-sm text-red-500">Inline error card: graceful ended after in-band error.</div> : null}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Raw SSE Inspector" subtitle="Copy transcript for debugging">
        <textarea readOnly value={transcript} className="w-full min-h-56 rounded-lg border border-border bg-bg p-3 text-sm font-mono" />
        <div className="mt-3">
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(transcript)}>Copy transcript</Button>
        </div>
      </Card>
    </div>
  );
}
