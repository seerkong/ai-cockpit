export type SlashCommandOption = {
  name: string;
  description?: string;
};

export function parseSlashQuery(prompt: string): string | null {
  const match = prompt.match(/^\/(\S*)$/);
  if (!match) return null;
  return match[1] ?? '';
}

export function filterSlashCommands(
  commands: SlashCommandOption[],
  query: string,
  limit = 10,
): SlashCommandOption[] {
  const q = query.trim().toLowerCase();
  const out = commands.filter((c) => !q || c.name.toLowerCase().includes(q));
  return out.slice(0, limit);
}

export function slashCommandReplacement(commandName: string): string {
  return `/${commandName} `;
}
