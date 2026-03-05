export const CODUMENT_STATUS_SYMBOL_TO_EMOJI: Record<string, string> = {
  '[ ]': '⬜',
  '[~]': '⏳',
  '[x]': '✅',
};

export function codumentStatusEmoji(statusSymbol: string): string {
  return CODUMENT_STATUS_SYMBOL_TO_EMOJI[statusSymbol] || '❔';
}
