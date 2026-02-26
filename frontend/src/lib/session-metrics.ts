import type { MessageWithParts } from '../composables/useSessions';

export type ModelOptionLike = {
  providerID: string;
  modelID: string;
  label?: string;
  limitContext?: number;
};

export type ExtractedTokens = {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type ContextUsage = {
  percent: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  contextLimit: number | null;
  cost: number | null;
  modelLabel: string | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function extractMessageTokens(info: Record<string, unknown>): ExtractedTokens {
  const out: ExtractedTokens = {};

  const tokens = asObject(info.tokens);
  if (tokens) {
    const input = asNumber(tokens.input);
    const output = asNumber(tokens.output);
    const reasoning = asNumber(tokens.reasoning);
    if (input !== null) out.input = input;
    if (output !== null) out.output = output;
    if (reasoning !== null) out.reasoning = reasoning;

    const cache = asObject(tokens.cache);
    if (cache) {
      const read = asNumber(cache.read);
      const write = asNumber(cache.write);
      if (read !== null) out.cacheRead = read;
      if (write !== null) out.cacheWrite = write;
    }
    return out;
  }

  // Fallback for OpenAI-style usage objects.
  const usage = asObject(info.usage) || asObject(info.token_usage) || asObject(info.tokenUsage);
  if (usage) {
    const input = asNumber(usage.prompt_tokens);
    const output = asNumber(usage.completion_tokens);
    if (input !== null) out.input = input;
    if (output !== null) out.output = output;
  }
  return out;
}

export function resolveModelLabel(info: Record<string, unknown>): string | null {
  const model = asObject(info.model);
  if (!model) return null;
  const providerID = asString(model.providerID) || asString(model.providerId) || asString(model.provider);
  const modelID = asString(model.modelID) || asString(model.modelId) || asString(model.id);
  if (!providerID || !modelID) return null;
  return `${providerID}/${modelID}`;
}

export function resolveModelContextLimit(
  info: Record<string, unknown>,
  modelOptions: ModelOptionLike[],
): number | null {
  const model = asObject(info.model);
  if (!model) return null;
  const providerID = asString(model.providerID) || asString(model.providerId) || asString(model.provider);
  const modelID = asString(model.modelID) || asString(model.modelId) || asString(model.id);
  if (!providerID || !modelID) return null;
  const match = modelOptions.find((m) => m.providerID === providerID && m.modelID === modelID);
  const limit = match?.limitContext;
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : null;
}

export function extractLatestAssistantInfo(messages: MessageWithParts[]): Record<string, unknown> | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg?.info || msg.info.role !== 'assistant') continue;
    const info = asObject(msg.info);
    if (info) return info;
  }
  return null;
}

export function computeContextUsage(
  messages: MessageWithParts[],
  modelOptions: ModelOptionLike[],
): ContextUsage {
  const info = extractLatestAssistantInfo(messages);
  if (!info) {
    return { percent: null, inputTokens: null, outputTokens: null, contextLimit: null, cost: null, modelLabel: null };
  }

  const tokens = extractMessageTokens(info);
  const inputTokens = typeof tokens.input === 'number' ? tokens.input : null;
  const outputTokens = typeof tokens.output === 'number' ? tokens.output : null;
  const contextLimit = resolveModelContextLimit(info, modelOptions);
  const cost = asNumber(info.cost);
  const modelLabel = resolveModelLabel(info);

  let percent: number | null = null;
  if (inputTokens !== null && contextLimit !== null && contextLimit > 0) {
    percent = Math.round((inputTokens / contextLimit) * 100);
    percent = Math.max(0, Math.min(100, percent));
  }

  return { percent, inputTokens, outputTokens, contextLimit, cost, modelLabel };
}

export function computeSessionSummary(messages: MessageWithParts[]): {
  totalCost: number;
  lastAgent: string;
  lastModelLabel: string;
} {
  let totalCost = 0;
  let lastAgent = '';
  let lastModelLabel = '';

  for (const msg of messages) {
    const info = asObject(msg?.info);
    if (!info) continue;
    const cost = asNumber(info.cost);
    if (cost !== null) totalCost += cost;
    const agent = asString(info.agent);
    if (agent) lastAgent = agent;
    const modelLabel = resolveModelLabel(info);
    if (modelLabel) lastModelLabel = modelLabel;
  }

  return { totalCost, lastAgent, lastModelLabel };
}
