import { describe, expect, test } from 'bun:test';
import type { MessageWithParts } from '../../src/composables/useSessions';
import { computeContextUsage, computeSessionSummary } from '../../src/lib/session-metrics';

function mkAssistantMessage(input: {
  cost?: number;
  agent?: string;
  model?: { providerID: string; modelID: string };
  tokens?: { input?: number; output?: number };
}): MessageWithParts {
  return {
    info: {
      id: 'msg_1',
      role: 'assistant',
      sessionID: 'sess_1',
      ...(input.cost !== undefined ? { cost: input.cost } : {}),
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.tokens ? { tokens: input.tokens } : {}),
    },
    parts: [],
  };
}

describe('computeSessionSummary', () => {
  test('sums costs and extracts last agent/model', () => {
    const messages: MessageWithParts[] = [
      mkAssistantMessage({ cost: 0.1, agent: 'A', model: { providerID: 'openai', modelID: 'gpt-4o' } }),
      mkAssistantMessage({ cost: 0.2, agent: 'B', model: { providerID: 'openai', modelID: 'gpt-4o-mini' } }),
    ];

    const out = computeSessionSummary(messages);
    expect(out.totalCost).toBeCloseTo(0.3);
    expect(out.lastAgent).toBe('B');
    expect(out.lastModelLabel).toBe('openai/gpt-4o-mini');
  });
});

describe('computeContextUsage', () => {
  test('returns nulls when no assistant message', () => {
    const out = computeContextUsage([], []);
    expect(out.percent).toBe(null);
    expect(out.inputTokens).toBe(null);
    expect(out.contextLimit).toBe(null);
  });

  test('computes percent from input tokens and model context limit', () => {
    const messages: MessageWithParts[] = [
      mkAssistantMessage({
        model: { providerID: 'openai', modelID: 'gpt-4o' },
        tokens: { input: 1000, output: 200 },
        cost: 0.001,
      }),
    ];
    const models = [{ providerID: 'openai', modelID: 'gpt-4o', limitContext: 10_000 }];
    const out = computeContextUsage(messages, models);
    expect(out.percent).toBe(10);
    expect(out.inputTokens).toBe(1000);
    expect(out.outputTokens).toBe(200);
    expect(out.contextLimit).toBe(10_000);
    expect(out.cost).toBe(0.001);
    expect(out.modelLabel).toBe('openai/gpt-4o');
  });
});
