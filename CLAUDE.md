# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a universal LLM API transformation server that acts as middleware to standardize requests and responses between different LLM providers (Anthropic, Gemini, Deepseek, etc.). It uses a modular transformer system to handle provider-specific API formats.

## Key Architecture Components

1. **Transformers**: Each provider has a dedicated transformer class that implements:
   - `transformRequestIn`: Converts the provider's request format to a unified format
   - `transformResponseIn`: Converts the provider's response format to a unified format
   - `transformRequestOut`: Converts the unified request format to the provider's format
   - `transformResponseOut`: Converts the unified response format back to the provider's format
   - `endPoint`: Specifies the API endpoint for the provider

2. **Unified Formats**: Requests and responses are standardized using `UnifiedChatRequest` and `UnifiedChatResponse` types.

3. **Streaming Support**: Handles real-time streaming responses for providers, converting chunked data into a standardized format.

4. **Service Layer Architecture**:
   - `ConfigService`: Manages environment variables and config.json
   - `LLMService`: Core LLM request/response processing
   - `ProviderService`: Provider-specific configurations and endpoints
   - `TransformerService`: Orchestrates transformer chains and execution

## Common Development Commands

- **Install dependencies**: `pnpm install` or `npm install`
- **Development mode**: `npm run dev` (Uses nodemon + tsx for hot-reloading)
- **Build**: `npm run build` (Outputs to dist/cjs and dist/esm)
- **Build with watch**: `npm run build:watch` (Continuous build during development)
- **Lint**: `npm run lint` (Runs ESLint on src directory)
- **Start server (CJS)**: `npm start` or `node dist/cjs/server.cjs`
- **Start server (ESM)**: `npm run start:esm` or `node dist/esm/server.mjs`

## Project Structure

- `src/server.ts`: Main Fastify server entry point with CORS and error handling
- `src/transformer/`: Provider-specific transformer implementations
  - Contains 16+ transformers including Anthropic, Gemini, OpenAI variants, and utility transformers
- `src/services/`: Core services (config, llm, provider, transformer)
- `src/types/`: TypeScript type definitions for LLM APIs and transformers
- `src/utils/`: Utility functions for conversion, tool parsing, and provider-specific helpers
- `src/api/`: API routes and middleware
- `scripts/build.ts`: Custom esbuild configuration for dual CJS/ESM output

## Path Aliases

- `@` is mapped to the `src` directory, use `import xxx from '@/xxx'`

## Logging & Debugging

**LLMS Fastify Pino Logger:**
- Available as `this.logger` in transformer instances (injected by TransformerService)
- Usage: `this.logger.info({ requestData }, 'Processing request');`
- Default: enabled with structured JSON logging

**CCR Custom File Logger:**
- Location: `~/.claude-code-router/claude-code-router.log`
- Enable: Edit config.json with `{"LOG": true, "LOG_LEVEL": "debug"}` then `ccr restart`
- Usage: `import { log } from './utils/log'; log('Message', { data });`

**Development Debugging:**
- Use temporary file logging to `/tmp/` for detailed request/response inspection
- Console.log works but output captured by CCR service (use for testing only)
- Clean up all debug code before committing

**Error Handling:**
- Server startup errors are re-thrown (not process.exit()) for proper error bubbling
- Use `console.error()` for startup failures to ensure visibility in consuming applications

**Debugging GPT-5 Issues:**
- Check LLMS transformer logs for parameter transformations
- Check CCR logs for routing decisions and model selection

**LLMS Transformer Debug Logs Location:**
- **Location**: Rotating log files at `~/.claude-code-router/logs/ccr-*.log`  
- **Access**: Search for emoji markers to find transformation debug logs:
  - 🚨 `RAW TOOLS received from Claude Code` - Shows exact tool format from Claude Code
  - 🔧 `Converting tools from Anthropic to OpenAI format` - Tool conversion process
  - 🎯 `FINAL converted tools validation` - Validation of converted tools
  - 🚀 `COMPLETE REQUEST being sent to OpenAI API` - Final request to OpenAI
- **Command**: `grep -n "🚨\|🔧\|🎯\|🚀" ~/.claude-code-router/logs/ccr-*.log`

**WebSearch Tool Debugging Results (2025-01-26):**
The WebSearch tool failure was caused by JSON schema metadata in tool parameters that GPT-5 rejects:
- **Root Cause**: Claude Code sends tools with `$schema` and `additionalProperties` fields
- **Error**: `Missing required parameter: 'tools[0].function.name'` (misleading - actual issue is schema validation)
- **Solution**: OpenAI transformer now strips JSON schema metadata before sending to GPT-5
- **Debug Evidence**: Found in logs at `ccr-1756235256784.log:28-31` showing 70 tools with schema metadata
- **Status**: Fixed in OpenAI transformer `src/transformer/openai.transformer.ts:172-187`

## Build System

The project uses esbuild for building, with separate CJS and ESM outputs. The build script is located at `scripts/build.ts` and supports:
- Dual format builds (CommonJS and ESM)
- External dependencies to reduce bundle size
- Watch mode for development
- Source maps and minification

## Environment Configuration

- Supports both `.env` files and `config.json`
- Configuration handled by `src/services/config.ts`
- Environment variables can be used for API keys and server settings

## Code Style Guidelines

- Strict TypeScript mode with 2-space indentation
- Prefer `@/` alias for imports
- Follow conventional commit messages (feat:, fix:, docs:, etc.)
- Node.js 18+ target with ES2022 features

## Adding New Transformers

1. Create a new transformer file in `src/transformer/`
2. Implement the `Transformer` interface with required methods:
   - Optional: `transformRequestIn`, `transformResponseIn`, `transformRequestOut`, `transformResponseOut`
   - Required: `endPoint` property
   - Optional: `auth` method for authentication
3. Export the transformer in `src/transformer/index.ts`
4. The transformer will be automatically registered at startup

## Local Development with yalc

For local development and testing changes in dependent projects (like CCR - Claude Code Router), use yalc instead of npm pack/install to avoid npm cache corruption. Note: The CCR proxy service auto-launches when you run `ccr code`.

### Setup yalc (one-time)
```bash
npm install -g yalc
```

### Development Workflow

**Automated Script (Recommended):**
```bash
# In llms-dev: Use convenience script for rapid iteration
./dev-workflow.sh   # Builds, publishes to yalc, and pushes to all linked projects
```

**Manual Steps:**
```bash
# In llms-dev: Publish to yalc
yalc publish

# In ccr-dev: Link from yalc  
yalc add @musistudio/llms
npm run build

# After making changes in llms-dev: Push updates
yalc push  # Automatically updates all linked projects
```

**Convenience Scripts:**
- `./dev-workflow.sh` (LLMS): Complete build → yalc publish → push workflow
- `./build-and-test.sh` (CCR): Build CCR with updated LLMS package and show status
### Benefits over npm pack/install
- **No npm cache issues**: Direct symlinks avoid cache corruption
- **Instant updates**: `yalc push` immediately updates linked projects
- **No abandoned processes**: No risk of stuck npm dev servers causing cache locks
- **Clean workflow**: No need for cache clearing or process killing

### Troubleshooting npm cache corruption
If you encounter `ENOTEMPTY` errors when clearing npm cache:
1. Check for stuck npm processes: `ps aux | grep npm`
2. Kill abandoned dev servers: `kill <PID>`  
3. Clear cache: `npm cache clean --force`
4. Switch to yalc to prevent future issues

## Available Transformers

The system includes transformers for:
- **LLM Providers**: Anthropic, Gemini, Vertex (Gemini/Claude), Deepseek, OpenAI, OpenRouter, Groq, Cerebras
- **Utility Transformers**: Tool enhancement, token limits, streaming options, reasoning content, sampling parameters

## Reasoning Transformer

The Reasoning Transformer (`src/transformer/reasoning.transformer.ts`) handles GPT-5 reasoning parameter conversion and inline token processing when used with Claude Code Router (CCR).

### **Key Functions:**

1. **Parameter Conversion**: Converts various reasoning formats to OpenAI's `reasoning_effort` parameter
   - `thinking: {type: "enabled"}` → `reasoning_effort: "medium"`
   - `reasoning: {max_tokens: X}` → `reasoning_effort` based on token budget mapping
   - `reasoning: {effort: "high"}` → `reasoning_effort: "high"`

2. **Inline Token Processing** (when used with CCR):
   - **Prefix Tokens**: `Quick:`, `Deep:`, `Explain:`, `Brief:`
   - **Colon Tokens**: `:quick`, `:deep`, `:explain`, `:brief`
   - **Token Stripping**: Removes tokens from prompt content before API calls
   - **Parameter Mapping**: Maps tokens to appropriate `reasoning_effort` and `verbosity` values

### **Token to Parameter Mapping:**

| Token | Reasoning Effort | Verbosity | Thinking Budget |
|-------|------------------|-----------|-----------------|
| `Quick:`/`:quick` | low | low | 500 tokens |
| `Deep:`/`:deep` | high | medium | 2000 tokens |
| `Explain:`/`:explain` | medium | high | 1000 tokens |
| `Brief:`/`:brief` | medium | low | 1000 tokens |

### **Usage in Transformer Chains:**

The reasoning transformer should be placed **before** provider-specific transformers:
```json
{
  "transformer": {
    "use": ["reasoning", "openai"]
  }
}
```

This ensures reasoning parameters are processed before OpenAI-specific transformations.

## GPT-5 Support

This server has **complete support for GPT-5 and o3 models** through OpenAI's Chat Completions API:

### ✅ Implementation Details
- **OpenAI Chat Completions API**: Uses standard `/v1/chat/completions` endpoint
- **Automatic Model Mapping**: OpenAI automatically serves GPT-5 for all model requests (GPT-4o, GPT-4, etc. all resolve to GPT-5)

### 🔧 GPT-5 API Quirks & Fixes

**Critical Parameter Issues & Solutions:**

1. **Parameter Mapping**: GPT-5 uses `max_completion_tokens` instead of `max_tokens` - OpenAI transformer automatically converts for GPT-5/o3 models

2. **Reasoning Parameter Format**: GPT-5 expects `reasoning_effort: "minimal|low|medium|high"` (string), not `reasoning: {effort: "...", enabled: true}` (object) - OpenAI transformer converts reasoning objects to reasoning_effort strings

3. **Temperature Restriction**: GPT-5 only supports temperature value of 1 (default) - OpenAI transformer removes non-default temperature values

4. **Verbosity Validation**: Strictly validates `verbosity: "low|medium|high"`, rejects invalid values

5. **Tool Schema Cleaning**: Rejects JSON schema metadata (`$schema`, `additionalProperties`) in tool parameters - Tool format cleaner removes problematic JSON schema fields

6. **Custom Tools Support**: GPT-5 supports `type: "custom"` tools for plaintext payloads - OpenAI transformer preserves custom tool types while converting standard tools

7. **Tool Format Conversion**: Anthropic vs OpenAI tool formats differ - OpenAI transformer converts Anthropic `input_schema` to OpenAI `parameters`

**API Response Differences:**
- **Reasoning Tokens**: GPT-5 includes significant `reasoning_tokens` in usage (often 1000+ vs 300 for GPT-4)
- **Reasoning Content**: Available inline during streaming via `reasoning_content` field  
- **Model ID**: Returns `gpt-5-2025-08-07` instead of requested model names
- **Error Sensitivity**: Stricter validation than earlier 2025 models (o3, o4-mini)

**Performance vs Earlier 2025 Models:**
- **vs o3/o4-mini**: GPT-5 uses unified architecture vs specialized reasoning focus
- **Tool Integration**: GPT-5 supports agentic tool use vs o3's limited tool capabilities
- **Performance**: 50% fewer tool calling errors and can chain dozens of tool calls reliably
- **Efficiency**: 50-80% fewer tokens for same quality vs o3, 6x fewer hallucinations

### 🔧 Technical Architecture
- **Transformer Chain**: `AnthropicRequest → UnifiedRequest → OpenAIRequest → OpenAI API`
- **Response Flow**: `OpenAI Response → UnifiedResponse → AnthropicResponse`
- **Parameter Mapping**: GPT-5 models (`gpt-5`, `gpt-5-mini`, `o3`, `o3-mini`, etc.) automatically use `max_completion_tokens`
- **Reasoning Extraction**: The `reasoning` transformer can extract reasoning content from `reasoning_content` field

### ⚡ API Performance Comparison

**Chat Completions API (Current Implementation):**
- ✅ **Faster for single interactions** - Lower latency per request
- ✅ **Simpler protocol** - Minimal overhead, stateless design
- ✅ **Industry standard** - OpenAI commits to supporting "indefinitely"
- ✅ **Works with proxy layers** - Compatible with transformation middleware

**Responses API (Alternative):**
- ⚡ **Better for complex workflows** - Server-managed state, fewer round trips
- ⚡ **Multi-tool orchestration** - Model handles tools internally
- ❌ **Benefits lost through proxy** - State management and multi-step advantages negated by our transformation layer
- ❌ **Additional complexity** - More transformation logic required

### 📊 Production Status
GPT-5 integration is **production ready** with the following caveats:
- Uses industry-standard Chat Completions API
- Reasoning tokens generated but may not be displayed (depending on transformer configuration)
- All tool formats properly converted
- Compatible with Claude Code Router for seamless integration

### 🔄 Configuration Example
```json
{
  "name": "openai",
  "api_base_url": "https://api.openai.com/v1/chat/completions",
  "api_key": "$OPENAI_API_KEY", 
  "models": ["gpt-5", "gpt-5-mini", "o3", "o3-mini"],
  "transformer": {
    "use": ["openai", "reasoning"]
  }
}
```


## Local Package Development & Caching Issues

When developing this package locally and using it in consuming projects (like Claude Code Router), you may encounter persistent caching issues where changes don't reflect despite rebuilding and reinstalling. This is a common npm issue in 2025.

### Common Symptoms
- Code changes don't appear in consuming project
- Old transformers/features still show up in API endpoints
- Package appears to install but uses stale code
- Multiple reinstall attempts fail to update

### Root Causes
1. **NPM package cache** - stores downloaded packages
2. **Module resolution cache** - Node.js caches module lookups  
3. **Build tool caches** - bundlers cache compiled code
4. **Lock file constraints** - package-lock.json pins versions

### Complete Solution (Nuclear Option)
```bash
# In the consuming project (ccr-dev)
rm -rf node_modules
rm -f package-lock.json
npm cache clean --force
npm cache verify
npm install file:../llms-dev/musistudio-llms-1.0.22.tgz --force
npm run build
```

### Development Workflow Best Practices

**In llms-dev (this package):**
```bash
# 1. Make your changes
# 2. Build and package
npm run build
rm -f musistudio-llms-*.tgz  # Remove old packages
npm pack
```

**In consuming project (ccr-dev):**
```bash
# 3. Stop all running services first
ccr stop

# 4. Force clean update
rm -rf node_modules/@musistudio
npm uninstall @musistudio/llms
npm install file:../llms-dev/musistudio-llms-1.0.22.tgz --force
npm run build

# 5. Restart services
ccr start
```

### Advanced Troubleshooting

**Verify package contents:**
```bash
tar -tzf musistudio-llms-1.0.22.tgz | grep -E "(transformer|index)"
```

**Check module resolution:**
```bash
node -e "console.log(require.resolve('@musistudio/llms'))"
```

**Important Notes:**
- In 2025, `npm update` often fails - use `npm install package@latest` or `--force` flag
- Always stop running services before updating local packages
- Build caches (esbuild/webpack) can persist stale code - clear `dist/` directories
- Use `npm ci` in CI/CD environments for reproducible builds

### Why This Happens
NPM's caching system is designed for performance with published packages, but local file: dependencies can create edge cases where caches aren't properly invalidated when the source files change.

