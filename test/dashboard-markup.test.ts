import { describe, expect, it } from 'vitest';
import { DASHBOARD_HTML } from '../src/dashboard.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Dashboard markup and script ID reference consistency', () => {
  it('declares all element IDs referenced by literal $(\'...\') and getElementById(\'...\')', () => {
    // 1. Extract all id="..." attributes declared in the static DASHBOARD_HTML
    const idAttrRegex = /\bid=["']([a-zA-Z0-9_-]+)["']/g;
    const declaredIds = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = idAttrRegex.exec(DASHBOARD_HTML)) !== null) {
      declaredIds.add(match[1]);
    }

    // 2. Read the source of src/dashboard.ts to find script references
    const dashboardSrc = readFileSync(join(__dirname, '../src/dashboard.ts'), 'utf8');

    // Extract browser script portion
    const scriptStart = dashboardSrc.indexOf('<script>');
    const scriptEnd = dashboardSrc.lastIndexOf('</script>');
    expect(scriptStart).toBeGreaterThan(0);
    expect(scriptEnd).toBeGreaterThan(scriptStart);
    const clientScript = dashboardSrc.slice(scriptStart, scriptEnd);

    // 3. Find literal $('id') and getElementById('id') calls
    const dollarRefRegex = /\$\(\s*['"]([a-zA-Z0-9_-]+)['"]\s*\)/g;
    const getElemRefRegex = /getElementById\(\s*['"]([a-zA-Z0-9_-]+)['"]\s*\)/g;

    const referencedIds = new Set<string>();
    while ((match = dollarRefRegex.exec(clientScript)) !== null) {
      referencedIds.add(match[1]);
    }
    while ((match = getElemRefRegex.exec(clientScript)) !== null) {
      referencedIds.add(match[1]);
    }

    // Dynamic IDs created at runtime by client script templates
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
      if (!declaredIds.has(id) && !dynamicallyCreatedIds.has(id)) {
        missingIds.push(id);
      }
    }

    // Assert that no referenced IDs are missing from markup
    expect(missingIds, `Referenced IDs missing from DASHBOARD_HTML: ${missingIds.join(', ')}`).toEqual([]);
  });

  it('fails if obsolete summary-requests or summary-active are referenced', () => {
    const dashboardSrc = readFileSync(join(__dirname, '../src/dashboard.ts'), 'utf8');
    expect(dashboardSrc).not.toContain("$('summary-requests')");
    expect(dashboardSrc).not.toContain("$('summary-active')");
  });
});
