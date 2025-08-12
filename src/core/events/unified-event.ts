/**
 * UnifiedEvent Interface and Processing
 * 
 * Standardized event format for processing SSE events from different APIs.
 * This provides a unified interface for consuming streaming events.
 */

/**
 * Unified event format for all streaming events
 */
export interface UnifiedEvent {
  kind: 'reasoning.delta' | 'output.delta' | 'tool_call' | 'tool_result' | 'done';
  content?: string;
  delta?: any;
}

/**
 * Builder for creating UnifiedEvent objects
 */
export class UnifiedEventBuilder {
  private event: Partial<UnifiedEvent> = {
    kind: 'output.delta'
  };

  static create(): UnifiedEventBuilder {
    return new UnifiedEventBuilder();
  }

  withKind(kind: UnifiedEvent['kind']): UnifiedEventBuilder {
    this.event.kind = kind;
    return this;
  }

  withContent(content: string): UnifiedEventBuilder {
    this.event.content = content;
    return this;
  }

  withDelta(delta: any): UnifiedEventBuilder {
    this.event.delta = delta;
    return this;
  }

  build(): UnifiedEvent {
    if (!this.event.kind) {
      throw new Error('Event kind is required');
    }
    
    return this.event as UnifiedEvent;
  }
}

/**
 * Convert SSE event to UnifiedEvent format
 */
export function sseToUnifiedEvent(sseEvent: any): UnifiedEvent | null {
  if (!sseEvent || !sseEvent.event || !sseEvent.data) {
    return null;
  }

  try {
    const data = typeof sseEvent.data === 'string' ? JSON.parse(sseEvent.data) : sseEvent.data;
    
    switch (sseEvent.event) {
      case 'reasoning.delta':
        return UnifiedEventBuilder.create()
          .withKind('reasoning.delta')
          .withContent(data.delta?.reasoning_content || '')
          .withDelta(data.delta)
          .build();

      case 'output.delta':
        return UnifiedEventBuilder.create()
          .withKind('output.delta')
          .withContent(data.delta?.content || '')
          .withDelta(data.delta)
          .build();

      case 'tool_calls':
        return UnifiedEventBuilder.create()
          .withKind('tool_call')
          .withDelta(data)
          .build();

      case 'response.completed':
        return UnifiedEventBuilder.create()
          .withKind('done')
          .withDelta(data)
          .build();

      default:
        // Unknown event type, convert to generic output delta
        return UnifiedEventBuilder.create()
          .withKind('output.delta')
          .withContent('')
          .withDelta(data)
          .build();
    }
  } catch (error) {
    // Invalid JSON or other parsing error
    return null;
  }
}

/**
 * Validate UnifiedEvent format
 */
export function validateUnifiedEvent(event: any): event is UnifiedEvent {
  if (!event || typeof event !== 'object') {
    return false;
  }

  const validKinds = ['reasoning.delta', 'output.delta', 'tool_call', 'tool_result', 'done'];
  if (!validKinds.includes(event.kind)) {
    return false;
  }

  // For delta events, require content or delta
  if (event.kind.includes('delta')) {
    return event.hasOwnProperty('content') || event.hasOwnProperty('delta');
  }

  return true;
}

/**
 * Process a sequence of UnifiedEvents and return final state
 */
export function processEventSequence(events: UnifiedEvent[]): {
  reasoning: string;
  output: string;
  toolCalls: any[];
  isComplete: boolean;
} {
  const state = {
    reasoning: '',
    output: '',
    toolCalls: [] as any[],
    isComplete: false
  };

  for (const event of events) {
    switch (event.kind) {
      case 'reasoning.delta':
        if (event.content) {
          state.reasoning += event.content;
        }
        break;

      case 'output.delta':
        if (event.content) {
          state.output += event.content;
        }
        break;

      case 'tool_call':
        if (event.delta?.tool_calls) {
          state.toolCalls.push(...event.delta.tool_calls);
        }
        break;

      case 'done':
        state.isComplete = true;
        break;
    }
  }

  return state;
}