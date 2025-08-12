import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { performance } from "perf_hooks";
import { OpenAIResponsesTransformer } from "@/transformer/openai-responses.transformer";
import { MockResponsesAPIServer } from "../mocks/openai/responses-api-server";
import { UnifiedRequestBuilder, TEST_MODELS } from "../helpers/test-builders";
import { TestAssertions } from "../helpers/test-assertions";
import { FixtureGenerator } from "../helpers/fixture-loader";

/**
 * Performance Benchmark Suite for OpenAI Responses API
 * 
 * This establishes baseline performance metrics and ensures that:
 * - Overhead is <5% for non-Responses workloads
 * - Latency meets acceptable thresholds
 * - Memory usage is reasonable
 * - Concurrent requests are handled efficiently
 */

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  memoryUsage: {
    before: number;
    after: number;
    peak: number;
  };
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];

  async measureOperation<T>(
    operation: string,
    fn: () => Promise<T> | T,
    iterations: number = 1000
  ): Promise<BenchmarkResult> {
    const times: number[] = [];
    const memoryBefore = process.memoryUsage().heapUsed;
    let memoryPeak = memoryBefore;

    // Warm up
    for (let i = 0; i < 10; i++) {
      await fn();
    }

    // Measure
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      
      times.push(end - start);
      
      const currentMemory = process.memoryUsage().heapUsed;
      if (currentMemory > memoryPeak) {
        memoryPeak = currentMemory;
      }
    }

    const memoryAfter = process.memoryUsage().heapUsed;
    const totalTime = times.reduce((sum, time) => sum + time, 0);

    const result: BenchmarkResult = {
      operation,
      iterations,
      totalTime,
      avgTime: totalTime / iterations,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      memoryUsage: {
        before: memoryBefore,
        after: memoryAfter,
        peak: memoryPeak
      }
    };

    this.results.push(result);
    return result;
  }

  getResults(): BenchmarkResult[] {
    return [...this.results];
  }

  printResults(): void {
    console.log("\n=== Performance Benchmark Results ===");
    for (const result of this.results) {
      console.log(`\n${result.operation}:`);
      console.log(`  Iterations: ${result.iterations}`);
      console.log(`  Average: ${result.avgTime.toFixed(3)}ms`);
      console.log(`  Min: ${result.minTime.toFixed(3)}ms`);
      console.log(`  Max: ${result.maxTime.toFixed(3)}ms`);
      console.log(`  Memory: ${((result.memoryUsage.after - result.memoryUsage.before) / 1024 / 1024).toFixed(2)}MB`);
    }
  }

  clear(): void {
    this.results = [];
  }
}

describe("Performance Benchmarks", () => {
  let transformer: OpenAIResponsesTransformer;
  let mockServer: MockResponsesAPIServer;
  let benchmark: PerformanceBenchmark;
  let serverPort: number;

  beforeEach(async () => {
    transformer = new OpenAIResponsesTransformer();
    mockServer = new MockResponsesAPIServer({ enableLogging: false });
    benchmark = new PerformanceBenchmark();
    serverPort = await mockServer.start();
  });

  afterEach(async () => {
    await mockServer.stop();
    // Only print results in CI or when explicitly requested
    if (process.env.PRINT_BENCHMARKS === "true") {
      benchmark.printResults();
    }
  });

  describe("Request Transformation Performance", () => {
    it("should transform Responses API requests efficiently", async () => {
      const responsesRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("user", "Test message")
        .withMaxTokens(100)
        .withTemperature(0.7)
        .withReasoning("medium")
        .build();

      const result = await benchmark.measureOperation(
        "Responses API Request Transformation",
        () => transformer.transformRequestOut(responsesRequest),
        500 // Reduced iterations for more complex transformation
      );

      // Should be very fast (< 1ms average)
      expect(result.avgTime).to.be.lessThan(1.0);
      TestAssertions.assertPerformanceConstraints(result.avgTime, 1.0);
      
      // Memory usage should be minimal
      const memoryIncrease = result.memoryUsage.after - result.memoryUsage.before;
      expect(memoryIncrease).to.be.lessThan(1024 * 1024); // < 1MB
    });

    it("should pass through Chat API requests with minimal overhead", async () => {
      const chatRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-4o")
        .withMessage("user", "Test message")
        .withMaxTokens(100)
        .withTemperature(0.7)
        .build();

      const result = await benchmark.measureOperation(
        "Chat API Request Pass-through",
        () => transformer.transformRequestOut(chatRequest),
        1000
      );

      // Should be extremely fast for pass-through (< 0.1ms average)
      expect(result.avgTime).to.be.lessThan(0.1);
      TestAssertions.assertPerformanceConstraints(result.avgTime, 0.1);
    });

    it("should handle complex requests efficiently", async () => {
      const complexRequest = UnifiedRequestBuilder.create()
        .withModel("o3")
        .withMessage("system", "You are a helpful assistant with access to tools")
        .withMessage("user", "What's the weather in multiple cities?")
        .withMaxTokens(500)
        .withTemperature(0.8)
        .withStream(true)
        .withReasoning("high")
        .withTool("get_weather", "Get weather", {
          type: "object",
          properties: {
            cities: {
              type: "array",
              items: { type: "string" }
            }
          }
        })
        .withToolChoice("auto")
        .build();

      const result = await benchmark.measureOperation(
        "Complex Request Transformation",
        () => transformer.transformRequestOut(complexRequest),
        500
      );

      // Even complex requests should be fast (< 2ms average)
      expect(result.avgTime).to.be.lessThan(2.0);
      TestAssertions.assertPerformanceConstraints(result.avgTime, 2.0);
    });
  });

  describe("Response Processing Performance", () => {
    it("should process responses efficiently", async () => {
      const mockResponse = new Response(
        JSON.stringify({
          id: "resp_123",
          object: "response",
          model: "gpt-5",
          choices: [{ message: { role: "assistant", content: "Test response" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, reasoning_tokens: 20, total_tokens: 35 }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );

      const result = await benchmark.measureOperation(
        "Response Processing",
        () => transformer.transformResponseIn(mockResponse.clone()),
        1000
      );

      // Response processing should be minimal (currently just pass-through)
      expect(result.avgTime).to.be.lessThan(0.1);
    });
  });

  describe("Concurrent Request Handling", () => {
    it("should handle concurrent transformations efficiently", async () => {
      const requests = Array.from({ length: 100 }, (_, i) =>
        UnifiedRequestBuilder.create()
          .withModel(i % 2 === 0 ? "gpt-5" : "gpt-4o")
          .withMessage("user", `Message ${i}`)
          .build()
      );

      const result = await benchmark.measureOperation(
        "Concurrent Request Processing",
        async () => {
          const promises = requests.map(req => transformer.transformRequestOut(req));
          await Promise.all(promises);
        },
        10 // Run 10 batches of 100 concurrent requests
      );

      // Concurrent processing should scale well
      const avgTimePerRequest = result.avgTime / 100; // 100 requests per batch
      expect(avgTimePerRequest).to.be.lessThan(1.0);
    });

    it("should maintain performance under load", async () => {
      const createRequest = (modelIndex: number) => {
        const models = ["gpt-5", "gpt-4o", "o3-mini", "gpt-5-nano"];
        return UnifiedRequestBuilder.create()
          .withModel(models[modelIndex % models.length])
          .withMessage("user", "Load test message")
          .withMaxTokens(100)
          .build();
      };

      // Simulate high load
      const result = await benchmark.measureOperation(
        "High Load Processing",
        async () => {
          const batch = Array.from({ length: 500 }, (_, i) => 
            transformer.transformRequestOut(createRequest(i))
          );
          await Promise.all(batch);
        },
        5
      );

      // Should maintain reasonable performance even under load
      const avgTimePerRequest = result.avgTime / 500;
      expect(avgTimePerRequest).to.be.lessThan(2.0);
    });
  });

  describe("Memory Usage Characteristics", () => {
    it("should not leak memory during repeated operations", async () => {
      const request = UnifiedRequestBuilder.create()
        .withModel("gpt-5")
        .withMessage("user", "Memory test")
        .build();

      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      for (let i = 0; i < 5000; i++) {
        await transformer.transformRequestOut(request);
        
        // Force garbage collection every 1000 operations
        if (i % 1000 === 999 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal (< 5MB)
      expect(memoryIncrease).to.be.lessThan(5 * 1024 * 1024);
    });

    it("should handle large requests efficiently", async () => {
      // Create a large request with many messages and tools
      const largeRequest = UnifiedRequestBuilder.create()
        .withModel("o3")
        .withMessage("system", "You are an expert assistant" + "X".repeat(1000))
        .withMessage("user", "Analyze this large dataset" + "Y".repeat(5000))
        .withMessage("assistant", "I'll help you analyze" + "Z".repeat(2000))
        .withMessage("user", "Please continue the analysis" + "W".repeat(3000))
        .withMaxTokens(2000)
        .withReasoning("high")
        .build();

      // Add multiple large tools
      for (let i = 0; i < 10; i++) {
        largeRequest.tools = largeRequest.tools || [];
        largeRequest.tools.push({
          type: "function",
          function: {
            name: `tool_${i}`,
            description: `Tool ${i} description`.repeat(100),
            parameters: {
              type: "object",
              properties: Object.fromEntries(
                Array.from({ length: 50 }, (_, j) => [
                  `param_${j}`,
                  { type: "string", description: `Parameter ${j}`.repeat(10) }
                ])
              )
            }
          }
        });
      }

      const result = await benchmark.measureOperation(
        "Large Request Processing",
        () => transformer.transformRequestOut(largeRequest),
        100
      );

      // Should handle large requests reasonably well (< 5ms)
      expect(result.avgTime).to.be.lessThan(5.0);
    });
  });

  describe("Streaming Performance", () => {
    it("should handle SSE events efficiently", async () => {
      const events = FixtureGenerator.generateSSEEvents({
        includeReasoning: true,
        includeToolCalls: false,
        eventCount: 50
      });

      const result = await benchmark.measureOperation(
        "SSE Event Processing",
        () => {
          // Simulate processing each event
          for (const event of events) {
            JSON.parse(event.data);
          }
        },
        100
      );

      // Processing 50 events should be fast (< 1ms total)
      expect(result.avgTime).to.be.lessThan(1.0);
    });

    it("should handle tool call events efficiently", async () => {
      const toolCallEvents = FixtureGenerator.generateSSEEvents({
        includeReasoning: false,
        includeToolCalls: true,
        eventCount: 10
      });

      const result = await benchmark.measureOperation(
        "Tool Call Event Processing",
        () => {
          for (const event of toolCallEvents) {
            if (event.event === "tool_calls") {
              const parsed = JSON.parse(event.data);
              // Simulate tool call validation
              if (parsed.delta?.tool_calls) {
                for (const toolCall of parsed.delta.tool_calls) {
                  JSON.parse(toolCall.function.arguments);
                }
              }
            }
          }
        },
        500
      );

      // Tool call processing should be efficient
      expect(result.avgTime).to.be.lessThan(2.0);
    });
  });

  describe("Comparative Performance", () => {
    it("should show minimal overhead vs. direct pass-through", async () => {
      const chatRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-4o")
        .withMessage("user", "Test")
        .build();

      // Measure transformer overhead
      const transformerResult = await benchmark.measureOperation(
        "Transformer Processing",
        () => transformer.transformRequestOut(chatRequest),
        1000
      );

      // Measure direct pass-through
      const directResult = await benchmark.measureOperation(
        "Direct Pass-through",
        () => Promise.resolve(chatRequest),
        1000
      );

      // Overhead should be minimal (< 100% increase)
      const overhead = (transformerResult.avgTime - directResult.avgTime) / directResult.avgTime;
      expect(overhead).to.be.lessThan(1.0); // Less than 100% overhead
    });

    it("should validate 5% overhead requirement", async () => {
      const baselineRequest = UnifiedRequestBuilder.create()
        .withModel("gpt-4o")
        .withMessage("user", "Baseline test")
        .build();

      // Baseline: JSON.stringify + JSON.parse (simulating minimal processing)
      const baselineResult = await benchmark.measureOperation(
        "Baseline JSON Processing",
        () => {
          const serialized = JSON.stringify(baselineRequest);
          return JSON.parse(serialized);
        },
        1000
      );

      // Transformer processing
      const transformerResult = await benchmark.measureOperation(
        "Transformer vs Baseline",
        () => transformer.transformRequestOut(baselineRequest),
        1000
      );

      // Calculate overhead percentage
      const overheadPercent = 
        ((transformerResult.avgTime - baselineResult.avgTime) / baselineResult.avgTime) * 100;

      // Should meet the <5% overhead requirement
      expect(overheadPercent).to.be.lessThan(5.0);
      
      console.log(`\nOverhead Analysis:`);
      console.log(`Baseline: ${baselineResult.avgTime.toFixed(3)}ms`);
      console.log(`Transformer: ${transformerResult.avgTime.toFixed(3)}ms`);
      console.log(`Overhead: ${overheadPercent.toFixed(2)}%`);
    });
  });

  describe("Performance Regression Detection", () => {
    it("should establish baseline metrics", async () => {
      const testCases = [
        {
          name: "Simple Responses Request",
          request: UnifiedRequestBuilder.create()
            .withModel("gpt-5")
            .withMessage("user", "Hello")
            .build(),
          maxTime: 1.0
        },
        {
          name: "Simple Chat Request",
          request: UnifiedRequestBuilder.create()
            .withModel("gpt-4o")
            .withMessage("user", "Hello")
            .build(),
          maxTime: 0.1
        },
        {
          name: "Complex Responses Request",
          request: UnifiedRequestBuilder.create()
            .withModel("o3")
            .withMessage("user", "Complex query")
            .withReasoning("high")
            .withTool("test", "Test tool", { type: "object" })
            .build(),
          maxTime: 2.0
        }
      ];

      for (const testCase of testCases) {
        const result = await benchmark.measureOperation(
          testCase.name,
          () => transformer.transformRequestOut(testCase.request),
          500
        );

        // Establish baseline expectations
        expect(result.avgTime).to.be.lessThan(testCase.maxTime);
        
        // Document the baseline for future regression testing
        console.log(`${testCase.name}: ${result.avgTime.toFixed(3)}ms avg`);
      }
    });
  });
});