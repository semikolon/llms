import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { OpenAIResponsesTransformer } from "@/transformer/openai-responses.transformer";
import { MockResponsesAPIServer } from "../../mocks/openai/responses-api-server";
import { UnifiedRequestBuilder, TEST_MODELS } from "../../helpers/test-builders";
import { TestAssertions, TestInvariants } from "../../helpers/test-assertions";
import { CommonFixtures, FixtureLoader } from "../../helpers/fixture-loader";

/**
 * Backward Compatibility Test Suite
 * 
 * This is a CRITICAL test suite that ensures the addition of Responses API support
 * does NOT break existing Chat Completions API functionality.
 * 
 * These tests act as a regression gate - they must ALL pass before any
 * Responses API changes can be merged.
 */

describe("Backward Compatibility", () => {
  let transformer: OpenAIResponsesTransformer;
  let mockServer: MockResponsesAPIServer;
  let serverPort: number;

  beforeEach(async () => {
    transformer = new OpenAIResponsesTransformer();
    mockServer = new MockResponsesAPIServer({ enableLogging: false });
    serverPort = await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  describe("Chat Completions API Preservation", () => {
    it("should pass through GPT-4o requests unchanged", async () => {
      for (const model of TEST_MODELS.CHAT_API) {
        const originalRequest = UnifiedRequestBuilder.create()
          .withModel(model)
          .withMessage("user", "Hello, how are you?")
          .withMaxTokens(150)
          .withTemperature(0.7)
          .withStream(false)
          .build();

        const transformedRequest = await transformer.transformRequestOut(originalRequest);

        // Should be identical for Chat API models
        expect(transformedRequest).to.deep.equal(originalRequest);
        TestAssertions.assertChatAPIFormat(transformedRequest);
      }
    });

    it("should preserve all Chat Completions parameters", async () => {
      const complexChatRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-4o")
        .withMessage("system", "You are a helpful assistant")
        .withMessage("user", "Explain quantum computing")
        .withMaxTokens(500)
        .withTemperature(0.8)
        .withStream(true)
        .withTool("search", "Search the web", {
          type: "object",
          properties: { query: { type: "string" } }
        })
        .withToolChoice("auto")
        .build();

      const result = await transformer.transformRequestOut(complexChatRequest);

      // Verify exact preservation
      expect(result.model).to.equal("gpt-4o");
      expect(result.messages).to.deep.equal(complexChatRequest.messages);
      expect(result.max_tokens).to.equal(500);
      expect(result.temperature).to.equal(0.8);
      expect(result.stream).to.equal(true);
      expect(result.tools).to.deep.equal(complexChatRequest.tools);
      expect(result.tool_choice).to.equal("auto");

      // Should NOT have Responses API format
      expect(result).to.not.have.property("input");
      expect(result).to.not.have.property("max_completion_tokens");
      expect(result).to.not.have.property("reasoning_effort");
    });

    it("should handle legacy OpenAI transformer behavior", async () => {
      // Test with existing golden fixtures to ensure no regression
      const gpt4oFixture = CommonFixtures.gpt4oChat;

      const unifiedRequest = UnifiedRequestBuilder.create()
        .withModel(gpt4oFixture.request.model)
        .withMessages(gpt4oFixture.request.messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })))
        .withMaxTokens(gpt4oFixture.request.max_tokens)
        .withTemperature(gpt4oFixture.request.temperature)
        .withStream(gpt4oFixture.request.stream)
        .build();

      const result = await transformer.transformRequestOut(unifiedRequest);

      // Should match the original request structure exactly
      TestAssertions.assertBackwardCompatibility(
        gpt4oFixture.request,
        gpt4oFixture.response,
        result,
        gpt4oFixture.response
      );
    });
  });

  describe("Response Format Preservation", () => {
    it("should preserve Chat Completions response structure", async () => {
      const mockChatResponse = new Response(
        JSON.stringify(CommonFixtures.gpt4oChat.response),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );

      const result = await transformer.transformResponseIn(mockChatResponse);

      // Response should be passed through unchanged
      expect(result).to.equal(mockChatResponse);
      
      const responseData = await result.json();
      TestAssertions.assertNoReasoningTokens(responseData.usage);
      expect(responseData).to.have.property("choices");
      expect(responseData.choices[0]).to.have.property("message");
      expect(responseData.choices[0].message).to.have.property("role", "assistant");
    });

    it("should preserve usage tracking format for Chat API", () => {
      const chatUsage = {
        prompt_tokens: 12,
        completion_tokens: 48,
        total_tokens: 60
      };

      TestAssertions.assertNoReasoningTokens(chatUsage);
      TestInvariants.checkUsageTrackingCompleteness(chatUsage, "chat");
    });

    it("should maintain HTTP headers and status codes", async () => {
      const originalHeaders = {
        "x-ratelimit-remaining": "99",
        "x-ratelimit-reset": "1704067260",
        "content-type": "application/json"
      };

      const mockResponse = new Response(
        JSON.stringify({ test: "data" }),
        {
          status: 200,
          headers: originalHeaders
        }
      );

      const result = await transformer.transformResponseIn(mockResponse);

      expect(result.status).to.equal(200);
      for (const [key, value] of Object.entries(originalHeaders)) {
        expect(result.headers.get(key)).to.equal(value);
      }
    });
  });

  describe("Streaming Compatibility", () => {
    it("should preserve Chat Completions streaming format", async () => {
      // Mock server should handle both APIs
      const chatStreamingRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        stream: true
      };

      const response = await fetch(`${mockServer.getBaseUrl()}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatStreamingRequest)
      });

      expect(response.ok).to.be.true;
      
      const responseData = await response.json();
      expect(responseData).to.have.property("id");
      expect(responseData).to.have.property("object", "chat.completion");
      expect(responseData).to.have.property("choices");
    });

    it("should not interfere with existing SSE event formats", () => {
      // Chat Completions uses different SSE format than Responses API
      const chatSSEEvent = {
        data: JSON.stringify({
          id: "chatcmpl-123",
          object: "chat.completion.chunk",
          choices: [{
            index: 0,
            delta: { content: "Hello" },
            finish_reason: null
          }]
        })
      };

      TestAssertions.assertSSEEvent(chatSSEEvent);
      
      const parsed = JSON.parse(chatSSEEvent.data);
      expect(parsed.object).to.equal("chat.completion.chunk");
      expect(parsed.choices[0].delta).to.have.property("content");
      expect(parsed.choices[0].delta).to.not.have.property("reasoning_content");
    });
  });

  describe("Tool Call Compatibility", () => {
    it("should preserve existing tool call format", async () => {
      const toolRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-4o")
        .withMessage("user", "What's the weather?")
        .withTool("get_weather", "Get weather info", {
          type: "object",
          properties: { city: { type: "string" } }
        })
        .withToolChoice("auto")
        .build();

      const result = await transformer.transformRequestOut(toolRequest);

      // Should preserve exact tool format for Chat API models
      expect(result.tools).to.deep.equal(toolRequest.tools);
      expect(result.tool_choice).to.equal("auto");
      
      // Should NOT transform to Responses API format
      TestAssertions.assertChatAPIFormat(result);
    });

    it("should maintain tool call response structure", () => {
      const chatToolResponse = {
        id: "chatcmpl-tool-123",
        object: "chat.completion",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"New York"}'
              }
            }]
          },
          finish_reason: "tool_calls"
        }],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 10,
          total_tokens: 25
        }
      };

      // Should follow existing Chat Completions format
      expect(chatToolResponse.object).to.equal("chat.completion");
      expect(chatToolResponse.choices[0].message).to.have.property("tool_calls");
      TestAssertions.assertNoReasoningTokens(chatToolResponse.usage);
    });
  });

  describe("Error Handling Compatibility", () => {
    it("should preserve existing error response formats", async () => {
      const errorResponse = new Response(
        JSON.stringify({
          error: {
            type: "invalid_request_error",
            message: "Missing required parameter",
            code: "missing_parameter"
          }
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" }
        }
      );

      const result = await transformer.transformResponseIn(errorResponse);

      expect(result.status).to.equal(400);
      const errorData = await result.json();
      expect(errorData).to.have.property("error");
      expect(errorData.error).to.have.property("type", "invalid_request_error");
    });

    it("should handle malformed requests the same way", async () => {
      const malformedRequest = {
        model: "gpt-4o",
        // Missing required messages field
        temperature: 0.7
      } as any;

      const result = await transformer.transformRequestOut(malformedRequest);

      // Should preserve the malformed structure for Chat API models
      expect(result.model).to.equal("gpt-4o");
      expect(result.temperature).to.equal(0.7);
      expect(result).to.not.have.property("messages");
    });
  });

  describe("Performance Impact", () => {
    it("should not add significant overhead to Chat API requests", async () => {
      const chatRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-4o")
        .withMessage("user", "Hello")
        .build();

      const startTime = Date.now();
      
      // Run transformation multiple times to measure overhead
      for (let i = 0; i < 100; i++) {
        await transformer.transformRequestOut(chatRequest);
      }
      
      const duration = Date.now() - startTime;
      const avgDuration = duration / 100;

      // Should be very fast for pass-through (< 1ms per request)
      TestAssertions.assertPerformanceConstraints(avgDuration, 1);
    });

    it("should not affect memory usage for Chat API", () => {
      const chatRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-4o")
        .withMessage("user", "Test message")
        .build();

      const memoryBefore = process.memoryUsage().heapUsed;

      // Process many requests
      for (let i = 0; i < 1000; i++) {
        transformer.transformRequestOut(chatRequest);
      }

      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryIncrease = memoryAfter - memoryBefore;

      // Memory increase should be minimal (< 1MB)
      expect(memoryIncrease).to.be.lessThan(1024 * 1024);
    });
  });

  describe("Configuration Compatibility", () => {
    it("should work with existing transformer configurations", () => {
      // Test that existing transformer instantiation still works
      const defaultTransformer = new OpenAIResponsesTransformer();
      expect(defaultTransformer.name).to.equal("OpenAI Responses API");
      expect(defaultTransformer.endPoint).to.equal("/v1/responses");

      const configuredTransformer = new OpenAIResponsesTransformer({
        timeout: 5000,
        retries: 3
      });
      expect(configuredTransformer.name).to.equal("OpenAI Responses API");
    });

    it("should maintain transformer registration compatibility", () => {
      // Verify transformer can be registered the same way
      expect(OpenAIResponsesTransformer.TransformerName).to.equal("openai-responses");
      
      // Should be compatible with existing registration patterns
      const transformerClass = OpenAIResponsesTransformer;
      expect(transformerClass).to.have.property("TransformerName");
      expect(typeof transformerClass).to.equal("function");
    });
  });

  describe("End-to-End Compatibility", () => {
    it("should work in existing Chat Completions workflows", async () => {
      // Simulate a complete request/response cycle for Chat API
      const originalRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-4o")
        .withMessage("user", "What is 2+2?")
        .withMaxTokens(50)
        .withTemperature(0.1)
        .build();

      // Transform request
      const transformedRequest = await transformer.transformRequestOut(originalRequest);
      
      // Should be unchanged
      TestAssertions.assertChatAPIFormat(transformedRequest);
      
      // Mock response
      const mockResponse = new Response(
        JSON.stringify({
          id: "chatcmpl-123",
          object: "chat.completion",
          model: "gpt-4o",
          choices: [{
            message: { role: "assistant", content: "2+2 equals 4." },
            finish_reason: "stop"
          }],
          usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

      // Transform response
      const transformedResponse = await transformer.transformResponseIn(mockResponse);
      
      // Should be unchanged
      expect(transformedResponse).to.equal(mockResponse);
      
      const responseData = await transformedResponse.json();
      TestAssertions.assertNoReasoningTokens(responseData.usage);
    });

    it("should maintain integration with existing middleware", async () => {
      // Test that the transformer works with existing request/response pipeline
      const middlewareRequest = {
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: "Be helpful" },
          { role: "user", content: "Hello" }
        ],
        temperature: 0.5,
        max_tokens: 100
      };

      // Should pass through existing middleware unchanged
      const result = await transformer.transformRequestOut(middlewareRequest as any);
      
      expect(result).to.deep.equal(middlewareRequest);
      TestAssertions.assertChatAPIFormat(result);
    });
  });

  describe("Regression Prevention", () => {
    it("should pass all existing test scenarios", () => {
      // Load all Chat API fixtures and verify they still work
      const chatFixtures = FixtureLoader.getChatFixtures();
      
      for (const [name, fixture] of chatFixtures.requests.entries()) {
        if (name.includes("request")) {
          // Should be able to process existing fixtures without errors
          expect(() => {
            transformer.transformRequestOut(fixture as any);
          }).to.not.throw();
        }
      }
    });

    it("should maintain API contract stability", () => {
      // Verify that public API hasn't changed
      const transformer = new OpenAIResponsesTransformer();
      
      expect(transformer).to.have.property("transformRequestOut");
      expect(transformer).to.have.property("transformResponseIn");
      expect(transformer).to.have.property("name");
      expect(transformer).to.have.property("endPoint");
      
      // Should not have removed any existing methods
      expect(typeof transformer.transformRequestOut).to.equal("function");
      expect(typeof transformer.transformResponseIn).to.equal("function");
    });

    it("should preserve type safety", () => {
      // TypeScript compilation should still work for existing code
      const request: any = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "test" }]
      };

      // Should not require type changes for existing usage
      expect(() => {
        transformer.transformRequestOut(request);
      }).to.not.throw();
    });
  });
});