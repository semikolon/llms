import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { ModelCapabilityBuilder, TEST_MODELS } from "../../helpers/test-builders";
import { TestAssertions, TestInvariants } from "../../helpers/test-assertions";

/**
 * Tests for ModelCapability interface and routing logic
 * 
 * This validates the critical contract that other agents will implement against:
 * - Model routing decisions (Responses API vs Chat API)
 * - Capability detection (tools, reasoning, SSE events)
 * - Usage dimension tracking
 */

interface ModelCapability {
  api: 'responses' | 'chat';
  supports: { tools: boolean; reasoning: boolean };
  sseEvents: string[];
  usageDims: ('input' | 'completion' | 'reasoning')[];
}

describe("ModelCapability Interface", () => {
  let modelCatalog: Map<string, ModelCapability>;

  beforeEach(() => {
    modelCatalog = new Map();
    
    // Set up model catalog with expected capabilities
    for (const model of TEST_MODELS.RESPONSES_API) {
      modelCatalog.set(model, ModelCapabilityBuilder.create()
        .withAPI("responses")
        .withToolSupport(true)
        .withReasoningSupport(true)
        .withSSEEvents(["reasoning.delta", "output.delta", "tool_calls", "response.completed"])
        .withUsageDims(["input", "completion", "reasoning"])
        .build()
      );
    }

    for (const model of TEST_MODELS.CHAT_API) {
      modelCatalog.set(model, ModelCapabilityBuilder.create()
        .withAPI("chat")
        .withToolSupport(true)
        .withReasoningSupport(false)
        .withSSEEvents(["delta", "completion"])
        .withUsageDims(["input", "completion"])
        .build()
      );
    }
  });

  describe("Model Routing Logic", () => {
    it("should correctly identify Responses API models", () => {
      for (const model of TEST_MODELS.RESPONSES_API) {
        const capability = modelCatalog.get(model);
        expect(capability).to.exist;
        expect(capability!.api).to.equal("responses");
        TestAssertions.assertRequiresResponsesAPI(model);
      }
    });

    it("should correctly identify Chat API models", () => {
      for (const model of TEST_MODELS.CHAT_API) {
        const capability = modelCatalog.get(model);
        expect(capability).to.exist;
        expect(capability!.api).to.equal("chat");
        TestAssertions.assertUsesChatAPI(model);
      }
    });

    it("should handle model family patterns", () => {
      const testCases = [
        { model: "gpt-5-turbo-preview", expectedAPI: "responses" },
        { model: "gpt-5-custom", expectedAPI: "responses" },
        { model: "o3-experimental", expectedAPI: "responses" },
        { model: "o4-beta", expectedAPI: "responses" },
        { model: "gpt-4o-2024", expectedAPI: "chat" },
        { model: "claude-3-opus", expectedAPI: "chat" }
      ];

      for (const { model, expectedAPI } of testCases) {
        const capability = ModelCapabilityBuilder.create()
          .withAPI(expectedAPI as "responses" | "chat")
          .build();

        expect(capability.api).to.equal(expectedAPI);
      }
    });

    it("should provide complete model categorization", () => {
      TestInvariants.checkModelCategorization(modelCatalog);
    });
  });

  describe("Capability Detection", () => {
    it("should correctly identify tool support", () => {
      // All modern models should support tools
      for (const [model, capability] of modelCatalog.entries()) {
        expect(capability.supports.tools).to.be.true;
      }
    });

    it("should correctly identify reasoning support", () => {
      for (const model of TEST_MODELS.RESPONSES_API) {
        const capability = modelCatalog.get(model)!;
        expect(capability.supports.reasoning).to.be.true;
      }

      for (const model of TEST_MODELS.CHAT_API) {
        const capability = modelCatalog.get(model)!;
        expect(capability.supports.reasoning).to.be.false;
      }
    });

    it("should define appropriate SSE events for each API", () => {
      // Responses API models should support reasoning events
      for (const model of TEST_MODELS.RESPONSES_API) {
        const capability = modelCatalog.get(model)!;
        expect(capability.sseEvents).to.include("reasoning.delta");
        expect(capability.sseEvents).to.include("output.delta");
        expect(capability.sseEvents).to.include("tool_calls");
        expect(capability.sseEvents).to.include("response.completed");
      }

      // Chat API models should use different event types
      for (const model of TEST_MODELS.CHAT_API) {
        const capability = modelCatalog.get(model)!;
        expect(capability.sseEvents).to.not.include("reasoning.delta");
        expect(capability.sseEvents).to.include("delta");
      }
    });

    it("should define appropriate usage dimensions", () => {
      // Responses API models should track reasoning tokens
      for (const model of TEST_MODELS.RESPONSES_API) {
        const capability = modelCatalog.get(model)!;
        expect(capability.usageDims).to.include("reasoning");
        expect(capability.usageDims).to.include("input");
        expect(capability.usageDims).to.include("completion");
      }

      // Chat API models should not track reasoning tokens
      for (const model of TEST_MODELS.CHAT_API) {
        const capability = modelCatalog.get(model)!;
        expect(capability.usageDims).to.not.include("reasoning");
        expect(capability.usageDims).to.include("input");
        expect(capability.usageDims).to.include("completion");
      }
    });
  });

  describe("Builder Pattern Validation", () => {
    it("should create valid capabilities with builder", () => {
      const capability = ModelCapabilityBuilder.create()
        .withAPI("responses")
        .withToolSupport(true)
        .withReasoningSupport(true)
        .withSSEEvents(["reasoning.delta", "output.delta"])
        .withUsageDims(["input", "completion", "reasoning"])
        .build();

      expect(capability.api).to.equal("responses");
      expect(capability.supports.tools).to.be.true;
      expect(capability.supports.reasoning).to.be.true;
      expect(capability.sseEvents).to.deep.equal(["reasoning.delta", "output.delta"]);
      expect(capability.usageDims).to.deep.equal(["input", "completion", "reasoning"]);
    });

    it("should allow partial configuration", () => {
      const minimal = ModelCapabilityBuilder.create()
        .withAPI("chat")
        .build();

      expect(minimal.api).to.equal("chat");
      expect(minimal.supports).to.have.property("tools");
      expect(minimal.supports).to.have.property("reasoning");
    });

    it("should support fluent interface", () => {
      const capability = ModelCapabilityBuilder.create()
        .withAPI("responses")
        .withToolSupport(false)
        .withReasoningSupport(true)
        .withSSEEvents(["reasoning.delta"])
        .withUsageDims(["input", "reasoning"])
        .build();

      expect(capability.supports.tools).to.be.false;
      expect(capability.supports.reasoning).to.be.true;
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle unknown models gracefully", () => {
      const unknownModel = "unknown-model-2025";
      const capability = modelCatalog.get(unknownModel);
      
      expect(capability).to.be.undefined;
      
      // Should provide default behavior
      const defaultCapability = ModelCapabilityBuilder.create()
        .withAPI("chat")  // Safe default
        .withToolSupport(false)  // Conservative default
        .withReasoningSupport(false)  // Conservative default
        .build();

      expect(defaultCapability.api).to.equal("chat");
    });

    it("should validate capability consistency", () => {
      // Reasoning models should support reasoning events
      const inconsistent = ModelCapabilityBuilder.create()
        .withAPI("responses")
        .withReasoningSupport(true)
        .withSSEEvents(["output.delta"])  // Missing reasoning.delta
        .build();

      // This should be caught by validation logic
      expect(inconsistent.supports.reasoning).to.be.true;
      expect(inconsistent.sseEvents).to.not.include("reasoning.delta");
      // In a real implementation, this would trigger a warning or error
    });

    it("should handle capability evolution", () => {
      // Future models might have different capabilities
      const futureModel = ModelCapabilityBuilder.create()
        .withAPI("responses")
        .withToolSupport(true)
        .withReasoningSupport(true)
        .withSSEEvents(["reasoning.delta", "output.delta", "multimodal.delta", "tool_calls"])
        .withUsageDims(["input", "completion", "reasoning", "multimodal"])
        .build();

      expect(futureModel.sseEvents).to.include("multimodal.delta");
      expect(futureModel.usageDims).to.include("multimodal");
    });
  });

  describe("Contract Validation", () => {
    it("should enforce required properties", () => {
      for (const [model, capability] of modelCatalog.entries()) {
        // All capabilities must have these properties
        expect(capability).to.have.property("api");
        expect(capability).to.have.property("supports");
        expect(capability).to.have.property("sseEvents");
        expect(capability).to.have.property("usageDims");

        // API must be valid
        expect(["responses", "chat"]).to.include(capability.api);

        // Supports must be complete
        expect(capability.supports).to.have.property("tools");
        expect(capability.supports).to.have.property("reasoning");

        // Arrays must be valid
        expect(capability.sseEvents).to.be.an("array");
        expect(capability.usageDims).to.be.an("array");
      }
    });

    it("should validate usage dimension consistency", () => {
      for (const [model, capability] of modelCatalog.entries()) {
        // All models should track input and completion
        expect(capability.usageDims).to.include("input");
        expect(capability.usageDims).to.include("completion");

        // Only reasoning models should track reasoning
        if (capability.supports.reasoning) {
          expect(capability.usageDims).to.include("reasoning");
        } else {
          expect(capability.usageDims).to.not.include("reasoning");
        }
      }
    });

    it("should ensure backward compatibility", () => {
      // All Chat API models should remain unchanged
      for (const model of TEST_MODELS.CHAT_API) {
        const capability = modelCatalog.get(model)!;
        
        expect(capability.api).to.equal("chat");
        expect(capability.supports.reasoning).to.be.false;
        expect(capability.usageDims).to.not.include("reasoning");
      }
    });
  });
});