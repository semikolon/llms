## Context
This PR's resolveEnvVars work follows and complements musistudio/claude-code-router#529 (Environment Variable Interpolation for API Keys), aligning LLMS-side transformations with the router's config interpolation.

## GPT-5 Core API Compatibility & Transformer Support
**Problem**: GPT-5 reasoning parameter compatibility crisis blocking Claude Code interactive mode

**Solution**: Complete end-to-end fix spanning both repositories:

- **LLMS**: Parameter transformation & API compatibility ✅
- **CCR**: Intuitive user experience via inline tokens (Part 2)

## 🔧 Key Fixes
- **Tools Format Validation**: Fixed "Missing required parameter" errors by cleaning GPT-5-rejected JSON schema metadata
- **Parameter Mapping**: Automatic conversion of max_tokens → max_completion_tokens for GPT-5 models
- **Reasoning Support**: Convert reasoning parameters to GPT-5's reasoning_effort format
- **Tool Format Conversion**: Seamless Anthropic → OpenAI tool format transformation
- **Response Processing**: Extract and transform reasoning content from GPT-5 responses
- **API Format Normalization**: Strip extra image fields, convert server_tool_use patterns to proper role:tool messages, ensure strict OpenAI format compliance

## 🧪 Testing
✅ GPT-5 models now respond without API errors  
✅ Tool calling works with complex Anthropic-format tools  
✅ Reasoning parameters properly converted and processed  
✅ Compatible with Claude Code Router integration  
✅ **Image & tool message normalization** (7 comprehensive test cases)  

## 📋 Related PRs
- **Enables**: [CCR PR #1] Inline reasoning control tokens (requires this PR)
- **Foundation for**: [LLMS PR #2] Documentation & API guide updates  
- **Part of**: Complete GPT-5 integration solution across both repositories

## 🔄 Commit Range
This PR represents commits 0c7a2d9 through eb1424e - the core GPT-5 functionality implementation with API format fixes.

## 🔗 Cross-Repository Impact
This change is required for Claude Code Router's GPT-5 reasoning features to function properly.

## Related PRs (complete series)
- musistudio/llms#28 — **GPT-5 Core API Compatibility** 
- musistudio/claude-code-router#677 — Inline Reasoning Control Tokens
- musistudio/llms#29 — 2025 Documentation & API Guide
- musistudio/claude-code-router#678 — Enhanced Documentation  
- musistudio/llms#30 — Development Workflow Scripts
- musistudio/claude-code-router#679 — Development Workflow Scripts

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>