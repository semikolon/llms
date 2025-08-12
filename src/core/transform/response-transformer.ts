/**
 * Response Transformation Functions
 * 
 * Pure functions for transforming responses from provider-specific formats
 * to unified response format.
 */

import { UnifiedChatResponse } from '@/types/llm';
import { ModelCapability } from '../routing/model-capability';

/**
 * OpenAI Responses API response format
 */
export interface ResponsesResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: any[];
      reasoning_content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    reasoning_tokens?: number;
    total_tokens: number;
  };
}

/**
 * OpenAI Chat Completions API response format
 */
export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: any[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Transform provider response to unified format
 */
export function transformFromProviderResponse(
  response: ResponsesResponse | ChatResponse,
  capability: ModelCapability
): UnifiedChatResponse {
  if (capability.api === 'responses') {
    return transformFromResponsesResponse(response as ResponsesResponse);
  } else {
    return transformFromChatResponse(response as ChatResponse);
  }
}

/**
 * Transform from OpenAI Responses API format
 */
export function transformFromResponsesResponse(response: ResponsesResponse): UnifiedChatResponse {
  const choice = response.choices[0];
  
  const unifiedResponse: UnifiedChatResponse = {
    id: response.id,
    model: response.model,
    content: choice?.message?.content || null,
    tool_calls: choice?.message?.tool_calls
  };

  // Transform usage with reasoning tokens
  if (response.usage) {
    unifiedResponse.usage = {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens
    };

    // Add reasoning tokens if present
    if (response.usage.reasoning_tokens !== undefined) {
      (unifiedResponse.usage as any).reasoning_tokens = response.usage.reasoning_tokens;
    }
  }

  return unifiedResponse;
}

/**
 * Transform from OpenAI Chat Completions API format
 */
export function transformFromChatResponse(response: ChatResponse): UnifiedChatResponse {
  const choice = response.choices[0];
  
  const unifiedResponse: UnifiedChatResponse = {
    id: response.id,
    model: response.model,
    content: choice?.message?.content || null,
    tool_calls: choice?.message?.tool_calls
  };

  // Transform usage (no reasoning tokens for Chat API)
  if (response.usage) {
    unifiedResponse.usage = {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens
    };
  }

  return unifiedResponse;
}

/**
 * Validate response transformation preserves essential data
 */
export function validateResponseTransformation(
  original: ResponsesResponse | ChatResponse,
  transformed: UnifiedChatResponse
): boolean {
  // ID should be preserved
  if (transformed.id !== original.id) {
    return false;
  }

  // Model should be preserved
  if (transformed.model !== original.model) {
    return false;
  }

  // Content should be preserved
  const originalContent = original.choices[0]?.message?.content;
  if (transformed.content !== originalContent) {
    return false;
  }

  // Usage tokens should be preserved
  if (original.usage && transformed.usage) {
    if (transformed.usage.prompt_tokens !== original.usage.prompt_tokens ||
        transformed.usage.completion_tokens !== original.usage.completion_tokens ||
        transformed.usage.total_tokens !== original.usage.total_tokens) {
      return false;
    }
  }

  return true;
}