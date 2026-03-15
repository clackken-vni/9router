"use client";

import { useMemo, useState } from "react";
import StreamInterventionTabs from "../components/StreamInterventionTabs";
import SectionHeader from "../components/SectionHeader";
import { Badge, Button, Card, Input, Select, Toggle } from "@/shared/components";

const DEFAULT_RULE = {
  id: "",
  name: "",
  priority: 100,
  enabled: true,
  status: "draft",
  scopeProvider: "openai",
  scopeModel: "gpt-4.1",
  whenEvent: "tool.detected",
  whenTool: "",
  thenAction: "intercept",
  thenExecutor: "mcp",
  timeoutMs: 3000,
  failPolicy: "fail_open",
  overrideMode: "status_only"
};

const eventOptions = [
  { value: "provider.attempt", label: "provider.attempt" },
  { value: "provider.fallback", label: "provider.fallback" },
  { value: "tool.detected", label: "tool.detected" },
  { value: "tool.intercept.start", label: "tool.intercept.start" },
  { value: "stream.error", label: "stream.error" }
];

function toRulePayload(form) {
  return {
    id: form.id || `rule_${Date.now()}`,
    name: form.name,
    priority: Number(form.priority || 0),
    enabled: form.enabled,
    status: form.status,
    scope: { provider: [form.scopeProvider], model: [form.scopeModel] },
    when: { event: form.whenEvent, tool_name: form.whenTool || undefined },
    then: {
      action: form.thenAction,
      executor: form.thenExecutor,
      timeout_ms: Number(form.timeoutMs || 0),
      fail_policy: form.failPolicy,
      override_mode: form.overrideMode
    },
    updated_at: new Date().toISOString()
  };
}

function validateRule(rule) {
  const errors = [];
  if (!rule.name?.trim()) errors.push("name is required");
  if (!Number.isFinite(rule.then?.timeout_ms) || rule.then.timeout_ms <= 0) errors.push("timeout_ms must be > 0");
  if (rule.then?.fail_policy === "fail_closed" && rule.scope?.provider?.includes("openai")) errors.push("fail_closed on production-like scope is risky");
  if (rule.when?.tool_name && rule.when.tool_name.includes(".*")) errors.push("tool regex too broad");
  return errors;
}

export default function StreamInterventionRulesPage() {
  const [rules, setRules] = useState([]);
  const [query, setQuery] = useState("");
  const [filterEvent, setFilterEvent] = useState("all");
  const [sortBy, setSortBy] = useState("priority_desc");
  const [jsonMode, setJsonMode] = useState(false);
  const [form, setForm] = useState(DEFAULT_RULE);
  const [jsonText, setJsonText] = useState(JSON.stringify(toRulePayload(DEFAULT_RULE), null, 2));
  const [jsonError, setJsonError] = useState("");

  const visibleRules = useMemo(() => {
    let items = rules.filter((r) => {
      if (filterEvent !== "all" && r.when?.event !== filterEvent) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return [r.name, r.when?.event, r.when?.tool_name, r.scope?.provider?.[0], r.scope?.model?.[0]].some((x) => String(x || "").toLowerCase().includes(q));
    });

    items = [...items].sort((a, b) => {
      if (sortBy === "priority_desc") return b.priority - a.priority;
      if (sortBy === "priority_asc") return a.priority - b.priority;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return items;
  }, [rules, filterEvent, query, sortBy]);

  const draftWarnings = useMemo(() => validateRule(toRulePayload(form)), [form]);

  const handleSave = () => {
    if (!jsonMode) {
      const payload = toRulePayload(form);
      const errs = validateRule(payload);
      if (errs.length) return;
      setRules((prev) => {
        const exists = prev.some((r) => r.id === payload.id);
        return exists ? prev.map((r) => (r.id === payload.id ? payload : r)) : [payload, ...prev];
      });
      setForm({ ...DEFAULT_RULE, id: "" });
      setJsonText(JSON.stringify(toRulePayload(DEFAULT_RULE), null, 2));
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);
      const errs = validateRule(parsed);
      if (errs.length) {
        setJsonError(errs.join("; "));
        return;
      }
      setJsonError("");
      setRules((prev) => {
        const exists = prev.some((r) => r.id === parsed.id);
        return exists ? prev.map((r) => (r.id === parsed.id ? parsed : r)) : [parsed, ...prev];
      });
    } catch (error) {
      setJsonError(`line-level json error: ${error.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Rules" subtitle="Rule List + Builder + Validation" help="Timeout is mandatory. Avoid broad regex and fail_closed in production scope." />
      <StreamInterventionTabs />

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="Search by name/provider/model/tool" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} options={[{ value: "all", label: "All events" }, ...eventOptions]} />
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} options={[{ value: "priority_desc", label: "Priority desc" }, { value: "priority_asc", label: "Priority asc" }, { value: "updated_desc", label: "Updated desc" }]} />
          <div className="flex items-center justify-between border border-border rounded-lg px-3">
            <span className="text-sm text-text-muted">JSON mode</span>
            <Toggle checked={jsonMode} onChange={() => setJsonMode((v) => !v)} />
          </div>
        </div>
      </Card>

      <Card title="Rule List" subtitle="CRUD + filter/sort">
        <div className="space-y-2">
          {visibleRules.map((rule) => (
            <div key={rule.id} className="p-3 border border-border rounded-lg flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{rule.name}</span>
                  <Badge size="sm" variant={rule.enabled ? "success" : "default"}>{rule.enabled ? "active" : "disabled"}</Badge>
                  <Badge size="sm" variant={rule.status === "draft" ? "warning" : "info"}>{rule.status}</Badge>
                </div>
                <p className="text-xs text-text-muted mt-1">priority={rule.priority} · {rule.when?.event} · {rule.scope?.provider?.[0]}/{rule.scope?.model?.[0]}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))}>{rule.enabled ? "Disable" : "Enable"}</Button>
                <Button size="sm" variant="secondary" onClick={() => setRules((prev) => [{ ...rule, id: `rule_${Date.now()}` }, ...prev])}>Duplicate</Button>
                <Button size="sm" variant="secondary" onClick={() => { setForm({ ...DEFAULT_RULE, ...rule, scopeProvider: rule.scope?.provider?.[0] || "openai", scopeModel: rule.scope?.model?.[0] || "gpt-4.1", whenEvent: rule.when?.event || "tool.detected", whenTool: rule.when?.tool_name || "", thenAction: rule.then?.action || "intercept", thenExecutor: rule.then?.executor || "mcp", timeoutMs: rule.then?.timeout_ms || 3000, failPolicy: rule.then?.fail_policy || "fail_open", overrideMode: rule.then?.override_mode || "status_only" }); setJsonText(JSON.stringify(rule, null, 2)); }}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))}>Delete</Button>
              </div>
            </div>
          ))}
          {visibleRules.length === 0 && <p className="text-sm text-text-muted">No rules</p>}
        </div>
      </Card>

      <Card title="Rule Builder" subtitle="Form mode + JSON mode + validation">
        {!jsonMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            <Input label="Priority" type="number" value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))} />
            <Select label="Event" value={form.whenEvent} onChange={(e) => setForm((s) => ({ ...s, whenEvent: e.target.value }))} options={eventOptions} />
            <Input label="Tool matcher" value={form.whenTool} onChange={(e) => setForm((s) => ({ ...s, whenTool: e.target.value }))} placeholder="search_docs" />
            <Input label="Provider" value={form.scopeProvider} onChange={(e) => setForm((s) => ({ ...s, scopeProvider: e.target.value }))} />
            <Input label="Model" value={form.scopeModel} onChange={(e) => setForm((s) => ({ ...s, scopeModel: e.target.value }))} />
            <Select label="Executor" value={form.thenExecutor} onChange={(e) => setForm((s) => ({ ...s, thenExecutor: e.target.value }))} options={[{ value: "mcp", label: "mcp" }, { value: "api", label: "api" }]} />
            <Input label="Timeout (ms)" type="number" value={form.timeoutMs} onChange={(e) => setForm((s) => ({ ...s, timeoutMs: e.target.value }))} />
            <Select label="Fail policy" value={form.failPolicy} onChange={(e) => setForm((s) => ({ ...s, failPolicy: e.target.value }))} options={[{ value: "fail_open", label: "fail_open" }, { value: "fail_closed", label: "fail_closed" }]} />
            <Select label="Override mode" value={form.overrideMode} onChange={(e) => setForm((s) => ({ ...s, overrideMode: e.target.value }))} options={[{ value: "status_only", label: "status_only" }, { value: "inject_tool_result", label: "inject_tool_result" }]} />
          </div>
        ) : (
          <div className="space-y-2">
            <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="w-full min-h-56 rounded-lg border border-border bg-bg p-3 text-sm font-mono" />
            {jsonError ? <p className="text-xs text-red-500">{jsonError}</p> : null}
          </div>
        )}

        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium">Safety warnings</p>
          {draftWarnings.length === 0 ? <Badge variant="success" size="sm">No blocking warnings</Badge> : draftWarnings.map((w) => <Badge key={w} variant="warning" size="sm">{w}</Badge>)}
        </div>

        <div className="mt-3 flex gap-2">
          <Button onClick={handleSave} disabled={!jsonMode && draftWarnings.length > 0}>Save rule</Button>
          <Button variant="secondary" onClick={() => setJsonText(JSON.stringify(toRulePayload(form), null, 2))}>Form → JSON</Button>
          <Button variant="secondary" onClick={() => { try { const parsed = JSON.parse(jsonText); setForm((s) => ({ ...s, ...DEFAULT_RULE, id: parsed.id || "", name: parsed.name || "", priority: parsed.priority || 100, scopeProvider: parsed.scope?.provider?.[0] || "openai", scopeModel: parsed.scope?.model?.[0] || "gpt-4.1", whenEvent: parsed.when?.event || "tool.detected", whenTool: parsed.when?.tool_name || "", thenExecutor: parsed.then?.executor || "mcp", timeoutMs: parsed.then?.timeout_ms || 3000, failPolicy: parsed.then?.fail_policy || "fail_open", overrideMode: parsed.then?.override_mode || "status_only" })); setJsonError(""); } catch (e) { setJsonError(`line-level json error: ${e.message}`); } }}>JSON → Form</Button>
        </div>
      </Card>

      <Card title="Execution Preview" subtitle="Priority order resolution">
        <ol className="list-decimal pl-5 text-sm text-text-muted space-y-1">
          {visibleRules.map((r) => <li key={`preview-${r.id}`}>{r.name} (priority {r.priority})</li>)}
          {visibleRules.length === 0 ? <li>No active preview entries</li> : null}
        </ol>
      </Card>
    </div>
  );
}
