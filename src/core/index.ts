import { UnifiedChatRequest } from "@/types/llm";
import { transformToResponsesRequest } from "./transform/request-transformer";

/**
 * Model capability interface - defines what API and features a model supports
 */
export interface ModelCapability {
  api: 'responses' | 'chat';
  supports: { 
    tools: boolean; 
    reasoning: boolean; 
  };
  sseEvents: string[];
  usageDims: ('input' | 'completion' | 'reasoning')[];
}

/**
 * Model catalog mapping model names to their capabilities
 */
const MODEL_CATALOG: Map<string, ModelCapability> = new Map([
  // OpenAI Responses API models (GPT-5, o3 series, codex-mini)
  ['gpt-5', {
    api: 'responses',
    supports: { tools: true, reasoning: true },
    sseEvents: ['response.created', 'reasoning.delta', 'output.delta', 'tool_calls', 'response.completed'],
    usageDims: ['input', 'completion', 'reasoning']
  }],
  ['gpt-5-mini', {
    api: 'responses',
    supports: { tools: true, reasoning: true },
    sseEvents: ['response.created', 'reasoning.delta', 'output.delta', 'tool_calls', 'response.completed'],
    usageDims: ['input', 'completion', 'reasoning']
  }],
  ['o3', {
    api: 'responses',
    supports: { tools: true, reasoning: true },
    sseEvents: ['response.created', 'reasoning.delta', 'output.delta', 'tool_calls', 'response.completed'],
    usageDims: ['input', 'completion', 'reasoning']
  }],
  ['o3-mini', {
    api: 'responses',
    supports: { tools: true, reasoning: true },
    sseEvents: ['response.created', 'reasoning.delta', 'output.delta', 'tool_calls', 'response.completed'],
    usageDims: ['input', 'completion', 'reasoning']
  }],
  ['codex-mini', {
    api: 'responses',
    supports: { tools: false, reasoning: true },
    sseEvents: ['response.created', 'reasoning.delta', 'output.delta', 'response.completed'],
    usageDims: ['input', 'completion', 'reasoning']
  }],

  // OpenAI Chat Completions API models (GPT-4o, GPT-4-turbo, etc.)
  ['gpt-4o', {
    api: 'chat',
    supports: { tools: true, reasoning: false },
    sseEvents: ['data'],
    usageDims: ['input', 'completion']
  }],
  ['gpt-4o-mini', {
    api: 'chat',
    supports: { tools: true, reasoning: false },
    sseEvents: ['data'],
    usageDims: ['input', 'completion']
  }],
  ['gpt-4-turbo', {
    api: 'chat',
    supports: { tools: true, reasoning: false },
    sseEvents: ['data'],
    usageDims: ['input', 'completion']
  }],
  ['gpt-4', {
    api: 'chat',
    supports: { tools: true, reasoning: false },
    sseEvents: ['data'],
    usageDims: ['input', 'completion']
  }],
]);

/**
 * Default capability for unknown models (conservative fallback)
 */
const DEFAULT_CAPABILITY: ModelCapability = {
  api: 'chat',
  supports: { tools: false, reasoning: false },
  sseEvents: ['data'],
  usageDims: ['input', 'completion']
};

/**
 * Get the capability for a specific model
 */
export function getModelCapability(model: string): ModelCapability {
  // Check exact match first
  const capability = MODEL_CATALOG.get(model);
  if (capability) {
    return capability;
  }

  // Check model family patterns (check more specific patterns first)
  if (model.startsWith('gpt-5-mini')) {
    return MODEL_CATALOG.get('gpt-5-mini')!;
  }
  if (model.startsWith('gpt-5')) {
    return MODEL_CATALOG.get('gpt-5')!;
  }
  if (model.startsWith('o3-mini')) {
    return MODEL_CATALOG.get('o3-mini')!;
  }
  if (model.startsWith('o3')) {
    return MODEL_CATALOG.get('o3')!;
  }
  if (model.startsWith('gpt-4o')) {
    return MODEL_CATALOG.get('gpt-4o')!;
  }
  if (model.startsWith('gpt-4')) {
    return MODEL_CATALOG.get('gpt-4')!;
  }

  // Return conservative default for unknown models
  return DEFAULT_CAPABILITY;
}

/**
 * Transform a unified request to provider-specific request format
 */
export function transformToProviderRequest(
  request: UnifiedChatRequest, 
  capability: ModelCapability
): any {
  if (capability.api === 'responses') {
    return transformToResponsesRequest(request);
  } else {
    return transformToChatAPI(request);
  }
}


/**
 * Transform unified request to OpenAI Chat Completions API format
 */
function transformToChatAPI(request: UnifiedChatRequest): any {
  // For Chat API, return the request mostly unchanged
  return request;
}

/**
 * Transform provider response to unified format
 */
export function transformFromProviderResponse(
  response: any,
  capability: ModelCapability
): any {
  // For now, pass through responses
  // This will be enhanced as needed
  return response;
}

/**
 * Unify usage statistics across different APIs
 */
export function unifyUsage(usage: any, capability: ModelCapability): any {
  if (!usage) return usage;

  // Ensure reasoning_tokens is present for Responses API models
  if (capability.api === 'responses' && capability.supports.reasoning) {
    return {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      reasoning_tokens: usage.reasoning_tokens || 0,
      total_tokens: usage.total_tokens || 
        (usage.prompt_tokens || 0) + 
        (usage.completion_tokens || 0) + 
        (usage.reasoning_tokens || 0)
    };
  }

  // For Chat API models, no reasoning tokens
  return {
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens || 
      (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
  };
}

/**
 * Builder for ModelCapability (used in tests)
 */
export class ModelCapabilityBuilder {
  private capability: ModelCapability = {
    api: 'responses',
    supports: { tools: false, reasoning: false },
    sseEvents: [],
    usageDims: []
  };

  static create(): ModelCapabilityBuilder {
    return new ModelCapabilityBuilder();
  }

  withAPI(api: 'responses' | 'chat'): ModelCapabilityBuilder {
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

  withUsageDims(dims: ('input' | 'completion' | 'reasoning')[]): ModelCapabilityBuilder {
    this.capability.usageDims = dims;
    return this;
  }

  build(): ModelCapability {
    return { ...this.capability };
  }
}