import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { UnifiedEventBuilder, TEST_SSE_EVENTS } from "../../helpers/test-builders";
import { TestAssertions } from "../../helpers/test-assertions";

/**
 * Tests for UnifiedEvent interface and event processing
 * 
 * This validates the critical contract that transforms SSE events from
 * OpenAI Responses API into a standardized format for consumption by other agents.
 */

interface UnifiedEvent {
  kind: 'reasoning.delta' | 'output.delta' | 'tool_call' | 'tool_result' | 'done';
  content?: string;
  delta?: any;
}

/**
 * Mock event processor that other agents would implement
 */
class UnifiedEventProcessor {
  private events: UnifiedEvent[] = [];
  private currentState: {
    reasoning: string;
    output: string;
    toolCalls: any[];
    isComplete: boolean;
  } = {
    reasoning: "",
    output: "",
    toolCalls: [],
    isComplete: false
  };

  processEvent(event: UnifiedEvent): void {
    TestAssertions.assertUnifiedEvent(event);
    this.events.push(event);

    switch (event.kind) {
      case "reasoning.delta":
        if (event.content) {
          this.currentState.reasoning += event.content;
        }
        break;

      case "output.delta":
        if (event.content) {
          this.currentState.output += event.content;
        }
        break;

      case "tool_call":
        if (event.delta?.tool_calls) {
          this.currentState.toolCalls.push(...event.delta.tool_calls);
        }
        break;

      case "tool_result":
        // Process tool results
        break;

      case "done":
        this.currentState.isComplete = true;
        break;
    }
  }

  getState() {
    return { ...this.currentState };
  }

  getEvents(): UnifiedEvent[] {
    return [...this.events];
  }

  reset(): void {
    this.events = [];
    this.currentState = {
      reasoning: "",
      output: "",
      toolCalls: [],
      isComplete: false
    };
  }
}

describe("UnifiedEvent Interface", () => {
  let processor: UnifiedEventProcessor;

  beforeEach(() => {
    processor = new UnifiedEventProcessor();
  });

  describe("Event Type Validation", () => {
    it("should validate all supported event kinds", () => {
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

    it("should require valid event kinds", () => {
      const validKinds = ["reasoning.delta", "output.delta", "tool_call", "tool_result", "done"];
      
      // Test with invalid kind
      const invalidEvent = {
        kind: "invalid.event" as any,
        content: "test"
      };

      expect(() => {
        TestAssertions.assertUnifiedEvent(invalidEvent);
      }).to.throw();
    });

    it("should validate content presence for delta events", () => {
      const deltaEvent = UnifiedEventBuilder.create()
        .withKind("reasoning.delta")
        .withContent("reasoning content")
        .build();

      TestAssertions.assertUnifiedEvent(deltaEvent);
      expect(deltaEvent).to.have.property("content");

      const outputDeltaEvent = UnifiedEventBuilder.create()
        .withKind("output.delta")
        .withContent("output content")
        .build();

      TestAssertions.assertUnifiedEvent(outputDeltaEvent);
      expect(outputDeltaEvent).to.have.property("content");
    });
  });

  describe("SSE to UnifiedEvent Conversion", () => {
    it("should convert reasoning delta events", () => {
      const sseEvent = TEST_SSE_EVENTS.REASONING_DELTA;
      const sseData = JSON.parse(sseEvent.data);
      
      const unifiedEvent = UnifiedEventBuilder.create()
        .withKind("reasoning.delta")
        .withContent(sseData.delta.reasoning_content)
        .build();

      TestAssertions.assertUnifiedEvent(unifiedEvent);
      expect(unifiedEvent.kind).to.equal("reasoning.delta");
      expect(unifiedEvent.content).to.equal("Let me think about this...");
    });

    it("should convert output delta events", () => {
      const sseEvent = TEST_SSE_EVENTS.OUTPUT_DELTA;
      const sseData = JSON.parse(sseEvent.data);
      
      const unifiedEvent = UnifiedEventBuilder.create()
        .withKind("output.delta")
        .withContent(sseData.delta.content)
        .build();

      TestAssertions.assertUnifiedEvent(unifiedEvent);
      expect(unifiedEvent.kind).to.equal("output.delta");
      expect(unifiedEvent.content).to.equal("Hello");
    });

    it("should convert tool call events", () => {
      const sseEvent = TEST_SSE_EVENTS.TOOL_CALL;
      const sseData = JSON.parse(sseEvent.data);
      
      const unifiedEvent = UnifiedEventBuilder.create()
        .withKind("tool_call")
        .withDelta(sseData.delta)
        .build();

      TestAssertions.assertUnifiedEvent(unifiedEvent);
      expect(unifiedEvent.kind).to.equal("tool_call");
      expect(unifiedEvent.delta).to.have.property("tool_calls");
      expect(unifiedEvent.delta.tool_calls[0].function.name).to.equal("get_weather");
    });

    it("should convert completion events", () => {
      const sseEvent = TEST_SSE_EVENTS.RESPONSE_COMPLETED;
      const sseData = JSON.parse(sseEvent.data);
      
      const unifiedEvent = UnifiedEventBuilder.create()
        .withKind("done")
        .withDelta(sseData)
        .build();

      TestAssertions.assertUnifiedEvent(unifiedEvent);
      expect(unifiedEvent.kind).to.equal("done");
      expect(unifiedEvent.delta).to.have.property("usage");
      expect(unifiedEvent.delta.usage).to.have.property("reasoning_tokens");
    });
  });

  describe("Event Processing Flow", () => {
    it("should process complete reasoning and output flow", () => {
      const events = [
        UnifiedEventBuilder.create()
          .withKind("reasoning.delta")
          .withContent("Let me think about ")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("reasoning.delta")
          .withContent("this problem carefully...")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("output.delta")
          .withContent("The answer is ")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("output.delta")
          .withContent("42.")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("done")
          .withDelta({
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              reasoning_tokens: 25,
              total_tokens: 40
            }
          })
          .build()
      ];

      for (const event of events) {
        processor.processEvent(event);
      }

      const state = processor.getState();
      expect(state.reasoning).to.equal("Let me think about this problem carefully...");
      expect(state.output).to.equal("The answer is 42.");
      expect(state.isComplete).to.be.true;
    });

    it("should handle tool call flow", () => {
      const events = [
        UnifiedEventBuilder.create()
          .withKind("reasoning.delta")
          .withContent("I need to call a tool...")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("tool_call")
          .withDelta({
            tool_calls: [{
              id: "call_123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"New York"}'
              }
            }]
          })
          .build(),
        UnifiedEventBuilder.create()
          .withKind("tool_result")
          .withDelta({
            tool_call_id: "call_123",
            content: "Weather: 75°F, sunny"
          })
          .build(),
        UnifiedEventBuilder.create()
          .withKind("output.delta")
          .withContent("The weather in New York is 75°F and sunny.")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("done")
          .build()
      ];

      for (const event of events) {
        processor.processEvent(event);
      }

      const state = processor.getState();
      expect(state.reasoning).to.equal("I need to call a tool...");
      expect(state.toolCalls).to.have.length(1);
      expect(state.toolCalls[0].function.name).to.equal("get_weather");
      expect(state.output).to.equal("The weather in New York is 75°F and sunny.");
      expect(state.isComplete).to.be.true;
    });

    it("should handle interleaved reasoning and output", () => {
      const events = [
        UnifiedEventBuilder.create()
          .withKind("reasoning.delta")
          .withContent("First, let me consider...")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("output.delta")
          .withContent("Based on my analysis, ")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("reasoning.delta")
          .withContent("Actually, I should also think about...")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("output.delta")
          .withContent("the conclusion is clear.")
          .build()
      ];

      for (const event of events) {
        processor.processEvent(event);
      }

      const state = processor.getState();
      expect(state.reasoning).to.equal("First, let me consider...Actually, I should also think about...");
      expect(state.output).to.equal("Based on my analysis, the conclusion is clear.");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle empty content gracefully", () => {
      const emptyEvents = [
        UnifiedEventBuilder.create()
          .withKind("reasoning.delta")
          .withContent("")
          .build(),
        UnifiedEventBuilder.create()
          .withKind("output.delta")
          .withContent("")
          .build()
      ];

      for (const event of emptyEvents) {
        expect(() => processor.processEvent(event)).to.not.throw();
      }

      const state = processor.getState();
      expect(state.reasoning).to.equal("");
      expect(state.output).to.equal("");
    });

    it("should handle missing content for non-delta events", () => {
      const toolEvent = UnifiedEventBuilder.create()
        .withKind("tool_call")
        .withDelta({ tool_calls: [] })
        .build();

      const doneEvent = UnifiedEventBuilder.create()
        .withKind("done")
        .build();

      expect(() => {
        processor.processEvent(toolEvent);
        processor.processEvent(doneEvent);
      }).to.not.throw();
    });

    it("should validate event sequence integrity", () => {
      // Process events out of logical order
      const events = [
        UnifiedEventBuilder.create()
          .withKind("done")  // Done before any content
          .build(),
        UnifiedEventBuilder.create()
          .withKind("output.delta")
          .withContent("Late content")
          .build()
      ];

      for (const event of events) {
        processor.processEvent(event);
      }

      // Should still process but state might be unexpected
      const state = processor.getState();
      expect(state.isComplete).to.be.true; // First event marked as done
      expect(state.output).to.equal("Late content"); // But still accumulated content
    });

    it("should handle malformed tool calls", () => {
      const malformedToolEvent = UnifiedEventBuilder.create()
        .withKind("tool_call")
        .withDelta({
          tool_calls: [{
            // Missing required fields
            type: "function"
          }]
        })
        .build();

      expect(() => processor.processEvent(malformedToolEvent)).to.not.throw();
      
      const state = processor.getState();
      expect(state.toolCalls).to.have.length(1);
      expect(state.toolCalls[0]).to.not.have.property("function");
    });
  });

  describe("Event Aggregation and State Management", () => {
    it("should accumulate content correctly across multiple deltas", () => {
      const words = ["The", " quick", " brown", " fox", " jumps"];
      
      for (const word of words) {
        const event = UnifiedEventBuilder.create()
          .withKind("output.delta")
          .withContent(word)
          .build();
        
        processor.processEvent(event);
      }

      const state = processor.getState();
      expect(state.output).to.equal("The quick brown fox jumps");
    });

    it("should maintain separate reasoning and output streams", () => {
      const events = [
        { kind: "reasoning.delta" as const, content: "Think 1" },
        { kind: "output.delta" as const, content: "Output 1" },
        { kind: "reasoning.delta" as const, content: "Think 2" },
        { kind: "output.delta" as const, content: "Output 2" }
      ];

      for (const { kind, content } of events) {
        const event = UnifiedEventBuilder.create()
          .withKind(kind)
          .withContent(content)
          .build();
        
        processor.processEvent(event);
      }

      const state = processor.getState();
      expect(state.reasoning).to.equal("Think 1Think 2");
      expect(state.output).to.equal("Output 1Output 2");
    });

    it("should track multiple tool calls", () => {
      const toolCalls = [
        {
          id: "call_1",
          type: "function",
          function: { name: "tool_1", arguments: '{}' }
        },
        {
          id: "call_2", 
          type: "function",
          function: { name: "tool_2", arguments: '{}' }
        }
      ];

      for (const toolCall of toolCalls) {
        const event = UnifiedEventBuilder.create()
          .withKind("tool_call")
          .withDelta({ tool_calls: [toolCall] })
          .build();
        
        processor.processEvent(event);
      }

      const state = processor.getState();
      expect(state.toolCalls).to.have.length(2);
      expect(state.toolCalls[0].function.name).to.equal("tool_1");
      expect(state.toolCalls[1].function.name).to.equal("tool_2");
    });
  });

  describe("Builder Pattern Validation", () => {
    it("should support fluent interface", () => {
      const event = UnifiedEventBuilder.create()
        .withKind("reasoning.delta")
        .withContent("Test reasoning")
        .withDelta({ additional: "data" })
        .build();

      expect(event.kind).to.equal("reasoning.delta");
      expect(event.content).to.equal("Test reasoning");
      expect(event.delta).to.deep.equal({ additional: "data" });
    });

    it("should allow partial configuration", () => {
      const minimalEvent = UnifiedEventBuilder.create()
        .withKind("done")
        .build();

      TestAssertions.assertUnifiedEvent(minimalEvent);
      expect(minimalEvent.kind).to.equal("done");
      expect(minimalEvent).to.not.have.property("content");
    });

    it("should support chaining with different configurations", () => {
      const builder = UnifiedEventBuilder.create();
      
      const reasoningEvent = builder
        .withKind("reasoning.delta")
        .withContent("reasoning")
        .build();
      
      const outputEvent = UnifiedEventBuilder.create()
        .withKind("output.delta")
        .withContent("output")
        .build();

      expect(reasoningEvent.kind).to.equal("reasoning.delta");
      expect(outputEvent.kind).to.equal("output.delta");
    });
  });

  describe("Integration with Real SSE Events", () => {
    it("should process events from golden fixtures", () => {
      // Simulate converting real SSE events to UnifiedEvents
      const realSSEEvents = [
        TEST_SSE_EVENTS.RESPONSE_CREATED,
        TEST_SSE_EVENTS.REASONING_DELTA,
        TEST_SSE_EVENTS.OUTPUT_DELTA,
        TEST_SSE_EVENTS.RESPONSE_COMPLETED
      ];

      const unifiedEvents: UnifiedEvent[] = [];

      for (const sseEvent of realSSEEvents) {
        const sseData = JSON.parse(sseEvent.data);
        
        let unifiedEvent: UnifiedEvent | null = null;
        
        switch (sseEvent.event) {
          case "reasoning.delta":
            unifiedEvent = {
              kind: "reasoning.delta",
              content: sseData.delta?.reasoning_content || ""
            };
            break;
          case "output.delta":
            unifiedEvent = {
              kind: "output.delta", 
              content: sseData.delta?.content || ""
            };
            break;
          case "response.completed":
            unifiedEvent = {
              kind: "done",
              delta: sseData
            };
            break;
        }

        if (unifiedEvent) {
          TestAssertions.assertUnifiedEvent(unifiedEvent);
          unifiedEvents.push(unifiedEvent);
          processor.processEvent(unifiedEvent);
        }
      }

      expect(unifiedEvents.length).to.be.greaterThan(0);
      
      const state = processor.getState();
      expect(state.reasoning).to.equal("Let me think about this...");
      expect(state.output).to.equal("Hello");
      expect(state.isComplete).to.be.true;
    });
  });
});