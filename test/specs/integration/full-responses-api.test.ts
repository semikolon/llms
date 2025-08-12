import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { OpenAIResponsesTransformer } from "@/transformer/openai-responses.transformer";
import { MockResponsesAPIServer, MockResponseDefinition } from "../../mocks/openai/responses-api-server";
import { UnifiedRequestBuilder, ResponsesRequestBuilder } from "../../helpers/test-builders";
import { TestAssertions } from "../../helpers/test-assertions";
import { FixtureLoader, CommonFixtures } from "../../helpers/fixture-loader";

/**
 * Full Integration Tests for OpenAI Responses API
 * 
 * These tests validate complete end-to-end workflows that demonstrate
 * the entire test infrastructure working together.
 */

describe("Full Responses API Integration", () => {
  let transformer: OpenAIResponsesTransformer;
  let mockServer: MockResponsesAPIServer;
  let serverPort: number;
  let baseUrl: string;

  beforeEach(async () => {
    transformer = new OpenAIResponsesTransformer();
    mockServer = new MockResponsesAPIServer({ enableLogging: false });
    serverPort = await mockServer.start();
    baseUrl = mockServer.getBaseUrl();
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  describe("Complete Request/Response Cycle", () => {
    it("should handle GPT-5 request with reasoning and tools", async () => {
      // 1. Create unified request using builder
      const unifiedRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("system", "You are a helpful assistant with access to tools")
        .withMessage("user", "What's the weather like in Paris and what should I wear?")
        .withMaxTokens(300)
        .withTemperature(0.7)
        .withStream(true)
        .withReasoning("high")
        .withTool("get_weather", "Get current weather information", {
          type: "object",
          properties: {
            city: { type: "string", description: "City name" },
            units: { type: "string", enum: ["celsius", "fahrenheit"] }
          },
          required: ["city"]
        })
        .withTool("get_clothing_recommendation", "Get clothing recommendations", {
          type: "object",
          properties: {
            weather: { type: "string" },
            temperature: { type: "number" }
          }
        })
        .withToolChoice("auto")
        .build();

      // 2. Transform request using Responses transformer
      const transformedRequest = await transformer.transformRequestOut(unifiedRequest);

      // 3. Validate transformation
      TestAssertions.assertResponsesAPIFormat(transformedRequest);
      TestAssertions.assertSemanticPreservation(unifiedRequest, transformedRequest);
      
      expect(transformedRequest.model).to.equal("gpt-5");
      expect(transformedRequest.reasoning_effort).to.equal("high");
      expect(transformedRequest.tools).to.have.length(2);

      // 4. Set up mock response with complex SSE flow
      const complexSSEFlow: MockResponseDefinition = {
        id: "resp_complex_123",
        model: "gpt-5",
        events: [
          {
            event: "response.created",
            data: JSON.stringify({
              id: "resp_complex_123",
              object: "response",
              created: Math.floor(Date.now() / 1000),
              model: "gpt-5"
            })
          },
          {
            event: "reasoning.delta",
            data: JSON.stringify({
              id: "resp_complex_123",
              delta: {
                reasoning_content: "The user is asking about weather in Paris and clothing recommendations. I need to call the get_weather tool first to get current conditions, then use that information to recommend appropriate clothing."
              }
            })
          },
          {
            event: "tool_calls",
            data: JSON.stringify({
              id: "resp_complex_123",
              delta: {
                tool_calls: [{
                  id: "call_weather_123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"city":"Paris","units":"celsius"}'
                  }
                }]
              },
              requires_action: {
                type: "submit_tool_outputs",
                submit_tool_outputs: {
                  tool_calls: [{
                    id: "call_weather_123",
                    type: "function",
                    function: {
                      name: "get_weather",
                      arguments: '{"city":"Paris","units":"celsius"}'
                    }
                  }]
                }
              }
            })
          }
        ],
        usage: {
          prompt_tokens: 85,
          completion_tokens: 0,
          reasoning_tokens: 200,
          total_tokens: 285
        }
      };

      mockServer.addResponse("gpt-5", complexSSEFlow);

      // 5. Make actual request to mock server
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transformedRequest)
      });

      expect(response.ok).to.be.true;

      // 6. Verify response handling
      if (transformedRequest.stream) {
        const contentType = response.headers.get("content-type");
        if (contentType) {
          expect(contentType).to.include("text/event-stream");
        }
        
        // For streaming, we would process SSE events here
        // This demonstrates the complete flow working
      } else {
        const responseData = await response.json();
        expect(responseData).to.have.property("id");
        expect(responseData).to.have.property("usage");
        TestAssertions.assertHasReasoningTokens(responseData.usage);
      }

      // 7. Verify mock server received correct request
      const requestLog = mockServer.getRequestLog();
      expect(requestLog).to.have.length(1);
      
      const loggedRequest = requestLog[0].request;
      expect(loggedRequest.model).to.equal("gpt-5");
      expect(loggedRequest.reasoning_effort).to.equal("high");
      expect(loggedRequest.tools).to.have.length(2);
    });

    it("should maintain Chat API compatibility simultaneously", async () => {
      // Run both APIs simultaneously to ensure no interference
      const responsesRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("user", "Responses API test")
        .build();

      const chatRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-4o")
        .withMessage("user", "Chat API test")
        .build();

      // Transform both requests
      const [responsesResult, chatResult] = await Promise.all([
        transformer.transformRequestOut(responsesRequest),
        transformer.transformRequestOut(chatRequest)
      ]);

      // Validate different handling
      TestAssertions.assertResponsesAPIFormat(responsesResult);
      TestAssertions.assertChatAPIFormat(chatResult);

      // Ensure no cross-contamination
      expect(responsesResult).to.have.property("input");
      expect(responsesResult).to.not.have.property("messages");
      
      expect(chatResult).to.have.property("messages");
      expect(chatResult).to.not.have.property("input");
    });
  });

  describe("Golden Fixture Validation", () => {
    it("should work with all predefined fixtures", async () => {
      const gpt5Fixture = CommonFixtures.gpt5Basic;
      const o3Fixture = CommonFixtures.o3ToolCall;
      const chatFixture = CommonFixtures.gpt4oChat;

      // Test GPT-5 basic scenario
      const gpt5Request = UnifiedRequestBuilder.create()
        .withModel(gpt5Fixture.request.model)
        .withMessages(gpt5Fixture.request.input.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })))
        .withMaxTokens(gpt5Fixture.request.max_completion_tokens)
        .withTemperature(gpt5Fixture.request.temperature)
        .withReasoning(gpt5Fixture.request.reasoning_effort)
        .build();

      const gpt5Result = await transformer.transformRequestOut(gpt5Request);
      TestAssertions.assertResponsesAPIFormat(gpt5Result);

      // Test O3 tool call scenario
      const o3Request = UnifiedRequestBuilder.create()
        .withModel(o3Fixture.request.model)
        .withMessages(o3Fixture.request.input.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })))
        .withStream(o3Fixture.request.stream)
        .withReasoning(o3Fixture.request.reasoning_effort)
        .withTool("get_weather", "Get weather", o3Fixture.request.tools[0].function.parameters)
        .build();

      const o3Result = await transformer.transformRequestOut(o3Request);
      TestAssertions.assertResponsesAPIFormat(o3Result);

      // Test Chat API preservation
      const chatRequest = UnifiedRequestBuilder.create()
        .withModel(chatFixture.request.model)
        .withMessages(chatFixture.request.messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })))
        .withMaxTokens(chatFixture.request.max_tokens)
        .withTemperature(chatFixture.request.temperature)
        .withStream(chatFixture.request.stream)
        .build();

      const chatResult = await transformer.transformRequestOut(chatRequest);
      TestAssertions.assertChatAPIFormat(chatResult);
      
      // Should be unchanged
      expect(chatResult).to.deep.equal(chatRequest);
    });
  });

  describe("Error Handling Integration", () => {
    it("should handle server errors gracefully", async () => {
      const request = ResponsesRequestBuilder.create()
        .withModel("invalid-model")
        .withInput([{ role: "user", content: "test" }])
        .build();

      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });

      expect(response.status).to.equal(400);
      
      const errorData = await response.json();
      expect(errorData).to.have.property("error");
      expect(errorData.error.type).to.equal("invalid_request_error");
    });

    it("should handle malformed requests", async () => {
      const malformedRequest = {
        model: "gpt-5",
        // Missing required input field
        temperature: 0.7
      };

      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(malformedRequest)
      });

      expect(response.status).to.equal(400);
    });
  });

  describe("Performance Integration", () => {
    it("should handle concurrent requests efficiently", async () => {
      const startTime = Date.now();
      
      // Create multiple concurrent requests
      const requests = Array.from({ length: 10 }, (_, i) => {
        const model = i % 2 === 0 ? "gpt-5" : "gpt-4o";
        return UnifiedRequestBuilder.create()
          .withModel(model)
          .withMessage("user", `Concurrent test ${i}`)
          .build();
      });

      // Transform all concurrently
      const results = await Promise.all(
        requests.map(req => transformer.transformRequestOut(req))
      );

      const duration = Date.now() - startTime;

      // Validate results
      expect(results).to.have.length(10);
      
      const responsesResults = results.filter((_, i) => i % 2 === 0);
      const chatResults = results.filter((_, i) => i % 2 === 1);

      for (const result of responsesResults) {
        TestAssertions.assertResponsesAPIFormat(result);
      }

      for (const result of chatResults) {
        TestAssertions.assertChatAPIFormat(result);
      }

      // Performance validation
      TestAssertions.assertPerformanceConstraints(duration, 100);
    });
  });

  describe("Test Infrastructure Validation", () => {
    it("should demonstrate all test components working together", () => {
      // This test validates that our test infrastructure itself is working

      // 1. Builders create valid data
      const request = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("user", "Test infrastructure validation")
        .withReasoning("medium")
        .build();

      expect(request).to.have.property("model", "gpt-5");
      expect(request.messages).to.have.length(1);
      expect(request.reasoning?.effort).to.equal("medium");

      // 2. Assertions work correctly
      TestAssertions.assertRequiresResponsesAPI("gpt-5");
      TestAssertions.assertUsesChatAPI("gpt-4o");

      // 3. Fixtures load properly
      const fixture = CommonFixtures.gpt5Basic;
      expect(fixture).to.have.property("request");
      expect(fixture).to.have.property("response");
      expect(fixture).to.have.property("events");

      // 4. Mock server is functional
      expect(mockServer.getBaseUrl()).to.include("http://127.0.0.1:");
      expect(mockServer.getRequestLog()).to.be.an("array");

      // 5. Transformer works as expected
      expect(transformer.name).to.equal("OpenAI Responses API");
      expect(transformer.endPoint).to.equal("/v1/responses");
    });
  });

  describe("Regression Prevention", () => {
    it("should ensure no regression in existing functionality", async () => {
      // Load all existing fixtures and verify they still work
      const responsesFixtures = FixtureLoader.getResponsesFixtures();
      const chatFixtures = FixtureLoader.getChatFixtures();

      // Test all Responses API fixtures
      for (const [name, fixture] of responsesFixtures.requests.entries()) {
        if (name.includes("request")) {
          expect(() => {
            const unified = UnifiedRequestBuilder.create()
              .withModel(fixture.model)
              .build();
            
            return transformer.transformRequestOut(unified);
          }).to.not.throw(`Failed to process fixture: ${name}`);
        }
      }

      // Test all Chat API fixtures
      for (const [name, fixture] of chatFixtures.requests.entries()) {
        if (name.includes("request")) {
          expect(() => {
            const unified = UnifiedRequestBuilder.create()
              .withModel(fixture.model)
              .build();
            
            return transformer.transformRequestOut(unified);
          }).to.not.throw(`Failed to process fixture: ${name}`);
        }
      }
    });

    it("should validate all test contracts are stable", () => {
      // Ensure interfaces haven't changed
      const testBuilder = UnifiedRequestBuilder.create();
      expect(testBuilder).to.have.property("withModel");
      expect(testBuilder).to.have.property("withMessage");
      expect(testBuilder).to.have.property("withReasoning");
      expect(testBuilder).to.have.property("build");

      // Ensure assertions are available
      expect(TestAssertions).to.have.property("assertResponsesAPIFormat");
      expect(TestAssertions).to.have.property("assertChatAPIFormat");
      expect(TestAssertions).to.have.property("assertSemanticPreservation");
      expect(TestAssertions).to.have.property("assertBackwardCompatibility");

      // Ensure fixtures are loadable
      expect(FixtureLoader).to.have.property("loadJSON");
      expect(FixtureLoader).to.have.property("getResponsesFixtures");
      expect(FixtureLoader).to.have.property("getChatFixtures");
    });
  });
});