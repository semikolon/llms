import { UnifiedChatRequest } from "@/types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";
import { 
  getModelCapability, 
  transformToProviderRequest,
  transformFromProviderResponse,
  unifyUsage
} from "@/core";

/**
 * OpenAI Responses API Transformer
 * 
 * This transformer handles the conversion between Chat Completions API and Responses API.
 * The Responses API is required for models like GPT-5, o3, and codex-mini.
 * 
 * Key differences:
 * - Endpoint: /v1/responses instead of /v1/chat/completions
 * - Request format: input instead of messages
 * - Response format: includes reasoning tokens
 * - Parameter names: reasoning_effort instead of reasoning
 */
export class OpenAIResponsesTransformer implements Transformer {
  name = "OpenAI Responses API";
  endPoint = "/v1/responses";

  constructor(private readonly options?: TransformerOptions) {
  }

  /**
   * Check if a model requires Responses API using core logic
   */
  private requiresResponsesAPI(model: string): boolean {
    const capability = getModelCapability(model);
    return capability.api === 'responses';
  }

  async transformRequestOut(request: UnifiedChatRequest): Promise<any> {
    // Use core logic to determine API and transform request
    const capability = getModelCapability(request.model);
    
    // Only transform if model requires Responses API
    if (capability.api !== 'responses') {
      return request;
    }

    // Use core transformation logic
    return transformToProviderRequest(request, capability);
  }

  async transformResponseIn(response: Response): Promise<Response> {
    // For now, pass through the response as the reasoning transformer
    // will handle extracting reasoning_content and other processing
    // In the future, this could use transformFromProviderResponse for consistency
    return response;
  }
}