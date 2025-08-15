import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { RegisterProviderRequest, LLMProvider } from "@/types/llm";
import { Transformer } from "@/types/transformer";
import { sendUnifiedRequest } from "@/utils/request";
import { createApiError } from "./middleware";
import { version } from "../../package.json";

/**
 * 处理transformer端点的主函数
 * 协调整个请求处理流程：验证提供者、处理请求转换器、发送请求、处理响应转换器、格式化响应
 */
async function handleTransformerEndpoint(
  req: FastifyRequest,
  reply: FastifyReply,
  fastify: FastifyInstance,
  transformer: any
) {
  const body = req.body as any;
  const providerName = req.provider!;
  const provider = fastify._server!.providerService.getProvider(providerName);

  // 验证提供者是否存在
  if (!provider) {
    throw createApiError(
      `Provider '${providerName}' not found`,
      404,
      "provider_not_found"
    );
  }

  // 🔧 [MISMATCH CORRECTION] Check if transformer matches provider
  fastify.log.info('🚨🚨🚨 [ENTRY POINT UNIQUE XYZ123] Checking transformer match - URL transformer: %s, Provider: %s', transformer.name, providerName);
  
  try {
    // Map provider names to expected transformer names
    const providerToTransformerMap: { [key: string]: string } = {
      'openai': 'Anthropic to OpenAI Responses',
      'anthropic': 'Anthropic',
    };
    
    const expectedTransformerName = providerToTransformerMap[providerName];
    fastify.log.info('🚨 [CRITICAL PATH] Provider: %s, Expected transformer: %s', providerName, expectedTransformerName);
    fastify.log.info('🚨 [CRITICAL PATH] About to check if expectedTransformerName exists...');
    
    if (expectedTransformerName) {
      fastify.log.info('🚨 [CRITICAL PATH] Inside expectedTransformerName conditional!');
      fastify.log.info('🔧 [LLMS DEBUG] Trying to get all transformers...');
      try {
        // Debug: List all registered transformers
        const allTransformers = fastify._server!.transformerService.getAllTransformers();
        fastify.log.info('🔧 [LLMS DEBUG] All registered transformers: %s', Array.from(allTransformers.keys()).join(', '));
      } catch (error: any) {
        fastify.log.error('🔧 [LLMS DEBUG] Error getting all transformers: %s', error.message);
      }
      
      const correctTransformer = fastify._server!.transformerService.getTransformer(expectedTransformerName);
      
      // 🕵️ PHASE 1: Registry inventory logging (GPT-5's #1 recommendation)
      if (!correctTransformer) {
        const allTransformers = fastify._server!.transformerService.getAllTransformers();
        const registeredNames = Array.from(allTransformers.keys()).join(', ');
        fastify.log.error('🚨 [REGISTRY INVENTORY] Transformer lookup failed!');
        fastify.log.error('🚨 [REGISTRY INVENTORY] Requested: %s', expectedTransformerName);
        fastify.log.error('🚨 [REGISTRY INVENTORY] Registered transformers: %s', registeredNames);
        fastify.log.error('🚨 [REGISTRY INVENTORY] Registry size: %d', allTransformers.size);
        throw new Error(`Transformer not found: ${expectedTransformerName}; registered: [${registeredNames}]`);
      }
      
      fastify.log.info('🔧 [LLMS DEBUG] Expected transformer for provider: %s, Found: %s', expectedTransformerName, correctTransformer?.name);
      
      if (correctTransformer && correctTransformer !== transformer) {
        fastify.log.warn('🔧 [LLMS DEBUG] MISMATCH DETECTED! URL-selected: %s, Provider needs: %s', transformer.name, correctTransformer.name);
        // Use the correct transformer for this provider
        return handleTransformerEndpoint(req, reply, fastify, correctTransformer as Transformer);
      } else {
        fastify.log.info('🔧 [LLMS DEBUG] Transformers match - no correction needed');
      }
    } else {
      fastify.log.info('🔧 [LLMS DEBUG] No transformer mapping for provider: %s', providerName);
    }
  } catch (error: any) {
    fastify.log.error('🔧 [LLMS DEBUG] Error in mismatch correction: %s', error.message);
  }

  // 处理请求转换器链
  const { requestBody, config, bypass } = await processRequestTransformers(
    body,
    provider,
    transformer,
    req.headers,
    fastify.log
  );

  // 发送请求到LLM提供者
  const response = await sendRequestToProvider(
    requestBody,
    config,
    provider,
    fastify,
    bypass,
    transformer
  );

  // 处理响应转换器链
  const finalResponse = await processResponseTransformers(
    requestBody,
    response,
    provider,
    transformer,
    bypass
  );

  // 格式化并返回响应
  return formatResponse(finalResponse, reply, body);
}

/**
 * 处理请求转换器链
 * 依次执行transformRequestOut、provider transformers、model-specific transformers
 * 返回处理后的请求体、配置和是否跳过转换器的标志
 */
async function processRequestTransformers(
  body: any,
  provider: any,
  transformer: any,
  headers: any,
  log: any
) {
  log.info('🚀 [ENTRY POINT] processRequestTransformers called with transformer: %s', transformer.name);
  let requestBody = body;
  let config = {};
  let bypass = false;

  // 检查是否应该跳过转换器（透传参数）
  bypass = shouldBypassTransformers(provider, transformer, body);

  if (bypass) {
    if (headers instanceof Headers) {
      headers.delete("content-length");
    } else {
      delete headers["content-length"];
    }
    config.headers = headers;
  }

  // 执行transformer的transformRequestOut方法
  log.info('🔧 [TRANSFORM DEBUG] About to call transformRequestOut - bypass: %s, hasMethod: %s', bypass, typeof transformer.transformRequestOut);
  if (typeof transformer.transformRequestOut === "function") {
    log.info('🔧 [TRANSFORM DEBUG] Calling transformRequestOut for transformer: %s', transformer.name);
    log.info('🔧 [TRANSFORM DEBUG] Original tools count: %d', requestBody.tools?.length || 0);
    if (requestBody.tools?.length > 0) {
      log.info('🔧 [TRANSFORM DEBUG] Original first tool sample: %j', requestBody.tools[0]);
    }
    const transformOut = await transformer.transformRequestOut(requestBody);
    log.info('🔧 [TRANSFORM DEBUG] Transform completed, result tools count: %d', transformOut.tools?.length || 0);
    if (transformOut.body) {
      requestBody = transformOut.body;
      config = transformOut.config || {};
    } else {
      requestBody = transformOut;
    }
    log.info('🔧 [TRANSFORM DEBUG] Final request tools count: %d', requestBody.tools?.length || 0);
    log.info('🔧 [TRANSFORM DEBUG] Final first tool sample: %j', requestBody.tools?.[0] || 'NO_TOOLS');
  }

  // 执行provider级别的转换器
  if (!bypass && provider.transformer?.use?.length) {
    for (const providerTransformer of provider.transformer.use) {
      if (
        !providerTransformer ||
        typeof providerTransformer.transformRequestIn !== "function"
      ) {
        continue;
      }
      const transformIn = await providerTransformer.transformRequestIn(
        requestBody,
        provider
      );
      if (transformIn.body) {
        requestBody = transformIn.body;
        config = { ...config, ...transformIn.config };
      } else {
        requestBody = transformIn;
      }
    }
  }

  // 执行模型特定的转换器
  if (!bypass && provider.transformer?.[body.model]?.use?.length) {
    for (const modelTransformer of provider.transformer[body.model].use) {
      if (
        !modelTransformer ||
        typeof modelTransformer.transformRequestIn !== "function"
      ) {
        continue;
      }
      requestBody = await modelTransformer.transformRequestIn(
        requestBody,
        provider
      );
    }
  }

  return { requestBody, config, bypass };
}

/**
 * 判断是否应该跳过转换器（透传参数）
 * 当provider只使用一个transformer且该transformer与当前transformer相同时，跳过其他转换器
 */
function shouldBypassTransformers(
  provider: any,
  transformer: any,
  body: any
): boolean {
  const providerUses = provider.transformer?.use ?? [];
  const modelUses = provider.transformer?.[body.model]?.use ?? [];
  
  return (
    providerUses.length === 1 &&
    providerUses[0]?.name === transformer.name &&
    (modelUses.length === 0 ||
      (modelUses.length === 1 && modelUses[0]?.name === transformer.name))
  );
}

/**
 * 发送请求到LLM提供者
 * 处理认证、构建请求配置、发送请求并处理错误
 */
async function sendRequestToProvider(
  requestBody: any,
  config: any,
  provider: any,
  fastify: FastifyInstance,
  bypass: boolean,
  transformer: any
) {
  // Construct URL using transformer's endpoint if available, otherwise use provider baseUrl
  let url: URL;
  if (transformer.endPoint) {
    // Use transformer's endpoint (e.g., "/v1/responses" for OpenAI Responses API)
    const baseUrl = new URL(provider.baseUrl);
    // baseUrl.origin = "https://api.openai.com" (protocol + hostname only)
    // new URL("/v1/responses", "https://api.openai.com") = "https://api.openai.com/v1/responses"
    url = new URL(transformer.endPoint, baseUrl.origin);
  } else {
    // Fall back to provider's configured baseUrl
    url = config.url || new URL(provider.baseUrl);
  }

  // 在透传参数下处理认证
  if (bypass && typeof transformer.auth === "function") {
    const auth = await transformer.auth(requestBody, provider);
    if (auth.body) {
      requestBody = auth.body;
      let headers = config.headers || {};
      if (auth.config?.headers) {
        headers = {
          ...headers,
          host: undefined,
          ...auth.config.headers,
        };
        delete auth.config.headers;
      }
      config = {
        ...config,
        ...auth.config,
        headers,
      };
    } else {
      requestBody = auth;
    }
  }

  // 发送HTTP请求
  const response = await sendUnifiedRequest(
    url,
    requestBody,
    {
      httpsProxy: fastify._server!.configService.getHttpsProxy(),
      ...config,
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        ...(config?.headers || {}),
      },
    },
    fastify.log
  );

  // 处理请求错误
  if (!response.ok) {
    const errorText = await response.text();
    throw createApiError(
      `Error from provider(${response.status}): ${errorText}`,
      response.status,
      "provider_response_error"
    );
  }

  return response;
}

/**
 * 处理响应转换器链
 * 依次执行provider transformers、model-specific transformers、transformer的transformResponseIn
 */
async function processResponseTransformers(
  requestBody: any,
  response: any,
  provider: any,
  transformer: any,
  bypass: boolean
) {
  let finalResponse = response;

  // 执行provider级别的响应转换器
  if (!bypass && provider.transformer?.use?.length) {
    for (const providerTransformer of Array.from(
      provider.transformer.use
    ).reverse()) {
      if (
        !providerTransformer ||
        typeof providerTransformer.transformResponseOut !== "function"
      ) {
        continue;
      }
      finalResponse = await providerTransformer.transformResponseOut(
        finalResponse
      );
    }
  }

  // 执行模型特定的响应转换器
  if (!bypass && provider.transformer?.[requestBody.model]?.use?.length) {
    for (const modelTransformer of Array.from(
      provider.transformer[requestBody.model].use
    ).reverse()) {
      if (
        !modelTransformer ||
        typeof modelTransformer.transformResponseOut !== "function"
      ) {
        continue;
      }
      finalResponse = await modelTransformer.transformResponseOut(
        finalResponse
      );
    }
  }

  // 执行transformer的transformResponseIn方法
  if (!bypass && transformer.transformResponseIn) {
    finalResponse = await transformer.transformResponseIn(finalResponse);
  }

  return finalResponse;
}

/**
 * 格式化并返回响应
 * 处理HTTP状态码、流式响应和普通响应的格式化
 */
function formatResponse(response: any, reply: FastifyReply, body: any) {
  // 设置HTTP状态码
  if (!response.ok) {
    reply.code(response.status);
  }

  // 处理流式响应
  const isStream = body.stream === true;
  if (isStream) {
    reply.header("Content-Type", "text/event-stream");
    reply.header("Cache-Control", "no-cache");
    reply.header("Connection", "keep-alive");
    return reply.send(response.body);
  } else {
    // 处理普通JSON响应
    return response.json();
  }
}

export const registerApiRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  // Health and info endpoints
  fastify.get("/", async () => {
    return { message: "LLMs API", version };
  });

  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  const transformersWithEndpoint =
    fastify._server!.transformerService.getTransformersWithEndpoint();

  for (const { transformer } of transformersWithEndpoint) {
    if (transformer.endPoint) {
      fastify.post(
        transformer.endPoint,
        async (req: FastifyRequest, reply: FastifyReply) => {
          return handleTransformerEndpoint(req, reply, fastify, transformer);
        }
      );
    }
  }

  fastify.post(
    "/providers",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: { type: "string", enum: ["openai", "anthropic"] },
            baseUrl: { type: "string" },
            apiKey: { type: "string" },
            models: { type: "array", items: { type: "string" } },
          },
          required: ["id", "name", "type", "baseUrl", "apiKey", "models"],
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: RegisterProviderRequest }>,
      reply: FastifyReply
    ) => {
      // Validation
      const { name, baseUrl, apiKey, models } = request.body;

      if (!name?.trim()) {
        throw createApiError(
          "Provider name is required",
          400,
          "invalid_request"
        );
      }

      if (!baseUrl || !isValidUrl(baseUrl)) {
        throw createApiError(
          "Valid base URL is required",
          400,
          "invalid_request"
        );
      }

      if (!apiKey?.trim()) {
        throw createApiError("API key is required", 400, "invalid_request");
      }

      if (!models || !Array.isArray(models) || models.length === 0) {
        throw createApiError(
          "At least one model is required",
          400,
          "invalid_request"
        );
      }

      // Check if provider already exists
      if (fastify._server!.providerService.getProvider(request.body.name)) {
        throw createApiError(
          `Provider with name '${request.body.name}' already exists`,
          400,
          "provider_exists"
        );
      }

      return fastify._server!.providerService.registerProvider(request.body);
    }
  );

  fastify.get("/providers", async () => {
    return fastify._server!.providerService.getProviders();
  });

  fastify.get(
    "/providers/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const provider = fastify._server!.providerService.getProvider(
        request.params.id
      );
      if (!provider) {
        throw createApiError("Provider not found", 404, "provider_not_found");
      }
      return provider;
    }
  );

  fastify.put(
    "/providers/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["openai", "anthropic"] },
            baseUrl: { type: "string" },
            apiKey: { type: "string" },
            models: { type: "array", items: { type: "string" } },
            enabled: { type: "boolean" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<LLMProvider>;
      }>,
      reply
    ) => {
      const provider = fastify._server!.providerService.updateProvider(
        request.params.id,
        request.body
      );
      if (!provider) {
        throw createApiError("Provider not found", 404, "provider_not_found");
      }
      return provider;
    }
  );

  fastify.delete(
    "/providers/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const success = fastify._server!.providerService.deleteProvider(
        request.params.id
      );
      if (!success) {
        throw createApiError("Provider not found", 404, "provider_not_found");
      }
      return { message: "Provider deleted successfully" };
    }
  );

  fastify.patch(
    "/providers/:id/toggle",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: { enabled: { type: "boolean" } },
          required: ["enabled"],
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { enabled: boolean };
      }>,
      reply
    ) => {
      const success = fastify._server!.providerService.toggleProvider(
        request.params.id,
        request.body.enabled
      );
      if (!success) {
        throw createApiError("Provider not found", 404, "provider_not_found");
      }
      return {
        message: `Provider ${
          request.body.enabled ? "enabled" : "disabled"
        } successfully`,
      };
    }
  );
};

// Helper function
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
