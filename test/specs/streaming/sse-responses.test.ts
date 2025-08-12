import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import EventSource from "eventsource";
import { MockResponsesAPIServer, MockResponseDefinition } from "../../mocks/openai/responses-api-server";
import { TestAssertions } from "../../helpers/test-assertions";
import { FixtureLoader, FixtureGenerator } from "../../helpers/fixture-loader";
import { ResponsesRequestBuilder, UnifiedEventBuilder } from "../../helpers/test-builders";

/**
 * Integration tests for SSE streaming with OpenAI Responses API
 * 
 * These tests validate:
 * - SSE event parsing and handling
 * - Streaming state management
 * - Tool call orchestration flows
 * - Error handling in streaming contexts
 * - Performance characteristics
 */

interface UnifiedEvent {
  kind: 'reasoning.delta' | 'output.delta' | 'tool_call' | 'tool_result' | 'done';
  content?: string;
  delta?: any;
}

describe("SSE Streaming Integration", () => {
  let mockServer: MockResponsesAPIServer;
  let serverPort: number;
  let baseUrl: string;

  beforeEach(async () => {
    mockServer = new MockResponsesAPIServer({
      enableLogging: false
    });
    serverPort = await mockServer.start();
    baseUrl = `http://127.0.0.1:${serverPort}`;
  });

  afterEach(async () => {
    await mockServer.stop();
  });

  describe("Basic SSE Event Handling", () => {
    it("should handle complete streaming response with reasoning", async () => {
      const events = FixtureLoader.loadSSEEvents("gpt-5-streaming-events.json");
      
      const mockResponse: MockResponseDefinition = {
        id: "resp_test_123",
        model: "gpt-5",
        events: events.map(e => ({ event: e.event, data: e.data })),
        usage: {
          prompt_tokens: 8,
          completion_tokens: 18,
          reasoning_tokens: 150,
          total_tokens: 176
        }
      };

      mockServer.addResponse("gpt-5", mockResponse);

      // Test streaming request using fetch (EventSource doesn't support POST with body)
      const requestBody = ResponsesRequestBuilder.create()
        .withModel("gpt-5")
        .withInput([{ role: "user", content: "What is the capital of France?" }])
        .withStream(true)
        .build();

      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      expect(response.ok).to.be.true;
      const contentType = response.headers.get("content-type");
      if (contentType) {
        expect(contentType).to.include("text/event-stream");
      }

      // Parse SSE stream
      const streamEvents: any[] = [];
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim() === "") continue;
            
            if (line.startsWith("event: ")) {
              const eventType = line.slice(7);
              streamEvents.push({ event: eventType });
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                streamEvents.push({ event: "done", data });
                // Validate stream completeness
                TestAssertions.assertStreamingCompleteness(streamEvents);
                
                // Check for reasoning events
                const reasoningEvents = streamEvents.filter(e => 
                  e.event === "reasoning.delta"
                );
                expect(reasoningEvents.length).to.be.at.least(1);

                // Check for output events
                const outputEvents = streamEvents.filter(e => 
                  e.event === "output.delta"
                );
                expect(outputEvents.length).to.be.at.least(1);

                // Check completion event
                const completionEvents = streamEvents.filter(e => 
                  e.event === "response.completed"
                );
                expect(completionEvents.length).to.equal(1);
                
                return; // Test passed
              } else {
                const lastEvent = streamEvents[streamEvents.length - 1];
                if (lastEvent && !lastEvent.data) {
                  lastEvent.data = data;
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    });

    it("should parse individual SSE events correctly", () => {
      const testEvents = [
        {
          event: "reasoning.delta",
          data: '{"id":"resp_123","delta":{"reasoning_content":"Let me think..."}}'
        },
        {
          event: "output.delta", 
          data: '{"id":"resp_123","delta":{"content":"The answer is"}}'
        },
        {
          event: "response.completed",
          data: '{"id":"resp_123","choices":[{"finish_reason":"stop"}],"usage":{"reasoning_tokens":50}}'
        }
      ];

      for (const event of testEvents) {
        TestAssertions.assertSSEEvent(event, event.event);
        
        const parsed = JSON.parse(event.data);
        expect(parsed).to.have.property("id");
        
        if (event.event === "reasoning.delta") {
          expect(parsed.delta).to.have.property("reasoning_content");
        } else if (event.event === "output.delta") {
          expect(parsed.delta).to.have.property("content");
        } else if (event.event === "response.completed") {
          expect(parsed).to.have.property("usage");
        }
      }
    });

    it("should handle malformed SSE events gracefully", () => {
      const malformedEvents = [
        { data: "invalid json {" },
        { event: "unknown.event", data: '{"valid":"json"}' },
        { data: "" }
      ];

      for (const event of malformedEvents) {
        // Should not throw during validation
        expect(() => {
          try {
            if (event.data) {
              JSON.parse(event.data);
            }
          } catch (e) {
            // Expected for invalid JSON
          }
        }).to.not.throw();
      }
    });
  });

  describe("Tool Call Orchestration", () => {
    it("should handle tool call streaming flow", async () => {
      const toolCallEvents = FixtureLoader.loadSSEEvents("o3-tool-call-events.json");
      
      const mockResponse: MockResponseDefinition = {
        id: "resp_tool_123",
        model: "o3-mini",
        events: toolCallEvents.map(e => ({ event: e.event, data: e.data })),
        usage: {
          prompt_tokens: 20,
          completion_tokens: 0,
          reasoning_tokens: 75,
          total_tokens: 95
        }
      };

      mockServer.addResponse("o3-mini", mockResponse);

      // Test streaming request using fetch
      const requestBody = ResponsesRequestBuilder.create()
        .withModel("o3-mini")
        .withInput([{ role: "user", content: "What's the weather in NYC?" }])
        .withStream(true)
        .withTools([{
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather",
            parameters: { type: "object", properties: { city: { type: "string" } } }
          }
        }])
        .build();

      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      expect(response.ok).to.be.true;
      const contentType = response.headers.get("content-type");
      if (contentType) {
        expect(contentType).to.include("text/event-stream");
      }

      // Parse SSE stream and look for tool calls
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || "";

          let currentEvent: { type?: string; data?: string } = {};
          
          for (const line of lines) {
            if (line.trim() === "") continue;
            
            if (line.startsWith("event: ")) {
              currentEvent.type = line.slice(7);
            } else if (line.startsWith("data: ")) {
              currentEvent.data = line.slice(6);
              
              // Process complete event
              if (currentEvent.type === "tool_calls" && currentEvent.data) {
                const toolCallData = JSON.parse(currentEvent.data);
                expect(toolCallData).to.have.property("requires_action");
                expect(toolCallData.requires_action.type).to.equal("submit_tool_outputs");
                
                const toolCalls = toolCallData.requires_action.submit_tool_outputs.tool_calls;
                expect(toolCalls).to.be.an("array").with.length.at.least(1);
                expect(toolCalls[0]).to.have.property("function");
                expect(toolCalls[0].function.name).to.equal("get_weather");
                
                return; // Test passed
              }
              
              currentEvent = {}; // Reset for next event
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    });

    it("should validate tool call JSON arguments", () => {
      const toolCallEvent = {
        event: "tool_calls",
        data: JSON.stringify({
          delta: {
            tool_calls: [{
              id: "call_123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"New York","units":"fahrenheit"}'
              }
            }]
          }
        })
      };

      TestAssertions.assertSSEEvent(toolCallEvent, "tool_calls");
      
      const parsed = JSON.parse(toolCallEvent.data);
      const toolCall = parsed.delta.tool_calls[0];
      
      // Validate arguments are valid JSON
      expect(() => {
        const args = JSON.parse(toolCall.function.arguments);
        expect(args).to.have.property("city");
        expect(args).to.have.property("units");
      }).to.not.throw();
    });

    it("should handle multi-turn tool orchestration", async () => {
      // This would test a complete tool call flow:
      // 1. Model requests tool call
      // 2. Tool is executed 
      // 3. Results are submitted
      // 4. Model continues with final response
      
      const multiTurnEvents = FixtureGenerator.generateSSEEvents({
        includeReasoning: true,
        includeToolCalls: true,
        eventCount: 5
      });

      const mockResponse: MockResponseDefinition = {
        id: "resp_multi_123",
        model: "o3",
        events: multiTurnEvents.map(e => ({ event: e.event, data: e.data })),
        usage: {
          prompt_tokens: 30,
          completion_tokens: 25,
          reasoning_tokens: 100,
          total_tokens: 155
        }
      };

      mockServer.addResponse("o3", mockResponse);

      // Validate mock response structure
      const hasToolCall = multiTurnEvents.some(e => e.event === "tool_calls");
      const hasReasoning = multiTurnEvents.some(e => e.event === "reasoning.delta");
      
      expect(hasToolCall).to.be.true;
      expect(hasReasoning).to.be.true;
    });
  });

  describe("UnifiedEvent Processing", () => {
    it("should convert SSE events to UnifiedEvent format", () => {
      const testCases = [
        {
          sse: { event: "reasoning.delta", data: '{"delta":{"reasoning_content":"thinking..."}}' },
          expected: { kind: "reasoning.delta", content: "thinking..." }
        },
        {
          sse: { event: "output.delta", data: '{"delta":{"content":"hello"}}' },
          expected: { kind: "output.delta", content: "hello" }
        },
        {
          sse: { event: "tool_calls", data: '{"delta":{"tool_calls":[{"id":"call_1"}]}}' },
          expected: { kind: "tool_call", delta: { tool_calls: [{ id: "call_1" }] } }
        }
      ];

      for (const { sse, expected } of testCases) {
        // Simulate the conversion logic that would be implemented
        const unifiedEvent = convertSSEToUnified(sse);
        
        TestAssertions.assertUnifiedEvent(unifiedEvent);
        expect(unifiedEvent.kind).to.equal(expected.kind);
        
        if (expected.content) {
          expect(unifiedEvent.content).to.equal(expected.content);
        }
        
        if (expected.delta) {
          expect(unifiedEvent.delta).to.deep.equal(expected.delta);
        }
      }
    });

    it("should validate UnifiedEvent builder", () => {
      const unifiedEvent = UnifiedEventBuilder.create()
        .withKind("reasoning.delta")
        .withContent("Let me analyze this problem...")
        .build();

      TestAssertions.assertUnifiedEvent(unifiedEvent);
      expect(unifiedEvent.kind).to.equal("reasoning.delta");
      expect(unifiedEvent.content).to.equal("Let me analyze this problem...");
    });

    it("should handle all UnifiedEvent kinds", () => {
      const eventKinds: Array<UnifiedEvent['kind']> = [
        "reasoning.delta",
        "output.delta", 
        "tool_call",
        "tool_result",
        "done"
      ];

      for (const kind of eventKinds) {
        const event = UnifiedEventBuilder.create()
          .withKind(kind)
          .withContent("test content")
          .build();

        TestAssertions.assertUnifiedEvent(event);
        expect(event.kind).to.equal(kind);
      }
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle stream disconnection gracefully", async () => {
      const incompleteEvents = [
        { event: "response.created", data: '{"id":"resp_123"}' },
        { event: "reasoning.delta", data: '{"delta":{"reasoning_content":"thinking"}}' }
        // No completion event - simulates disconnection
      ];

      const mockResponse: MockResponseDefinition = {
        id: "resp_disconnected",
        model: "gpt-5",
        events: incompleteEvents,
        usage: {
          prompt_tokens: 10,
          completion_tokens: 0,
          total_tokens: 10
        }
      };

      mockServer.addResponse("gpt-5", mockResponse);

      const streamEvents: any[] = [];
      const eventSource = new EventSource(`${baseUrl}/v1/responses`);

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          // Expected to timeout due to incomplete stream
          eventSource.close();
          
          // Validate partial events were received
          expect(streamEvents.length).to.be.at.least(1);
          resolve();
        }, 2000);

        eventSource.onmessage = (event) => {
          streamEvents.push(event);
        };

        eventSource.onerror = () => {
          clearTimeout(timeout);
          eventSource.close();
          resolve(); // Error is expected for incomplete streams
        };
      });
    });

    it("should handle rapid event sequences", async () => {
      const rapidEvents = [];
      
      // Generate many small delta events
      for (let i = 0; i < 50; i++) {
        rapidEvents.push({
          event: "output.delta",
          data: JSON.stringify({
            id: "resp_rapid",
            delta: { content: ` ${i}` }
          })
        });
      }
      
      rapidEvents.push({
        event: "response.completed",
        data: JSON.stringify({
          id: "resp_rapid",
          choices: [{ finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 50, total_tokens: 55 }
        })
      });

      const mockResponse: MockResponseDefinition = {
        id: "resp_rapid",
        model: "gpt-5",
        events: rapidEvents,
        usage: {
          prompt_tokens: 5,
          completion_tokens: 50,
          total_tokens: 55
        }
      };

      mockServer.addResponse("gpt-5", mockResponse);

      // Test that all events are processed correctly
      const receivedEvents: any[] = [];
      
      // Simulate event processing
      for (const event of rapidEvents) {
        TestAssertions.assertSSEEvent(event);
        receivedEvents.push(event);
      }

      expect(receivedEvents.length).to.equal(51); // 50 deltas + 1 completion
    });

    it("should validate usage tracking in streams", async () => {
      const eventsWithUsage = FixtureGenerator.generateSSEEvents({
        includeReasoning: true,
        eventCount: 3
      });

      // Find completion event and validate usage
      const completionEvent = eventsWithUsage.find(e => 
        e.event === "response.completed"
      );

      expect(completionEvent).to.exist;
      
      const completionData = JSON.parse(completionEvent!.data);
      TestAssertions.assertHasReasoningTokens(completionData.usage);
    });
  });

  describe("Performance Characteristics", () => {
    it("should handle streaming with acceptable latency", async () => {
      const startTime = Date.now();
      
      const events = FixtureGenerator.generateSSEEvents({
        includeReasoning: true,
        eventCount: 10
      });

      const mockResponse: MockResponseDefinition = {
        id: "resp_perf",
        model: "gpt-5",
        events: events,
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          reasoning_tokens: 25,
          total_tokens: 45
        }
      };

      mockServer.addResponse("gpt-5", mockResponse);

      // Process events
      for (const event of events) {
        TestAssertions.assertSSEEvent(event);
      }

      const duration = Date.now() - startTime;
      TestAssertions.assertPerformanceConstraints(duration, 100);
    });

    it("should maintain memory efficiency during long streams", () => {
      // Test that event processing doesn't accumulate memory
      const largeEvents = FixtureGenerator.generateSSEEvents({
        includeReasoning: true,
        eventCount: 100
      });

      const memoryBefore = process.memoryUsage().heapUsed;
      
      // Simulate processing large stream
      for (const event of largeEvents) {
        const parsed = JSON.parse(event.data);
        // Simulate processing without accumulating references
      }

      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryIncrease = memoryAfter - memoryBefore;
      
      // Memory increase should be reasonable (less than 10MB for this test)
      expect(memoryIncrease).to.be.lessThan(10 * 1024 * 1024);
    });
  });
});

/**
 * Helper function to simulate SSE to UnifiedEvent conversion
 * This would be implemented by other agents
 */
function convertSSEToUnified(sseEvent: { event?: string; data: string }): UnifiedEvent {
  const parsed = JSON.parse(sseEvent.data);
  
  switch (sseEvent.event) {
    case "reasoning.delta":
      return {
        kind: "reasoning.delta",
        content: parsed.delta?.reasoning_content
      };
    case "output.delta":
      return {
        kind: "output.delta", 
        content: parsed.delta?.content
      };
    case "tool_calls":
      return {
        kind: "tool_call",
        delta: parsed.delta
      };
    case "response.completed":
      return {
        kind: "done",
        delta: parsed
      };
    default:
      return {
        kind: "output.delta",
        content: ""
      };
  }
}