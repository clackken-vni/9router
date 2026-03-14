export const STREAM_INTERVENTION_EVENT_TYPES = {
  STATUS: "amp.status",
  TOOL: "amp.tool",
  ERROR: "amp.error"
};

export function createState(context = {}) {
  return {
    seq: 0,
    terminalSent: false,
    queue: [],
    context: {
      request_id: context.request_id || context.requestId || null,
      provider: context.provider || null,
      model: context.model || null,
      attempt: Number.isFinite(context.attempt) ? context.attempt : 1
    }
  };
}

export function nextSeq(state) {
  if (!state || typeof state !== "object") return 0;
  state.seq = (Number.isFinite(state.seq) ? state.seq : 0) + 1;
  return state.seq;
}

export function buildEvent(state, input = {}) {
  const type = input.type || STREAM_INTERVENTION_EVENT_TYPES.STATUS;
  const ctx = state?.context || {};
  const event = {
    type,
    phase: input.phase || "unknown",
    seq: nextSeq(state),
    ts: Number.isFinite(input.ts) ? input.ts : Date.now(),
    request_id: input.request_id || input.requestId || ctx.request_id || null,
    provider: input.provider || ctx.provider || null,
    model: input.model || ctx.model || null,
    attempt: Number.isFinite(input.attempt) ? input.attempt : (Number.isFinite(ctx.attempt) ? ctx.attempt : 1),
    terminal: input.terminal === true,
    data: input.data && typeof input.data === "object" ? input.data : {}
  };
  return event;
}

export function queueEvent(state, eventInput) {
  if (!state || typeof state !== "object" || !Array.isArray(state.queue)) return null;
  if (!eventInput) return null;

  try {
    const event = (eventInput.type && Number.isFinite(eventInput.seq))
      ? eventInput
      : buildEvent(state, eventInput);

    if (state.terminalSent) return null;
    if (event.terminal) {
      state.terminalSent = true;
    }

    state.queue.push(event);
    return event;
  } catch {
    return null;
  }
}

export function drainEvents(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.queue) || state.queue.length === 0) {
    return [];
  }

  const drained = state.queue.slice();
  state.queue.length = 0;
  return drained;
}

export function markTerminal(state, eventInput = null) {
  if (!state || typeof state !== "object" || state.terminalSent) return null;

  state.terminalSent = true;
  if (!eventInput) return null;

  const event = buildEvent(state, { ...eventInput, terminal: true });
  state.queue.push(event);
  return event;
}

export function serializeEvent(event) {
  if (!event || typeof event !== "object" || !event.type) return "";

  try {
    return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  } catch {
    return "";
  }
}
