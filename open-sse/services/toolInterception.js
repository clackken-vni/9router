import { STREAM_INTERVENTION_EVENT_TYPES } from "./streamIntervention.js";

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_MODE = "status_only";

export function resolveToolInterceptionPolicy(body = {}) {
  const rawPolicy = body?.stream_intervention?.tool_interception;
  if (!rawPolicy || typeof rawPolicy !== "object") {
    return {
      enabled: false,
      mode: DEFAULT_MODE,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      rules: []
    };
  }

  const timeoutMsRaw = Number(rawPolicy.timeout_ms);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
    ? Math.min(timeoutMsRaw, 15000)
    : DEFAULT_TIMEOUT_MS;

  return {
    enabled: rawPolicy.enabled === true,
    mode: rawPolicy.mode === "inject_tool_result" ? "inject_tool_result" : DEFAULT_MODE,
    timeoutMs,
    rules: Array.isArray(rawPolicy.rules) ? rawPolicy.rules : []
  };
}

function matchRule(toolName, rule) {
  if (!rule || typeof rule !== "object") return false;
  if (typeof rule.tool === "string" && rule.tool === toolName) return true;
  if (typeof rule.pattern === "string" && rule.pattern.length > 0) {
    try {
      return new RegExp(rule.pattern, "i").test(toolName);
    } catch {
      return false;
    }
  }
  return false;
}

function createExecutor(rule) {
  return async ({ toolCall }) => {
    if (!rule || typeof rule !== "object") {
      throw new Error("missing_intercept_rule");
    }

    if (rule.mock_error === true) {
      throw new Error("mock_intercept_error");
    }

    const startedAt = Date.now();
    return {
      status: "ok",
      mode: rule.mode || DEFAULT_MODE,
      tool_call_id: toolCall.id,
      tool_name: toolCall.function?.name || "unknown",
      duration_ms: Date.now() - startedAt,
      result: rule.mode === "inject_tool_result"
        ? { content: rule.mock_result || "intercepted" }
        : null
    };
  };
}

function withTimeout(task, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("intercept_timeout")), timeoutMs);
    task()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function interceptToolCalls({ toolCalls, policy, queueEvent, context }) {
  if (!policy?.enabled || !Array.isArray(toolCalls) || toolCalls.length === 0) return;

  for (const toolCall of toolCalls) {
    const toolName = toolCall?.function?.name || "unknown";
    const rule = policy.rules.find((item) => matchRule(toolName, item));
    if (!rule) continue;

    const base = {
      type: STREAM_INTERVENTION_EVENT_TYPES.TOOL,
      provider: context.provider,
      model: context.model,
      attempt: context.attempt,
      data: {
        tool_call_id: toolCall.id,
        tool_name: toolName,
        mode: policy.mode
      }
    };

    queueEvent({ ...base, phase: "tool.detected" });
    queueEvent({ ...base, phase: "tool.intercept.start" });

    try {
      const exec = createExecutor(rule);
      const result = await withTimeout(() => exec({ toolCall, context }), policy.timeoutMs);
      queueEvent({
        ...base,
        phase: "tool.intercept.success",
        data: {
          ...base.data,
          result: result?.result || null,
          duration_ms: result?.duration_ms || null
        }
      });
    } catch (error) {
      queueEvent({
        ...base,
        phase: "tool.intercept.error",
        data: {
          ...base.data,
          error: error?.message || "intercept_failed",
          fail_open: true
        }
      });
    }
  }
}
