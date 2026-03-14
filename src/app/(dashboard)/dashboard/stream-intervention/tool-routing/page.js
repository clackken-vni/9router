"use client";

import { useMemo, useState } from "react";
import StreamInterventionTabs from "../components/StreamInterventionTabs";
import SectionHeader from "../components/SectionHeader";
import { Badge, Button, Card, Input, Select, Toggle } from "@/shared/components";

const DEFAULT_MAPPING = {
  id: "",
  tool_name: "",
  executor_type: "mcp",
  target: "docs-server",
  timeout_ms: 3000,
  retry: 1,
  backoff_ms: 500,
  max_payload_kb: 64,
  fail_policy: "fail_open",
  secret_ref: "secret://routing/default",
  enabled: true,
  health: { status: "unknown", latency_ms: null, error: null }
};

export default function StreamInterventionToolRoutingPage() {
  const [mappings, setMappings] = useState([]);
  const [form, setForm] = useState(DEFAULT_MAPPING);

  const sortedMappings = useMemo(() => [...mappings], [mappings]);

  const validate = (mapping) => {
    const errors = [];
    if (!mapping.tool_name.trim()) errors.push("tool_name required");
    if (!Number(mapping.timeout_ms) || Number(mapping.timeout_ms) <= 0) errors.push("timeout required");
    if (!mapping.fail_policy) errors.push("fail_policy required");
    if (!String(mapping.secret_ref || "").startsWith("secret://")) errors.push("secret reference required");
    return errors;
  };

  const saveMapping = () => {
    const errors = validate(form);
    if (errors.length) return;
    const payload = { ...form, id: form.id || `mapping_${Date.now()}` };
    setMappings((prev) => {
      const exists = prev.some((m) => m.id === payload.id);
      return exists ? prev.map((m) => (m.id === payload.id ? payload : m)) : [payload, ...prev];
    });
    setForm(DEFAULT_MAPPING);
  };

  const healthCheck = (id) => {
    setMappings((prev) => prev.map((m) => m.id === id ? { ...m, health: { status: m.target.includes("fail") ? "error" : "healthy", latency_ms: m.target.includes("fail") ? null : 142, error: m.target.includes("fail") ? "endpoint unavailable" : null } } : m));
  };

  const formErrors = validate(form);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Tool Routing" subtitle="Manage tool → executor mappings, health, and fail-open defaults" help="Never store plaintext secrets in mapping form. Use secret reference keys only." />
      <StreamInterventionTabs />

      <Card title="Mapping Table" subtitle="CRUD + enable/disable + health diagnostics">
        <div className="space-y-2">
          {sortedMappings.map((mapping) => (
            <div key={mapping.id} className="p-3 border border-border rounded-lg flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{mapping.tool_name}</span>
                  <Badge size="sm" variant={mapping.executor_type === "mcp" ? "info" : "warning"}>{mapping.executor_type}</Badge>
                  <Badge size="sm" variant={mapping.enabled ? "success" : "default"}>{mapping.enabled ? "enabled" : "disabled"}</Badge>
                  <Badge size="sm" variant={mapping.fail_policy === "fail_open" ? "success" : "error"}>{mapping.fail_policy}</Badge>
                </div>
                <p className="text-xs text-text-muted mt-1">{mapping.target} · timeout {mapping.timeout_ms}ms · {mapping.secret_ref}</p>
                {mapping.health.status !== "unknown" ? <p className="text-xs mt-1 text-text-muted">health={mapping.health.status}{mapping.health.latency_ms ? ` · ${mapping.health.latency_ms}ms` : ""}{mapping.health.error ? ` · ${mapping.health.error}` : ""}</p> : null}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => healthCheck(mapping.id)}>Health Check</Button>
                <Button size="sm" variant="secondary" onClick={() => setMappings((prev) => prev.map((m) => m.id === mapping.id ? { ...m, enabled: !m.enabled } : m))}>{mapping.enabled ? "Disable" : "Enable"}</Button>
                <Button size="sm" variant="secondary" onClick={() => setForm(mapping)}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => setMappings((prev) => prev.filter((m) => m.id !== mapping.id))}>Delete</Button>
              </div>
            </div>
          ))}
          {sortedMappings.length === 0 ? <p className="text-sm text-text-muted">No mappings</p> : null}
        </div>
      </Card>

      <Card title="Config Panel" subtitle="Executor type, target, timeout/retry/backoff, payload guard, fail policy">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Tool name" value={form.tool_name} onChange={(e) => setForm((s) => ({ ...s, tool_name: e.target.value }))} />
          <Select label="Executor type" value={form.executor_type} onChange={(e) => setForm((s) => ({ ...s, executor_type: e.target.value }))} options={[{ value: "mcp", label: "mcp" }, { value: "api", label: "api" }]} />
          <Input label="Target" value={form.target} onChange={(e) => setForm((s) => ({ ...s, target: e.target.value }))} placeholder="docs-server or https://service" />
          <Input label="Timeout (ms)" type="number" value={form.timeout_ms} onChange={(e) => setForm((s) => ({ ...s, timeout_ms: e.target.value }))} />
          <Input label="Retry" type="number" value={form.retry} onChange={(e) => setForm((s) => ({ ...s, retry: e.target.value }))} />
          <Input label="Backoff (ms)" type="number" value={form.backoff_ms} onChange={(e) => setForm((s) => ({ ...s, backoff_ms: e.target.value }))} />
          <Input label="Max payload (KB)" type="number" value={form.max_payload_kb} onChange={(e) => setForm((s) => ({ ...s, max_payload_kb: e.target.value }))} />
          <Select label="Fail policy" value={form.fail_policy} onChange={(e) => setForm((s) => ({ ...s, fail_policy: e.target.value }))} options={[{ value: "fail_open", label: "fail_open" }, { value: "fail_closed", label: "fail_closed" }]} />
          <Input label="Secret reference key" value={form.secret_ref} onChange={(e) => setForm((s) => ({ ...s, secret_ref: e.target.value }))} placeholder="secret://routing/default" />
          <div className="flex items-center justify-between border border-border rounded-lg px-3">
            <span className="text-sm text-text-muted">Enabled</span>
            <Toggle checked={form.enabled} onChange={() => setForm((s) => ({ ...s, enabled: !s.enabled }))} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {formErrors.length === 0 ? <Badge variant="success" size="sm">Ready to save</Badge> : formErrors.map((e) => <Badge key={e} variant="warning" size="sm">{e}</Badge>)}
          <Badge variant="info" size="sm">No plaintext secrets in preview</Badge>
        </div>

        <div className="mt-3 flex gap-2">
          <Button onClick={saveMapping} disabled={formErrors.length > 0}>Save mapping</Button>
          <Button variant="secondary" onClick={() => setForm(DEFAULT_MAPPING)}>Reset</Button>
        </div>
      </Card>
    </div>
  );
}
