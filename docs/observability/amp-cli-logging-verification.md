# AMP CLI Observability — Verification Matrix & Sample Traces

## Scope
Epic: `epic:amp-cli-observability` (#16, #17, #18, #19)

## Environment
- Runtime: `npm run dev:alt` (`http://localhost:20126`)
- Build check: `npm run build`
- Logs root: `logs/amp-sessions/`

---

## Verification Matrix

| Scenario | Expected events | Evidence (module/endpoint) | Status |
|---|---|---|---|
| Request lifecycle on compatibility routes | `request.received` → `request.responded`/`request.failed` | [http.js](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/lib/ampObservability/http.js#L1-L166), [v1 root](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/app/api/v1/route.js#L1-L57), [v1 models](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/app/api/v1/models/route.js#L1-L180) | ✅ |
| Streaming lifecycle | `stream.chunk*` + terminal `request.responded` | [chat completions](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/app/api/v1/chat/completions/route.js#L34-L194), [responses](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/app/api/v1/responses/route.js#L34-L190), [messages](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/app/api/v1/messages/route.js#L29-L164) | ✅ |
| Internal API tool lifecycle | `tool.call.start` → `tool.call.forwarded/result/end/error` | [internal handler](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/lib/internalApi/handler.js#L44-L252), [internal proxy](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/lib/internalApi/proxyToUpstream.js#L13-L163) | ✅ |
| Correlation continuity | same request/trace/session IDs across events | [session resolver](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/lib/ampObservability/session.js#L1-L44), [schema headers](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/lib/ampObservability/schema.js#L1-L71) | ✅ |
| Redaction compliance | secrets masked + large values truncated/hash | [redact policy](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/lib/ampObservability/redact.js#L1-L92) | ✅ |
| Query usability | filter by `request_id`, `route_id`, `tool_call_id` | [reader](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/lib/ampObservability/reader.js#L68-L175), [api route](file:///Users/hungdang/Documents/Projects/VNI/9router/.worktrees/issue-19-observability-verification-matrix/src/app/api/observability/route.js#L1-L27) | ✅ |

---

## Sample Trace Patterns

### A) Non-stream request trace
1. `request.received`
2. `model.request.start` (if model route)
3. `model.response.end`
4. `request.responded`

### B) Stream request trace
1. `request.received`
2. `model.request.start`
3. `stream.chunk` (n events)
4. `model.response.end`
5. `request.responded`

### C) Internal tool error trace
1. `request.received`
2. `tool.call.start`
3. `tool.call.error`
4. `request.failed` (or `request.responded` with mapped error status)

---

## Pass/Fail Criteria

- Completeness: mỗi request chính có event mở đầu + kết thúc (hoặc failed).
- Continuity: event chain giữ nguyên `trace_id` và `request_id` xuyên route/tool.
- Safety: không có token/secret thô trong payload đã ghi.
- Operability: API query trả được logs theo filters quan trọng.

---

## Commands Executed

```bash
npm run build
npm run dev:alt
# GET /v1/models
# POST /v1/messages/count_tokens
# GET /api/observability?limit=10
```

---

## Remaining Risk

1. Live MITM interception trace cần môi trường có traffic MITM thực tế để thu sample event thực địa.
2. Một số provider-specific fallback path vẫn phụ thuộc external credentials để capture full happy-path traces.
