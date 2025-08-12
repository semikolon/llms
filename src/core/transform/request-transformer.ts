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
  max_completion_tokens?: number;
  temperature?: number;
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
 * Transform to OpenAI Responses API format
 */
export function transformToResponsesRequest(request: UnifiedChatRequest): ResponsesRequest {
  const responsesRequest: ResponsesRequest = {
    model: request.model,
    input: (request.messages || []).map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id })
    }))
  };

  // Transform max_tokens to max_completion_tokens
  if (request.max_tokens !== undefined) {
    responsesRequest.max_completion_tokens = request.max_tokens;
  }

  // Copy other standard parameters
  if (request.temperature !== undefined) {
    responsesRequest.temperature = request.temperature;
  }

  if (request.stream !== undefined) {
    responsesRequest.stream = request.stream;
  }

  if (request.tools) {
    responsesRequest.tools = request.tools;
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

  // Temperature should be preserved
  if (original.temperature !== undefined && transformed.temperature !== original.temperature) {
    return false;
  }

  // Stream setting should be preserved
  if (original.stream !== undefined && transformed.stream !== original.stream) {
    return false;
  }

  return true;
}