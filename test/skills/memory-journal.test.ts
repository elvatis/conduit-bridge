import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DailyMemory } from '../../src/skills/memory.js';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-journal-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
it('writes UTC date-keyed JSONL and searches only the selected owner across days', () => {
  let now = new Date('2026-09-06T23:59:00Z'); const alice = new DailyMemory('alice', root, () => now); const bob = new DailyMemory('bob', root, () => now);
  alice.write('first decision'); bob.write('private other-owner note'); now = new Date('2026-09-07T00:01:00Z'); alice.write('second decision');
  expect(readdirSync(root)).toEqual(['2026-09-06.jsonl', '2026-09-07.jsonl']);
  expect(alice.readToday().map(entry => entry.note)).toEqual(['second decision']); expect(alice.search('DECISION', 2)).toHaveLength(2); expect(alice.search('other-owner', 2)).toHaveLength(0);
  expect(readFileSync(join(root, '2026-09-07.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
  expect(() => alice.search('', 99)).toThrow('Invalid'); expect(() => alice.write('x'.repeat(4097))).toThrow('4096');
});
