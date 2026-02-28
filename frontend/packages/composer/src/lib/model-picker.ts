export type ModelOption = {
  providerID: string;
  providerName?: string;
  modelID: string;
  modelName?: string;
};

export type ModelGroup = {
  providerID: string;
  models: ModelOption[];
};

function includes(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

export function filterModelOptions(options: ModelOption[], query: string): ModelOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;

  return options.filter((m) => {
    return (
      includes(m.providerID, q) ||
      includes(m.providerName, q) ||
      includes(m.modelID, q) ||
      includes(m.modelName, q)
    );
  });
}

export function groupModelOptions(options: ModelOption[]): ModelGroup[] {
  const groups = new Map<string, ModelOption[]>();
  for (const m of options) {
    const pid = m.providerID;
    if (!pid) continue;
    const list = groups.get(pid);
    if (list) list.push(m);
    else groups.set(pid, [m]);
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([providerID, models]) => {
      const sorted = [...models].sort((a, b) => a.modelID.localeCompare(b.modelID));
      return { providerID, models: sorted } satisfies ModelGroup;
    });
}
