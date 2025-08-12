import { expect } from "chai";
import { UnifiedChatRequest, UnifiedChatResponse } from "@/types/llm";

/**
 * Custom assertions for validating test invariants
 */

export class TestAssertions {
  /**
   * Assert that a request follows Responses API format
   */
  static assertResponsesAPIFormat(request: any): void {
    expect(request).to.have.property("input").that.is.an("array");
    expect(request).to.have.property("model").that.is.a("string");
    expect(request).to.not.have.property("messages");
    
    if (request.max_tokens !== undefined) {
      expect(request).to.have.property("max_completion_tokens");
      expect(request).to.not.have.property("max_tokens");
    }
    
    if (request.reasoning !== undefined) {
      expect(request).to.have.property("reasoning_effort");
      expect(request).to.not.have.property("reasoning");
    }
  }

  /**
   * Assert that a request follows Chat Completions API format
   */
  static assertChatAPIFormat(request: any): void {
    expect(request).to.have.property("messages").that.is.an("array");
    expect(request).to.have.property("model").that.is.a("string");
    expect(request).to.not.have.property("input");
    expect(request).to.not.have.property("max_completion_tokens");
    expect(request).to.not.have.property("reasoning_effort");
  }

  /**
   * Assert that a model requires Responses API
   */
  static assertRequiresResponsesAPI(model: string): void {
    const responsesModels = ["gpt-5", "gpt-5-mini", "gpt-5-nano", "o3", "o3-mini", "o3-pro", "o4-mini", "codex-mini"];
    const requiresResponses = responsesModels.some(m => model.includes(m)) || 
                             model.startsWith("gpt-5") || 
                             model.startsWith("o3") || 
                             model.startsWith("o4");
    
    expect(requiresResponses).to.be.true;
  }

  /**
   * Assert that a model uses Chat Completions API
   */
  static assertUsesChatAPI(model: string): void {
    const chatModels = ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"];
    const usesChat = chatModels.some(m => model.includes(m)) && 
                    !model.startsWith("gpt-5") && 
                    !model.startsWith("o3") && 
                    !model.startsWith("o4");
    
    expect(usesChat).to.be.true;
  }

  /**
   * Assert that usage tracking includes reasoning tokens
   */
  static assertHasReasoningTokens(usage: any): void {
    expect(usage).to.have.property("reasoning_tokens").that.is.a("number");
    expect(usage.reasoning_tokens).to.be.at.least(0);
    
    // Verify total tokens calculation
    const expectedTotal = (usage.prompt_tokens || 0) + 
                         (usage.completion_tokens || 0) + 
                         (usage.reasoning_tokens || 0);
    expect(usage.total_tokens).to.equal(expectedTotal);
  }

  /**
   * Assert that usage tracking does NOT include reasoning tokens (for Chat API)
   */
  static assertNoReasoningTokens(usage: any): void {
    expect(usage).to.not.have.property("reasoning_tokens");
    
    // Verify total tokens calculation without reasoning
    const expectedTotal = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
    expect(usage.total_tokens).to.equal(expectedTotal);
  }

  /**
   * Assert SSE event format
   */
  static assertSSEEvent(event: any, expectedType?: string): void {
    expect(event).to.have.property("data").that.is.a("string");
    
    if (expectedType) {
      expect(event).to.have.property("event", expectedType);
    }
    
    // Validate JSON data
    expect(() => JSON.parse(event.data)).to.not.throw();
  }

  /**
   * Assert unified event format
   */
  static assertUnifiedEvent(event: any): void {
    expect(event).to.have.property("kind").that.is.a("string");
    
    const validKinds = ["reasoning.delta", "output.delta", "tool_call", "tool_result", "done"];
    expect(validKinds).to.include(event.kind);
    
    if (event.kind.includes("delta")) {
      expect(event).to.satisfy((e: any) => 
        e.hasOwnProperty("content") || e.hasOwnProperty("delta")
      );
    }
  }

  /**
   * Assert that transformation preserves semantic meaning
   */
  static assertSemanticPreservation(original: UnifiedChatRequest, transformed: any): void {
    expect(transformed.model).to.equal(original.model);
    
    // Messages should be preserved in some form
    if (original.messages) {
      expect(transformed).to.satisfy((t: any) => 
        t.hasOwnProperty("messages") || t.hasOwnProperty("input")
      );
    }
    
    // Temperature should be preserved
    if (original.temperature !== undefined) {
      expect(transformed.temperature).to.equal(original.temperature);
    }
    
    // Streaming setting should be preserved
    if (original.stream !== undefined) {
      expect(transformed.stream).to.equal(original.stream);
    }
  }

  /**
   * Assert backward compatibility (existing functionality unchanged)
   */
  static assertBackwardCompatibility(
    originalRequest: any, 
    originalResponse: any,
    transformedRequest: any,
    transformedResponse: any
  ): void {
    // For non-Responses models, requests should be unchanged
    if (!this.isResponsesModel(originalRequest.model)) {
      expect(transformedRequest).to.deep.equal(originalRequest);
    }
    
    // Response structure should remain compatible
    expect(transformedResponse).to.have.property("choices").that.is.an("array");
    expect(transformedResponse).to.have.property("usage").that.is.an("object");
    expect(transformedResponse).to.have.property("model").that.is.a("string");
  }

  /**
   * Assert performance constraints
   */
  static assertPerformanceConstraints(duration: number, maxMs: number = 100): void {
    expect(duration).to.be.at.most(maxMs, `Operation took ${duration}ms, expected <= ${maxMs}ms`);
  }

  /**
   * Assert streaming completeness (all events properly terminated)
   */
  static assertStreamingCompleteness(events: any[]): void {
    expect(events).to.have.length.at.least(1);
    
    // Should have a completion or done event
    const hasCompletion = events.some(e => 
      e.event === "response.completed" || 
      (e.data && typeof e.data === "string" && e.data.includes("finish_reason")) ||
      e.data === "[DONE]"
    );
    
    expect(hasCompletion).to.be.true;
  }

  private static isResponsesModel(model: string): boolean {
    return model.startsWith("gpt-5") || 
           model.startsWith("o3") || 
           model.startsWith("o4") ||
           model.includes("codex-mini");
  }
}

/**
 * Invariant checkers for consistent validation
 */
export class TestInvariants {
  /**
   * Check that request transformation is reversible (where applicable)
   */
  static checkTransformationReversibility(
    original: UnifiedChatRequest,
    transformed: any,
    reverseTransformer: (req: any) => UnifiedChatRequest
  ): void {
    const reversed = reverseTransformer(transformed);
    
    // Core fields should match
    expect(reversed.model).to.equal(original.model);
    expect(reversed.temperature).to.equal(original.temperature);
    expect(reversed.stream).to.equal(original.stream);
    
    // Messages content should be preserved (format may differ)
    if (original.messages && reversed.messages) {
      expect(reversed.messages).to.have.length(original.messages.length);
    }
  }

  /**
   * Check that all supported models are properly categorized
   */
  static checkModelCategorization(modelCatalog: Map<string, any>): void {
    for (const [model, config] of modelCatalog.entries()) {
      expect(config).to.have.property("api").that.is.oneOf(["responses", "chat"]);
      expect(config).to.have.property("supports").that.is.an("object");
      expect(config.supports).to.have.property("tools").that.is.a("boolean");
      expect(config.supports).to.have.property("reasoning").that.is.a("boolean");
    }
  }

  /**
   * Check that usage tracking is comprehensive
   */
  static checkUsageTrackingCompleteness(usage: any, modelType: "responses" | "chat"): void {
    expect(usage).to.have.property("prompt_tokens").that.is.a("number");
    expect(usage).to.have.property("completion_tokens").that.is.a("number");
    expect(usage).to.have.property("total_tokens").that.is.a("number");
    
    if (modelType === "responses") {
      expect(usage).to.have.property("reasoning_tokens").that.is.a("number");
    }
    
    // Verify total calculation
    const expectedTotal = (usage.prompt_tokens || 0) + 
                         (usage.completion_tokens || 0) + 
                         (usage.reasoning_tokens || 0);
    expect(usage.total_tokens).to.equal(expectedTotal);
  }
}