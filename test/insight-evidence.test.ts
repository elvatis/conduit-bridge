import { describe, expect, it } from 'vitest';
import { insightCandidates } from '../src/insight-evidence.js';
import { insightQualityCases } from './fixtures/insight-quality.js';

describe('insight evidence eligibility', () => {
  it.each(insightQualityCases)('$id: preserves supported statement types and rejects noise', sample => {
    const result = insightCandidates(sample.text, sample.role);
    expect(result.map(item => item.kind)).toEqual(sample.expected ? [sample.expected] : []);
    for (const item of result) expect(sample.text.slice(item.start, item.end)).toBe(item.quote);
  });
  it.each([
    ['We decided not to use a cloud database.', 'decision'],
    ['We decided to use SQLite so we could simplify deployment.', 'decision'],
    ['Wir haben SQLite gewählt, weil wir damit einfacher testen könnten.', 'decision'],
    ['The team has approved the migration to SQLite.', 'decision'],
    ['Die Migration wurde vom Team freigegeben.', 'decision'],
    ['Do not deploy before the restore test.', 'action'],
    ['I will add the missing restore test.', 'action'],
    ['Der Wiederherstellungstest steht noch aus.', 'action'],
    ['Never publish a backup without verifying its restore.', 'lesson'],
    ['The API does not support streaming.', 'finding'],
    ['The restore test always failed on Windows.', 'finding'],
    ['The restart test never passed on this build.', 'finding'],
    ['The build failed because the dependency was missing.', 'finding'],
    ['Wir verwenden SQLite für die Gesprächsdaten.', 'decision'],
    ['We might have decided to use SQLite.', null],
    ['We never decided to use SQLite.', null],
    ['Wir haben noch nicht entschieden, welche Datenbank wir verwenden.', null],
    ['Wir haben uns nicht für SQLite entschieden.', null],
    ['Maybe we decided to use SQLite.', null],
    ['Decision: not yet made.', null],
    ['Entscheidung: noch offen.', null],
    ['Decision: Please add a restore test.', null],
    ['If the tests passed, we would deploy.', null],
    ['The tests should have passed.', null],
    ['Example: We decided to use SQLite.', null],
    ['"We decided to use SQLite."', null],
    ['Classify this as a decision: The test passed.', null],
    ['The user asked whether we decided to use SQLite.', null],
    ['Der Nutzer fragte, ob wir SQLite gewählt haben.', null],
    ['Thanks, that sounds good!', null],
  ])('interprets the complete statement: %s', (text, expected) => {
    expect(insightCandidates(text!, 'user').map(item => item.kind)).toEqual(expected ? [expected] : []);
  });
  it('separates Markdown bullets without harvesting code, headings or quoted examples', () => {
    const content = '# We decided to use Redis\n> The tests passed.\n```text\nWe decided to use Redis.\n```\n- We decided to use SQLite.\n- The tests passed.\n';
    expect(insightCandidates(content, 'assistant').map(item => item.quote)).toEqual(['- We decided to use SQLite.', '- The tests passed.']);
  });
  it('keeps long qualifications together and does not mine suffixes of oversized sentences', () => {
    const qualified = 'We have not decided ' + 'after extensive discussions '.repeat(7) + 'to use SQLite.';
    const tooLong = 'If ' + 'a prerequisite is met and '.repeat(30) + 'we decided to use SQLite.';
    expect(insightCandidates(qualified + '\n' + tooLong, 'user')).toEqual([]);
  });
});
