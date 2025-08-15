/**
 * Transformer Composition Utilities
 * 
 * Provides functions to compose multiple transformers for complex provider→provider transformations.
 * Follows the architectural principle: Provider→Unified→Provider using the canonical UnifiedChatRequest IR.
 */

import { UnifiedChatRequest } from '@/types/llm';
import { Transformer } from '@/types/transformer';

/**
 * Provider descriptor for transformer composition
 */
export interface ProviderDescriptor {
  provider: 'anthropic' | 'openai' | 'gemini';
  endpoint?: 'messages' | 'responses' | 'chat';
  model?: string;
}

/**
 * Result of a transformation with optional metadata
 */
export interface TransformResult<T = any> {
  result: T;
  warnings?: string[];
  metadata?: Record<string, any>;
}

/**
 * Compose two transformers to create a Provider→Provider transformation
 * 
 * @param inputTransformer - Transformer that converts provider format to unified format (transformRequestOut)
 * @param outputTransformer - Transformer that converts unified format to provider format (transformRequestOut) 
 * @param input - Input request in the source provider format
 * @returns Transformed request in target provider format
 */
export async function composeTransformers<TInput, TOutput>(
  inputTransformer: Transformer,
  outputTransformer: Transformer, 
  input: TInput
): Promise<TransformResult<TOutput>> {
  const warnings: string[] = [];
  
  try {
    // Step 1: Provider format → Unified format
    if (!inputTransformer.transformRequestOut) {
      throw new Error(`Input transformer '${inputTransformer.name}' missing transformRequestOut method`);
    }
    
    const unifiedRequest = await inputTransformer.transformRequestOut(input as any) as UnifiedChatRequest;
    
    // Validate unified request
    if (!unifiedRequest || !unifiedRequest.model) {
      throw new Error('Input transformer produced invalid unified request (missing model)');
    }
    
    // Step 2: Unified format → Target provider format  
    if (!outputTransformer.transformRequestOut) {
      throw new Error(`Output transformer '${outputTransformer.name}' missing transformRequestOut method`);
    }
    
    const outputRequest = await outputTransformer.transformRequestOut(unifiedRequest) as TOutput;
    
    return {
      result: outputRequest,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        inputTransformer: inputTransformer.name,
        outputTransformer: outputTransformer.name,
        unifiedModel: unifiedRequest.model,
        transformedAt: new Date().toISOString()
      }
    };
  } catch (error: any) {
    throw new Error(`Transformer composition failed: ${error.message}`);
  }
}

/**
 * Transform a request from one provider format to another
 * 
 * @param config - Transformation configuration
 * @returns Transformed request with metadata
 */
export async function transformRequest<TInput = any, TOutput = any>(config: {
  from: ProviderDescriptor;
  to: ProviderDescriptor;
  input: TInput;
  inputTransformer: Transformer;
  outputTransformer: Transformer;
}): Promise<TransformResult<TOutput>> {
  const { from, to, input, inputTransformer, outputTransformer } = config;
  
  // Validate transformer compatibility
  if (inputTransformer.endPoint && from.endpoint) {
    const expectedEndpoint = `/${from.endpoint}` === inputTransformer.endPoint ? true :
                              `/v1/${from.endpoint}` === inputTransformer.endPoint;
    if (!expectedEndpoint) {
      throw new Error(`Input transformer endpoint mismatch: expected ${from.endpoint}, got ${inputTransformer.endPoint}`);
    }
  }
  
  if (outputTransformer.endPoint && to.endpoint) {
    const expectedEndpoint = `/${to.endpoint}` === outputTransformer.endPoint ? true :
                              `/v1/${to.endpoint}` === outputTransformer.endPoint;
    if (!expectedEndpoint) {
      throw new Error(`Output transformer endpoint mismatch: expected ${to.endpoint}, got ${outputTransformer.endPoint}`);
    }
  }
  
  return composeTransformers<TInput, TOutput>(inputTransformer, outputTransformer, input);
}

/**
 * Create a transform report for debugging and observability
 */
export function createTransformReport(
  from: ProviderDescriptor,
  to: ProviderDescriptor, 
  result: TransformResult<any>
): string {
  const { metadata, warnings } = result;
  const lines = [
    `Transform: ${from.provider}/${from.endpoint} → ${to.provider}/${to.endpoint}`,
    `Input Transformer: ${metadata?.inputTransformer}`,
    `Output Transformer: ${metadata?.outputTransformer}`,
    `Model: ${metadata?.unifiedModel}`,
    `Timestamp: ${metadata?.transformedAt}`
  ];
  
  if (warnings?.length) {
    lines.push(`Warnings: ${warnings.join(', ')}`);
  }
  
  return lines.join('\n');
}

/**
 * Utility for CCR to easily transform Anthropic→OpenAI Responses
 */
export async function transformAnthropicToOpenAIResponses(
  anthropicRequest: any,
  anthropicTransformer: Transformer,
  openaiResponsesTransformer: Transformer
): Promise<TransformResult<any>> {
  return transformRequest({
    from: { provider: 'anthropic', endpoint: 'messages' },
    to: { provider: 'openai', endpoint: 'responses' },
    input: anthropicRequest,
    inputTransformer: anthropicTransformer,
    outputTransformer: openaiResponsesTransformer
  });
}