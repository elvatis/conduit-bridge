import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFixture, sections, stamp } from './fixture.mjs';

function report() {
  return { language: 'de', generatedAt: stamp, sessions: 1, messages: 1, excludedMessages: 0,
    items: ['finding', 'decision', 'lesson', 'action'].map((kind, index) => ({ id: 'item-' + index, kind, text: ['Prüfung erfolgreich.', 'SQLite gewählt.', 'Breite nach Änderungen prüfen.', 'Wiederherstellung testen.'][index],
      sources: [{ sessionId: 'session-demo', messageId: 'message-demo', title: 'A focused developer workspace', quote: 'Keep the execution controls clear and the repository context close at hand.' }] })) };
}
const violations = async (page: any) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, failure: node.failureSummary })) }));

test('first visit offers an introduction; dismissal persists and Help restores keyboard focus', async ({ page }) => {
  const fixture = await installFixture(page, { language: 'de', introduction: true }); await fixture.open('execution');
  await expect(page.locator('#intro-offer')).toBeVisible(); await expect(page.locator('#intro-dialog')).not.toBeVisible();
  await page.locator('#intro-offer [data-open-intro]').click(); await expect(page.locator('#intro-done')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#intro-dialog')).not.toBeVisible(); await expect(page.locator('#nav-search-open')).toBeFocused();
  await page.reload(); await expect(page.locator('#intro-offer')).toBeHidden();
  await page.evaluate(() => (window as any).showSection('help'));
  const opener = page.locator('#help-section-v2 [data-open-intro]'); await opener.click(); await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  await opener.click(); await page.locator('#intro-examples').click(); await expect(page.locator('#help-section-v2')).toHaveClass(/active/);
  expect(fixture.requests.filter(item => item.method !== 'GET')).toEqual([]); expect(fixture.errors).toEqual([]);
});

test('examples append to unsent drafts and Insights example only opens the page', async ({ page }) => {
  const fixture = await installFixture(page, { language: 'de' }); await fixture.open('platform');
  await page.locator('#pf-chat-input').fill('Mein vorhandener Entwurf.');
  await page.evaluate(() => (window as any).showSection('help')); await page.locator('[data-use-example="explain"]').click();
  await expect(page.locator('#pf-chat-input')).toBeFocused(); await expect(page.locator('#pf-chat-input')).toHaveValue(/^Mein vorhandener Entwurf\.\n\n/);
  await page.evaluate(() => (window as any).showSection('execution')); await page.locator('#ex-prompt').fill('Noch prüfen.');
  await page.evaluate(() => (window as any).showSection('help')); await page.locator('[data-use-example="review"]').click();
  await expect(page.locator('#ex-prompt')).toBeFocused(); await expect(page.locator('#ex-prompt')).toHaveValue(/^Noch prüfen\.\n\n/);
  await page.evaluate(() => (window as any).showSection('help')); await page.locator('[data-use-example="insights"]').click();
  await expect(page.locator('#ins-heading')).toBeFocused();
  expect(fixture.requests.filter(item => item.method !== 'GET')).toEqual([]); expect(fixture.unexpected).toEqual([]); expect(fixture.errors).toEqual([]);
});

test('page search includes hidden navigation, supports arrows, no results, Escape and current-page semantics', async ({ page }) => {
  const fixture = await installFixture(page, { language: 'de' }); await fixture.open('execution');
  await page.locator('#nav-search-open').focus(); await page.keyboard.press('Control+k');
  const input = page.locator('#nav-search-input'); await expect(input).toBeFocused();
  await expect(page.locator('#nav-search-results [role="option"]')).toHaveCount(sections.length);
  await input.press('ArrowDown'); await expect(input).toHaveAttribute('aria-activedescendant', 'nav-search-option-1');
  await input.fill('keine-seite-xyz'); await expect(page.locator('#nav-search-count')).toHaveText('Keine passenden Seiten'); await input.press('Enter');
  await expect(page.locator('#nav-search-dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#nav-search-open')).toBeFocused();
  await page.keyboard.press('Control+k'); await input.fill('Budgets'); await input.press('Enter');
  await expect(page.locator('#budgets-section')).toHaveClass(/active/); await expect(page.locator('#budgets-section h2')).toBeFocused();
  await expect(page.locator('#side-nav [data-section="budgets"]')).toHaveAttribute('aria-current', 'page');
  expect(fixture.errors).toEqual([]);
});

test('insights refresh and cancellation preserve source details; source links focus the original message', async ({ page }) => {
  const fixture = await installFixture(page, { language: 'de', sessions: true });
  const data = fixture.payloads['/v1/platform/insights'] as any; data.report = report(); data.job.status = 'complete';
  fixture.on('POST', '/v1/platform/insights/refresh', request => { expect(request.body).toEqual({ language: 'de' }); data.busy = true; data.job = { status: 'running', phase: 'reading', completed: 0, total: 2 }; return { status: 202, body: {} }; });
  fixture.on('POST', '/v1/platform/insights/cancel', () => { data.busy = false; data.job.status = 'cancelled'; return {}; });
  await fixture.open('insights'); await expect(page.locator('#ins-results')).toBeVisible();
  const details = page.locator('#ins-finding details'); await details.locator('summary').click(); await expect(details.locator('blockquote')).toContainText('Keep the execution controls');
  await page.locator('#ins-refresh').click(); await expect(page.locator('#ins-cancel')).toBeVisible();
  await expect(page.locator('#ins-status')).toContainText('0 von 2');
  data.job.completed = 1; await expect(page.locator('#ins-status')).toContainText('1 von 2', { timeout: 6000 }); await expect(details).toHaveAttribute('open', '');
  await page.locator('#ins-cancel').click(); await expect(page.locator('#ins-cancel')).toBeHidden(); await expect(details).toHaveAttribute('open', '');
  await details.locator('button').click(); await expect(page.locator('#pf-message-message-demo')).toBeFocused();
  expect(fixture.requests.filter(item => item.method === 'POST').map(item => item.path)).toEqual(['/v1/platform/insights/refresh', '/v1/platform/insights/cancel']);
  expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
});

test('insights hides invalidated or mismatched-owner reports and keeps start errors until retry', async ({ page }) => {
  const fixture = await installFixture(page, { language: 'de', sessions: true }); const data = fixture.payloads['/v1/platform/insights'] as any;
  data.report = report(); data.job.status = 'complete'; let fail = true;
  fixture.on('POST', '/v1/platform/insights/refresh', () => fail ? { status: 409, body: { error: { message: 'Busy' } } } : {});
  await fixture.open('insights'); await expect(page.locator('#ins-results')).toBeVisible();
  await page.locator('#ins-refresh').click(); await expect(page.locator('#ins-error')).toContainText('konnte nicht starten');
  await page.evaluate(() => (window as any).loadInsights()); await expect(page.locator('#ins-error')).toBeVisible();
  fail = false; await page.locator('#ins-refresh').click(); await expect(page.locator('#ins-error')).toBeHidden();
  data.stale = true; delete data.report; await page.evaluate(() => (window as any).loadInsights()); await expect(page.locator('#ins-results')).toBeHidden(); await expect(page.locator('#ins-stale')).toBeVisible();
  data.report = report(); data.ownerId = 'different-owner'; await page.evaluate(() => (window as any).loadInsights());
  await expect(page.locator('#ins-results')).toBeHidden(); await expect(page.locator('#ins-refresh')).toBeDisabled(); await expect(page.locator('#ins-error')).toContainText('konnten nicht geladen');
  expect(fixture.errors).toEqual([]);
});

test('viewers can inspect their insights but cannot start or cancel an analysis', async ({ page }) => {
  const fixture = await installFixture(page, { language: 'de', role: 'viewer' }); const data = fixture.payloads['/v1/platform/insights'] as any;
  data.report = report(); data.job.status = 'running'; data.busy = true;
  await fixture.open('insights'); await expect(page.locator('#ins-results')).toBeVisible(); await expect(page.locator('#ins-refresh')).toBeDisabled(); await expect(page.locator('#ins-cancel')).toBeDisabled();
  expect(fixture.requests.filter(item => item.method !== 'GET')).toEqual([]);
});

test('all navigation sections and platform panes pass automated accessibility checks', async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await installFixture(page, { language: 'de' }); await fixture.open();
  for (const section of sections) { await page.evaluate(name => (window as any).showSection(name), section); expect(await violations(page), section).toEqual([]); }
  await page.evaluate(() => (window as any).showSection('platform'));
  for (const pane of ['chat', 'vault', 'memory', 'library', 'runs', 'system']) { await page.locator('#pf-view-select').selectOption(pane, { force: true }); expect(await violations(page), pane).toEqual([]); }
  await page.locator('.nav-advanced > summary').click(); expect(await violations(page), 'expanded navigation').toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const width of [320, 1280]) test(`introduction, search and populated insights are accessible at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 320 ? 640 : 900 });
  const fixture = await installFixture(page, { language: 'de', introduction: true }); const data = fixture.payloads['/v1/platform/insights'] as any; data.report = report(); data.job.status = 'complete';
  await fixture.open('insights'); await page.locator('#ins-finding summary').click();
  expect(await violations(page), 'populated insights').toEqual([]);
  await page.locator('#intro-offer [data-open-intro]').click(); expect(await violations(page), 'introduction').toEqual([]);
  await expect(page.locator('#intro-done')).toBeFocused(); await page.keyboard.press('Escape');
  await page.locator('#nav-search-open').click(); expect(await violations(page), 'page search').toEqual([]); await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).showSection('help')); await page.locator('#help-example-explain summary').click(); expect(await violations(page), 'examples').toEqual([]);
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, cards: [...document.querySelectorAll('.help-example')].map(item => { const rect = item.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }; }) }));
  expect(geometry.page).toBeLessThanOrEqual(geometry.viewport + 1);
  for (let index = 1; index < geometry.cards.length; index++) { const a = geometry.cards[index - 1], b = geometry.cards[index]; expect(Math.max(b.x - a.right, b.y - a.bottom)).toBeGreaterThanOrEqual(20); }
  await page.screenshot({ path: info.outputPath('examples.png'), fullPage: true }); expect(fixture.errors).toEqual([]);
});
