/**
 * Model Capability Detection and Routing
 * 
 * This module provides pure functions for detecting model capabilities
 * and routing requests to appropriate APIs (Responses vs Chat Completions).
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
 * Builder for creating ModelCapability objects
 */
export class ModelCapabilityBuilder {
  private capability: ModelCapability = {
    api: 'chat',
    supports: { tools: false, reasoning: false },
    sseEvents: [],
    usageDims: ['input', 'completion']
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

/**
 * Model catalog containing all known model capabilities
 */
export class ModelCatalog {
  private static capabilities = new Map<string, ModelCapability>();

  static {
    // Initialize with known model capabilities
    this.initializeCapabilities();
  }

  private static initializeCapabilities(): void {
    // Responses API models
    const responsesModels = [
      'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
      'o3', 'o3-mini', 'o3-pro', 
      'o4-mini',
      'codex-mini', 'codex-mini-latest'
    ];

    const responsesCapability = ModelCapabilityBuilder.create()
      .withAPI('responses')
      .withToolSupport(true)
      .withReasoningSupport(true)
      .withSSEEvents(['reasoning.delta', 'output.delta', 'tool_calls', 'response.completed'])
      .withUsageDims(['input', 'completion', 'reasoning'])
      .build();

    responsesModels.forEach(model => {
      this.capabilities.set(model, responsesCapability);
    });

    // Chat API models
    const chatModels = [
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'
    ];

    const chatCapability = ModelCapabilityBuilder.create()
      .withAPI('chat')
      .withToolSupport(true)
      .withReasoningSupport(false)
      .withSSEEvents(['delta', 'completion'])
      .withUsageDims(['input', 'completion'])
      .build();

    chatModels.forEach(model => {
      this.capabilities.set(model, chatCapability);
    });
  }

  /**
   * Get capability for a specific model
   */
  static getCapability(model: string): ModelCapability {
    // Direct lookup first
    const capability = this.capabilities.get(model);
    if (capability) {
      return capability;
    }

    // Pattern matching for model families
    if (this.isResponsesModel(model)) {
      return ModelCapabilityBuilder.create()
        .withAPI('responses')
        .withToolSupport(true)
        .withReasoningSupport(true)
        .withSSEEvents(['reasoning.delta', 'output.delta', 'tool_calls', 'response.completed'])
        .withUsageDims(['input', 'completion', 'reasoning'])
        .build();
    }

    // Default to Chat API for unknown models
    return ModelCapabilityBuilder.create()
      .withAPI('chat')
      .withToolSupport(true)
      .withReasoningSupport(false)
      .withSSEEvents(['delta', 'completion'])
      .withUsageDims(['input', 'completion'])
      .build();
  }

  /**
   * Check if a model requires Responses API based on pattern matching
   */
  private static isResponsesModel(model: string): boolean {
    const responsesPatterns = [
      'gpt-5', 'o3', 'o4', 'codex-mini'
    ];

    return responsesPatterns.some(pattern => 
      model.startsWith(pattern) || model.includes(pattern)
    );
  }

  /**
   * Check if model requires Responses API
   */
  static requiresResponsesAPI(model: string): boolean {
    return this.getCapability(model).api === 'responses';
  }

  /**
   * Check if model uses Chat Completions API
   */
  static usesChatAPI(model: string): boolean {
    return this.getCapability(model).api === 'chat';
  }
}