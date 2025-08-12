import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { OpenAIResponsesTransformer } from "@/transformer/openai-responses.transformer";
import { UnifiedRequestBuilder, ResponsesRequestBuilder, TEST_MODELS } from "../../helpers/test-builders";
import { TestAssertions } from "../../helpers/test-assertions";
import { FixtureLoader, CommonFixtures } from "../../helpers/fixture-loader";

describe("OpenAI Responses Transformer", () => {
  let transformer: OpenAIResponsesTransformer;

  beforeEach(() => {
    transformer = new OpenAIResponsesTransformer();
  });

  describe("Model Detection", () => {
    it("should identify models that require Responses API", () => {
      const responsesModels = TEST_MODELS.RESPONSES_API;
      
      for (const model of responsesModels) {
        const request = UnifiedRequestBuilder.create()
          .withModel(model)
          .withMessage("user", "Test message")
          .build();

        // Private method testing - we verify behavior through transformRequestOut
        transformer.transformRequestOut(request).then(result => {
          if (model.startsWith("gpt-5") || model.startsWith("o3") || model.startsWith("o4") || model.includes("codex-mini")) {
            TestAssertions.assertResponsesAPIFormat(result);
          }
        });
      }
    });

    it("should pass through models that use Chat Completions API", () => {
      const chatModels = TEST_MODELS.CHAT_API;
      
      for (const model of chatModels) {
        const request = UnifiedRequestBuilder.create()
          .withModel(model)
          .withMessage("user", "Test message")
          .build();

        transformer.transformRequestOut(request).then(result => {
          TestAssertions.assertChatAPIFormat(result);
        });
      }
    });

    it("should handle edge cases in model detection", () => {
      const edgeCases = [
        "gpt-5-turbo-preview",  // Should use Responses API
        "gpt-4o-gpt-5",         // Should use Chat API (doesn't start with gpt-5)
        "o3-turbo",             // Should use Responses API
        "custom-o3-model"       // Should use Chat API (doesn't start with o3)
      ];

      for (const model of edgeCases) {
        const request = UnifiedRequestBuilder.create()
          .withModel(model)
          .withMessage("user", "Test message")
          .build();

        transformer.transformRequestOut(request).then(result => {
          if (model.startsWith("gpt-5") || model.startsWith("o3") || model.startsWith("o4")) {
            TestAssertions.assertResponsesAPIFormat(result);
          } else {
            TestAssertions.assertChatAPIFormat(result);
          }
        });
      }
    });
  });

  describe("Request Transformation", () => {
    it("should transform UnifiedChatRequest to Responses API format", async () => {
      const unifiedRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("user", "What is the capital of France?")
        .withMaxTokens(100)
        .withTemperature(0.7)
        .withStream(true)
        .withReasoning("medium")
        .build();

      const result = await transformer.transformRequestOut(unifiedRequest);

      TestAssertions.assertResponsesAPIFormat(result);
      expect(result.model).to.equal("gpt-5");
      expect(result.input).to.deep.equal(unifiedRequest.messages);
      expect(result.max_completion_tokens).to.equal(100);
      expect(result.temperature).to.equal(0.7);
      expect(result.stream).to.equal(true);
      expect(result.reasoning_effort).to.equal("medium");
    });

    it("should preserve tools and tool_choice", async () => {
      const unifiedRequest = UnifiedRequestBuilder.create()
        .withModel("o3-mini")
        .withMessage("user", "What's the weather?")
        .withTool("get_weather", "Get weather info", {
          type: "object",
          properties: { city: { type: "string" } }
        })
        .withToolChoice("auto")
        .build();

      const result = await transformer.transformRequestOut(unifiedRequest);

      TestAssertions.assertResponsesAPIFormat(result);
      expect(result.tools).to.deep.equal(unifiedRequest.tools);
      expect(result.tool_choice).to.equal("auto");
    });

    it("should handle optional parameters correctly", async () => {
      const minimalRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("user", "Hello")
        .build();

      const result = await transformer.transformRequestOut(minimalRequest);

      TestAssertions.assertResponsesAPIFormat(result);
      expect(result.model).to.equal("gpt-5");
      expect(result.input).to.deep.equal(minimalRequest.messages);
      expect(result).to.not.have.property("max_completion_tokens");
      expect(result).to.not.have.property("reasoning_effort");
    });

    it("should use golden fixtures for transformation validation", async () => {
      const expectedRequest = FixtureLoader.loadJSON("openai/responses/gpt-5-basic-request.json");
      
      const unifiedRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("user", "What is the capital of France?")
        .withMaxTokens(100)
        .withTemperature(0.7)
        .withReasoning("medium")
        .build();

      const result = await transformer.transformRequestOut(unifiedRequest);

      // Verify structure matches golden fixture
      expect(result.model).to.equal(expectedRequest.model);
      expect(result.max_completion_tokens).to.equal(expectedRequest.max_completion_tokens);
      expect(result.temperature).to.equal(expectedRequest.temperature);
      expect(result.reasoning_effort).to.equal(expectedRequest.reasoning_effort);
    });
  });

  describe("Response Transformation", () => {
    it("should pass through Responses API responses", async () => {
      const mockResponse = new Response(
        JSON.stringify(CommonFixtures.gpt5Basic.response),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );

      const result = await transformer.transformResponseIn(mockResponse);

      expect(result).to.equal(mockResponse);
      expect(result.status).to.equal(200);
    });

    it("should preserve response headers", async () => {
      const customHeaders = {
        "x-ratelimit-remaining": "100",
        "x-openai-version": "2024-10-01"
      };

      const mockResponse = new Response(
        JSON.stringify({ test: "data" }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            ...customHeaders
          }
        }
      );

      const result = await transformer.transformResponseIn(mockResponse);

      for (const [key, value] of Object.entries(customHeaders)) {
        expect(result.headers.get(key)).to.equal(value);
      }
    });
  });

  describe("Semantic Preservation", () => {
    it("should preserve semantic meaning during transformation", async () => {
      const originalRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("system", "You are a helpful assistant")
        .withMessage("user", "Explain quantum computing")
        .withMaxTokens(200)
        .withTemperature(0.8)
        .withStream(false)
        .withReasoning("high")
        .build();

      const transformed = await transformer.transformRequestOut(originalRequest);

      TestAssertions.assertSemanticPreservation(originalRequest, transformed);
    });

    it("should handle complex message arrays", async () => {
      const originalRequest = UnifiedRequestBuilder.create()
        .withModel("o3")
        .withMessage("system", "You are an expert in mathematics")
        .withMessage("user", "Solve this equation: 2x + 5 = 13")
        .withMessage("assistant", "I need to solve for x")
        .withMessage("user", "Yes, please show your work")
        .build();

      const transformed = await transformer.transformRequestOut(originalRequest);

      TestAssertions.assertResponsesAPIFormat(transformed);
      expect(transformed.input).to.have.length(4);
      expect(transformed.input[0].role).to.equal("system");
      expect(transformed.input[3].role).to.equal("user");
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed requests gracefully", async () => {
      const malformedRequest = {
        model: "gpt-5",
        // Missing messages/input
        temperature: 0.7
      } as any;

      const result = await transformer.transformRequestOut(malformedRequest);
      
      // Should not throw, but should preserve what it can
      expect(result.model).to.equal("gpt-5");
      expect(result.temperature).to.equal(0.7);
    });

    it("should handle undefined reasoning object", async () => {
      const request = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("user", "Test")
        .build();

      // Explicitly set reasoning to undefined
      (request as any).reasoning = undefined;

      const result = await transformer.transformRequestOut(request);

      TestAssertions.assertResponsesAPIFormat(result);
      expect(result).to.not.have.property("reasoning_effort");
    });
  });

  describe("Integration with Fixtures", () => {
    it("should work with all golden fixtures", async () => {
      const fixtures = FixtureLoader.getResponsesFixtures();

      for (const [name, fixture] of fixtures.requests.entries()) {
        if (name.includes("request")) {
          // Build equivalent UnifiedChatRequest
          const unifiedRequest = UnifiedRequestBuilder.create()
            .withModel(fixture.model)
            .withMessages(fixture.input?.map((msg: any) => ({
              role: msg.role,
              content: msg.content
            })) || [])
            .build();

          const result = await transformer.transformRequestOut(unifiedRequest);
          
          TestAssertions.assertResponsesAPIFormat(result);
          expect(result.model).to.equal(fixture.model);
        }
      }
    });
  });

  describe("Configuration", () => {
    it("should use correct transformer name", () => {
      expect(OpenAIResponsesTransformer.TransformerName).to.equal("openai-responses");
      expect(transformer.name).to.equal("OpenAI Responses API");
    });

    it("should use correct endpoint", () => {
      expect(transformer.endPoint).to.equal("/v1/responses");
    });

    it("should accept options in constructor", () => {
      const options = { debug: true, timeout: 5000 };
      const customTransformer = new OpenAIResponsesTransformer(options);
      
      expect(customTransformer).to.be.instanceOf(OpenAIResponsesTransformer);
      expect(customTransformer.name).to.equal("OpenAI Responses API");
    });
  });
});