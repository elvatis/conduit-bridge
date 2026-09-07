import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeJsonFile } from '../src/runtime-json.js';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'conduit-runtime-json-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
it('persists atomic changes across instances and keeps failed transactions unchanged', () => {
  const path = join(root, 'state.json'); const first = new RuntimeJsonFile(path, () => ({ count: 0 }));
  first.update(value => value.count++);
  expect(new RuntimeJsonFile(path, () => ({ count: 0 })).read()).toEqual({ count: 1 });
  expect(() => first.update(value => { value.count++; throw new Error('failed'); })).toThrow('failed');
  expect(first.read().count).toBe(1);
  expect(readFileSync(path, 'utf8')).toBe('{"count":1}');
});
it('refuses a busy lock and corrupted persistent data', () => {
  const path = join(root, 'state.json'); const file = new RuntimeJsonFile(path, () => []);
  writeFileSync(path + '.lock', 'busy'); expect(() => file.update(() => {})).toThrow();
  rmSync(path + '.lock'); writeFileSync(path, '{bad'); expect(() => file.update(() => {})).toThrow();
});
