import { describe, expect, test } from 'bun:test';
import { filterSlashCommands, parseSlashQuery, slashCommandReplacement } from './slash-command-popover';

describe('slash-command-popover', () => {
  test('parseSlashQuery returns query for single-token slash input', () => {
    expect(parseSlashQuery('/')).toBe('');
    expect(parseSlashQuery('/ch')).toBe('ch');
    expect(parseSlashQuery('/chat')).toBe('chat');
  });

  test('parseSlashQuery returns null when prompt is not a slash token', () => {
    expect(parseSlashQuery('')).toBeNull();
    expect(parseSlashQuery(' /ch')).toBeNull();
    expect(parseSlashQuery('/ch ')).toBeNull();
    expect(parseSlashQuery('/ch arg')).toBeNull();
    expect(parseSlashQuery('hello /ch')).toBeNull();
  });

  test('filterSlashCommands filters by substring and limits results', () => {
    const commands = [
      { name: 'chat', description: 'chat description' },
      { name: 'checkout', description: 'checkout description' },
      { name: 'commit', description: 'commit description' },
    ];
    expect(filterSlashCommands(commands, 'ch').map((c) => c.name)).toEqual(['chat', 'checkout']);
    expect(filterSlashCommands(commands, 'COM').map((c) => c.name)).toEqual(['commit']);
    expect(filterSlashCommands(commands, '', 2).length).toBe(2);
  });

  test('slashCommandReplacement formats as /name<space>', () => {
    expect(slashCommandReplacement('chat')).toBe('/chat ');
  });
});
