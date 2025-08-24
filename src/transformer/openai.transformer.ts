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
          detail: 'high'
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
          detail: content.image_url?.detail || 'high'
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

    // 3. Strip ALL reasoning parameters - OpenAI only accepts reasoning_effort now
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

    // Convert Anthropic tool format to OpenAI format
    if (request.tools) {
      // Check if tools are already in OpenAI format
      const isOpenAIFormat = request.tools.every((tool: any) => 
        tool.function && typeof tool.function === 'object' && 
        tool.function.name && tool.function.parameters
      );
      
      if (isOpenAIFormat) {
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
        // Convert from Anthropic format
        request.tools = request.tools.map((tool: any) => {
          // Handle custom tools (plaintext type)
          if (tool.type === "custom") {
            return {
              type: "custom",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema
              }
            };
          }
          // Standard function tools
          return {
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema
            }
          };
        });
      }
    }

    // Handle verbosity parameter - ensure it's properly formatted
    if (request.verbosity && typeof request.verbosity === "string") {
      // Validate verbosity values
      if (!["low", "medium", "high"].includes(request.verbosity)) {
        delete request.verbosity; // Remove invalid values
      }
    }
    
    // Note: We don't automatically set verbosity based on reasoning_effort
    // These are independent parameters per OpenAI guidance:
    // - reasoning_effort controls internal thinking depth
    // - verbosity controls output length/detail
    // Let users explicitly control verbosity or use API default (medium)

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

    
    // Handle reasoning parameter conversion
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

    // Convert Anthropic tool format to OpenAI format
    if (request.tools) {
      // Check if tools are already in OpenAI format
      const isOpenAIFormat = request.tools.every((tool: any) => 
        tool.function && typeof tool.function === 'object' && 
        tool.function.name && tool.function.parameters
      );
      
      if (isOpenAIFormat) {
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
        // Convert from Anthropic format
        request.tools = request.tools.map((tool: any) => {
          // Handle custom tools (plaintext type)
          if (tool.type === "custom") {
            return {
              type: "custom",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema
              }
            };
          }
          // Standard function tools
          return {
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema
            }
          };
        });
      }
    }

    // Handle verbosity parameter - ensure it's properly formatted
    if (request.verbosity && typeof request.verbosity === "string") {
      // Validate verbosity values
      if (!["low", "medium", "high"].includes(request.verbosity)) {
        delete request.verbosity; // Remove invalid values
      }
    }
    
    // Note: We don't automatically set verbosity based on reasoning_effort
    // These are independent parameters per OpenAI guidance:
    // - reasoning_effort controls internal thinking depth
    // - verbosity controls output length/detail
    // Let users explicitly control verbosity or use API default (medium)

    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    // Handle reasoning_content extraction and reasoning_tokens in response
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      try {
        const jsonResponse = await response.json();
        
        // DEBUG: Use proper Fastify logging instead of files
        this.logger?.info({
          hasChoices: !!jsonResponse.choices,
          choicesLength: jsonResponse.choices?.length || 0,
          firstChoiceKeys: jsonResponse.choices?.[0] ? Object.keys(jsonResponse.choices[0]) : [],
          messageKeys: jsonResponse.choices?.[0]?.message ? Object.keys(jsonResponse.choices[0].message) : [],
          hasReasoningContent: !!jsonResponse.choices?.[0]?.message?.reasoning_content,
          hasUsage: !!jsonResponse.usage,
          model: jsonResponse.model,
          verbosity: jsonResponse.choices?.[0]?.message?.verbosity,
          reasoning_effort: jsonResponse.choices?.[0]?.message?.reasoning_effort
        }, "GPT-5 Response Structure Debug");
        
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
            // Future: This could be handled by a dedicated reasoning display transformer
            const originalContent = choice.message.content || "";
            const reasoningPrefix = `<reasoning>\n${choice.message.reasoning_content}\n</reasoning>\n\n`;
            
            choice.message.content = reasoningPrefix + originalContent;
            
            // Keep the raw reasoning_content for downstream processing
            choice.message._raw_reasoning_content = choice.message.reasoning_content;
          } else {
            this.logger?.debug({
              messageKeys: Object.keys(choice.message || {}),
              contentPreview: choice.message?.content?.substring(0, 100)
            }, "No reasoning content found in GPT-5 response");
          }
        }
        
        // 🔧 FIX: Convert OpenAI usage format to Claude Code expected format
        if (jsonResponse.usage) {
          const originalUsage = jsonResponse.usage;
          
          this.logger?.info({
            originalUsage,
            hasPromptTokens: !!originalUsage.prompt_tokens,
            hasCompletionTokens: !!originalUsage.completion_tokens,
            hasTotalTokens: !!originalUsage.total_tokens
          }, "Converting OpenAI usage format to Claude Code format");
          
          // Convert OpenAI format to Claude Code expected format
          jsonResponse.usage = {
            input_tokens: originalUsage.prompt_tokens || 0,
            output_tokens: originalUsage.completion_tokens || 0,
            // Preserve additional OpenAI-specific data for compatibility
            _openai_original: originalUsage
          };
          
          this.logger?.info({
            convertedUsage: jsonResponse.usage,
            conversion: `${originalUsage.prompt_tokens} prompt_tokens → ${jsonResponse.usage.input_tokens} input_tokens`,
            conversion2: `${originalUsage.completion_tokens} completion_tokens → ${jsonResponse.usage.output_tokens} output_tokens`
          }, "✅ Usage format converted for Claude Code compatibility");
        }
        
        // Check if response has reasoning_tokens usage information
        if (jsonResponse.usage?._openai_original?.completion_tokens_details?.reasoning_tokens) {
          // Reasoning tokens are already properly included in OpenAI's response format
          // No transformation needed - just pass through
          this.logger?.debug({
            reasoningTokens: jsonResponse.usage._openai_original.completion_tokens_details.reasoning_tokens,
            totalTokens: jsonResponse.usage._openai_original.total_tokens
          }, "GPT-5 reasoning tokens detected in usage");
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
