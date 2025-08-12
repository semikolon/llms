# OpenAI Responses API Implementation Plan for @musistudio/llms

## Executive Summary

This document outlines the comprehensive plan to add full OpenAI Responses API support to the @musistudio/llms package, which is a core dependency of Claude Code Router (CCR). The Responses API is required for newer OpenAI models like GPT-5, o3, and codex-mini, and provides enhanced features including reasoning token tracking, advanced streaming, and multi-turn tool orchestration.

## Context from Previous Work

### Issues Discovered and Fixed
1. **Root Problem**: CCR routing to GPT-5 was failing with "0 tokens" displayed, falling back to native Claude
   - **Cause**: Custom router returning objects instead of strings
   - **Fix Applied**: Router now correctly returns "openai,gpt-5" string format

2. **Serena Integration**:
   - **Issue**: Multiple Claude Code instances conflicting
   - **Fix Applied**: Implemented lock file mechanism with follower fast-path for shared Serena server

3. **Environment Variables**:
   - **Issue**: CCR couldn't interpolate environment variables in config
   - **Status**: User submitted PR to CCR for this functionality

### Architectural Decisions from Latest Research

#### CCR PR #373: Perfect Implementation Foundation
**Critical Discovery**: Based on GitHub links provided (musistudio/llms#15, musistudio/claude-code-router#384, musistudio/claude-code-router#373), it appears that **SSE streaming infrastructure and auto-detection have already been merged into CCR main branch approximately 2 weeks ago**.

This provides the ideal foundation for Responses API implementation:
- **SSE Streaming Infrastructure**: Server-Sent Events for real-time response streaming
- **Anthropic Passthrough**: Clean architecture for API proxying and transformation
- **Auto-Detection**: Automatic provider detection and routing logic
- **Ready for Extension**: Architecture designed to support multiple API formats

**Implementation Strategy**: Layer Responses API support on top of the existing SSE foundation rather than building from scratch.

#### Charm Crush Analysis Results
**Verified Limitations**:
- **NO Responses API support**: Only implements standard OpenAI Chat Completions API (confirmed via source code analysis)
- **NO Claude Max compatibility**: Explicitly states "only official, compliant APIs"  
- **Beautiful UI**: Uses Charm ecosystem (Bubble Tea, Lip Gloss, Bubbles) for stunning terminal experience
- **Architectural Decision**: Implement Responses API in CCR first, then explore UI enhancements using Charm libraries

### Current Implementation Status

#### Already Implemented (Partial)
- **Basic Responses Transformer**: Created `openai-responses.transformer.ts` with:
  - Endpoint switching logic (/v1/responses)
  - Basic parameter mapping (reasoning → reasoning_effort)
  - Model detection for Responses-required models
  - **Status**: Incomplete - missing streaming, tool calls, usage tracking

- **Reasoning Transformer**: Existing transformer expects Responses API format:
  - Already looking for `reasoning_content` in deltas
  - **Bug**: Using wrong parameter name ("reasoning" instead of "reasoning_effort")
  - Maps to Claude-style thinking blocks

#### Local Development Setup
- **Directories**: 
  - `~/llms-dev` - Enhanced @musistudio/llms package
  - `~/ccr-dev` - Claude Code Router
- **Testing Configuration**: User has working CCR config routing to GPT-5
- **Known Issues**: Token counting not displaying correctly for reasoning tokens

### Architectural Decisions Made

Based on GPT-5's expert analysis, we determined:
- **Transformer-only approach is insufficient** for full feature parity
- Need broader architectural components:
  - ModelCatalog for routing decisions
  - StreamTransformer for stateful SSE handling
  - UsageExtractor for multi-dimensional token tracking
  - ToolCallOrchestrator for multi-turn conversations
- Decision to use **Incremental Evolution** approach rather than full rewrite

## Background & Context

### The Problem
Claude Code Router (CCR) currently cannot properly route requests to GPT-5 and newer OpenAI models because:
- These models require the Responses API (`/v1/responses`) instead of Chat Completions API (`/v1/chat/completions`)
- The Responses API uses different request/response formats and parameter names
- Reasoning tokens need special handling for cost tracking and display
- Current transformer-only approach is insufficient for full feature parity

### Prior Research
- **SST OpenCode**: Successfully implemented Responses API support in PR #34 (May 2025)
- **Charm Crush CLI**: Verified NO Responses API support - only standard Chat Completions API, NO Claude Max compatibility
- **CCR**: **CRITICAL DISCOVERY** - PR #373 provides perfect SSE streaming foundation for Responses API implementation

### Current State
- Basic OpenAI Responses transformer created (`openai-responses.transformer.ts`)
- Handles endpoint switching and basic parameter mapping
- Missing critical features: streaming, tool calls, cost tracking, model detection

## Technical Architecture

### Current Architecture Limitations
The existing transformer pattern in @musistudio/llms:
- **Can Handle**: Basic request/response transformation, endpoint switching, parameter mapping
- **Cannot Handle**: Stateful streaming, multi-turn conversations, usage tracking, model-specific routing

### Required Architectural Components

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                        │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   MODEL CATALOG                          │
│  Determines: API type, capabilities, pricing, streaming  │
└────────────────────────┬─────────────────────────────────┘
                         │
                    ┌────┴────┐
                    │ Routes  │
                    └────┬────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Chat Comp.   │ │ Responses    │ │ Tool Orch.   │
│ Transformer  │ │ Transformer  │ │ State Machine│
└──────────────┘ └──────┬───────┘ └──────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                STREAM TRANSFORMER                        │
│     Stateful SSE handling, reasoning aggregation         │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              USAGE EXTRACTOR & PRICING                   │
│     Multi-dimensional tokens, cost calculation           │
└─────────────────────────────────────────────────────────┘
```

## Related Documentation

- **CCR Implementation Roadmap**: See `~/ccr-dev/CCR_NEXT_STEPS.md` for detailed implementation plan and TUI enhancement strategy
- **Charm Ecosystem Analysis**: Complete analysis of Crush architecture and Charm libraries for future UI improvements

## Implementation Phases

### PHASE 1: Research & Foundation
**Objective:** Deep analysis of OpenCode patterns and interface design

#### 1.1 OpenCode Analysis
- Clone OpenCode repository and examine implementation files
- Map model detection logic (which models trigger Responses API)
- Study streaming event handling architecture  
- Understand usage/cost tracking approach
- Document tool call orchestration patterns

#### 1.2 Interface Design
- Design ModelCatalog interface based on OpenCode patterns
- Create StreamTransformer interface for SSE event handling
- Define UsageExtractor interface for multi-dimensional tokens
- Plan ErrorMapper interface for streaming error handling

#### 1.3 Foundation Components  
- Implement basic ModelCatalog with known Responses models
- Create enhanced types for Responses API requests/responses
- Set up test framework for Responses API integration testing

### PHASE 2: Core Responses Support
**Objective:** Basic request/response transformation with backward compatibility

#### 2.1 Enhanced OpenAI Transformer
- Modify existing OpenAI transformer to detect Responses-required models
- Add endpoint switching logic (/v1/responses vs /v1/chat/completions)
- Implement request format transformation (messages → input)
- Handle parameter mapping (reasoning → reasoning_effort)

#### 2.2 Model Registry Implementation
- Create ModelCatalog service with model capabilities mapping
- Define which models require/support Responses API
- Add streaming format detection (responses_sse vs chat_delta)
- Include pricing tier information for cost calculation

#### 2.3 Basic Usage Tracking
- Extend UnifiedChatRequest/Response types for reasoning tokens
- Create UsageExtractor to parse provider-specific usage fields
- Add reasoning_tokens to usage schema without breaking existing code
- Implement basic cost calculation for multi-dimensional tokens

#### 2.4 Integration & Testing
- Test basic non-streaming requests with GPT-5/o3/codex-mini
- Verify existing Chat Completions models still work unchanged
- Validate cost tracking captures reasoning tokens correctly
- Create regression test suite for backward compatibility

### PHASE 3: Advanced Streaming Architecture
**Objective:** Stateful SSE event handling - the most complex component

#### 3.1 StreamTransformer Design
- Create stateful StreamTransformer class for SSE event parsing
- Handle event types: reasoning.delta, output.delta, tool_calls, completion
- Implement buffering and state management for incomplete events
- Add reasoning content aggregation and filtering policies

#### 3.2 Enhanced Response Processing
- Extend current reasoning transformer to handle new SSE event format
- Map reasoning.delta events to Claude-style thinking blocks
- Preserve original reasoning_content for cost tracking
- Handle stream termination and final usage reporting

#### 3.3 Error Handling & Resilience
- Implement ErrorMapper for streaming error events and incomplete responses
- Add timeout handling for long reasoning steps
- Create retry logic with idempotency for transient failures
- Ensure proper cleanup on connection failures

#### 3.4 Performance & Observability
- Add structured logging for SSE events and stream lifecycle
- Implement metrics for stream duration, reasoning token rates
- Create debugging tools for stream event inspection
- Performance testing with concurrent streams and long reasoning chains

### PHASE 4: Tool Call Orchestration
**Objective:** Multi-turn conversational flows with tool execution

#### 4.1 Tool Call State Machine
State transitions:
```
tool_requested → tool_executed → response_continued
       ↓              ↓              ↓
   pause stream → submit_outputs → resume stream
```

- Create ToolCallOrchestrator to manage multi-turn tool flows
- Implement state transitions with proper timing
- Handle tool call streaming events and pause/resume logic
- Add support for submit_tool_outputs API calls

#### 4.2 Multi-Turn Conversation Management
- Extend current request handling to support conversational context
- Implement proper message history management across tool calls
- Add conversation state persistence for long-running tool chains
- Handle timeout and abandonment of incomplete tool sequences

#### 4.3 Tool Integration Patterns
- Create abstraction layer for different tool execution backends
- Add support for both synchronous and asynchronous tool calls
- Implement proper error propagation from tool execution failures
- Add retry logic for transient tool execution issues

#### 4.4 Advanced Tool Features
- Support for parallel tool calls within single turn
- Implement tool call result caching and deduplication
- Add tool execution monitoring and performance metrics
- Create debugging interface for tool call inspection

### PHASE 5: Production Hardening
**Objective:** Polish implementation for production readiness

#### 5.1 Enhanced Cost & Usage Tracking
- Implement comprehensive PricingEngine with model-specific rates
- Add support for multiple token dimensions (input/output/reasoning/audio)
- Create usage aggregation and reporting interfaces
- Add cost budgeting and alerting capabilities

#### 5.2 Security & Authentication
- Implement AuthHeaderBuilder for consistent header handling
- Add support for OpenAI-Organization and OpenAI-Project headers
- Create idempotency key management for tool calls and retries
- Add API key rotation and validation logic

#### 5.3 Monitoring & Observability
- Create comprehensive metrics for Responses API usage patterns
- Add distributed tracing for multi-turn conversations
- Implement health checks for streaming and tool call subsystems
- Create alerting for reasoning token cost spikes and failures

#### 5.4 Configuration & Deployment
- Add feature flags for Responses API rollout control
- Create migration scripts for existing CCR configurations
- Add capacity planning tools for reasoning workloads
- Create documentation and runbooks for operational support

### PHASE 6: Integration & Rollout
**Objective:** Final CCR integration and controlled production deployment

#### 6.1 CCR Integration
- Update CCR package.json to use enhanced @musistudio/llms version
- Modify CCR configuration to use new OpenAI Responses transformer
- Update model routing to leverage ModelCatalog for Responses API detection
- Test end-to-end integration with Claude Code CLI

#### 6.2 Migration & Compatibility
- Create migration guide for existing CCR users
- Add backward compatibility layers for legacy configurations
- Implement gradual rollout with feature flags
- Create rollback procedures for production issues

#### 6.3 Validation & Testing
- Comprehensive integration testing with real OpenAI API
- Load testing with concurrent reasoning workloads
- Cost tracking validation with actual billing data
- User acceptance testing with CCR community

#### 6.4 Documentation & Launch
- Create comprehensive documentation for new Responses API features
- Update CCR README with Responses API configuration examples
- Prepare launch communication highlighting reasoning token support
- Monitor rollout metrics and user feedback

## Key Implementation Details

### Model Detection
Models requiring Responses API:
- GPT-5 family (gpt-5, gpt-5-mini, gpt-5-nano)
- O3 family (o3, o3-mini, o3-pro)
- O4 family (o4-mini)
- Codex family (codex-mini, codex-mini-latest)

### Request Transformation
Chat Completions → Responses API:
```javascript
// Before (Chat Completions)
{
  messages: [...],
  max_tokens: 1000,
  reasoning: { effort: "high" }
}

// After (Responses API)
{
  input: [...],
  max_completion_tokens: 1000,
  reasoning_effort: "high"
}
```

### SSE Event Types
Responses API streaming events:
- `reasoning.delta` - Reasoning token chunks
- `output.delta` - Output text chunks
- `tool_calls` - Tool invocation requests
- `response.completed` - Stream completion with usage
- `response.incomplete` - Stream failure/timeout

### Usage Tracking Schema
Enhanced usage structure:
```javascript
{
  prompt_tokens: 100,
  completion_tokens: 200,
  reasoning_tokens: 500,  // New field
  total_tokens: 800,
  cost: {
    prompt: 0.001,
    completion: 0.002,
    reasoning: 0.003,    // New field
    total: 0.006
  }
}
```

## Success Metrics

Feature parity validation checklist:
- [ ] GPT-5/o3 models work correctly with reasoning tokens preserved
- [ ] Existing Chat Completions models continue unchanged
- [ ] Cost tracking accurately captures reasoning vs completion tokens
- [ ] Performance overhead < 5% for non-Responses workloads
- [ ] Tool calls flow properly through multi-turn conversations
- [ ] Streaming responses preserve reasoning content and cost tracking

## Dependencies & Risks

### Critical Dependencies
- OpenCode implementation analysis (gates all subsequent work)
- Model registry completion (gates routing logic)
- Streaming architecture (gates tool orchestration)

### Risk Mitigation
- **API Changes**: Abstract with interfaces, version lock OpenAI SDK
- **Performance**: Implement caching, connection pooling, lazy loading
- **Backward Compatibility**: Feature flags, gradual rollout, comprehensive testing
- **Cost Overruns**: Budget alerts, rate limiting, usage caps

## Getting Started for New Developers

### Prerequisites
1. Familiarity with TypeScript and Node.js
2. Understanding of OpenAI's Chat Completions API
3. Knowledge of Server-Sent Events (SSE) for streaming
4. Basic understanding of the transformer pattern

### Repository Structure
```
llms-dev/
├── src/
│   ├── transformer/          # Request/response transformers
│   │   ├── openai.transformer.ts
│   │   ├── openai-responses.transformer.ts  # New Responses API transformer
│   │   └── reasoning.transformer.ts         # Reasoning token handling
│   ├── services/
│   │   ├── provider.ts       # Provider management
│   │   └── llm.ts           # LLM service coordination
│   ├── types/
│   │   ├── llm.ts           # Core type definitions
│   │   └── transformer.ts    # Transformer interfaces
│   └── api/
│       └── routes.ts        # API route handling
└── package.json
```

### Development Workflow
1. Clone the repository: `git clone ~/llms-dev`
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Run tests: `npm test`
5. Start development: `npm run dev`

### Testing with CCR
1. Build llms package: `npm run build` in ~/llms-dev
2. Link to CCR: `npm link` in ~/llms-dev, then `npm link @musistudio/llms` in ~/ccr-dev
3. Configure CCR to use Responses transformer for GPT-5 models
4. Test with Claude Code CLI using GPT-5 model

### Key Concepts
- **Transformer Pattern**: Modular request/response transformation
- **Model Catalog**: Central registry of model capabilities and requirements
- **Stream Transformer**: Stateful SSE event processing
- **Usage Extractor**: Multi-dimensional token parsing and cost calculation

## CCR Integration Requirements

This section details all the changes needed in the Claude Code Router (~/ccr-dev) to integrate with the enhanced @musistudio/llms package and provide full Responses API support.

### Current CCR Architecture

```
┌─────────────────┐    ┌───────────────────┐    ┌─────────────────┐
│  Claude Code    │───▶│  CCR Proxy        │───▶│ @musistudio/llms│
│      CLI        │    │  (ccr-dev)        │    │   (llms-dev)    │
└─────────────────┘    └───────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌───────────────────┐
                       │ Provider Configs  │
                       │  config.json      │
                       └───────────────────┘
```

### Required CCR Changes

#### 1. Package Dependency Update
**File**: `~/ccr-dev/package.json`
```json
{
  "dependencies": {
    "@musistudio/llms": "^1.1.0",  // Update from ^1.0.21
    // ... other dependencies
  }
}
```

#### 2. Provider Configuration Updates
**File**: `~/ccr-dev/config.example.json` - Add OpenAI provider with Responses API support:

```json
{
  "Providers": [
    // ... existing providers
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "${OPENAI_API_KEY}",
      "models": [
        "gpt-4-turbo",
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-5",
        "gpt-5-mini", 
        "gpt-5-nano",
        "o3",
        "o3-mini",
        "o3-pro",
        "o4-mini",
        "codex-mini",
        "codex-mini-latest"
      ],
      "transformer": {
        "use": ["openai"],
        // Models that require Responses API
        "gpt-5": {
          "use": ["openai-responses", "reasoning", "maxcompletiontokens"]
        },
        "gpt-5-mini": {
          "use": ["openai-responses", "reasoning", "maxcompletiontokens"]
        },
        "gpt-5-nano": {
          "use": ["openai-responses", "reasoning", "maxcompletiontokens"]
        },
        "o3": {
          "use": ["openai-responses", "reasoning", "maxcompletiontokens"]
        },
        "o3-mini": {
          "use": ["openai-responses", "reasoning", "maxcompletiontokens"]
        },
        "o3-pro": {
          "use": ["openai-responses", "reasoning", "maxcompletiontokens"]
        },
        "o4-mini": {
          "use": ["openai-responses", "reasoning", "maxcompletiontokens"]
        },
        "codex-mini": {
          "use": ["openai-responses", "maxcompletiontokens"]
        },
        "codex-mini-latest": {
          "use": ["openai-responses", "maxcompletiontokens"]
        }
      }
    }
  ],
  "Router": {
    "default": "openai,gpt-5",  // Set GPT-5 as default
    "background": "openai,gpt-4o-mini",
    "think": "openai,o3-mini",
    "reasoning": "openai,gpt-5",
    "coding": "openai,codex-mini-latest",
    // ... other routing rules
  }
}
```

#### 3. Environment Configuration
**File**: `~/ccr-dev/.env` (create if not exists):
```bash
# OpenAI API Configuration
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_ORG_ID=your-org-id  # Optional
OPENAI_PROJECT_ID=your-project-id  # Optional

# Feature Flags for Responses API rollout
ENABLE_RESPONSES_API=true
ENABLE_REASONING_TOKENS=true
ENABLE_TOOL_ORCHESTRATION=false  # Initially disabled
```

#### 4. Custom Router Integration
**File**: `~/ccr-dev/custom-router.example.js` - Update to handle Responses API models:

```javascript
module.exports = function customRouter(modelName, sessionMeta) {
  // Route reasoning-heavy requests to GPT-5
  if (sessionMeta.reasoning || sessionMeta.complexity === 'high') {
    return 'openai,gpt-5';
  }
  
  // Route coding tasks to Codex
  if (sessionMeta.task === 'coding' || sessionMeta.files?.some(f => f.endsWith('.py'))) {
    return 'openai,codex-mini-latest';
  }
  
  // Route quick tasks to O3-mini
  if (sessionMeta.estimated_tokens < 1000) {
    return 'openai,o3-mini';
  }
  
  // Default routing logic
  return null;  // Let CCR use default routing
};
```

#### 5. Server Configuration Updates
**File**: `~/ccr-dev/src/server.ts` - Add Responses API monitoring endpoints:

```typescript
// Add after existing endpoints
server.app.get("/api/responses-status", async (req, reply) => {
  const accessLevel = (req as any).accessLevel || "restricted";
  if (accessLevel === "restricted") {
    reply.status(401).send("API key required");
    return;
  }
  
  return {
    responses_api_enabled: process.env.ENABLE_RESPONSES_API === 'true',
    reasoning_tokens_enabled: process.env.ENABLE_REASONING_TOKENS === 'true',
    supported_models: [
      'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
      'o3', 'o3-mini', 'o3-pro', 'o4-mini',
      'codex-mini', 'codex-mini-latest'
    ]
  };
});

// Usage analytics endpoint for reasoning tokens
server.app.get("/api/usage/reasoning", async (req, reply) => {
  const accessLevel = (req as any).accessLevel || "restricted";
  if (accessLevel === "restricted") {
    reply.status(401).send("API key required");
    return;
  }
  
  // This would integrate with the enhanced usage tracking
  return server.app._server!.usageAnalytics?.getReasoningUsage() || {};
});
```

#### 6. UI Dashboard Updates
**Files**: `~/ccr-dev/ui/src/components/`

**ProviderList.tsx** - Add Responses API indicators:
```tsx
// Add to provider display
{provider.transformer?.['gpt-5']?.use?.includes('openai-responses') && (
  <Badge variant="secondary" className="ml-2">
    Responses API
  </Badge>
)}
```

**New Component**: `~/ccr-dev/ui/src/components/ResponsesApiStatus.tsx`:
```tsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const ResponsesApiStatus = () => {
  const [status, setStatus] = useState(null);
  
  useEffect(() => {
    fetch('/api/responses-status')
      .then(res => res.json())
      .then(setStatus)
      .catch(console.error);
  }, []);
  
  if (!status) return null;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Responses API Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div>
            <Badge variant={status.responses_api_enabled ? "default" : "secondary"}>
              {status.responses_api_enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <div className="text-sm text-gray-600">
            Supported Models: {status.supported_models.length}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
```

#### 7. Usage Analytics Dashboard
**New Component**: `~/ccr-dev/ui/src/components/ReasoningUsage.tsx`:
```tsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const ReasoningUsage = () => {
  const [usage, setUsage] = useState(null);
  
  useEffect(() => {
    fetch('/api/usage/reasoning')
      .then(res => res.json())
      .then(setUsage)
      .catch(console.error);
  }, []);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reasoning Token Usage</CardTitle>
      </CardHeader>
      <CardContent>
        {usage ? (
          <div className="space-y-2">
            <div>Total Reasoning Tokens: {usage.total_reasoning_tokens || 0}</div>
            <div>Cost: ${usage.reasoning_cost?.toFixed(4) || '0.0000'}</div>
            <div>Avg per Request: {usage.avg_reasoning_tokens || 0}</div>
          </div>
        ) : (
          <div>Loading usage data...</div>
        )}
      </CardContent>
    </Card>
  );
};
```

#### 8. Documentation Updates
**File**: `~/ccr-dev/README.md` - Add Responses API section:

```markdown
## OpenAI Responses API Support

CCR now supports OpenAI's Responses API for advanced models like GPT-5 and o3.

### Features
- **Reasoning Tokens**: Separate tracking and billing for reasoning vs completion tokens
- **Advanced Streaming**: Real-time reasoning content display
- **Tool Orchestration**: Multi-turn tool call conversations
- **Cost Tracking**: Detailed usage analytics for reasoning workloads

### Configuration
Add OpenAI provider with Responses API models:
```json
{
  "name": "openai",
  "models": ["gpt-5", "o3-mini", "codex-mini-latest"],
  "transformer": {
    "gpt-5": {
      "use": ["openai-responses", "reasoning", "maxcompletiontokens"]
    }
  }
}
```

### Environment Variables
```bash
OPENAI_API_KEY=your-api-key
ENABLE_RESPONSES_API=true
ENABLE_REASONING_TOKENS=true
```
```

#### 9. Migration Scripts
**New File**: `~/ccr-dev/scripts/migrate-responses-api.js`:
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Migration script to update existing CCR configs for Responses API
function migrateConfig() {
  const configPath = path.join(__dirname, '..', 'config.json');
  
  if (!fs.existsSync(configPath)) {
    console.log('No config.json found, creating from template...');
    // Copy from config.example.json with OpenAI provider
    return;
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Add OpenAI provider if not exists
  const hasOpenAI = config.Providers?.some(p => p.name === 'openai');
  if (!hasOpenAI) {
    console.log('Adding OpenAI provider with Responses API support...');
    // Add OpenAI provider configuration
  }
  
  // Update router with GPT-5 routes
  if (!config.Router.reasoning) {
    config.Router.reasoning = 'openai,gpt-5';
  }
  
  // Backup and save
  const backupPath = `${configPath}.backup.${Date.now()}`;
  fs.copyFileSync(configPath, backupPath);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log(`Config migrated successfully. Backup saved to ${backupPath}`);
}

if (require.main === module) {
  migrateConfig();
}

module.exports = { migrateConfig };
```

### Development Workflow for CCR Integration

#### Local Development Setup
When working from ~/llms-dev with Claude Code:

1. **Link packages locally**:
```bash
cd ~/llms-dev
npm run build
npm link

cd ~/ccr-dev  
npm link @musistudio/llms
```

2. **Environment setup**:
```bash
cd ~/ccr-dev
cp .env.example .env  # Add your OpenAI API key
```

3. **Start CCR with enhanced logging**:
```bash
cd ~/ccr-dev
npm run build
DEBUG=llms:* ./dist/cli.js --config config.json
```

4. **Start Claude Code from llms-dev**:
```bash
cd ~/llms-dev
claude-code --use-ccr=http://localhost:7001
```

#### Testing Checklist
- [ ] Basic Chat Completions models still work (gpt-4o, gpt-4o-mini)
- [ ] GPT-5 requests route to Responses API transformer  
- [ ] Reasoning tokens display correctly in Claude Code
- [ ] Cost tracking shows separate reasoning costs
- [ ] Custom router handles Responses API models correctly
- [ ] UI dashboard shows Responses API status
- [ ] Migration script updates existing configs properly

### Phase-by-Phase CCR Updates

#### Phase 1-2: Basic Integration
- Update package.json dependency
- Add OpenAI provider configuration
- Create environment variables
- Test basic GPT-5 routing

#### Phase 3: Advanced Features  
- Add usage analytics endpoints
- Create reasoning token dashboard
- Implement custom router logic
- Add feature flags for gradual rollout

#### Phase 4-6: Production Readiness
- Add comprehensive monitoring
- Create migration scripts
- Update documentation
- Implement rollback procedures

### Monitoring & Debugging

#### Log Analysis
CCR will log Responses API interactions:
```
[INFO] Routing request to openai,gpt-5 via Responses API
[DEBUG] Request transformed: messages -> input, reasoning -> reasoning_effort  
[INFO] Reasoning tokens: 1,500 | Completion tokens: 300 | Cost: $0.0045
```

#### Health Checks
CCR UI will show:
- Responses API availability status
- Model-specific routing success rates  
- Reasoning token usage trends
- Cost breakdowns by token type

This integration plan ensures CCR can fully leverage the enhanced @musistudio/llms package while maintaining backward compatibility and providing rich monitoring capabilities.

## Claude Code CLI Compatibility

Based on expert analysis, **Claude Code CLI should not need changes** if we properly transform all Responses API features in the proxy layer to match Anthropic's Messages API format.

### Streaming Format Compatibility

**Challenge**: Responses API uses different SSE event types:
- `reasoning.delta` - Reasoning token chunks
- `output_text.delta` - Output text chunks  
- `tool_calls` - Tool invocation requests
- `response.completed` - Stream completion with usage

**Solution**: Transform to Anthropic Messages SSE events in the proxy:
```
OpenAI Event                     →  Anthropic Event
─────────────────────────────────   ───────────────────────────────
response.created                 →  message_start
reasoning.delta                  →  content_block_start type "thinking"
                                     + content_block_delta
output_text.delta               →  content_block_start type "text" 
                                     + content_block_delta
tool_calls (requires_action)    →  content_block_start type "tool_use"
                                     + message_delta stop_reason "tool_use"
response.completed              →  message_delta stop_reason "end_turn"
                                     + message_stop
response.incomplete/error       →  message_delta stop_reason "error"
```

### Tool Call Flow Compatibility

**Challenge**: OpenAI uses `submit_tool_outputs` to continue in-flight responses, while Claude uses new messages with `tool_result` content.

**Solution**: Maintain proxy-side state machine:
1. **OpenAI streams tool_calls** → Buffer until JSON-valid → **Emit tool_use blocks to Claude Code** → **End message with stop_reason "tool_use"**
2. **Claude Code runs tools** → **Sends new request with tool_result** → **Proxy calls submit_tool_outputs** → **Resume streaming**
3. **Repeat for multi-turn tool sequences**

**State Management**:
```typescript
interface ToolCallState {
  pending_response_id: string;
  tool_call_mappings: Map<string, string>; // tool_call_id -> name
  conversation_context: Message[];
  timeout_handle: NodeJS.Timeout;
}
```

### Usage Display Compatibility

**Challenge**: Reasoning tokens are a new cost dimension that Claude Code may not display separately.

**Solutions** (in order of preference):
1. **If Claude Code supports "thinking" tokens**: Map `reasoning_tokens` to that field
2. **Proxy-appended footer**: Add usage line at end of stream
   ```
   usage: reasoning_tokens=1,500 (OpenAI), output_tokens=300, input_tokens=200
   ```
3. **HTTP Headers**: Return detailed usage via `X-CCR-Usage-Reasoning-Tokens` header
4. **Avoid**: Don't merge reasoning_tokens into output_tokens (distorts cost tracking)

### Thinking/Reasoning Content Display

**Claude Code Behavior**: Should display reasoning content correctly if mapped to Anthropic "thinking" blocks.

**Proxy Configuration Options**:
```typescript
interface ThinkingDisplayConfig {
  mode: "thinking_blocks" | "plain_text" | "suppress";
  prefix?: string; // For plain_text mode: "[thinking] ..."
  show_in_ui?: boolean;
}
```

### Implementation Requirements for Proxy

#### Event Translation Precision
- **Tool Call Buffering**: Don't emit `tool_use` until JSON arguments are complete
- **Content Block Indexing**: Maintain proper `content_block_index` across thinking/text/tool_use blocks
- **Termination**: Send `content_block_stop` per block and `message_stop` exactly once

#### State Machine for Tool Orchestration
- **Session Context**: Track Anthropic conversation turns to OpenAI response.id
- **Cleanup**: Cancel upstream OpenAI responses on CLI disconnects
- **Timeout Handling**: TTL for pending responses, heartbeat for slow tool execution

#### Error Mapping
- **OpenAI response.incomplete** → Anthropic error response format
- **Tool execution failures** → Include original error details in final text block

### Feature Flags for Gradual Rollout

**Proxy Configuration**:
```json
{
  "responses_api": {
    "show_thinking": "as_blocks",  // "off", "as_text", "as_blocks"
    "show_reasoning_usage": true,
    "tool_args_streaming_mode": "buffer_until_valid",
    "merge_reasoning_into_output_tokens": false
  }
}
```

### Testing Requirements

**Critical Test Cases for Claude Code Compatibility**:
- [ ] Pure text streaming with reasoning + output interleaved
- [ ] Multiple tool_calls in one turn → two tool_use blocks → CLI runs both
- [ ] Multi-turn requires_action: tool → model → tool → model
- [ ] Partial JSON tool args → no broken tool_use emission
- [ ] Error mid-stream → clean CLI-friendly error display
- [ ] Usage display → reasoning_tokens visible as separate metric

### Likely No Changes Needed in Claude Code

Based on analysis, Claude Code should work with full Responses API features if the proxy properly emulates Anthropic Messages semantics. The only potential gap is native reasoning token display, which can be handled via proxy footers or headers.

**Verification Approach**: Test with current Claude Code CLI against enhanced proxy to confirm compatibility before any CLI modifications.

## References

- [OpenAI Responses API Documentation](https://platform.openai.com/docs/api-reference/responses)
- [SST OpenCode PR #34](https://github.com/sst/opencode/pull/34)
- [Claude Code Router Issue #76](https://github.com/anthropics/claude-code-router/issues/76)
- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)

## Contact & Support

For questions about this implementation plan:
- Review existing CCR issues and discussions
- Check the OpenCode implementation for reference patterns
- Consult GPT-5's architectural analysis for complex decisions

---

*Document created: January 2025*
*Last updated: January 2025*
*Status: Planning Phase - Ready for Implementation*