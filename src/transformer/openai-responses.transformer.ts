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
    console.log('🔧 [CCR DEBUG] OpenAI Responses Transformer loaded!');
    console.log('🔧 [CCR DEBUG] endPoint set to:', this.endPoint);
  }

  /**
   * Check if a model requires Responses API using core logic
   */
  private requiresResponsesAPI(model: string): boolean {
    const capability = getModelCapability(model);
    return capability.api === 'responses';
  }

  async transformRequestOut(request: UnifiedChatRequest): Promise<any> {
    // Simple debug marker
    const fs = require('fs');
    fs.writeFileSync('/tmp/transformer-called', `${new Date().toISOString()}: transformRequestOut called for model ${request.model}`);
    
    // Use core logic to determine API and transform request
    const capability = getModelCapability(request.model);
    
    // Only transform if model requires Responses API
    if (capability.api !== 'responses') {
      fs.writeFileSync('/tmp/transformer-skip', `${new Date().toISOString()}: skipping transform, api=${capability.api}`);
      return request;
    }

    // Debug: Log the tools issue
    try {
      const debugInfo = {
        timestamp: new Date().toISOString(),
        model: request.model,
        toolsCount: request.tools?.length || 0,
        firstToolSample: request.tools?.[0] || 'NO_TOOLS'
      };
      fs.writeFileSync('/tmp/ccr-tools-debug.log', JSON.stringify(debugInfo, null, 2));

      // Use core transformation logic
      const transformed = transformToProviderRequest(request, capability);
      
      // Debug: Log the transformed tools
      const transformedInfo = {
        timestamp: new Date().toISOString(),
        model: transformed.model,
        toolsCount: transformed.tools?.length || 0,
        firstTransformedTool: transformed.tools?.[0] || 'NO_TOOLS'
      };
      fs.appendFileSync('/tmp/ccr-tools-debug.log', '\n---TRANSFORMED---\n' + JSON.stringify(transformedInfo, null, 2));
      
      return transformed;
    } catch (error: any) {
      fs.writeFileSync('/tmp/transformer-error', `${new Date().toISOString()}: Error in transform: ${error.message}`);
      throw error;
    }
  }

  async transformResponseIn(response: Response): Promise<Response> {
    // For now, pass through the response as the reasoning transformer
    // will handle extracting reasoning_content and other processing
    // In the future, this could use transformFromProviderResponse for consistency
    return response;
  }
}