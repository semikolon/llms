/**
 * Usage Unification Functions
 * 
 * Pure functions for handling multi-dimensional token usage tracking
 * across different API formats and capabilities.
 */

import { ModelCapability } from '../routing/model-capability';

/**
 * Unified usage format supporting multi-dimensional tokens
 */
export interface UnifiedUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  reasoning_tokens?: number;
}

/**
 * Provider-specific usage formats
 */
export interface ResponsesUsage {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens?: number;
  total_tokens: number;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Unify usage from provider-specific format
 */
export function unifyUsage(
  providerUsage: ResponsesUsage | ChatUsage | any,
  capability: ModelCapability
): UnifiedUsage {
  const unified: UnifiedUsage = {
    prompt_tokens: providerUsage.prompt_tokens || 0,
    completion_tokens: providerUsage.completion_tokens || 0,
    total_tokens: providerUsage.total_tokens || 0
  };

  // Add reasoning tokens if supported by the model
  if (capability.supports.reasoning && providerUsage.reasoning_tokens !== undefined) {
    unified.reasoning_tokens = providerUsage.reasoning_tokens;
  }

  // Recalculate total tokens to ensure consistency
  unified.total_tokens = calculateTotalTokens(unified);

  return unified;
}

/**
 * Calculate total tokens from individual dimensions
 */
export function calculateTotalTokens(usage: UnifiedUsage): number {
  return (usage.prompt_tokens || 0) + 
         (usage.completion_tokens || 0) + 
         (usage.reasoning_tokens || 0);
}

/**
 * Validate usage calculations
 */
export function validateUsage(usage: UnifiedUsage): boolean {
  // All token counts should be non-negative
  if (usage.prompt_tokens < 0 || usage.completion_tokens < 0) {
    return false;
  }

  if (usage.reasoning_tokens !== undefined && usage.reasoning_tokens < 0) {
    return false;
  }

  // Total should equal sum of parts
  const expectedTotal = calculateTotalTokens(usage);
  if (usage.total_tokens !== expectedTotal) {
    return false;
  }

  return true;
}

/**
 * Transform usage for backward compatibility
 */
export function transformUsageForCompatibility(
  usage: UnifiedUsage,
  capability: ModelCapability
): UnifiedUsage {
  const compatible = { ...usage };

  // Remove reasoning tokens for models that don't support them
  if (!capability.supports.reasoning) {
    delete compatible.reasoning_tokens;
    compatible.total_tokens = compatible.prompt_tokens + compatible.completion_tokens;
  }

  return compatible;
}

/**
 * Aggregate usage across multiple requests/responses
 */
export function aggregateUsage(usages: UnifiedUsage[]): UnifiedUsage {
  const aggregated: UnifiedUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0
  };

  let hasReasoningTokens = false;

  for (const usage of usages) {
    aggregated.prompt_tokens += usage.prompt_tokens || 0;
    aggregated.completion_tokens += usage.completion_tokens || 0;

    if (usage.reasoning_tokens !== undefined) {
      hasReasoningTokens = true;
      aggregated.reasoning_tokens = (aggregated.reasoning_tokens || 0) + usage.reasoning_tokens;
    }
  }

  // Only include reasoning_tokens if at least one usage had them
  if (!hasReasoningTokens) {
    delete aggregated.reasoning_tokens;
  }

  aggregated.total_tokens = calculateTotalTokens(aggregated);

  return aggregated;
}