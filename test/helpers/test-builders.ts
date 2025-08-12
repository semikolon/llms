import { UnifiedChatRequest, UnifiedMessage, UnifiedTool } from "@/types/llm";

/**
 * Test builders for creating consistent test data
 */

export class UnifiedRequestBuilder {
  private request: Partial<UnifiedChatRequest> = {
    messages: [],
    model: "gpt-5",
    stream: false
  };

  static create(): UnifiedRequestBuilder {
    return new UnifiedRequestBuilder();
  }

  withModel(model: string): UnifiedRequestBuilder {
    this.request.model = model;
    return this;
  }

  withMessage(role: "user" | "assistant" | "system" | "tool", content: string): UnifiedRequestBuilder {
    this.request.messages = this.request.messages || [];
    this.request.messages.push({
      role,
      content
    });
    return this;
  }

  withMessages(messages: UnifiedMessage[]): UnifiedRequestBuilder {
    this.request.messages = messages;
    return this;
  }

  withStream(stream: boolean = true): UnifiedRequestBuilder {
    this.request.stream = stream;
    return this;
  }

  withMaxTokens(maxTokens: number): UnifiedRequestBuilder {
    this.request.max_tokens = maxTokens;
    return this;
  }

  withTemperature(temperature: number): UnifiedRequestBuilder {
    this.request.temperature = temperature;
    return this;
  }

  withReasoning(effort: "low" | "medium" | "high", enabled: boolean = true): UnifiedRequestBuilder {
    this.request.reasoning = {
      effort,
      enabled
    };
    return this;
  }

  withTool(name: string, description: string, parameters: any): UnifiedRequestBuilder {
    this.request.tools = this.request.tools || [];
    this.request.tools.push({
      type: "function",
      function: {
        name,
        description,
        parameters
      }
    });
    return this;
  }

  withToolChoice(choice: "auto" | "none" | "required" | string): UnifiedRequestBuilder {
    this.request.tool_choice = choice;
    return this;
  }

  build(): UnifiedChatRequest {
    return this.request as UnifiedChatRequest;
  }
}

export class ResponsesRequestBuilder {
  private request: any = {
    model: "gpt-5",
    input: [],
    stream: false
  };

  static create(): ResponsesRequestBuilder {
    return new ResponsesRequestBuilder();
  }

  withModel(model: string): ResponsesRequestBuilder {
    this.request.model = model;
    return this;
  }

  withInput(messages: Array<{ role: string; content: string }>): ResponsesRequestBuilder {
    this.request.input = messages;
    return this;
  }

  withStream(stream: boolean = true): ResponsesRequestBuilder {
    this.request.stream = stream;
    return this;
  }

  withMaxCompletionTokens(tokens: number): ResponsesRequestBuilder {
    this.request.max_completion_tokens = tokens;
    return this;
  }

  withTemperature(temperature: number): ResponsesRequestBuilder {
    this.request.temperature = temperature;
    return this;
  }

  withReasoningEffort(effort: "low" | "medium" | "high"): ResponsesRequestBuilder {
    this.request.reasoning_effort = effort;
    return this;
  }

  withTools(tools: any[]): ResponsesRequestBuilder {
    this.request.tools = tools;
    return this;
  }

  withToolChoice(choice: any): ResponsesRequestBuilder {
    this.request.tool_choice = choice;
    return this;
  }

  build(): any {
    return this.request;
  }
}

export class ModelCapabilityBuilder {
  private capability: any = {
    api: "responses",
    supports: {
      tools: true,
      reasoning: true
    },
    sseEvents: [],
    usageDims: []
  };

  static create(): ModelCapabilityBuilder {
    return new ModelCapabilityBuilder();
  }

  withAPI(api: "responses" | "chat"): ModelCapabilityBuilder {
    this.capability.api = api;
    return this;
  }

  withToolSupport(supported: boolean = true): ModelCapabilityBuilder {
    this.capability.supports.tools = supported;
    return this;
  }

  withReasoningSupport(supported: boolean = true): ModelCapabilityBuilder {
    this.capability.supports.reasoning = supported;
    return this;
  }

  withSSEEvents(events: string[]): ModelCapabilityBuilder {
    this.capability.sseEvents = events;
    return this;
  }

  withUsageDims(dims: ("input" | "completion" | "reasoning")[]): ModelCapabilityBuilder {
    this.capability.usageDims = dims;
    return this;
  }

  build(): any {
    return this.capability;
  }
}

export class UnifiedEventBuilder {
  private event: any = {
    kind: "output.delta"
  };

  static create(): UnifiedEventBuilder {
    return new UnifiedEventBuilder();
  }

  withKind(kind: "reasoning.delta" | "output.delta" | "tool_call" | "tool_result" | "done"): UnifiedEventBuilder {
    this.event.kind = kind;
    return this;
  }

  withContent(content: string): UnifiedEventBuilder {
    this.event.content = content;
    return this;
  }

  withDelta(delta: any): UnifiedEventBuilder {
    this.event.delta = delta;
    return this;
  }

  build(): any {
    return this.event;
  }
}

/**
 * Predefined test data constants
 */
export const TEST_MODELS = {
  RESPONSES_API: ["gpt-5", "gpt-5-mini", "gpt-5-nano", "o3", "o3-mini", "o3-pro", "o4-mini", "codex-mini"],
  CHAT_API: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
} as const;

export const TEST_MESSAGES = {
  SIMPLE_USER: { role: "user" as const, content: "Hello, how are you?" },
  SYSTEM_PROMPT: { role: "system" as const, content: "You are a helpful assistant." },
  ASSISTANT_RESPONSE: { role: "assistant" as const, content: "I'm doing well, thank you for asking!" }
} as const;

export const TEST_TOOLS = {
  WEATHER_TOOL: {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get current weather information",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          units: { type: "string", enum: ["celsius", "fahrenheit"] }
        },
        required: ["city"]
      }
    }
  },
  CALCULATOR_TOOL: {
    type: "function" as const,
    function: {
      name: "calculate",
      description: "Perform mathematical calculations",
      parameters: {
        type: "object", 
        properties: {
          expression: { type: "string", description: "Mathematical expression" }
        },
        required: ["expression"]
      }
    }
  }
} as const;

export const TEST_SSE_EVENTS = {
  RESPONSE_CREATED: {
    event: "response.created",
    data: '{"id":"resp_123","object":"response","created":1704067200,"model":"gpt-5"}'
  },
  REASONING_DELTA: {
    event: "reasoning.delta",
    data: '{"id":"resp_123","object":"response.delta","delta":{"reasoning_content":"Let me think about this..."}}'
  },
  OUTPUT_DELTA: {
    event: "output.delta", 
    data: '{"id":"resp_123","object":"response.delta","delta":{"content":"Hello"}}'
  },
  TOOL_CALL: {
    event: "tool_calls",
    data: '{"id":"resp_123","object":"response.delta","delta":{"tool_calls":[{"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\":\\"NYC\\"}"}}]}}'
  },
  RESPONSE_COMPLETED: {
    event: "response.completed",
    data: '{"id":"resp_123","object":"response","model":"gpt-5","choices":[{"message":{"role":"assistant","content":"Hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"reasoning_tokens":50,"total_tokens":65}}'
  }
} as const;