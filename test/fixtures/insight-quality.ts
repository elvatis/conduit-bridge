// Synthetic statements only. Shared by offline regressions and the opt-in native check.
export const insightQualityCases = [
  { id: 'question-en', role: 'user', text: 'Which database should we choose?', expected: null },
  { id: 'question-de', role: 'user', text: 'Welche Datenbank sollen wir wählen?', expected: null },
  { id: 'recall-en', role: 'user', text: 'What was the codeword from the previous message?', expected: null },
  { id: 'echo-en', role: 'user', text: 'Reply with exactly SESSION_TEST_5829 and nothing else.', expected: null },
  { id: 'echo-de', role: 'user', text: 'Antworte nur mit dem Testkennwort WALD73.', expected: null },
  { id: 'token', role: 'assistant', text: 'SESSION_TEST_5829', expected: null },
  { id: 'hypothetical', role: 'assistant', text: 'If we decided to use SQLite, we could simplify deployment.', expected: null },
  { id: 'undecided', role: 'user', text: 'We have not decided to use SQLite.', expected: null },
  { id: 'proposal', role: 'assistant', text: 'We could choose SQLite for the database.', expected: null },
  { id: 'decision-en', role: 'user', text: 'We decided to store conversation records in SQLite.', expected: 'decision' },
  { id: 'decision-de', role: 'user', text: 'Wir haben uns für SQLite als Datenbank entschieden.', expected: 'decision' },
  { id: 'action-en', role: 'user', text: 'Could you add a restore test for encrypted backups?', expected: 'action' },
  { id: 'action-de', role: 'user', text: 'Bitte ergänze einen Wiederherstellungstest für verschlüsselte Backups.', expected: 'action' },
  { id: 'pending', role: 'assistant', text: 'The backup restore test is still pending.', expected: 'action' },
  { id: 'result-en', role: 'assistant', text: 'The restart test passed and all seven chats were retained.', expected: 'finding' },
  { id: 'result-de', role: 'assistant', text: 'Der Neustarttest war erfolgreich und alle sieben Chats blieben erhalten.', expected: 'finding' },
  { id: 'lesson-en', role: 'assistant', text: 'Lesson learned: check form widths after adding help icons.', expected: 'lesson' },
  { id: 'lesson-de', role: 'assistant', text: 'Für künftige Änderungen gilt: Formularbreiten nach zusätzlichen Hilfesymbolen prüfen.', expected: 'lesson' },
] as const;

export const insightQualityScenarios = [
  { id: 'mixed-priorities', messages: [
    ['The first test passed.', 'The second test passed.', 'The third test passed.', 'The fourth test passed.',
      'We decided to use SQLite.', 'Please add a restore test.', 'Lesson learned: always verify backup restoration.'].join(' '),
  ], kinds: ['finding', 'decision', 'lesson', 'action'] },
  { id: 'hierarchical-selection', messages: [
    'We decided to use SQLite for conversation storage.',
    'We decided to encrypt all saved conversation records.',
    'We decided to use the local model for private analysis.',
    'We decided to require source links for every insight.',
    'We decided to preserve message roles during exports.',
    'We decided to test restores before publishing backups.',
  ], kinds: ['decision'] },
  { id: 'duplicate-provenance', messages: [
    'The restart test passed.', 'The restart test passed.', 'The restart test passed.',
  ], kinds: ['finding'] },
] as const;
