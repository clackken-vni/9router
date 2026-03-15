import { translateResponse, initState } from "../translator/index.js";
import { FORMATS } from "../translator/formats.js";
import { trackPendingRequest, appendRequestLog } from "@/lib/usageDb.js";
import { extractUsage, hasValidUsage, estimateUsage, logUsage, addBufferToUsage, filterUsageForFormat, COLORS } from "./usageTracking.js";
import { parseSSELine, hasValuableContent, fixInvalidId, formatSSE } from "./streamHelpers.js";
import { serializeEvent, drainEvents, queueEvent, markTerminal, STREAM_INTERVENTION_EVENT_TYPES } from "../services/streamIntervention.js";
import { resolveToolInterceptionPolicy, interceptToolCalls } from "../services/toolInterception.js";
import { getCompleteToolCalls } from "../translator/helpers/toolCallHelper.js";

export { COLORS, formatSSE };

const sharedDecoder = new TextDecoder();
const sharedEncoder = new TextEncoder();

/**
 * Stream modes
 */
const STREAM_MODE = {
  TRANSLATE: "translate",    // Full translation between formats
  PASSTHROUGH: "passthrough" // No translation, normalize output, extract usage
};

/**
 * Create unified SSE transform stream
 * @param {object} options
 * @param {string} options.mode - Stream mode: translate, passthrough
 * @param {string} options.targetFormat - Provider format (for translate mode)
 * @param {string} options.sourceFormat - Client format (for translate mode)
 * @param {string} options.provider - Provider name
 * @param {object} options.reqLogger - Request logger instance
 * @param {string} options.model - Model name
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @param {object} options.body - Request body (for input token estimation)
 * @param {function} options.onStreamComplete - Callback when stream completes (content, usage)
 * @param {string} options.apiKey - API key for usage tracking
 */
export function createSSEStream(options = {}) {
  const {
    mode = STREAM_MODE.TRANSLATE,
    targetFormat,
    sourceFormat,
    provider = null,
    reqLogger = null,
    toolNameMap = null,
    model = null,
    connectionId = null,
    body = null,
    onStreamComplete = null,
    apiKey = null,
    interventionState = null
  } = options;

  let buffer = "";
  let usage = null;

  const state = mode === STREAM_MODE.TRANSLATE ? { ...initState(sourceFormat), provider, toolNameMap, model } : null;
  const interceptionPolicy = resolveToolInterceptionPolicy(body);
  const interceptedToolCallIds = new Set();

  let totalContentLength = 0;
  let accumulatedContent = "";
  let accumulatedThinking = "";
  let ttftAt = null;
  let hasSentDoneMarker = false;
  let hasStreamErrorEvent = false;
  let hasSeenSSEData = false; // Track if we've seen valid SSE data events
  const accumulatedToolCalls = new Map();
  let pendingNamedEvent = null;

  const mergeToolCalls = (toolCalls) => {
    if (!Array.isArray(toolCalls)) return;

    for (const tc of toolCalls) {
      if (!tc || typeof tc !== "object") continue;
      const index = Number.isInteger(tc.index) ? tc.index : 0;
      const current = accumulatedToolCalls.get(index) || {
        id: tc.id || `call_${Date.now()}_${index}`,
        type: tc.type || "function",
        function: {
          name: "",
          arguments: ""
        }
      };

      if (tc.id) current.id = tc.id;
      if (tc.type) current.type = tc.type;

      if (tc.function?.name) {
        current.function.name = tc.function.name;
      }

      if (typeof tc.function?.arguments === "string") {
        current.function.arguments += tc.function.arguments;
      }

      accumulatedToolCalls.set(index, current);
    }
  };

  const getToolCalls = () => Array.from(accumulatedToolCalls.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, tc]) => tc);

  const enqueueInterventionEvents = (controller) => {
    if (!interventionState) return;
    const events = drainEvents(interventionState);
    if (!events.length) return;

    for (const event of events) {
      const output = serializeEvent(event);
      if (!output) continue;
      reqLogger?.appendConvertedChunk?.(output);
      controller.enqueue(sharedEncoder.encode(output));
    }
  };

  const emitDoneMarker = (controller) => {
    if (hasSentDoneMarker) return;

    if (sourceFormat !== FORMATS.OPENAI_RESPONSES) {
      const doneOutput = "data: [DONE]\n\n";
      reqLogger?.appendConvertedChunk?.(doneOutput);
      controller.enqueue(sharedEncoder.encode(doneOutput));
    }

    hasSentDoneMarker = true;
  };

  const emitStreamError = (controller, error) => {
    if (!interventionState || hasStreamErrorEvent) return;

    queueEvent(interventionState, {
      type: STREAM_INTERVENTION_EVENT_TYPES.ERROR,
      phase: "stream.error",
      provider,
      model,
      attempt: interventionState.context?.attempt || 1,
      data: {
        message: error?.message || "stream_transform_error"
      }
    });

    markTerminal(interventionState, {
      type: STREAM_INTERVENTION_EVENT_TYPES.STATUS,
      phase: "stream.done",
      provider,
      model,
      attempt: interventionState.context?.attempt || 1,
      data: {
        provider_attempts: interventionState.context?.provider_attempts || []
      }
    });

    hasStreamErrorEvent = true;
    enqueueInterventionEvents(controller);
  };

  const processToolInterception = async (controller, finishReason = null) => {
    if (!interventionState || !interceptionPolicy.enabled) return;
    if (finishReason && finishReason !== "tool_calls") return;

    const completeToolCalls = getCompleteToolCalls(getToolCalls())
      .filter((tc) => !interceptedToolCallIds.has(tc.id));
    if (!completeToolCalls.length) return;

    await interceptToolCalls({
      toolCalls: completeToolCalls,
      policy: interceptionPolicy,
      queueEvent: (eventInput) => queueEvent(interventionState, eventInput),
      context: {
        provider,
        model,
        attempt: interventionState.context?.attempt || 1
      }
    });

    for (const tc of completeToolCalls) {
      interceptedToolCallIds.add(tc.id);
    }

    enqueueInterventionEvents(controller);
  };

  return new TransformStream({
    async transform(chunk, controller) {
      try {
        if (!ttftAt) {
          ttftAt = Date.now();
        }
        const text = sharedDecoder.decode(chunk, { stream: true });
        buffer += text;
        reqLogger?.appendProviderChunk?.(text);

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
        const trimmed = line.trim();
        enqueueInterventionEvents(controller);

        if (trimmed.startsWith("event:")) {
          pendingNamedEvent = trimmed.slice(6).trim();
          if (mode === STREAM_MODE.PASSTHROUGH) {
            const output = line + "\n";
            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(sharedEncoder.encode(output));
          }
          continue;
        }

        if (pendingNamedEvent && pendingNamedEvent.startsWith("amp.") && trimmed.startsWith("data:")) {
          try {
            const payload = JSON.parse(trimmed.slice(5).trim());
            if (payload && typeof payload === "object") {
              payload.type = pendingNamedEvent;
              const output = serializeEvent(payload);
              if (output) {
                reqLogger?.appendConvertedChunk?.(output);
                controller.enqueue(sharedEncoder.encode(output));
              }
              pendingNamedEvent = null;
              continue;
            }
          } catch { }
          pendingNamedEvent = null;
        }

        // Passthrough mode: normalize and forward
        if (mode === STREAM_MODE.PASSTHROUGH) {
          let output;
          let injectedUsage = false;

          if (trimmed.startsWith("data:") && trimmed.slice(5).trim() !== "[DONE]") {
            hasSeenSSEData = true; // Mark that we've seen valid SSE data
            try {
              const parsed = JSON.parse(trimmed.slice(5).trim());

              const idFixed = fixInvalidId(parsed);

              // Ensure OpenAI-required fields are present on streaming chunks (Letta compat)
              let fieldsInjected = false;
              if (parsed.choices !== undefined) {
                if (!parsed.object) { parsed.object = "chat.completion.chunk"; fieldsInjected = true; }
                if (!parsed.created) { parsed.created = Math.floor(Date.now() / 1000); fieldsInjected = true; }
              }

              // Strip Azure-specific non-standard fields from streaming chunks
              if (parsed.prompt_filter_results !== undefined) {
                delete parsed.prompt_filter_results;
                fieldsInjected = true;
              }
              if (parsed?.choices) {
                for (const choice of parsed.choices) {
                  if (choice.content_filter_results !== undefined) {
                    delete choice.content_filter_results;
                    fieldsInjected = true;
                  }
                }
              }

              if (!hasValuableContent(parsed, FORMATS.OPENAI)) {
                continue;
              }

              const delta = parsed.choices?.[0]?.delta;
              const content = delta?.content;
              const reasoning = delta?.reasoning_content;
              if (Array.isArray(delta?.tool_calls)) {
                mergeToolCalls(delta.tool_calls);
              }
              if (content && typeof content === "string") {
                totalContentLength += content.length;
                accumulatedContent += content;
              }
              if (reasoning && typeof reasoning === "string") {
                totalContentLength += reasoning.length;
                accumulatedThinking += reasoning;
              }

              const extracted = extractUsage(parsed);
              if (extracted) {
                usage = extracted;
              }

              const isFinishChunk = parsed.choices?.[0]?.finish_reason;
              if (isFinishChunk) {
                await processToolInterception(controller, isFinishChunk);
              }
              if (isFinishChunk && !hasValidUsage(parsed.usage)) {
                const estimated = estimateUsage(body, totalContentLength, FORMATS.OPENAI);
                parsed.usage = filterUsageForFormat(estimated, FORMATS.OPENAI);
                output = `data: ${JSON.stringify(parsed)}\n`;
                usage = estimated;
                injectedUsage = true;
              } else if (isFinishChunk && usage) {
                const buffered = addBufferToUsage(usage);
                parsed.usage = filterUsageForFormat(buffered, FORMATS.OPENAI);
                output = `data: ${JSON.stringify(parsed)}\n`;
                injectedUsage = true;
              } else if (idFixed || fieldsInjected) {
                output = `data: ${JSON.stringify(parsed)}\n`;
                injectedUsage = true;
              }
            } catch { }
          }

          if (!injectedUsage) {
            if (line.startsWith("data:") && !line.startsWith("data: ")) {
              output = "data: " + line.slice(5) + "\n";
            } else {
              output = line + "\n";
            }
          }

          reqLogger?.appendConvertedChunk?.(output);
          controller.enqueue(sharedEncoder.encode(output));
          continue;
        }

        // Translate mode
        if (!trimmed) continue;

        const parsed = parseSSELine(trimmed);
        if (!parsed) continue;

        if (parsed && parsed.done) {
          // Responses API SSE does not use [DONE] sentinel — stream ends after response.completed
          emitDoneMarker(controller);
          continue;
        }

        // Claude format - content
        if (parsed.delta?.text) {
          totalContentLength += parsed.delta.text.length;
          accumulatedContent += parsed.delta.text;
        }
        // Claude format - thinking
        if (parsed.delta?.thinking) {
          totalContentLength += parsed.delta.thinking.length;
          accumulatedThinking += parsed.delta.thinking;
        }
        
        // OpenAI format - content
        if (parsed.choices?.[0]?.delta?.content) {
          totalContentLength += parsed.choices[0].delta.content.length;
          accumulatedContent += parsed.choices[0].delta.content;
        }
        // OpenAI format - reasoning
        if (parsed.choices?.[0]?.delta?.reasoning_content) {
          totalContentLength += parsed.choices[0].delta.reasoning_content.length;
          accumulatedThinking += parsed.choices[0].delta.reasoning_content;
        }
        if (Array.isArray(parsed.choices?.[0]?.delta?.tool_calls)) {
          mergeToolCalls(parsed.choices[0].delta.tool_calls);
        }
        
        // Gemini format
        if (parsed.candidates?.[0]?.content?.parts) {
          for (const part of parsed.candidates[0].content.parts) {
            if (part.text && typeof part.text === "string") {
              totalContentLength += part.text.length;
              // Check if this is thinking content
              if (part.thought === true) {
                accumulatedThinking += part.text;
              } else {
                accumulatedContent += part.text;
              }
            }
          }
        }

        // Extract usage
        const extracted = extractUsage(parsed);
        if (extracted) state.usage = extracted; // Keep original usage for logging

        // Translate: targetFormat -> openai -> sourceFormat
        const translated = translateResponse(targetFormat, sourceFormat, parsed, state);

        // Log OpenAI intermediate chunks (if available)
        if (translated?._openaiIntermediate) {
          for (const item of translated._openaiIntermediate) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }
        }

        if (translated?.length > 0) {
          for (const item of translated) {
            // Filter empty chunks
            if (!hasValuableContent(item, sourceFormat)) {
              continue; // Skip this empty chunk
            }

            // Inject estimated usage if finish chunk has no valid usage
            const isFinishChunk = item.type === "message_delta" || item.choices?.[0]?.finish_reason;
            const finishReason = item.choices?.[0]?.finish_reason || (item.type === "message_delta" ? state.finishReason : null);
            if (isFinishChunk) {
              await processToolInterception(controller, finishReason);
            }
            if (state.finishReason && isFinishChunk && !hasValidUsage(item.usage) && totalContentLength > 0) {
              const estimated = estimateUsage(body, totalContentLength, sourceFormat);
              item.usage = filterUsageForFormat(estimated, sourceFormat); // Filter + already has buffer
              state.usage = estimated;
            } else if (state.finishReason && isFinishChunk && state.usage) {
              // Add buffer and filter usage for client (but keep original in state.usage for logging)
              const buffered = addBufferToUsage(state.usage);
              item.usage = filterUsageForFormat(buffered, sourceFormat);
            }

            const output = formatSSE(item, sourceFormat);
            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(sharedEncoder.encode(output));
          }
        }
      }
      } catch (error) {
        emitStreamError(controller, error);
        emitDoneMarker(controller);
      }
    },

    async flush(controller) {
      trackPendingRequest(model, provider, connectionId, false);
      enqueueInterventionEvents(controller);
      try {
        const remaining = sharedDecoder.decode();
        if (remaining) buffer += remaining;

        await processToolInterception(controller, state?.finishReason || null);

        if (mode === STREAM_MODE.PASSTHROUGH) {
          if (buffer) {
            let output = buffer;
            if (buffer.startsWith("data:") && !buffer.startsWith("data: ")) {
              output = "data: " + buffer.slice(5);
            }
            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(sharedEncoder.encode(output));
          }

          if (!hasValidUsage(usage) && totalContentLength > 0) {
            usage = estimateUsage(body, totalContentLength, FORMATS.OPENAI);
          }

          if (hasValidUsage(usage)) {
            logUsage(provider, usage, model, connectionId, apiKey);
          } else {
            appendRequestLog({ model, provider, connectionId, tokens: null, status: "200 OK" }).catch(() => { });
          }

          // IMPORTANT: Only append [DONE] sentinel if we've seen valid SSE data events.
          // This prevents mixing JSON responses with SSE terminators.
          // Some clients (e.g. OpenClaw) expect the OpenAI-style sentinel for true SSE streams.
          if (hasSeenSSEData) {
            emitDoneMarker(controller);
          }

          if (onStreamComplete) {
            onStreamComplete({
              content: accumulatedContent,
              thinking: accumulatedThinking,
              toolCalls: getToolCalls()
            }, usage, ttftAt);
            enqueueInterventionEvents(controller);
          }
          return;
        }

        if (buffer.trim()) {
          const parsed = parseSSELine(buffer.trim());
          if (parsed && !parsed.done) {
            const translated = translateResponse(targetFormat, sourceFormat, parsed, state);

            if (translated?._openaiIntermediate) {
              for (const item of translated._openaiIntermediate) {
                const openaiOutput = formatSSE(item, FORMATS.OPENAI);
                reqLogger?.appendOpenAIChunk?.(openaiOutput);
              }
            }

            if (translated?.length > 0) {
              for (const item of translated) {
                const output = formatSSE(item, sourceFormat);
                reqLogger?.appendConvertedChunk?.(output);
                controller.enqueue(sharedEncoder.encode(output));
              }
            }
          }
        }

        const flushed = translateResponse(targetFormat, sourceFormat, null, state);

        if (flushed?._openaiIntermediate) {
          for (const item of flushed._openaiIntermediate) {
            const openaiOutput = formatSSE(item, FORMATS.OPENAI);
            reqLogger?.appendOpenAIChunk?.(openaiOutput);
          }
        }

        if (flushed?.length > 0) {
          for (const item of flushed) {
            const output = formatSSE(item, sourceFormat);
            reqLogger?.appendConvertedChunk?.(output);
            controller.enqueue(sharedEncoder.encode(output));
          }
        }

        // Responses API SSE does not use [DONE] sentinel — stream ends after response.completed
        emitDoneMarker(controller);

        if (!hasValidUsage(state?.usage) && totalContentLength > 0) {
          state.usage = estimateUsage(body, totalContentLength, sourceFormat);
        }

        if (hasValidUsage(state?.usage)) {
          logUsage(state.provider || targetFormat, state.usage, model, connectionId, apiKey);
        } else {
          appendRequestLog({ model, provider, connectionId, tokens: null, status: "200 OK" }).catch(() => { });
        }
        
        if (onStreamComplete) {
          onStreamComplete({
            content: accumulatedContent,
            thinking: accumulatedThinking
          }, state?.usage, ttftAt);
          enqueueInterventionEvents(controller);
        }
      } catch (error) {
        emitStreamError(controller, error);
        emitDoneMarker(controller);
      }
    }
  });
}

export function createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider = null, reqLogger = null, toolNameMap = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, interventionState = null) {
  return createSSEStream({
    mode: STREAM_MODE.TRANSLATE,
    targetFormat,
    sourceFormat,
    provider,
    reqLogger,
    toolNameMap,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey,
    interventionState
  });
}

export function createPassthroughStreamWithLogger(provider = null, reqLogger = null, model = null, connectionId = null, body = null, onStreamComplete = null, apiKey = null, interventionState = null) {
  return createSSEStream({
    mode: STREAM_MODE.PASSTHROUGH,
    provider,
    reqLogger,
    model,
    connectionId,
    body,
    onStreamComplete,
    apiKey,
    interventionState
  });
}
