# Stream Intervention — Verification Matrix & Rollout Checklist

Issue: #28
Epic: #22 (`epic/stream-intervention`)

## 1) Verification Matrix

| ID | Area | Scenario | Expected | Evidence / Method | Status |
|---|---|---|---|---|---|
| V-01 | Status events | Single provider attempt | `provider.attempt` then `stream.done` | In-band `amp.status` sequence | ✅ |
| V-02 | Status events | Account fallback path | `provider.fallback` -> `provider.switched` -> next `provider.attempt` | Raw SSE frame order | ✅ |
| V-03 | Tool interception | Matching rule success | `tool.detected` -> `tool.intercept.start` -> `tool.intercept.success` | Simulated interceptor success | ✅ |
| V-04 | Tool interception | Interceptor error/timeout | `tool.intercept.error`, stream remains alive (fail-open) | Simulated mock error + timeout wrapper | ✅ |
| V-05 | Tool completion fidelity | Chunked tool arguments across deltas | Intercept trigger only after completion | helper matrix + stream behavior | ✅ |
| V-06 | Reliability | Runtime transform error after bytes started | `amp.error(stream.error)` + terminal `amp.status(stream.done)` + native marker | graceful stream path | ✅ |
| V-07 | Reliability | Done semantics | `stream.done` max 1 + done marker max 1 | terminal guard in stream | ✅ |
| V-08 | Regression | Non-stream requests | No stream intervention side effects | existing JSON path unchanged | ✅ |
| V-09 | Regression | `/api/v1/responses` | Format remains valid, no amp event corruption | API regression call | ✅ |
| V-10 | Security | Event payload hygiene | No secret/token leakage in custom events | payload review of emitted event fields | ✅ |

## 2) Smoke Test Checklist (Reusable)

### Preconditions
- Worktree branch for current issue checked out
- `.env` available in worktree

### Commands
```bash
./wt.sh build <issue>
./wt.sh dev <issue> alt
```

### API Smoke
1. `GET /dashboard` → HTTP 200
2. `GET /v1/models` → HTTP 200 + valid model list payload
3. `POST /v1/chat/completions` (stream payload)
4. `POST /api/v1/responses` (regression)

### Runtime checks
- No hard crash in terminal
- Streaming connection closes gracefully in error path
- Done marker semantics preserved (`[DONE]` for non-Responses stream)

## 3) Raw SSE Transcript Samples

> Sample A — provider lifecycle
```text
event: amp.status
data: {"type":"amp.status","phase":"provider.attempt","seq":1,"terminal":false,...}

event: amp.status
data: {"type":"amp.status","phase":"provider.fallback","seq":2,"terminal":false,...}

event: amp.status
data: {"type":"amp.status","phase":"provider.switched","seq":3,"terminal":false,...}

event: amp.status
data: {"type":"amp.status","phase":"stream.done","seq":4,"terminal":true,...}
```

> Sample B — tool intercept success
```text
event: amp.tool
data: {"type":"amp.tool","phase":"tool.detected",...}

event: amp.tool
data: {"type":"amp.tool","phase":"tool.intercept.start",...}

event: amp.tool
data: {"type":"amp.tool","phase":"tool.intercept.success",...}
```

> Sample C — tool intercept fail-open
```text
event: amp.tool
data: {"type":"amp.tool","phase":"tool.intercept.error","data":{"fail_open":true,...}}
```

> Sample D — graceful stream error termination
```text
event: amp.error
data: {"type":"amp.error","phase":"stream.error",...}

event: amp.status
data: {"type":"amp.status","phase":"stream.done","terminal":true,...}

data: [DONE]
```

## 4) Commands Run & Results (Epic evidence)

- `./wt.sh build 23` ✅
- `./wt.sh build 24` ✅
- `./wt.sh build 25` ✅
- `./wt.sh build 26` ✅
- `./wt.sh build 27` ✅
- `./wt.sh build 28` ✅
- `npm run dev:alt` smoke checks for each sub-issue ✅
- Helper validation scripts (tool interception / tool completion matrix / disconnect graceful path) ✅

## 5) Remaining Risks

1. End-to-end fallback+intercept under real provider credentials may exhibit provider-specific timing variance.
2. Responses event fragmentation varies by client parser implementation.
3. Interceptor external service quality still affects event latency (mitigated by hard timeout + fail-open).

## 6) Recommendations

1. Keep timeout conservative (`<=3000ms`) for hot stream path.
2. Add canary monitor on `amp.error phase=stream.error` rate.
3. Roll out by environment tier (local → staging → prod subset).

## 7) Rollout Checklist

- [ ] Epic branch rebased/synced and green build
- [ ] Smoke run on target environment
- [ ] Verify `/v1/models`, `/v1/chat/completions`, `/api/v1/responses`
- [ ] Verify in-band events visible in stream client logs
- [ ] Monitor stream error rate after deploy
- [ ] Confirm rollback command/branch ready
- [ ] Close epic #22 after final acceptance
