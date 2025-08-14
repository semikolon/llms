/**
 * Request Transformation Functions
 * 
 * Pure functions for transforming requests between different API formats.
 * Handles conversion from UnifiedRequest to provider-specific formats.
 */

import { UnifiedChatRequest } from '@/types/llm';
import { ModelCapability } from '../routing/model-capability';

/**
 * OpenAI Responses API request format
 */
export interface ResponsesRequest {
  model: string;
  input: Array<{
    role: string;
    content: string | any[];
    tool_calls?: any[];
    tool_call_id?: string;
  }>;
  max_output_tokens?: number;
  // Note: temperature is not supported by OpenAI Responses API
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
  reasoning_effort?: string;
}

/**
 * OpenAI Chat Completions API request format
 */
export interface ChatRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string | any[];
    tool_calls?: any[];
    tool_call_id?: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
}

/**
 * Transform a unified request to provider-specific format
 */
export function transformToProviderRequest(
  request: UnifiedChatRequest,
  capability: ModelCapability
): ResponsesRequest | ChatRequest {
  if (capability.api === 'responses') {
    return transformToResponsesRequest(request);
  } else {
    return transformToChatRequest(request);
  }
}

/**
 * Transform content format for Responses API
 * Converts 'text' type to 'input_text' for compatibility
 */
function transformContentForResponses(content: string | any[]): string | any[] {
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content.map(item => {
      if (typeof item === 'object' && item.type === 'text') {
        // Remove cache_control as it's not supported by Responses API
        const { cache_control, ...itemWithoutCache } = item;
        return {
          ...itemWithoutCache,
          type: 'input_text'
        };
      }
      return item;
    });
  }
  
  return content;
}

/**
 * Transform to OpenAI Responses API format
 */
export function transformToResponsesRequest(request: UnifiedChatRequest): ResponsesRequest {
  const responsesRequest: ResponsesRequest = {
    model: request.model,
    input: (request.messages || []).map(msg => ({
      role: msg.role,
      content: transformContentForResponses(msg.content),
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id })
    }))
  };

  // Transform max_tokens to max_output_tokens (Responses API uses this parameter)
  if (request.max_tokens !== undefined) {
    responsesRequest.max_output_tokens = request.max_tokens;
  }

  // Note: OpenAI Responses API does not support temperature parameter
  // Temperature is ignored for compatibility with Chat Completions API

  if (request.stream !== undefined) {
    responsesRequest.stream = request.stream;
  }

  // Transform tools format for Responses API
  if (request.tools && Array.isArray(request.tools)) {
    responsesRequest.tools = request.tools.map(tool => {
      // Handle OpenAI function format (already has function wrapper)
      if (tool.function && !tool.type) {
        return {
          type: 'function',
          ...tool
        };
      }
      
      // Handle Claude Code format (direct tool definition)
      if (tool.name && tool.description && (tool.input_schema || tool.parameters)) {
        const parameters = tool.input_schema || tool.parameters;
        
        // Ensure parameters has the required JSON Schema structure
        const normalizedParameters = parameters && typeof parameters === 'object' ? {
          type: 'object',
          ...parameters
        } : {
          type: 'object',
          properties: {},
          additionalProperties: false
        };
        
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: normalizedParameters
          }
        };
      }
      
      // Already in correct format or unknown format
      return tool;
    });
  }

  if (request.tool_choice) {
    responsesRequest.tool_choice = request.tool_choice;
  }

  // Transform reasoning parameter
  if (request.reasoning?.effort) {
    responsesRequest.reasoning_effort = request.reasoning.effort;
  }

  return responsesRequest;
}

/**
 * Transform to OpenAI Chat Completions API format
 */
export function transformToChatRequest(request: UnifiedChatRequest): ChatRequest {
  const chatRequest: ChatRequest = {
    model: request.model,
    messages: (request.messages || []).map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id })
    }))
  };

  // Copy standard parameters
  if (request.max_tokens !== undefined) {
    chatRequest.max_tokens = request.max_tokens;
  }

  if (request.temperature !== undefined) {
    chatRequest.temperature = request.temperature;
  }

  if (request.stream !== undefined) {
    chatRequest.stream = request.stream;
  }

  if (request.tools) {
    chatRequest.tools = request.tools;
  }

  if (request.tool_choice) {
    chatRequest.tool_choice = request.tool_choice;
  }

  // Note: Chat API doesn't support reasoning parameters
  // They should be ignored for backward compatibility

  return chatRequest;
}

/**
 * Validate request transformation preserves semantic meaning
 */
export function validateRequestTransformation(
  original: UnifiedChatRequest,
  transformed: ResponsesRequest | ChatRequest
): boolean {
  // Model should be preserved
  if (transformed.model !== original.model) {
    return false;
  }

  // Message content should be preserved
  const originalMessages = original.messages;
  const transformedMessages = 'input' in transformed ? transformed.input : transformed.messages;
  
  if (originalMessages.length !== transformedMessages.length) {
    return false;
  }

  // Temperature should be preserved for Chat API, but ignored for Responses API
  if ('temperature' in transformed && original.temperature !== undefined && transformed.temperature !== original.temperature) {
    return false;
  }

  // Stream setting should be preserved
  if (original.stream !== undefined && transformed.stream !== original.stream) {
    return false;
  }

  return true;
}