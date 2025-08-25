import { UnifiedChatRequest } from "@/types/llm";
import { Transformer } from "@/types/transformer";

export class OpenAITransformer implements Transformer {
  name = "openai";

  constructor() {}

  // Helper method to normalize image content
  private normalizeImageContent(content: any): any {
    // Handle Anthropic 'image' type conversion
    if (content.type === 'image' && content.source) {
      const url = content.source.type === 'base64' 
        ? `data:${content.source.media_type};base64,${content.source.data}`
        : content.source.url;
      
      return {
        type: 'image_url',
        image_url: {
          url: url,
          detail: 'auto'  // Changed from 'high' to 'auto' to let OpenAI optimize
        }
      };
    }
    
    // Handle image_url type with extra fields
    if (content.type === 'image_url') {
      let url = content.image_url?.url || content.url;
      
      // Ensure base64 images have proper data URI format
      if (url && !url.startsWith('http') && !url.startsWith('data:')) {
        // Raw base64 data - need to add data URI prefix
        // Try to detect image type from base64 signature
        const isPng = url.startsWith('iVBORw0KGgo');
        const isJpeg = url.startsWith('/9j/');
        const mediaType = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : 'image/png';
        url = `data:${mediaType};base64,${url}`;
      }
      
      const normalized = {
        type: 'image_url',
        image_url: {
          url: url,
          detail: content.image_url?.detail || 'auto'  // Use 'auto' by default for token optimization
        }
      };
      
      // Remove all extra fields - only keep type and image_url
      return normalized;
    }
    
    return content;
  }

  // Helper method to normalize tool messages
  private normalizeToolMessages(messages: any[]): any[] {
    const normalized: any[] = [];
    let lastToolCallId: string | null = null;
    
    for (const msg of messages) {
      // Track tool call IDs from assistant messages
      if (msg.role === 'assistant' && msg.content && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool_use' && part.id) {
            lastToolCallId = part.id;
          }
        }
        normalized.push(msg);
        continue;
      }
      
      // Handle messages with content arrays
      if (msg.content && Array.isArray(msg.content)) {
        const hasToolResult = msg.content.some((c: any) => 
          c.type === 'tool_result' || c.type === 'server_tool_use'
        );
        
        if (hasToolResult) {
          // Extract tool results and create separate tool messages
          for (const part of msg.content) {
            if (part.type === 'tool_result') {
              normalized.push({
                role: 'tool',
                tool_call_id: part.tool_use_id,
                content: typeof part.content === 'string' 
                  ? part.content 
                  : JSON.stringify(part.content)
              });
            } else if (part.type === 'server_tool_use') {
              // Use the last tool call ID from assistant message
              normalized.push({
                role: 'tool',
                tool_call_id: lastToolCallId || part.id.replace('srvtoolu_', 'call_'),
                content: JSON.stringify(part.result || {})
              });
            }
          }
          
          // Filter out tool results from the original message
          const nonToolContent = msg.content.filter((c: any) => 
            c.type !== 'tool_result' && c.type !== 'server_tool_use'
          );
          
          if (nonToolContent.length > 0) {
            normalized.push({
              ...msg,
              content: nonToolContent
            });
          }
        } else {
          normalized.push(msg);
        }
      } else {
        normalized.push(msg);
      }
    }
    
    return normalized;
  }

  async transformRequestOut(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    // OpenAI has consolidated ALL models to GPT-5, so apply transformations to all requests

    // 1. Convert max_tokens → max_completion_tokens for all OpenAI requests
    if (request.max_tokens) {
      request.max_completion_tokens = request.max_tokens;
      delete request.max_tokens;
    }

    // 2. Handle temperature restriction (GPT-5 only supports default value of 1)
    if (request.temperature !== undefined && request.temperature !== 1) {
      delete request.temperature; // Let OpenAI use default (1)
    }

    // 3. Handle reasoning parameter conversion
    if (request.reasoning) {
      if (typeof request.reasoning === 'object') {
        // Convert reasoning.effort to reasoning_effort
        request.reasoning_effort = request.reasoning.effort ?? "medium";
        delete request.reasoning; // Remove the invalid format
      } else if (typeof request.reasoning === 'string') {
        // Strip any string reasoning parameters too
        delete request.reasoning;
      }
    }

    // 4. Convert Anthropic tool format to OpenAI format
    if (request.tools) {
      // ENHANCED DEBUG: Log full tool structure for troubleshooting
      this.logger?.info({
        toolCount: request.tools.length,
        toolFormats: request.tools.map((tool: any, i: number) => ({
          index: i,
          name: tool.name,
          type: tool.type,
          hasFunction: !!tool.function,
          hasInputSchema: !!tool.input_schema,
          hasParameters: !!tool.parameters,
          keys: Object.keys(tool),
          fullTool: tool // Log the complete tool structure
        }))
      }, "🔧 ENHANCED Tool format analysis");

      // Check if tools are already in OpenAI format
      const isOpenAIFormat = request.tools.every((tool: any) => 
        tool.function && typeof tool.function === 'object' && 
        tool.function.name && tool.function.parameters
      );
      
      if (isOpenAIFormat) {
        this.logger?.info("Tools already in OpenAI format, cleaning JSON schema metadata");
        // Clean JSON schema metadata that GPT-5 rejects
        request.tools = request.tools.map((tool: any) => {
          if (tool.function?.parameters) {
            const cleanParams = { ...tool.function.parameters };
            delete cleanParams.$schema;
            delete cleanParams.additionalProperties;
            
            return {
              ...tool,
              function: {
                ...tool.function,
                parameters: cleanParams
              }
            };
          }
          return tool;
        });
      } else {
        this.logger?.info("Converting tools from Anthropic/Claude Code format to OpenAI format");
        // Convert from Anthropic format OR Claude Code format
        request.tools = request.tools.map((tool: any, index: number) => {
          // ENHANCED DEBUG: Log each tool conversion
          this.logger?.info({
            toolIndex: index,
            originalTool: tool,
            conversionPath: tool.type === "custom" ? "custom" : 
                          (tool.name && tool.parameters && !tool.input_schema) ? "claudeCode" : 
                          "standard"
          }, `🔧 Converting tool ${index}: ${tool.name}`);

          // Handle custom tools (plaintext type)
          if (tool.type === "custom") {
            const converted = {
              type: "custom",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema
              }
            };
            this.logger?.info({ converted }, `✅ Converted custom tool: ${tool.name}`);
            return converted;
          }
          
          // Handle Claude Code built-in tools (like WebSearch)
          if (tool.name && tool.parameters && !tool.input_schema) {
            const converted = {
              type: "function",
              function: {
                name: tool.name,
                description: tool.description || `Execute ${tool.name}`,
                parameters: tool.parameters
              }
            };
            this.logger?.info({ converted }, `✅ Converted Claude Code tool: ${tool.name}`);
            return converted;
          }
          
          // Standard Anthropic function tools
          const converted = {
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema
            }
          };
          this.logger?.info({ converted }, `✅ Converted Anthropic tool: ${tool.name}`);
          return converted;
        });
      }

      // FINAL DEBUG: Log the final converted tools
      this.logger?.info({
        convertedTools: request.tools,
        toolValidation: request.tools.map((tool: any, i: number) => ({
          index: i,
          hasType: !!tool.type,
          hasFunction: !!tool.function,
          hasFunctionName: !!tool.function?.name,
          hasFunctionParameters: !!tool.function?.parameters,
          isValid: !!(tool.function?.name && tool.function?.parameters)
        }))
      }, "🎯 FINAL converted tools validation");
    }

    // 5. Handle verbosity parameter - ensure it's properly formatted
    if (request.verbosity && typeof request.verbosity === "string") {
      // Validate verbosity values
      if (!["low", "medium", "high"].includes(request.verbosity)) {
        delete request.verbosity; // Remove invalid values
      }
    }

    // CRITICAL FIXES: Apply normalization to prevent GPT-5 400 errors
    
    // Fix A: Normalize image content in messages
    if (request.messages) {
      request.messages = request.messages.map(msg => {
        if (msg.content && Array.isArray(msg.content)) {
          msg.content = msg.content.map(part => {
            if (part.type === 'image_url' || part.type === 'image') {
              return this.normalizeImageContent(part);
            }
            return part;
          });
        }
        return msg;
      });
    }

    // Fix B: Convert tool result messages to proper format
    if (request.messages) {
      request.messages = this.normalizeToolMessages(request.messages);
    }

    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    // Handle reasoning_content extraction and reasoning_tokens in response
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      try {
        const jsonResponse = await response.json();
        
        // Extract reasoning content from GPT-5 responses
        if (jsonResponse.choices?.length > 0) {
          const choice = jsonResponse.choices[0];
          
          // Check for reasoning_content field in the response
          if (choice.message?.reasoning_content) {
            this.logger?.info({
              hasReasoningContent: true,
              reasoningLength: choice.message.reasoning_content.length,
              model: jsonResponse.model
            }, "✅ GPT-5 reasoning content detected - prepending to response");
            
            // For now, prepend reasoning to main content for visibility
            const originalContent = choice.message.content || "";
            const reasoningPrefix = `<reasoning>\n${choice.message.reasoning_content}\n</reasoning>\n\n`;
            
            choice.message.content = reasoningPrefix + originalContent;
            
            // Keep the raw reasoning_content for downstream processing
            choice.message._raw_reasoning_content = choice.message.reasoning_content;
          }
        }
        
        // 🔧 FIX: Convert OpenAI usage format to Claude Code expected format
        if (jsonResponse.usage) {
          const originalUsage = jsonResponse.usage;
          
          // Convert OpenAI format to Claude Code expected format
          jsonResponse.usage = {
            input_tokens: originalUsage.prompt_tokens || 0,
            output_tokens: originalUsage.completion_tokens || 0,
            // Preserve additional OpenAI-specific data for compatibility
            _openai_original: originalUsage
          };
        }
        
        return new Response(JSON.stringify(jsonResponse), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        this.logger?.error({ error: error.message }, "Failed to process GPT-5 response");
        // If parsing fails, return original response
        return response;
      }
    }
    
    return response;
  }

  get endPoint(): string {
    return "/chat/completions";
  }
}