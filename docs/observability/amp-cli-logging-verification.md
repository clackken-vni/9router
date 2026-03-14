# AMP CLI Observability — Verification Matrix & Sample Traces

## Scope
Epic: `epic:amp-cli-observability` (OBS-1..OBS-6)

## Environment
- Runtime: `npm run dev:alt` (`http://localhost:20126`)
- Build check: `npm run build`
- Logs root: `logs/amp-sessions/`

---

## Verification Matrix

| Scenario | Expected events | Evidence | Status |
|---|---|---|---|
| Chat non-stream lifecycle | `session.start` → `model.request.start` → `model.response.end` → `session.end` | [2026-03-14T07-47-58-894Z__sess_obs6_demo.jsonl](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-12-amp-cli-observability-verification/logs/amp-sessions/2026-03-14/2026-03-14T07-47-58-894Z__sess_obs6_demo.jsonl#L1-L4) | ✅ |
| Internal tool lifecycle (error path) | `tool.call.start` → `tool.call.error` | [2026-03-14T07-47-59-231Z__sess_obs6_demo.jsonl](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-12-amp-cli-observability-verification/logs/amp-sessions/2026-03-14/2026-03-14T07-47-59-231Z__sess_obs6_demo.jsonl#L1-L2) | ✅ |
| Correlation continuity | same `session_id` + `trace_id` across model/tool events | [chat trace](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-12-amp-cli-observability-verification/logs/amp-sessions/2026-03-14/2026-03-14T07-47-58-894Z__sess_obs6_demo.jsonl#L1-L4), [tool trace](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-12-amp-cli-observability-verification/logs/amp-sessions/2026-03-14/2026-03-14T07-47-59-231Z__sess_obs6_demo.jsonl#L1-L2) | ✅ |
| Redaction/truncation | sensitive fields masked/truncated | [tool error stack truncation + hash](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-12-amp-cli-observability-verification/logs/amp-sessions/2026-03-14/2026-03-14T07-47-59-231Z__sess_obs6_demo.jsonl#L2-L2) | ✅ |
| Retention maintenance | old raw compressed/deleted, old gz deleted | synthetic maintenance run output (raw removed + gz removed + compressed created) | ✅ |
| MITM intercept/passthrough lifecycle | `mitm.intercept.*` events | code path implemented: [server.js](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-12-amp-cli-observability-verification/src/mitm/server.js#L104-L505) | ⚠️ pending live MITM traffic |

---

## Sample Trace (session.start → session.end)

Source: [2026-03-14T07-47-58-894Z__sess_obs6_demo.jsonl](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-12-amp-cli-observability-verification/logs/amp-sessions/2026-03-14/2026-03-14T07-47-58-894Z__sess_obs6_demo.jsonl#L1-L4)

1. `session.start` (route entry)
2. `model.request.start` (model metadata)
3. `model.response.end` (status/timing)
4. `session.end` (terminal marker)

IDs preserved across these lines:
- `session_id = sess_obs6_demo`
- `trace_id = tr_obs6_demo`

---

## Commands Executed

```bash
npm run build
npm run dev:alt
# POST /v1/chat/completions
# POST /api/internal
```

Retention maintenance proof (synthetic old files in `logs/amp-sessions/2000-01-01`):
- before: `oversize-old.jsonl`, `older.jsonl.gz`
- after trigger: `oversize-old.jsonl` removed, `oversize-old.jsonl.gz` created, `older.jsonl.gz` removed

---

## Known Gaps / Follow-up

1. Live MITM traffic scenario not executed in this runbook environment (no real intercepted request captured).
2. Internal tool error path is validated; happy-path local handler and upstream proxy should be validated with configured upstream/search providers.
