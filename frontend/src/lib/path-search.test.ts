import { describe, expect, test } from 'bun:test';
import { basenameFromPath, fileUrlForPath, normalizePathSearchResults } from './path-search';

describe('path-search', () => {
  test('normalizePathSearchResults supports string and object payloads', () => {
    expect(normalizePathSearchResults(['a.txt', 'b/c.ts'])).toEqual(['a.txt', 'b/c.ts']);
    expect(normalizePathSearchResults([{ path: 'x.md' }, { file: 'y.png' }, { value: 'z.json' }])).toEqual(['x.md', 'y.png', 'z.json']);
    expect(normalizePathSearchResults([{ nope: 1 }, null, 0, true])).toEqual([]);
  });

  test('fileUrlForPath formats Windows and POSIX paths', () => {
    expect(fileUrlForPath('C:/repo/a b.txt')).toBe('file:///C:/repo/a%20b.txt');
    expect(fileUrlForPath('C:\\repo\\a.txt')).toBe('file:///C:/repo/a.txt');
    expect(fileUrlForPath('/home/me/a.txt')).toBe('file:///home/me/a.txt');
  });

  test('basenameFromPath extracts file name', () => {
    expect(basenameFromPath('a.txt')).toBe('a.txt');
    expect(basenameFromPath('a/b/c.ts')).toBe('c.ts');
    expect(basenameFromPath('a\\b\\c.ts')).toBe('c.ts');
  });
});
