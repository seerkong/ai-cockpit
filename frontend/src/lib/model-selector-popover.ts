export type ModelKeyItem = {
  key: string;
  providerID: string;
  modelID: string;
};

export type ModelGroupLike = {
  providerID: string;
  models: Array<{ providerID: string; modelID: string }>;
};

export function modelKey(providerID: string, modelID: string): string {
  return `${providerID}:${modelID}`;
}

export function flattenModelGroups(groups: ModelGroupLike[]): ModelKeyItem[] {
  const out: ModelKeyItem[] = [];
  for (const g of groups) {
    for (const m of g.models) {
      out.push({ key: modelKey(m.providerID, m.modelID), providerID: m.providerID, modelID: m.modelID });
    }
  }
  return out;
}
