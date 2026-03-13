// OpenAI helper functions for translator

// Valid OpenAI content block types
export const VALID_OPENAI_CONTENT_TYPES = ["text", "image_url", "image"];
export const VALID_OPENAI_MESSAGE_TYPES = ["text", "image_url", "image", "tool_calls", "tool_result"];

// Filter messages to OpenAI standard format
// Remove: thinking, redacted_thinking, signature, and other non-OpenAI blocks
export function filterToOpenAIFormat(body) {
  if (!body.messages || !Array.isArray(body.messages)) return body;

  body.messages = body.messages.map(msg => {
    // Keep tool messages as-is (OpenAI format)
    if (msg.role === "tool") return msg;

    // Keep assistant messages with tool_calls as-is
    if (msg.role === "assistant" && msg.tool_calls) return msg;

    // Handle string content
    if (typeof msg.content === "string") return msg;

    // Handle array content
    if (Array.isArray(msg.content)) {
      const filteredContent = [];

      for (const block of msg.content) {
        // Skip thinking blocks
        if (block.type === "thinking" || block.type === "redacted_thinking") continue;

        // Only keep valid OpenAI content types
        if (VALID_OPENAI_CONTENT_TYPES.includes(block.type)) {
          // Remove signature field if exists
          const { signature, cache_control, ...cleanBlock } = block;
          filteredContent.push(cleanBlock);
        } else if (block.type === "tool_use") {
          // Convert tool_use to tool_calls format (handled separately)
          continue;
        } else if (block.type === "tool_result") {
          // Keep tool_result but clean it
          const { signature, cache_control, ...cleanBlock } = block;
          filteredContent.push(cleanBlock);
        }
      }

      // If all content was filtered, add empty text
      if (filteredContent.length === 0) {
        filteredContent.push({ type: "text", text: "" });
      }

      // Normalize: if content is array with only text blocks, convert to string
      // This handles cases where clients send multimodal format for simple text
      const hasOnlyText = filteredContent.every(block => block.type === "text");
      if (hasOnlyText && filteredContent.length > 0) {
        const textContent = filteredContent.map(block => block.text || "").join("");
        return { ...msg, content: textContent };
      }

      return { ...msg, content: filteredContent };
    }

    return msg;
  });
  
  // Filter out messages with only empty text (but NEVER filter tool messages)
  body.messages = body.messages.filter(msg => {
    // Always keep tool messages
    if (msg.role === "tool") return true;
    // Always keep assistant messages with tool_calls
    if (msg.role === "assistant" && msg.tool_calls) return true;
    
    if (typeof msg.content === "string") return msg.content.trim() !== "";
    if (Array.isArray(msg.content)) {
      return msg.content.some(b => 
        (b.type === "text" && b.text?.trim()) ||
        b.type !== "text"
      );
    }
    return true;
  });

  // Remove empty tools array (some providers like QWEN reject it)
  if (body.tools && Array.isArray(body.tools) && body.tools.length === 0) {
    delete body.tools;
  }

  // Normalize tools to OpenAI format (from Claude, Gemini, etc.)
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    body.tools = body.tools.map(tool => {
      // Already OpenAI format
      if (tool.type === "function" && tool.function) return tool;
      
      // Claude format: {name, description, input_schema}
      if (tool.name && (tool.input_schema || tool.description)) {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description || "",
            parameters: tool.input_schema || { type: "object", properties: {} }
          }
        };
      }
      
      // Gemini format: {functionDeclarations: [{name, description, parameters}]}
      if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
        return tool.functionDeclarations.map(fn => ({
          type: "function",
          function: {
            name: fn.name,
            description: fn.description || "",
            parameters: fn.parameters || { type: "object", properties: {} }
          }
        }));
      }
      
      return tool;
    }).flat();
  }

  // Normalize tool_choice to OpenAI format
  // NOTE: tool_choice does NOT support "required" or object type in thinking mode
  // Must remove tool_choice when thinking is enabled to avoid 400 error
  const hasThinking = !!(body.reasoning_effort || body.thinking?.type === "enabled");
  
  if (body.tool_choice && typeof body.tool_choice === "object") {
    const choice = body.tool_choice;
    // Claude format: {type: "auto|any|tool", name?: "..."}
    if (choice.type === "auto") {
      body.tool_choice = "auto";
    } else if (choice.type === "any") {
      // Remove tool_choice if thinking mode enabled, otherwise set to "required"
      if (hasThinking) {
        delete body.tool_choice;
      } else {
        body.tool_choice = "required";
      }
    } else if (choice.type === "tool" && choice.name) {
      // Remove tool_choice object if thinking mode enabled, otherwise convert
      if (hasThinking) {
        delete body.tool_choice;
      } else {
        body.tool_choice = { type: "function", function: { name: choice.name } };
      }
    }
  }
  
  // Also remove string tool_choice "required" if thinking mode enabled
  if (hasThinking && body.tool_choice === "required") {
    delete body.tool_choice;
  }
  
  // Remove tool_choice object type if thinking mode enabled
  if (hasThinking && typeof body.tool_choice === "object") {
    delete body.tool_choice;
  }

  return body;
}

