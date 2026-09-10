import { describe, expect, it } from 'vitest';
import { DASHBOARD_HTML } from '../src/dashboard.js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function collectIds(html: string): Set<string> {
  const ids = new Set<string>();
  const idAttrRegex = /\bid=["']([a-zA-Z][a-zA-Z0-9_-]*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = idAttrRegex.exec(html)) !== null) ids.add(match[1]);
  return ids;
}

function collectRefs(source: string): Set<string> {
  const refs = new Set<string>();
  const dollarRefRegex = /\$\(\s*['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]\s*\)/g;
  const getElemRefRegex = /getElementById\(\s*['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = dollarRefRegex.exec(source)) !== null) refs.add(match[1]);
  while ((match = getElemRefRegex.exec(source)) !== null) refs.add(match[1]);
  return refs;
}

describe('Dashboard markup and script ID reference consistency', () => {
  it('declares all element IDs referenced by literal $(\'...\') and getElementById(\'...\')', () => {
    const declaredIds = collectIds(DASHBOARD_HTML);
    const dashboardSrc = readFileSync(join(root, 'src/dashboard.ts'), 'utf8');
    const uiDir = join(root, 'src/ui');
    const extraSources = [
      dashboardSrc,
      readFileSync(join(root, 'src/platform-ui.ts'), 'utf8'),
      ...readdirSync(uiDir).filter(name => name.endsWith('.ts')).map(name => readFileSync(join(uiDir, name), 'utf8')),
    ];
    const referencedIds = new Set<string>();
    for (const source of extraSources) {
      for (const id of collectRefs(source)) referencedIds.add(id);
    }

    const dynamicallyCreatedIds = new Set<string>([
      'platform-view',
      'pf-chat-model',
      'ex-card',
      'ex-output',
      'ex-feedback',
      'ex-search',
      'ex-tree',
      'ex-composer',
      'ex-approve',
      'ex-reject',
      'ex-create-task',
      'ex-run-new',
    ]);

    const missingIds: string[] = [];
    for (const id of referencedIds) {
      if (!declaredIds.has(id) && !dynamicallyCreatedIds.has(id)) missingIds.push(id);
    }

    expect(missingIds, `Referenced IDs missing from DASHBOARD_HTML: ${missingIds.join(', ')}`).toEqual([]);
  });

  it('fails if obsolete summary-requests or summary-active are referenced', () => {
    const dashboardSrc = readFileSync(join(root, 'src/dashboard.ts'), 'utf8');
    expect(dashboardSrc).not.toContain("$('summary-requests')");
    expect(dashboardSrc).not.toContain("$('summary-active')");
    expect(dashboardSrc).not.toMatch(/\$\(\s*['"]summary-active['"]\s*\)/);
  });
});
