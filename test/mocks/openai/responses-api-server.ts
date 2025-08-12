import { Server } from "http";
import { AddressInfo } from "net";
import fastify, { FastifyInstance } from "fastify";

export interface MockResponsesServerOptions {
  port?: number;
  responses?: MockResponseDefinition[];
  enableLogging?: boolean;
}

export interface MockResponseDefinition {
  id: string;
  model: string;
  events: SSEEvent[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    reasoning_tokens?: number;
    total_tokens: number;
  };
  delay?: number;
}

export interface SSEEvent {
  event?: string;
  data: string;
  delay?: number;
}

export interface ResponsesRequest {
  model: string;
  input: Array<{
    role: string;
    content: string;
  }>;
  stream?: boolean;
  max_completion_tokens?: number;
  temperature?: number;
  reasoning_effort?: "low" | "medium" | "high";
  tools?: any[];
  tool_choice?: any;
}

/**
 * Mock OpenAI Responses API Server
 * 
 * Simulates the /v1/responses endpoint with full SSE streaming support.
 * Used for testing the OpenAI Responses transformer and streaming functionality.
 */
export class MockResponsesAPIServer {
  private server: FastifyInstance;
  private httpServer?: Server;
  private responses: Map<string, MockResponseDefinition>;
  private requestLog: Array<{ timestamp: Date; request: any; response?: any }> = [];

  constructor(private options: MockResponsesServerOptions = {}) {
    this.server = fastify({ 
      logger: options.enableLogging || false,
      disableRequestLogging: !options.enableLogging 
    });
    this.responses = new Map();
    this.setupRoutes();
    this.loadResponses(options.responses || []);
  }

  private setupRoutes() {
    // CORS setup for tests
    this.server.register(require('@fastify/cors'), {
      origin: true,
      credentials: true
    });

    // Health check endpoint
    this.server.get('/health', async () => {
      return { 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        endpoints: ['/v1/responses', '/v1/chat/completions'],
        responses_loaded: this.responses.size
      };
    });

    // Mock /v1/responses endpoint (Responses API)
    this.server.post('/v1/responses', async (request, reply) => {
      const req = request.body as ResponsesRequest;
      
      // Log request
      this.requestLog.push({
        timestamp: new Date(),
        request: req
      });

      // Validate request format
      if (!req.model || !req.input) {
        reply.status(400).send({
          error: {
            type: 'invalid_request_error',
            message: 'Missing required fields: model and input'
          }
        });
        return;
      }

      // Find matching response definition
      const responseData = this.findMatchingResponse(req.model, req);
      
      if (!responseData) {
        reply.status(400).send({
          error: {
            type: 'invalid_request_error',
            message: `Model ${req.model} not supported or no mock response defined`
          }
        });
        return;
      }

      if (req.stream) {
        return this.handleStreamingResponse(reply, responseData, req);
      } else {
        return this.handleNonStreamingResponse(reply, responseData, req);
      }
    });

    // Mock /v1/chat/completions endpoint (backward compatibility)
    this.server.post('/v1/chat/completions', async (request, reply) => {
      const req = request.body as any;
      
      this.requestLog.push({
        timestamp: new Date(),
        request: req
      });

      // Simple mock for Chat Completions format
      const chatResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: req.model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Mock chat completion response'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      return chatResponse;
    });

    // Test utility endpoints
    this.server.get('/test/requests', async () => {
      return { requests: this.requestLog };
    });

    this.server.delete('/test/requests', async () => {
      this.requestLog = [];
      return { cleared: true };
    });

    this.server.get('/test/responses', async () => {
      return { 
        responses: Array.from(this.responses.entries()).map(([key, value]) => ({
          key,
          ...value
        }))
      };
    });
  }

  private findMatchingResponse(model: string, request: ResponsesRequest): MockResponseDefinition | undefined {
    // Try exact model match first
    let response = this.responses.get(model);
    if (response) return response;

    // Try pattern matching for model families
    for (const [key, resp] of this.responses.entries()) {
      if (key.includes('*')) {
        const pattern = key.replace('*', '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(model)) {
          return resp;
        }
      }
    }

    // Try default response
    return this.responses.get('default');
  }

  private async handleStreamingResponse(
    reply: any, 
    responseData: MockResponseDefinition, 
    request: ResponsesRequest
  ) {
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('Access-Control-Allow-Origin', '*');

    // Send events with proper SSE formatting
    for (const event of responseData.events) {
      if (event.delay) {
        await this.sleep(event.delay);
      }

      let sseData = '';
      if (event.event) {
        sseData += `event: ${event.event}\n`;
      }
      sseData += `data: ${event.data}\n\n`;

      reply.raw.write(sseData);
    }

    // Send final [DONE] event
    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  }

  private async handleNonStreamingResponse(
    reply: any,
    responseData: MockResponseDefinition,
    request: ResponsesRequest
  ) {
    // For non-streaming, extract the final response from the events
    const completionEvents = responseData.events.filter(e => 
      e.data.includes('response.completed') || e.data.includes('message')
    );

    if (completionEvents.length === 0) {
      reply.status(500).send({
        error: {
          type: 'server_error',
          message: 'No completion event found in mock response'
        }
      });
      return;
    }

    // Parse the last completion event to get the response
    const lastEvent = completionEvents[completionEvents.length - 1];
    let responseObject;
    
    try {
      responseObject = JSON.parse(lastEvent.data);
    } catch (e) {
      responseObject = {
        id: responseData.id,
        object: 'response',
        created: Math.floor(Date.now() / 1000),
        model: request.model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Mock non-streaming response'
          },
          finish_reason: 'stop'
        }],
        usage: responseData.usage || {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };
    }

    if (responseData.delay) {
      await this.sleep(responseData.delay);
    }

    return responseObject;
  }

  private loadResponses(responses: MockResponseDefinition[]) {
    responses.forEach(response => {
      this.responses.set(response.model, response);
    });
  }

  public addResponse(model: string, response: MockResponseDefinition) {
    this.responses.set(model, response);
  }

  public removeResponse(model: string) {
    this.responses.delete(model);
  }

  public getRequestLog() {
    return [...this.requestLog];
  }

  public clearRequestLog() {
    this.requestLog = [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async start(): Promise<number> {
    const port = this.options.port || 0;
    await this.server.listen({ port, host: '127.0.0.1' });
    this.httpServer = this.server.server;
    const address = this.httpServer.address() as AddressInfo;
    return address.port;
  }

  public async stop(): Promise<void> {
    if (this.httpServer) {
      await this.server.close();
      this.httpServer = undefined;
    }
  }

  public getBaseUrl(): string {
    if (!this.httpServer) {
      throw new Error('Server not started');
    }
    const address = this.httpServer.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  }
}