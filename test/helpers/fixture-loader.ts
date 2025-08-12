import * as fs from "fs";
import * as path from "path";

/**
 * Utility for loading and managing test fixtures
 */
export class FixtureLoader {
  private static readonly FIXTURES_DIR = path.join(__dirname, "..", "fixtures");

  /**
   * Load a JSON fixture file
   */
  static loadJSON<T = any>(relativePath: string): T {
    const fullPath = path.join(this.FIXTURES_DIR, relativePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Fixture not found: ${fullPath}`);
    }
    
    const content = fs.readFileSync(fullPath, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Load all fixtures from a directory
   */
  static loadDirectory<T = any>(relativePath: string): Map<string, T> {
    const fullPath = path.join(this.FIXTURES_DIR, relativePath);
    const fixtures = new Map<string, T>();
    
    if (!fs.existsSync(fullPath)) {
      return fixtures;
    }
    
    const files = fs.readdirSync(fullPath);
    
    for (const file of files) {
      if (file.endsWith(".json")) {
        const name = path.basename(file, ".json");
        const content = this.loadJSON<T>(path.join(relativePath, file));
        fixtures.set(name, content);
      }
    }
    
    return fixtures;
  }

  /**
   * Get OpenAI Responses API fixtures
   */
  static getResponsesFixtures() {
    return {
      requests: this.loadDirectory("openai/responses"),
      responses: this.loadDirectory("openai/responses")
    };
  }

  /**
   * Get OpenAI Chat Completions API fixtures
   */
  static getChatFixtures() {
    return {
      requests: this.loadDirectory("openai/chat"),
      responses: this.loadDirectory("openai/chat")
    };
  }

  /**
   * Load SSE events fixture
   */
  static loadSSEEvents(fixtureName: string): Array<{ event?: string; data: string }> {
    return this.loadJSON(`openai/responses/${fixtureName}`);
  }

  /**
   * Create a test-specific fixture directory
   */
  static createTestFixtures(testName: string, fixtures: Record<string, any>): void {
    const testDir = path.join(this.FIXTURES_DIR, "test-generated", testName);
    
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    for (const [name, content] of Object.entries(fixtures)) {
      const filePath = path.join(testDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    }
  }

  /**
   * Clean up test-generated fixtures
   */
  static cleanupTestFixtures(testName?: string): void {
    const testDir = testName 
      ? path.join(this.FIXTURES_DIR, "test-generated", testName)
      : path.join(this.FIXTURES_DIR, "test-generated");
    
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

/**
 * Predefined fixture sets for common test scenarios
 */
export const CommonFixtures = {
  /**
   * Basic GPT-5 request/response pair
   */
  get gpt5Basic() {
    return {
      request: FixtureLoader.loadJSON("openai/responses/gpt-5-basic-request.json"),
      response: FixtureLoader.loadJSON("openai/responses/gpt-5-basic-response.json"),
      events: FixtureLoader.loadJSON("openai/responses/gpt-5-streaming-events.json")
    };
  },

  /**
   * O3 tool call scenario
   */
  get o3ToolCall() {
    return {
      request: FixtureLoader.loadJSON("openai/responses/o3-tool-call-request.json"),
      events: FixtureLoader.loadJSON("openai/responses/o3-tool-call-events.json")
    };
  },

  /**
   * GPT-4o Chat Completions (for backward compatibility testing)
   */
  get gpt4oChat() {
    return {
      request: FixtureLoader.loadJSON("openai/chat/gpt-4o-request.json"),
      response: FixtureLoader.loadJSON("openai/chat/gpt-4o-response.json")
    };
  }
};

/**
 * Dynamic fixture generation for testing edge cases
 */
export class FixtureGenerator {
  /**
   * Generate a Responses API request with specified parameters
   */
  static generateResponsesRequest(overrides: Partial<any> = {}): any {
    return {
      model: "gpt-5",
      input: [
        { role: "user", content: "Test message" }
      ],
      stream: false,
      max_completion_tokens: 100,
      temperature: 0.7,
      reasoning_effort: "medium",
      ...overrides
    };
  }

  /**
   * Generate SSE events for a streaming response
   */
  static generateSSEEvents(options: {
    includeReasoning?: boolean;
    includeToolCalls?: boolean;
    eventCount?: number;
  } = {}): Array<{ event?: string; data: string }> {
    const events: Array<{ event?: string; data: string }> = [];
    
    // Response created
    events.push({
      event: "response.created",
      data: JSON.stringify({
        id: "resp_test_123",
        object: "response",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-5"
      })
    });

    // Reasoning events
    if (options.includeReasoning) {
      events.push({
        event: "reasoning.delta",
        data: JSON.stringify({
          id: "resp_test_123",
          object: "response.delta",
          delta: { reasoning_content: "Let me think about this..." }
        })
      });
    }

    // Output events
    const eventCount = options.eventCount || 3;
    const words = ["Hello", " world", "!"];
    
    for (let i = 0; i < Math.min(eventCount, words.length); i++) {
      events.push({
        event: "output.delta",
        data: JSON.stringify({
          id: "resp_test_123",
          object: "response.delta",
          delta: { content: words[i] }
        })
      });
    }

    // Tool call events
    if (options.includeToolCalls) {
      events.push({
        event: "tool_calls",
        data: JSON.stringify({
          id: "resp_test_123",
          object: "response.delta",
          delta: {
            tool_calls: [{
              id: "call_test_123",
              type: "function",
              function: {
                name: "test_function",
                arguments: '{"param": "value"}'
              }
            }]
          },
          requires_action: {
            type: "submit_tool_outputs",
            submit_tool_outputs: {
              tool_calls: [{
                id: "call_test_123",
                type: "function",
                function: {
                  name: "test_function",
                  arguments: '{"param": "value"}'
                }
              }]
            }
          }
        })
      });
    } else {
      // Completion event
      events.push({
        event: "response.completed",
        data: JSON.stringify({
          id: "resp_test_123",
          object: "response",
          model: "gpt-5",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: words.join("")
            },
            finish_reason: "stop"
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: words.length,
            reasoning_tokens: options.includeReasoning ? 25 : 0,
            total_tokens: 10 + words.length + (options.includeReasoning ? 25 : 0)
          }
        })
      });
    }

    return events;
  }

  /**
   * Generate a model capability definition
   */
  static generateModelCapability(overrides: Partial<any> = {}): any {
    return {
      api: "responses",
      supports: {
        tools: true,
        reasoning: true
      },
      sseEvents: ["reasoning.delta", "output.delta", "tool_calls", "response.completed"],
      usageDims: ["input", "completion", "reasoning"],
      ...overrides
    };
  }
}