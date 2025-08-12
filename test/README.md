# OpenAI Responses API Test Infrastructure

This comprehensive test suite validates the implementation of OpenAI Responses API support in the @musistudio/llms package. The tests ensure backward compatibility, performance requirements, and full feature parity.

## 🏗️ Test Architecture

```
test/
├── fixtures/                    # Golden JSON/SSE test data
│   ├── openai/
│   │   ├── responses/          # Responses API fixtures
│   │   └── chat/               # Chat Completions fixtures
├── mocks/                      # Mock servers and services
│   └── openai/
│       └── responses-api-server.ts  # Full SSE mock server
├── specs/                      # Test specifications
│   ├── core/                  # Unit tests for transformers
│   ├── streaming/             # SSE integration tests
│   ├── compatibility/         # Backward compatibility tests
│   └── integration/           # End-to-end tests
├── helpers/                   # Test utilities and builders
│   ├── test-builders.ts       # Fluent test data builders
│   ├── test-assertions.ts     # Custom assertions
│   └── fixture-loader.ts      # Golden fixture management
├── benchmarks/                # Performance tests
└── test-runner.ts            # Orchestrated test execution
```

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Categories
```bash
# Core transformer tests
npm run test:responses

# Backward compatibility (CRITICAL)
npm run test:compatibility  

# Performance benchmarks
npm run test:benchmarks

# Custom test runner with detailed reporting
tsx test/test-runner.ts
```

## 📋 Test Categories

### 1. Core Unit Tests (`test/specs/core/`)
- **OpenAI Responses Transformer** - Request/response transformation logic
- **Model Capability Interface** - Model routing and capability detection
- **UnifiedEvent Processing** - SSE event standardization

**Purpose**: Validate the core transformation logic and interfaces that other agents will implement against.

### 2. Streaming Integration Tests (`test/specs/streaming/`)
- **SSE Event Handling** - Server-Sent Events processing
- **Tool Call Orchestration** - Multi-turn conversation flows
- **UnifiedEvent Conversion** - Real-time event transformation

**Purpose**: Ensure streaming functionality works end-to-end with realistic SSE scenarios.

### 3. Backward Compatibility Tests (`test/specs/compatibility/`)
- **Chat Completions Preservation** - Existing API unchanged
- **Response Format Compatibility** - No breaking changes
- **Performance Impact** - <5% overhead requirement

**Purpose**: **CRITICAL GATE** - These tests must ALL pass before any Responses API changes can be merged.

### 4. Performance Benchmarks (`test/benchmarks/`)
- **Transformation Latency** - <1ms for simple requests
- **Memory Usage** - No memory leaks
- **Concurrent Processing** - Scale validation
- **Overhead Analysis** - Quantified performance impact

**Purpose**: Establish baseline metrics and ensure performance requirements are met.

## 🧪 Key Test Contracts

### ModelCapability Interface
```typescript
interface ModelCapability {
  api: 'responses' | 'chat';
  supports: { tools: boolean; reasoning: boolean };
  sseEvents: string[];
  usageDims: ('input' | 'completion' | 'reasoning')[];
}
```

**Validation**: Model routing logic for GPT-5 → responses API, GPT-4o → chat API

### UnifiedEvent Interface
```typescript
interface UnifiedEvent {
  kind: 'reasoning.delta' | 'output.delta' | 'tool_call' | 'tool_result' | 'done';
  content?: string;
  delta?: any;
}
```

**Validation**: SSE event standardization for cross-API compatibility

## 🛠️ Test Utilities

### Test Builders (Fluent Interface)
```typescript
// Build test requests
const request = UnifiedRequestBuilder.create()
  .withModel("gpt-5")
  .withMessage("user", "Test message")
  .withReasoning("high")
  .withTool("get_weather", "Get weather", {...})
  .build();

// Build capabilities
const capability = ModelCapabilityBuilder.create()
  .withAPI("responses")
  .withReasoningSupport(true)
  .withSSEEvents(["reasoning.delta", "output.delta"])
  .build();
```

### Custom Assertions
```typescript
// Format validation
TestAssertions.assertResponsesAPIFormat(request);
TestAssertions.assertChatAPIFormat(request);

// Model routing
TestAssertions.assertRequiresResponsesAPI("gpt-5");
TestAssertions.assertUsesChatAPI("gpt-4o");

// Usage tracking
TestAssertions.assertHasReasoningTokens(usage);
TestAssertions.assertNoReasoningTokens(usage);

// Performance
TestAssertions.assertPerformanceConstraints(duration, 1.0);
```

### Golden Fixtures
```typescript
// Load predefined test data
const fixtures = CommonFixtures.gpt5Basic;
// { request, response, events }

// Load custom fixtures
const customData = FixtureLoader.loadJSON("openai/responses/custom.json");

// Generate dynamic test data
const events = FixtureGenerator.generateSSEEvents({
  includeReasoning: true,
  includeToolCalls: true,
  eventCount: 10
});
```

## 🎯 Test Scenarios

### Model Routing Tests
- ✅ GPT-5 family → Responses API
- ✅ O3 family → Responses API  
- ✅ GPT-4o family → Chat Completions API
- ✅ Edge cases and pattern matching

### Request Transformation Tests
- ✅ `messages` → `input` conversion
- ✅ `max_tokens` → `max_completion_tokens`
- ✅ `reasoning.effort` → `reasoning_effort`
- ✅ Tool preservation and validation

### SSE Event Processing Tests
- ✅ `reasoning.delta` → reasoning content aggregation
- ✅ `output.delta` → response text streaming
- ✅ `tool_calls` → tool execution orchestration
- ✅ `response.completed` → usage tracking

### Tool Orchestration Tests
- ✅ Single tool call flow
- ✅ Multi-turn tool conversations
- ✅ Parallel tool execution
- ✅ Tool error handling

### Usage Tracking Tests
- ✅ Reasoning tokens (Responses API)
- ✅ No reasoning tokens (Chat API)
- ✅ Multi-dimensional cost calculation
- ✅ Token count validation

## 🚨 Critical Success Criteria

### Backward Compatibility (MUST PASS)
- [ ] All existing Chat Completions tests pass unchanged
- [ ] GPT-4o requests identical before/after
- [ ] Response format preserved
- [ ] No new fields in Chat API responses
- [ ] Performance overhead <5%

### Responses API Support (NEW FUNCTIONALITY)
- [ ] GPT-5/O3 models route correctly
- [ ] Request transformation preserves semantics
- [ ] SSE events process correctly
- [ ] Reasoning tokens tracked separately
- [ ] Tool calls work end-to-end

### Performance Requirements
- [ ] Request transformation <1ms average
- [ ] Chat API pass-through <0.1ms average
- [ ] Memory usage stable under load
- [ ] Concurrent requests scale linearly

## 🔧 Mock Infrastructure

### MockResponsesAPIServer
Full-featured mock server that simulates OpenAI's `/v1/responses` endpoint:

- ✅ SSE streaming with realistic events
- ✅ Tool call orchestration flows
- ✅ Usage tracking with reasoning tokens
- ✅ Error scenarios and edge cases
- ✅ Performance testing support

```typescript
const server = new MockResponsesAPIServer();
await server.start();

server.addResponse("gpt-5", {
  id: "resp_123",
  model: "gpt-5", 
  events: [...sseEvents],
  usage: { reasoning_tokens: 150, ... }
});
```

## 📊 Performance Baselines

### Target Metrics
- **Simple Request Transformation**: <1ms
- **Chat API Pass-through**: <0.1ms  
- **Complex Request**: <2ms
- **Memory Overhead**: <1MB per 1000 requests
- **Total Overhead**: <5% vs baseline

### Benchmark Categories
- Single request latency
- Concurrent request throughput
- Memory usage under load
- Long-running streaming performance

## 🏃‍♂️ Running Tests

### Development Workflow
```bash
# Watch mode during development
npm run test:watch

# Quick core validation
tsx test/test-runner.ts --core

# Critical compatibility check
tsx test/test-runner.ts --compatibility

# Performance validation
tsx test/test-runner.ts --benchmarks
```

### CI/CD Integration
```bash
# Full test suite with reporting
tsx test/test-runner.ts

# Exit codes: 0 = success, 1 = failure
# Generates test-report.json for CI analysis
```

### Custom Test Patterns
```bash
# Run specific files
tsx test/test-runner.ts --pattern "test/specs/core/*transformer*.test.ts"

# Run streaming tests only
tsx test/test-runner.ts --streaming
```

## 🎯 Test-Driven Development

This test infrastructure enables **Test-Driven Development** for Responses API implementation:

1. **Tests are written FIRST** - They define the expected behavior
2. **Implementation follows** - Code is written to make tests pass
3. **Contracts are enforced** - Interfaces are validated by tests
4. **Regression prevention** - Changes must not break existing tests

### Implementation Agents Should:
- ✅ Run tests before implementing
- ✅ Use test builders for consistent data
- ✅ Follow test contracts (ModelCapability, UnifiedEvent)
- ✅ Ensure backward compatibility tests pass
- ✅ Meet performance requirements

## 🐛 Debugging Tests

### Common Issues
```bash
# Mock server port conflicts
lsof -ti:3000 | xargs kill -9

# Memory leaks in tests
node --expose-gc test/test-runner.ts --benchmarks

# Timeout issues
MOCHA_TIMEOUT=60000 npm test

# Verbose logging
DEBUG=* npm test
```

### Test Isolation
Each test suite runs in isolation with:
- Fresh transformer instances
- Clean mock servers
- Reset test state
- Independent fixtures

## 📈 Continuous Improvement

### Metrics Collection
- Test execution times
- Performance baselines
- Coverage reports
- Compatibility validation

### Test Maintenance
- Golden fixtures updated with API changes
- Performance baselines adjusted for hardware
- New test scenarios added for edge cases
- Mock servers enhanced with real-world data

---

**This test infrastructure is the foundation for reliable Responses API implementation. All tests must pass before any code changes are merged.**