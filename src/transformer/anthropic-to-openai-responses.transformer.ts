import { UnifiedChatRequest } from "@/types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";
import { transformAnthropicToOpenAIResponses } from "@/core/transformer-composition";
import { AnthropicTransformer } from "./anthropic.transformer";
import { OpenAIResponsesTransformer } from "./openai-responses.transformer";

/**
 * Composite transformer for CCR: Anthropic Messages → OpenAI Responses API
 * 
 * This transformer handles the specific CCR use case where:
 * - Input: Anthropic /v1/messages format from Claude Code
 * - Output: OpenAI /v1/responses format for GPT-5/o3 models
 * 
 * Internally uses transformer composition: Anthropic → Unified → OpenAI Responses
 */
export class AnthropicToOpenAIResponsesTransformer implements Transformer {
  name = "Anthropic to OpenAI Responses";
  endPoint = "/v1/messages"; // CCR receives requests on this endpoint
  
  private anthropicTransformer: AnthropicTransformer;
  private openaiResponsesTransformer: OpenAIResponsesTransformer;

  constructor(private readonly options?: TransformerOptions) {
    this.anthropicTransformer = new AnthropicTransformer();
    this.openaiResponsesTransformer = new OpenAIResponsesTransformer();
  }

  async transformRequestOut(request: any): Promise<any> {
    try {
      // Use the composition utility to chain transformations
      const result = await transformAnthropicToOpenAIResponses(
        request,
        this.anthropicTransformer,
        this.openaiResponsesTransformer
      );

      // Log the transformation for debugging
      if (this.options?.debug) {
        console.log('🔧 [CCR COMPOSITION] Transform completed:', {
          inputTransformer: result.metadata?.inputTransformer,
          outputTransformer: result.metadata?.outputTransformer,
          model: result.metadata?.unifiedModel,
          warnings: result.warnings
        });
      }

      return result.result;
    } catch (error: any) {
      console.error('🚨 [CCR COMPOSITION] Transform failed:', error.message);
      throw error;
    }
  }

  async transformResponseIn(response: Response): Promise<Response> {
    // Use the Anthropic transformer's response handling since CCR needs to return Anthropic format to Claude Code
    return this.anthropicTransformer.transformResponseIn(response);
  }

  // Delegate auth to Anthropic transformer since CCR receives Anthropic requests
  async auth(request: any, provider: any): Promise<any> {
    // Actually, for CCR we don't need auth since it's forwarding to OpenAI
    // The auth will be handled by the provider configuration
    return { body: request, config: {} };
  }
}