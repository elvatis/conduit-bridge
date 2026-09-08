import { PRESET_PIPELINES } from '../pipelines.js';
import { buildCodingPipelines } from '../platform-presets.js';

// Original display strings let installed copies retain localization until edited.
// Only display metadata is embedded in the browser, never executable templates.
export const PIPELINE_ORIGINALS = Object.fromEntries([
  ...PRESET_PIPELINES,
  ...buildCodingPipelines({ planner:'display',implementer:'display',reviewer:'display',security:'display' }),
].map(preset => [preset.id, { name:preset.name, description:preset.description, steps:Object.fromEntries(preset.steps.map(step => [step.id,step.name])) }]));

/** Display copy for shipped presets. User pipelines and executable prompts stay intact. */
export const PIPELINE_COPY_DE: Record<string, { name: string; description: string; steps: Record<string, string> }> = {
  'platform-bugfix-regression': { name: 'Fehler nachstellen, beheben und erneut prüfen', description: 'Stellt einen Fehler nach, gibt eine gezielte Korrektur frei und prüft die Fehlerbehebung und Sicherheit unabhängig.', steps: {
    reproduce:'Fehler nachstellen und Ursache bestimmen', implement:'Umsetzen und Prüfergebnisse sammeln', review:'Code und Nachweise unabhängig prüfen', security:'Sicherheit gesondert prüfen', decision:'Nachweise bewerten und Abnahme entscheiden',
  } },
  'platform-api-contract': { name: 'API-Verhalten festlegen, umsetzen und prüfen', description: 'Definiert das Verhalten einer API, setzt es um und prüft die Kompatibilität anhand konkreter Beispiele und Tests.', steps: {
    contract:'API-Verhalten und Abnahmefälle festlegen', implement:'Umsetzen und Prüfergebnisse sammeln', compatibility:'Kompatibilität unabhängig analysieren', security:'Sicherheit gesondert prüfen', decision:'Nachweise bewerten und Abnahme entscheiden',
  } },
  'platform-doc-code-verification': { name: 'Dokumentation mit dem Code abgleichen', description: 'Prüft Dokumentation anhand des Quellcodes und aufgezeichneter Befehlsausgaben, ohne Dateien zu ändern.', steps: {
    inventory:'Dokumentation und Code-Verhalten erfassen', accuracy:'Genauigkeit und Beispiele unabhängig prüfen', draft:'Korrigierte Dokumentation vorschlagen', decision:'Nachweise bewerten und Abnahme entscheiden',
  } },
  'platform-design-decision': { name: 'Entwürfe vergleichen und begründet entscheiden', description: 'Vergleicht unabhängige Vorschläge zu Wartbarkeit und Leistung und klärt ihre Unterschiede ausdrücklich.', steps: {
    maintainability:'Wartbarkeit und einfachen Betrieb bewerten', performance:'Leistung und Erweiterungsmöglichkeiten bewerten', security:'Sicherheit gesondert prüfen', synthesis:'Alternativen klären und Entscheidung dokumentieren', decision:'Nachweise bewerten und Abnahme entscheiden',
  } },
  'platform-feature-review': { name: 'Planen, umsetzen, testen und prüfen', description: 'Ein Ablauf mit Freigaben, tatsächlichen Codeänderungen sowie unabhängiger Prüfung der Testnachweise und Sicherheit.', steps: {
    plan:'Anforderungen, Plan und Abnahmekriterien festlegen', implement:'Umsetzen und Prüfergebnisse sammeln', 'test-evidence':'Prüfergebnisse und Nachweise bewerten', review:'Code und Nachweise unabhängig prüfen', security:'Sicherheit gesondert prüfen', decision:'Nachweise bewerten und Abnahme entscheiden',
  } },
  'standard-governance': { name: 'Standard-Governance: Umsetzung, Prüfung und Freigabe', description: 'Unabhängige Code-, Sicherheits- und Richtlinienprüfungen mit abschließender manueller Freigabe.', steps: {
    'step-impl': 'Lösung entwerfen und umsetzen', 'step-code-review': 'Unabhängige Codeprüfung', 'step-security-review': 'Sicherheit und Schwachstellen prüfen', 'step-compliance-review': 'Richtlinien und Vorgaben prüfen', 'step-final-approval': 'Ergebnisse zusammenführen und freigeben',
  } },
  'doc-generation': { name: 'Dokumentation automatisch erstellen', description: 'Untersucht den Code, erstellt strukturierte Markdown-Anleitungen und prüft die Querverweise.', steps: {
    'step-doc-analysis': 'Architektur und Schnittstellen erfassen', 'step-doc-writing': 'Markdown-Dokumentation schreiben', 'step-doc-integration': 'Navigation und Querverweise prüfen',
  } },
  'doc-review': { name: 'Qualität und Genauigkeit der Dokumentation prüfen', description: 'Prüft fachliche Aussagen, Codebeispiele und die Einhaltung der Stilvorgaben.', steps: {
    'step-doc-accuracy': 'Technische Richtigkeit prüfen', 'step-doc-clarity': 'Stil, Grammatik und Lesbarkeit prüfen', 'step-doc-signoff': 'Veröffentlichung der Dokumentation freigeben',
  } },
  'refactoring-review': { name: 'Refactoring und Codestruktur prüfen', description: 'Erkennt strukturelle Probleme, entwirft Verbesserungen und bewertet das Risiko neuer Fehler.', steps: {
    'step-smell-analysis': 'Codeprobleme und Komplexität erkennen', 'step-refactor-proposal': 'Strukturelle Überarbeitung planen', 'step-regression-risk': 'Fehlerrisiken bewerten und prüfen',
  } },
  'pr-review': { name: 'Pull Request mit mehreren Agenten prüfen', description: 'Fasst Änderungen zusammen und prüft Architektur, Design und Testabdeckung.', steps: {
    'step-pr-diff': 'Änderungen und Absicht zusammenfassen', 'step-pr-arch': 'Architektur und Design prüfen', 'step-pr-test': 'Testabdeckung und Randfälle prüfen', 'step-pr-gate': 'Zusammenführen des Pull Requests freigeben',
  } },
  'release-readiness': { name: 'Veröffentlichungsreife und Vorgaben prüfen', description: 'Prüft das Änderungsprotokoll, Sicherheitsmeldungen und erforderliche Freigaben.', steps: {
    'step-release-verify': 'Änderungsprotokoll und Versionierung prüfen', 'step-release-sec': 'Sicherheitsmeldungen und CVEs prüfen', 'step-release-gate': 'Produktivbereitstellung freigeben',
  } },
  'architecture-review': { name: 'Systemarchitektur und Skalierbarkeit prüfen', description: 'Bewertet Dienstgrenzen und Nebenläufigkeit und dokumentiert die Architekturentscheidung.', steps: {
    'step-arch-eval': 'Systemgrenzen und Zusammenhalt bewerten', 'step-scale-eval': 'Nebenläufigkeit und Skalierbarkeit analysieren', 'step-adr-synthesis': 'Architekturentscheidung dokumentieren',
  } },
  'dependency-risk': { name: 'Abhängigkeitsrisiken und Lizenzen prüfen', description: 'Erkennt verwundbare oder veraltete Abhängigkeiten und prüft deren Lizenzbedingungen.', steps: {
    'step-dep-inventory': 'Abhängigkeiten und Aktualität erfassen', 'step-license-audit': 'Lizenzverträglichkeit und Vorgaben prüfen', 'step-upgrade-checkpoint': 'Aktualisierung der Abhängigkeiten freigeben',
  } },
  'supply-chain-security': { name: 'Lieferkette und Build-Integrität prüfen', description: 'Prüft die Sicherheit der Build-Abläufe, festgelegte Action-Versionen und Herkunftsnachweise.', steps: {
    'step-pipeline-audit': 'CI-Abläufe und Actions auf Sicherheit prüfen', 'step-integrity-check': 'Artefakte und Signaturen prüfen', 'step-supply-chain-gate': 'Herkunftsnachweise freigeben',
  } },
  'tri-vendor-review': { name: 'Prüfkette: Claude, Codex und Gemini', description: 'Erstellt einen Umsetzungsvorschlag und prüft Code und Sicherheit unabhängig mit manueller Freigabe.', steps: {
    'step-plan': 'Architektur und Umsetzung planen', 'step-review': 'Code prüfen und Fehler analysieren', 'step-security': 'Sicherheit und Härtung prüfen',
  } },
  'code-gen-test': { name: 'Code erstellen, testen und validieren', description: 'Erstellt Code und automatisierte Tests und lässt das Ergebnis von einem weiteren Modell prüfen.', steps: {
    'step-codegen': 'Code erstellen', 'step-tests': 'Automatisierte Tests erstellen', 'step-validation': 'Verhalten und Codequalität prüfen',
  } },
  'debate-consensus': { name: 'Expertenrunde und gemeinsame Bewertung', description: 'Führt unabhängige parallele Analysen mehrerer Modelle zu einer gemeinsamen Bewertung zusammen.', steps: {
    'step-panel-a': 'Perspektive A (Claude)', 'step-panel-b': 'Perspektive B (Codex)', 'step-consensus': 'Ergebnisse und Maßnahmen zusammenführen',
  } },
};
