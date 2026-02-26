import { ref } from 'vue';

export type Capabilities = {
  chat?: boolean;
  agents?: boolean;
  models?: boolean;
  commands?: boolean;
  reviewDiffs?: boolean;
  permissions?: boolean;
  questions?: boolean;
  fileSearch?: boolean;
  [key: string]: unknown;
};

type AgentOption = {
  name: string;
  description?: string;
  hidden?: boolean;
  mode?: string;
};

type CommandOption = {
  name: string;
  description?: string;
};

type ModelOption = {
  providerID: string;
  providerName?: string;
  modelID: string;
  modelName?: string;
  label: string;
  limitContext?: number;
  limitOutput?: number;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeCommandOptions(payload: unknown): CommandOption[] {
  const root = asObject(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.commands)
      ? root.commands
      : [];

  const out: CommandOption[] = [];
  for (const item of list) {
    const row = asObject(item);
    if (!row) continue;
    const name = asString(row.name || row.id);
    if (!name) continue;
    const description = asString(row.description) || undefined;
    out.push(description ? { name, description } : { name });
  }

  return out;
}

function normalizeAgentOptions(payload: unknown): AgentOption[] {
  const root = asObject(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.agents)
      ? root.agents
      : [];

  const out: AgentOption[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      out.push({ name: item });
      continue;
    }
    const row = asObject(item);
    if (!row) continue;
    const name = asString(row.name || row.id);
    if (!name) continue;
    const description = asString(row.description) || undefined;
    const mode = asString(row.mode) || undefined;
    const hidden = Boolean(row.hidden);
    out.push({ name, description, hidden, mode });
  }

  return out;
}

function normalizeModelOptions(payload: unknown): ModelOption[] {
  const root = asObject(payload);
  const providersRaw = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.providers)
      ? root.providers
      : Array.isArray(root?.all)
        ? root.all
        : Array.isArray(root?.data)
          ? root.data
          : [];

  const out: ModelOption[] = [];
  const seen = new Set<string>();

  for (const providerItem of providersRaw) {
    const provider = asObject(providerItem);
    if (!provider) continue;
    const providerID = asString(provider.providerID || provider.id || provider.name);
    if (!providerID) continue;
    const providerName = asString(provider.providerName || provider.name) || undefined;
    const modelsRaw = Array.isArray(provider.models)
      ? provider.models
      : asObject(provider.models)
        ? Object.values(provider.models as Record<string, unknown>)
        : [];

    for (const modelItem of modelsRaw) {
      const model = asObject(modelItem);
      if (!model) continue;
      const modelID = asString(model.modelID || model.id || model.name);
      if (!modelID) continue;
      const key = `${providerID}:${modelID}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        providerID,
        providerName,
        modelID,
        modelName: asString(model.modelName || model.name) || undefined,
        label: `${providerID}/${modelID}`,
        limitContext: (() => {
          const limit = asObject(model.limit);
          const ctx = limit ? limit.context : null;
          return typeof ctx === 'number' && Number.isFinite(ctx) && ctx > 0 ? ctx : undefined;
        })(),
        limitOutput: (() => {
          const limit = asObject(model.limit);
          const outLimit = limit ? limit.output : null;
          return typeof outLimit === 'number' && Number.isFinite(outLimit) && outLimit > 0 ? outLimit : undefined;
        })(),
      });
    }
  }

  return out;
}

function createDefaultCapabilities(): Capabilities {
  return {
    chat: true,
    agents: true,
    models: true,
    commands: true,
    reviewDiffs: true,
    permissions: true,
    questions: true,
    fileSearch: true,
  };
}

type ApiFetchForConnection = (connectionId: string, url: string, options?: RequestInit) => Promise<Response>;

export function useComposerMetadata({
  apiFetchForConnection,
}: {
  apiFetchForConnection: ApiFetchForConnection;
}) {
  const capabilities = ref<Capabilities | null>(null);
  const agentOptions = ref<AgentOption[]>([]);
  const commandOptions = ref<CommandOption[]>([]);
  const modelOptions = ref<ModelOption[]>([]);

  function defaultCapabilities() {
    return createDefaultCapabilities();
  }

  async function refreshComposerMetadata(connectionId: string) {
    const caps = capabilities.value;
    if (!caps) return;

    if (caps.agents) {
      try {
        const resp = await apiFetchForConnection(connectionId, `/api/v1/workspaces/${connectionId}/agents`);
        if (resp.ok) {
          const payload = await resp.json().catch(() => []);
          agentOptions.value = normalizeAgentOptions(payload).filter((agent) => !agent.hidden);
        }
      } catch {
        agentOptions.value = [];
      }
    } else {
      agentOptions.value = [];
    }

    if (caps.commands) {
      try {
        const resp = await apiFetchForConnection(connectionId, `/api/v1/workspaces/${connectionId}/commands`);
        if (resp.ok) {
          const payload = await resp.json().catch(() => []);
          commandOptions.value = normalizeCommandOptions(payload);
        }
      } catch {
        commandOptions.value = [];
      }
    } else {
      commandOptions.value = [];
    }

    if (caps.models) {
      try {
        const resp = await apiFetchForConnection(connectionId, `/api/v1/workspaces/${connectionId}/models`);
        if (resp.ok) {
          const payload = await resp.json().catch(() => []);
          modelOptions.value = normalizeModelOptions(payload);
        }
      } catch {
        modelOptions.value = [];
      }
    } else {
      modelOptions.value = [];
    }
  }

  return {
    capabilities,
    agentOptions,
    commandOptions,
    modelOptions,
    defaultCapabilities,
    refreshComposerMetadata,
  };
}
