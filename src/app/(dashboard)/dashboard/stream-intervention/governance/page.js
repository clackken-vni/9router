"use client";

import { useMemo, useState } from "react";
import StreamInterventionTabs from "../components/StreamInterventionTabs";
import SectionHeader from "../components/SectionHeader";
import { Badge, Button, Card, Input, Select } from "@/shared/components";

const sampleVersions = [
  { version: "v3", status: "draft", actor: "alice", changed_at: "2026-03-14 18:00", summary: "Adjusted timeout + fail-open defaults" },
  { version: "v2", status: "published", actor: "alice", changed_at: "2026-03-14 17:10", summary: "Published runtime-safe set" },
  { version: "v1", status: "archived", actor: "system", changed_at: "2026-03-14 15:00", summary: "Initial rollout" }
];

const sampleRules = [
  { name: "Intercept search_docs", priority: 100, when: "tool.detected", action: "intercept:mcp" },
  { name: "Intercept search_docs override", priority: 100, when: "tool.detected", action: "status_only" }
];

export default function StreamInterventionGovernancePage() {
  const [eventInput, setEventInput] = useState('{"phase":"tool.detected","tool_name":"search_docs"}');
  const [publishStatus, setPublishStatus] = useState("draft");
  const [selectedVersion, setSelectedVersion] = useState("v3");

  const simulator = useMemo(() => {
    try {
      const parsed = JSON.parse(eventInput);
      const matches = sampleRules.filter((rule) => parsed.phase === rule.when);
      return { parsed, matches, error: null };
    } catch (error) {
      return { parsed: null, matches: [], error: error.message };
    }
  }, [eventInput]);

  const conflicts = useMemo(() => {
    const [a, b] = sampleRules;
    if (a.when === b.when && a.priority === b.priority && a.action !== b.action) {
      return ["Conflict detected: same matcher and priority with different actions. Consider changing priority or scope."];
    }
    return [];
  }, []);

  const canPublish = !simulator.error && conflicts.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Governance" subtitle="Simulator, conflict resolver, draft/publish workflow, version history, and rollback" help="Publish should be blocked when simulator or conflict precheck fails." />
      <StreamInterventionTabs />

      <Card title="Rule Simulator" subtitle="Match trace for sample event envelope">
        <textarea value={eventInput} onChange={(e) => setEventInput(e.target.value)} className="w-full min-h-40 rounded-lg border border-border bg-bg p-3 text-sm font-mono" />
        {simulator.error ? <p className="text-sm text-red-500 mt-2">Simulator error: {simulator.error}</p> : null}
        {!simulator.error ? (
          <div className="mt-3 space-y-2">
            {simulator.matches.map((rule) => (
              <div key={rule.name} className="p-3 border border-border rounded-lg">
                <div className="flex items-center gap-2"><Badge size="sm" variant="success">match</Badge><span className="font-medium">{rule.name}</span></div>
                <p className="text-xs text-text-muted mt-1">priority {rule.priority} · action {rule.action}</p>
              </div>
            ))}
            {simulator.matches.length === 0 ? <p className="text-sm text-text-muted mt-2">No matching rule.</p> : null}
          </div>
        ) : null}
      </Card>

      <Card title="Conflict Resolver" subtitle="Detect conflicting actions and suggest remediation">
        {conflicts.length === 0 ? <Badge variant="success" size="sm">No conflicts</Badge> : conflicts.map((conflict) => <Badge key={conflict} variant="warning" size="sm">{conflict}</Badge>)}
      </Card>

      <Card title="Draft / Publish Workflow" subtitle="Precheck gate before publish">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant={publishStatus === "published" ? "success" : publishStatus === "draft" ? "warning" : "default"}>{publishStatus}</Badge>
          <Button onClick={() => setPublishStatus("draft")} variant="secondary">Set draft</Button>
          <Button onClick={() => canPublish && setPublishStatus("published")} disabled={!canPublish}>Publish</Button>
          <Button onClick={() => setPublishStatus("archived")} variant="outline">Archive</Button>
        </div>
        {!canPublish ? <p className="text-sm text-red-500 mt-2">Publish blocked: fix simulator or conflict precheck first.</p> : <p className="text-sm text-text-muted mt-2">Precheck passed.</p>}
      </Card>

      <Card title="Version History + Rollback" subtitle="Diff, version list, and one-click rollback">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            {sampleVersions.map((item) => (
              <div key={item.version} className="p-3 border border-border rounded-lg flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.version}</span>
                    <Badge size="sm" variant={item.status === "published" ? "success" : item.status === "draft" ? "warning" : "default"}>{item.status}</Badge>
                  </div>
                  <p className="text-xs text-text-muted mt-1">{item.actor} · {item.changed_at} · {item.summary}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setSelectedVersion(item.version)}>View</Button>
              </div>
            ))}
          </div>
          <div className="p-3 border border-border rounded-lg bg-bg">
            <div className="flex items-center justify-between">
              <span className="font-medium">Selected {selectedVersion}</span>
              <Button size="sm" onClick={() => setPublishStatus("published")}>Rollback</Button>
            </div>
            <pre className="mt-3 text-xs overflow-auto">{JSON.stringify(sampleVersions.find((item) => item.version === selectedVersion), null, 2)}</pre>
          </div>
        </div>
      </Card>

      <Card title="Audit Trail" subtitle="Actor / time / before-after summary">
        <div className="space-y-2">
          {sampleVersions.map((item) => (
            <div key={`audit-${item.version}`} className="p-3 border border-border rounded-lg">
              <p className="text-sm font-medium">{item.actor} updated {item.version}</p>
              <p className="text-xs text-text-muted mt-1">{item.changed_at} · {item.summary}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
