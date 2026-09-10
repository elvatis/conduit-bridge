# Integrationsprüfung: Workflow-Canvas, Prompt-Verbesserung und Akido/GitHub

Stand: 8. September 2026. Geprüft wurde der aktuelle Arbeitsstand von `codex/agent-orchestrator-dashboard`, einschließlich noch nicht eingecheckter Git-Workspace-Module. Dieses Dokument beschreibt die Integration; die vorgeschlagenen Erweiterungen sind **noch nicht implementiert**. Zeilenangaben beziehen sich auf diesen Arbeitsstand und können sich beim parallelen UI-Abschluss verschieben.

| Bereich | Bereits vorhanden | Fehlender Baustein | Empfehlung |
| --- | --- | --- | --- |
| Visueller Workflow | Pipeline-DAG, Provider-Aufrufe, Parallelgruppen, Freigaben, Laufhistorie | Node-Editor, Layout-Persistenz, Step-Fallbacks, Skill-Bindung | React Flow als begrenztes UI-Modul; vorhandene Engine weiterverwenden |
| Globale Prompt-Verbesserung | Verschlüsselte Gespräche, Quellenbezüge, lokale BitNet-Scans, Vorschlagsentwürfe | Dauerhafte Muster über mehrere Sitzungen, Priorisierung, Wirkungsmessung | Eigentümerbezogenes Musterregister mit nachvollziehbaren Belegen |
| GitHub/Akido | Lokaler Git-Workspace, GitHub-Client, Projects, Actions-Skill; Akido-Verbindung erreichbar | PR-/Issue-/CI-Ansicht im Workspace, begrenzter Akido-Adapter | GitHub-Lesefunktionen zuerst direkt integrieren; Akido gezielt für ergänzende Dienste |

## 1. Workflow-Canvas über der Pipeline-Engine

### Bestehende Verträge und ihre tatsächliche Bedeutung

| Anknüpfungspunkt | Befund |
| --- | --- |
| `src/pipelines.ts:19`, `:34` | `PipelineStep` besitzt `id`, `name`, `model`, `mode`, `promptTemplate`, `requiresApproval`, `dependsOn`, `parallelGroup`, `max_tokens`, `effort`, `fastMode`. Die Definition enthält Metadaten, `steps`, Kategorie und optional Repository. Es gibt keinen gespeicherten Graphen mit Koordinaten. |
| `src/pipelines.ts:100` | Serverseitige Validierung: 1–50 Schritte, sichere eindeutige IDs, gültige Abhängigkeiten, keine Zyklen und begrenzte Text-/Tokenwerte. Diese Validierung bleibt maßgeblich. |
| `src/pipelines.ts:719` | Vorlagen unterstützen `{{prompt}}`, `{{previous_output}}`, `{{prior_steps}}`, `{{input}}` und direkte Schrittreferenzen. Abhängigkeiten steuern auch die Auswahl vorheriger Ausgaben. |
| `src/pipelines.ts:768`, `:910` | Die Engine wartet auf abgeschlossene Abhängigkeiten. Gleichzeitige Ausführung entsteht über `parallelGroup`, maximal vier Schritte gleichzeitig. Mehrere ausgehende Kanten allein aktivieren keine beliebige Parallelität. |
| `src/pipelines.ts:792`, `:914` | Freigabe stoppt **vor** dem betreffenden Modellaufruf. Fortsetzung bindet sich an den wartenden Schritt und die eingefrorene Definition. Der freigegebene Schritt wird anschließend ausgeführt. |
| `src/pipelines.ts:859`, `:896` | Ein Schritt wählt genau ein Modell. Ein Fehler beendet den Schritt und bricht parallele Geschwister ab. Es gibt keine Step-Fallback-Liste und keine generische Tool-Node-Ausführung. |
| `src/server.ts:1795`, `:1849`, `:1943`; `src/orchestrator.ts:22` | Provider-Fallbacks existieren auf dem Chat-/Routing-Pfad. Sie gelten nicht automatisch für `runPipeline`. |
| `src/dashboard.ts:2054`, `:2338`, `:2396` | Die heutige Oberfläche zeigt Schrittkarten und einen Formular-Builder. Beim Speichern werden sequenzielle `dependsOn`-Verbindungen erzeugt. Ein Drag-and-drop-Editor oder frei bearbeitbarer DAG fehlt. |

Ein „Approval Gate“ ist derzeit eine Eigenschaft eines Modellschritts. Ein frei stehender Gate-Knoten ohne Modell wäre eine neue Ausführungssemantik. Für die erste Version kann der Canvas ein Gate vor einem Schritt anzeigen und verlustfrei auf dessen `requiresApproval` abbilden. Ein Gate mit mehreren Folgeästen benötigt eine präzise gemeinsame Freigabebedeutung; das lässt sich nicht zuverlässig durch ein beliebiges zusätzliches Modell mit leerem Prompt simulieren.

Auch „Skill“ bezeichnet im Repo zwei verschiedene Dinge: `src/platform-catalog.ts:9`, `:98`, `:212` verwaltet versionierte Anweisungen mit Tool-Anforderungen; `src/skills/index.ts:45`, `:94` enthält ausführbare Werkzeuge mit Schema und Effekten (`read`, `write`, `network`, `execute`). Kataloganweisungen installieren keine Werkzeuge und verleihen keine Berechtigungen. Der Canvas muss diese zwei Typen getrennt anbieten.

### API und Persistenz: SQLite ist vorhanden, Pipelines nutzen sie noch nicht

| Bestehender Endpunkt | Vertrag |
| --- | --- |
| `GET /v1/pipelines` | `{ object: "list", data: PipelineDefinition[] }` |
| `POST /v1/pipelines` | Speichert Definition; optional vorhandene `id`, ansonsten neue ID. Antwort `{ status: "saved", pipeline }`. Der Server kopiert nur bekannte Felder. Neue Layout-/Fallback-/Skill-Felder würden heute verworfen. |
| `DELETE /v1/pipelines/:id` | Löscht eine eigene Definition; eingebaute IDs bleiben reserviert. |
| `POST /v1/pipelines/run` | Start mit `pipelineId`, `prompt`, optional `repository`, `workingDirectory`. Repository-Allowlist und verpflichtende Gates werden serverseitig berücksichtigt. |
| `GET /v1/pipelines/runs`, `GET /v1/pipelines/runs/:id` | Laufübersichten bzw. Details mit `stepResults`, Status, Zeit-/Kosteninformationen. |
| `POST /v1/pipelines/runs/action` | `runId`, `action: approve | reject | cancel`, optional Feedback; die Engine prüft den aktuellen Freigabezustand. |

Implementierung: `src/server.ts:1390`, `:1395`, `:1455`, `:1555`, `:1572`. Diese Routen liegen hinter der älteren Bridge-Authentifizierung, nicht automatisch hinter workspacebezogenen Plattformrechten (`src/server.ts:695`). Ein Editor für mehrere Operatoren braucht daher eine explizite Autorisierungsanbindung; das Weiterreichen eines Plattform-Tokens an diese Route reicht nicht.

`PipelineStore` speichert Definitionen in `pipelines.json` und Zusammenfassungen in `pipeline-runs.json` (`src/pipelines.ts:583`, `:630`, `:637`). Laufprompts, Modellausgaben, Definition und Events werden aus dauerhaft gespeicherten Zusammenfassungen entfernt (`:85`). Nach Neustart werden laufende oder wartende Runs `interrupted`, weil ihr privater Kontext nur im RAM vorhanden war (`:611`). SQLite allein stellt deshalb keine Wiederaufnahme nach Neustart her.

Die Plattform nutzt standardmäßig `platform.sqlite` über `TransactionalStateStore` und `SqliteSnapshotBackend` (`src/platform-api.ts:83`, `src/storage.ts:214`). Das ist kein relationales Sitzungs-/Workflow-Schema: `bridge_state(id, revision, payload)` enthält den verschlüsselten Gesamtsnapshot; Collections liegen darin (`src/storage.ts:21`, `:222`, `:243`). Updates sind transaktional und prüfen die erwartete Revision. Der Textsuchindex der Vault ist eine eigene FTS5-Datenbank im RAM, kein dauerhaftes Analyse-Lager (`src/platform-vault.ts:90`).

**Vorgeschlagenes Speicherformat**, nicht vorhandene API:

```ts
type WorkflowDocumentV1 = {
  id: string;
  schemaVersion: 1;
  revision: number;
  ownerId: string;
  workspaceId: string;
  definition: PipelineDefinition;
  layout: {
    version: 1;
    positions: Record<string, { x: number; y: number }>;
    viewport?: { x: number; y: number; zoom: number };
  };
  updatedAt: number;
};
```

`dependsOn` bleibt die einzige Wahrheit für Ausführungskanten. Koordinaten und Zoom ändern keine Ausführungsreihenfolge; die Reihenfolge von `steps` und explizite Parallelgruppen bleiben erhalten. Eine Adapterfunktion erzeugt daraus die React-Flow-Nodes/Edges und übersetzt Änderungen zurück. Nur bekannte Step-IDs, endliche Koordinaten, begrenzter Zoom, keine Zyklen und maximal 50 Nodes werden gespeichert.

Neue vorgeschlagene Collection: `platform.workflows`. Neue vorgeschlagene Routen: `GET /v1/platform/workflows`, `GET /v1/platform/workflows/:id`, `PUT /v1/platform/workflows/:id` mit `expectedRevision` und `DELETE` mit Revisionsprüfung. `view` darf lesen, Bearbeitung wird mindestens an die passende Administrations-/Workspace-Berechtigung gebunden. Repository-Allowlist, verpflichtende Gates, Budget und Laufberechtigungen gelten weiterhin serverseitig.

Definition und Layout sollten in einer Transaktion gespeichert werden. Vorhandene JSON-Dateien kontrolliert und idempotent importieren; Importstatus, Quell-Hash, Validierungsfehler und Anzahl melden. Eingebaute Presets werden nicht kopiert, sondern bleiben versioniert im Code. Quelldateien als Rückfallmöglichkeit erhalten. Kein paralleles Schreiben derselben Definition nach JSON und SQLite. Die heute synchronen `PipelineStore`-Aufrufe müssen für den dauerhaften Store explizit angepasst werden; insbesondere muss das erste Speichern eines Runs weiterhin vor dem ersten Provider-Aufruf abgeschlossen sein.

### Passt React Flow zur heutigen Oberfläche?

Technisch ja, als bewusst abgegrenztes Modul. Heute enthalten `src/dashboard.ts` und `src/platform-ui.ts:155` HTML/CSS/JavaScript als TypeScript-Strings. `package.json:15` baut Node-Entry-Points mit esbuild; React, React DOM, DOM-Typen und ein Browser-Bundle sind nicht eingerichtet. `tsconfig.json` verwendet Node16-Auflösung und nur `ES2022`-Bibliotheken.

React Flow setzt React, das Paket `@xyflow/react`, dessen CSS und eine bemessene Containerfläche voraus. Reacts `createRoot` unterstützt die Einbettung einzelner Komponenten in bestehende Oberflächen. Daraus folgt die Empfehlung einer separat gebauten, bei Bedarf geladenen Canvas-Komponente statt einer Migration des gesamten Dashboards. Quellen: [React Flow Quick Start](https://reactflow.dev/learn), [React createRoot](https://react.dev/reference/react-dom/client/createRoot).

Konkret: ein eigener Browser-Entry mit React/React-DOM/XYFlow, eigener DOM-/JSX-Typecheck und lokal ausgelieferten JS-/CSS-Assets; ein `mountWorkflowCanvas(element, callbacks)`-/`unmount()`-Vertrag. Der bestehende Request-Helper, Übersetzungen, Theme und die Operator-Sitzung werden über definierte Schnittstellen angebunden. Keine Tokens in Flow-Daten, Browser-Storage oder Dritt-CDNs. Navigation muss die Komponente sauber abmelden, ohne laufende Runs zu beenden. Formulare bleiben als zugängliche alternative Bearbeitung erhalten.

React Flow kann Nodes, Edges und Viewport serialisieren. Das ist ein UI-Datenformat, kein Ersatz für Pipeline-Validierung oder Laufpersistenz. [Save and Restore](https://reactflow.dev/examples/interaction/save-and-restore)

| Variante | Vorteil | Nachteil / Entscheidung |
| --- | --- | --- |
| React-Flow-Modul | Interaktion, Selektion, Zoom, Verbindungen und eigene Nodes wiederverwenden | Zusätzlicher Browser-Build und React-Laufzeit; Bundlegröße und Lifecycle messen. Empfohlen für einen echten Workflow-Editor. |
| Eigener DOM-/SVG-Editor | Passt ohne Framework in die aktuelle UI | Edge-Reconnect, Pan/Zoom, Tastaturbedienung, Undo und Touch selbst pflegen. Sinnvoll nur bei bewusst reduziertem Umfang. |
| Vollständige React-Migration | Einheitliches Framework | Viel größer als die gewünschte Integrationsschicht und nicht erforderlich. |

Der Begriff „n8n-artig“ beschreibt hier die Bedienung: Palette, Canvas, Node-Eigenschaften, Laufstatus und Freigaben in einem eingebetteten Workspace. Webhooks, Zeittrigger, Schleifen, beliebige Code-Nodes, Credentials-Verteilung und n8n-Kompatibilität sind damit nicht implementiert.

### Engine-Erweiterungen nach dem ersten Canvas

1. **Versionierte Anweisungen am Modellschritt:** `skillRefs`/`promptRefs` mit `{ id, version }` auflösen; Provider, Modus und `requiredTools` wie im Katalog prüfen. Den aufgelösten Inhalt im Lauf einfrieren. Fehlende Versionen sind ein Startfehler.
2. **Ausführbare Tool-Nodes:** eigener diskriminierter Typ, z. B. `kind: "tool"`, `toolName`, versioniertes Argument-Schema und typisierte Output-Bindings. `SkillRegistry.execute` mit neu autorisiertem `SkillExecutionContext` verwenden. Keine frei wählbaren Shell-Kommandos oder vom Browser gelieferten Credential-Resolver. Berechtigungen und Effekte werden nicht aus dem Node-Label abgeleitet.
3. **Fallback-Politik je Modellschritt:** geordnete `fallbackModels`, erlaubte Fehlerklassen und maximale Versuche. Jeder Versuch bekommt `attemptId`, tatsächliches Modell, Start/Ende, Ergebnis und Kosten; alle Versuche zählen zum gleichen Budget und Deadline. Jeder Kandidat muss erneut Modell-/Workspace-/Providerrechte erfüllen.
4. **Wiederholungen nach Nebenwirkungen:** bei Agent- oder Tool-Schritten keinen automatischen Wechsel nach möglicherweise bereits erfolgten Änderungen. Nur eindeutig vor der Ausführung gescheiterte Auswahl/Verbindung automatisch ersetzen; sonst manuelle Entscheidung oder nachgewiesene Idempotenz. Policy-Ablehnung, Abbruch oder erschöpftes Budget sind keine Fallback-Trigger.

## 2. Globale Prompt-Verbesserung

### Was der Vault heute bereits leistet

`PlatformSession` enthält Eigentümer, Workspace, optional Projekt/Agent und Herkunftssitzung; Nachrichten enthalten Rolle, Inhalt, Provider/Modell, Request-ID und Status (`src/platform-content.ts:38`, `:59`). Der Vault-Dienst wird von `PlatformApi` mit sichtbaren Sitzungen des jeweiligen Eigentümers versorgt, prüft eine Autorisierungsversion und erlaubt ausschließlich BitNet auf diesem Gerät (`src/platform-api.ts:96`). Damit bestehen brauchbare Datenschutz- und Berechtigungsgrenzen.

Der Scan nimmt die nächsten **sechs nicht mehr wartenden Nachrichten**, kürzt jede auf **650 Zeichen** und fragt nach einer wiederverwendbaren Instruktion (`src/platform-vault.ts:141`). Das Paket kann zufällig mehrere Sitzungen enthalten; es ist aber keine kontinuierliche Cross-Session-Musteranalyse. Die strukturiert angeforderte Antwort enthält höchstens einen Vorschlag (`:11`); die zusätzliche Parserprüfung akzeptiert technisch bis zu drei (`:156`). Diese zwei Grenzen sollten bei einer Erweiterung vereinheitlicht werden.

Vorschläge speichern Titel, Begründung, Prompt, Eigentümer, Zeit, `pending | dismissed` und Quellenpaare `{ sessionId, messageId }` (`src/platform-vault.ts:25`). Dedupliziert wird über den exakten Prompt-Hash pro Eigentümer. Pro Eigentümer bleiben höchstens 100 Vorschläge; Sortierung erfolgt nach Erstellungszeit. Am Ende des Nachrichtenbestands wird der Cursor zurückgesetzt, sodass spätere Scans erneut von vorn beginnen können (`src/platform-vault.ts:168`). Ein dauerhafter Beobachtungsstand oder eine semantische Deduplizierung existiert nicht.

Vor dem Speichern werden Autorisierung und unveränderte Quellinhalte erneut geprüft. Bei der Ausgabe müssen alle Quellen noch sichtbar sein (`:74`, `:152`). Quellenlöschung entfernt jedoch derzeit nicht automatisch die bereits gespeicherten abgeleiteten Vorschläge: `deleteSession` löscht nur die Session-Collection (`src/platform-content.ts:290`). Für ein langfristiges Musterregister ist deshalb zusätzlich eine Löschkaskade nötig.

Die Oberfläche zeigt Quellen und kann einen Vorschlag in einen neuen Chatentwurf übernehmen oder verwerfen (`src/platform-ui.ts:529`, `:542`). „Verwenden“ sendet den Prompt noch nicht und dokumentiert keine spätere Wirkung. Es gibt keine Annahme-/Bearbeitungs-/Ergebnisstatistik, keine Musterpriorität und keine automatische Aktualisierung globaler Instruktionen.

Bestehende Routen unter `/v1/platform/vault` (`src/platform-api.ts:279`): `GET /`, `GET /settings`, `GET /search?query=...&mode=text|regex`, `PATCH /settings`, `POST /scan`, `DELETE /suggestions/:id`. Der manuelle Scan liefert `202`; Konfiguration und Scan erfordern `operate`.

### Empfohlenes Ziel: Beobachtungen, Muster und Vorschläge getrennt speichern

„Global“ bedeutet zunächst **über die eigenen freigegebenen Sitzungen hinweg**. Es darf weder alle Operatoren automatisch zusammenfassen noch Workspace-Beschränkungen oder explizite Benutzerwünsche überschreiben. Für wiederkehrende Schwächen eignen sich nachvollziehbare Kategorien wie fehlende Abnahmekriterien, unklare Scope-Grenzen, wiederholte Ausgabeformat-Korrekturen oder unvollständige Prüfanforderungen. Bloße Wiederholung eines Themas ist kein Qualitätsmangel.

Vorgeschlagene Collections im vorhandenen verschlüsselten StateStore:

```ts
type PromptObservation = {
  id: string; ownerId: string; workspaceId: string;
  sessionId: string; messageId: string;
  sourceRevision: number; sourceHash: string;
  category: string; patternKey: string;
  confidence: number; observedAt: number;
  analyzerVersion: string;
};

type PromptPattern = {
  id: string; ownerId: string;
  scope: "owner" | "workspace"; workspaceId?: string;
  category: string; patternKey: string;
  evidenceIds: string[]; distinctSessions: number;
  firstSeenAt: number; lastSeenAt: number;
  confidence: number; priority: number; priorityReasons: string[];
  status: "candidate" | "confirmed" | "dismissed" | "resolved";
  revision: number;
};

type PromptImprovement = {
  id: string; ownerId: string; patternId: string; patternRevision: number;
  instruction: string;
  suggestedScope: "session" | "workspace" | "owner";
  status: "proposed" | "accepted" | "edited" | "dismissed";
  catalogRef?: { id: string; version: number };
  revision: number;
};
```

Diese Typen sind ein Vorschlag, keine vorhandenen DTOs. `platform.prompt-observations`, `platform.prompt-patterns`, `platform.prompt-improvements` und später `platform.prompt-feedback` erhalten owner-/workspacebezogene Schlüssel, Mengenlimits und eine begrenzte Aufbewahrung. Keine vollständigen Transkripte in den Ableitungen duplizieren. Auch Hashes und Quellen-IDs gelten als private Daten. Eine verschlüsselte Snapshot-Collection ist für den begrenzten ersten Umfang geeignet; große Korpora brauchen später ein eigenes transaktionales, weiterhin verschlüsseltes Datenmodell, da derzeit jeder Commit den Gesamtsnapshot schreibt.

**Analyseablauf:**

1. Autorisierte abgeschlossene Gesprächsturns mit User-Anweisung, Antwort und gegebenenfalls folgender Korrektur auswählen; Budget-, Zeit- und Zeichenlimit beibehalten. Einzelne technische Providerfehler sind kein Beleg für schwache Prompts.
2. Bereits analysierte `(owner, session, message, revision/hash, analyzerVersion)` überspringen. Bearbeitungen erneut prüfen; kopierte/forked Nachrichten nicht als unabhängige Belege zählen (`parentSessionId`). Ein dauerhafter High-Water-Mark mit Änderungsprüfung ersetzt den umlaufenden Batch-Cursor.
3. Auszüge ausdrücklich als unzuverlässige Daten behandeln. Der lokale Analyst erzeugt begrenzte, schemavalidierte Beobachtungen mit existierenden Quellen; kein Toolaufruf und kein Memory-Schreiben aus Gesprächsinhalten.
4. Beobachtungen anhand kontrollierter Kategorien und normalisierter Muster gruppieren. Für einen Vorschlag mindestens zwei unabhängige Sitzungen fordern; stärkere Aussagen erst bei mehreren konkreten Korrekturen. Schwache oder widersprüchliche Belege als Kandidaten belassen.
5. Priorität transparent aus unabhängigen Sitzungen, wiederholten Korrekturen, Aktualität und Konfidenz bestimmen. Infrastrukturfehler herausfiltern. Ablehnung und schon angenommene ähnliche Vorschläge reduzieren die Priorität. Formel, Zeitfenster und Nenner versionieren; keinen unkalibrierten Modell-Score als gemessene Wirksamkeit darstellen.
6. Vor Speicherung und Anzeige sämtliche Quellen-/Scope-Rechte erneut prüfen. Bei Löschen, Widerruf oder Inhaltsänderung Beobachtungen entfernen bzw. invalidieren und Musterzähler/Vorschläge neu berechnen. Dashboard höchstens die wichtigsten fünf aktiven Vorschläge mit Begründung, Quellen, vorgeschlagenem Geltungsbereich und letzter Beobachtung zeigen.

Vorgeschlagene additive API: `GET /v1/platform/prompt-insights?workspaceId=...`, `POST /v1/platform/prompt-insights/scan`, `POST /v1/platform/prompt-insights/:id/decision` mit `expectedRevision`, `decision`, optional bearbeitetem Text und Scope. Entscheidungen dürfen nur dem authentifizierten Eigentümer zugeordnet werden. Scan-Ausgabe nennt analysierte/übersprungene Einheiten, Fenster und Fehlerstatus ohne Rohtexte.

Eine Annahme kann einen versionierten Katalog-Prompt erzeugen (`src/platform-catalog.ts:114`, `:162`) oder eine Memory-Kandidatur mit Herkunftsbezug (`src/platform-content.ts:91`). Die Anwendung erfolgt erst über die vorhandene Auswahl bzw. einen explizit eingerichteten Standard. Laufende Gespräche und Systemprompts werden nicht rückwirkend umgeschrieben. Priorisierung und Anwendung sind getrennte Entscheidungen.

### Optionaler aggregierter Feedback-Loop

Zunächst pro Verbesserung erfassen: angezeigt, angenommen/bearbeitet/verworfen, tatsächlich in Request X mit Katalogversion Y verwendet, Nutzerbewertung und erneute Korrektur. Ein Klick auf „Verwenden“ ist weder ein ausgeführter Request noch ein Erfolg. Dafür muss der Request-Kontext die Version und Improvement-ID protokollieren; das heutige Nachrichtenschema enthält diese Verknüpfung nicht vollständig.

Die erste Auswertung bleibt lokal und eigentümerbezogen. Ein späterer gemeinsamer Report benötigt eine gesonderte Opt-in-Einstellung, ein konfiguriertes Minimum unabhängiger Beteiligter und Unterdrückung kleiner Gruppen. Nur Zähler über ausreichend große Zeitfenster exportieren; keine Auszüge, Prompts, Session-IDs, Repo-Namen oder seltenen Musterlabels. Das ist keine garantierte Anonymisierung. Feedback dient zunächst der Vorschlagsreihenfolge, nicht automatischem Training oder stillen globalen Regeländerungen. Vorher/nachher-Vergleiche nach Aufgabenart, Provider, Version und Zeitraum trennen; ohne kontrollierten Vergleich keine kausale Qualitätssteigerung behaupten.

## 3. Akido und GitHub im neuen Git-Workspace

### Verifizierter Verfügbarkeitsstand

Prüfung vom 8. September 2026 über lesende GitHub-API-Abfragen, lokale HTTP-GETs und einen reinen MCP-Hilfeaufruf. Das private [Akido-Repository](https://github.com/homeofe/akido-mcp) war über die vorhandene GitHub-Anmeldung zugänglich; der öffentliche Webabruf konnte es nicht laden. Geprüfter `main`-Commit: [`78b457699ac66bf06506f643d67d65daf31707d2`](https://github.com/homeofe/akido-mcp/commit/78b457699ac66bf06506f643d67d65daf31707d2), Commitdatum 19. Juli 2026. Das Repository meldete ein späteres `pushed_at`; dies beweist keinen neueren Stand dieses Branches. Der laufende Dienst wurde nicht einer Binärversion oder diesem SHA zugeordnet.

| Nachweis | Ergebnis und Grenze |
| --- | --- |
| `GET http://127.0.0.1:3334/status` | HTTP 200, HTML „Elvatis · akido Command Center“. Erster Aufruf über `localhost`/PowerShell lief in ein Timeout; der direkte IPv4-Aufruf funktionierte. |
| `GET http://127.0.0.1:3334/mcp` | HTTP 404. Port 3334 ist damit beim geprüften Dienst kein beobachteter MCP-HTTP-Endpunkt. |
| MCP-Werkzeugmetadaten dieser Sitzung | 98 Akido-Werkzeuge sind für diesen Client exponiert, darunter `github_activity`, `git_status`, `git_diff`, `git_log`, `task_create`, `akido_review_diff`, `akido_create_pr_package` und Projektstatus-Werkzeuge. Das ist mehr als eine README-Behauptung, aber kein Funktionstest aller Tools. |
| `mcp_help({})` | Erfolgreich beantwortet, ohne Fehler. Seine statische Überschrift nennt „93 tools“; diese Zahl ist keine verlässliche Inventur. |
| `GET /api/gh-stats?repo=elvatis/conduit-bridge` auf Port 3334 | Antwort: `prs: 0`, `issues: 0`, `ci: "success"`, kein Fehlerfeld. Dies bestätigt die API-Form, nicht vollständige oder branchbezogene GitHub-Daten. Der Handler kann CLI-Fehler zu leeren Listen umwandeln. |
| Vault-/Graph-/Forge-Funktionen | Im Repository als interne TypeScript-Funktionen bzw. Dashboard-Funktionalität vorhanden, aber keine separaten `vault`, `insights`, `graph` oder `forge` MCP-Tools in der exponierten Liste. |

Die Aufteilung entspricht dem Quellcode: stdio-MCP plus Dashboard auf `httpPort + 1`, standardmäßig 3334; der alternative HTTP-Modus bedient `/mcp` auf `httpPort`. Der konkrete aktive MCP-Transport dieser Clientverbindung wurde damit noch nicht ermittelt. Ein HTML-Statusdienst ist kein allgemeiner Tool-Proxy. Quellen: [Akido-Transport](https://github.com/homeofe/akido-mcp/blob/78b457699ac66bf06506f643d67d65daf31707d2/src/index.ts#L1911), [GitHub-Statistikhandler und Fehlerbehandlung](https://github.com/homeofe/akido-mcp/blob/78b457699ac66bf06506f643d67d65daf31707d2/src/index.ts#L1523).

Nicht ausgeführt: GitHub-Schreibaktionen, Workflows, Fetch/Pull/Push, Remote-Shell, Akido-Review-/LLM-Aufträge, Memory-/Cache-Schreibwerkzeuge oder Änderungen an Dienstkonfiguration und Credentials. Der erfolgreiche MCP-Hilfeaufruf beweist die Verbindung; Backend-Rechte und Funktionsfähigkeit anderer Dienste bleiben ungeprüft.

### Bestehendes Conduit sollte die lokale Git-Schicht behalten

`src/git-workspace.ts:11`, `:95`, `:188` liefert Graph, Branches, Worktrees, Status und begrenzte Diffs aus einem serverseitig registrierten lokalen Workspace. `realpath` und Workspace-Grenzen verhindern das Öffnen nicht zugelassener Worktrees. Git wird mit Argumentlisten und ohne ausgegebenes stderr ausgeführt. Die API authentifiziert Plattformoperatoren und verlangt Workspace-Rechte (`src/repository-api.ts:23`, `:58`).

| Bestehende Route | Wesentliche Eingabe / Ausgabe |
| --- | --- |
| `GET /api/git-workspace/snapshot` | `workspaceId`, optional `worktree`, `allBranches`, `branch`; Ausgabe `branches`, `worktrees`, `commits` inklusive Graph-Lanes, `files`, `head`, `truncated`, `updatedAt`. |
| `GET /api/git-workspace/diff` | `workspaceId`, optional `worktree`, `mode: history | changes`, `commit`, `path`; Ausgabe Patch, Dateiliste, Additions/Deletions, Binary-/Truncation-Status. |
| `POST /api/git-workspace/action` | `workspaceId`, `action: fetch | pull | push | create-branch | add-worktree`, optional `worktree`, `name`. Bereits vorhandene Mutationen, hier nicht ausgeführt. |
| `GET /v1/analytics/repositories`, `GET /v1/analytics/repository` | Registrierte Repository-Auswahl und lokale Auswertung mit Branch-Auswahl. |

Pull verwendet `--ff-only` und verlangt einen sauberen Workspace, Push einen expliziten Upstream ohne Force, neue Worktrees liegen in `.conduit-worktrees` (`src/git-workspace.ts:319`, `:324`, `:335`). Das sind lokale Git-Funktionen; PRs, Issues, Reviews und GitHub-Checks sind zusätzliche Remote-Metadaten.

Akidos `git_status`, `git_diff` und `git_log` arbeiten dagegen über SSH unter `~/workspace/<repo>` oder einem Remote-Absolutpfad. Sie liefern Text und keine zu Conduit passende Commit-/Graph-/Worktree-Struktur. Besonders relevant: `repo` wird in den geprüften Handlern ungequotet in `cd ... && git ...` eingesetzt. Diese Handler sind ohne vorgelagerte feste Pfadzuordnung und sichere Remote-Argumentbehandlung kein geeigneter Proxy für Eingaben aus dem Browser. Das ist ein im Quellcode belegter Integrationsblocker; es wurde kein Angriff ausgeführt. [Akido Git-Werkzeuge](https://github.com/homeofe/akido-mcp/blob/78b457699ac66bf06506f643d67d65daf31707d2/src/tools/git-tools.ts#L27)

### GitHub nicht neu erfinden: vorhandene Adapter ergänzen

`src/github-api.ts:13` bietet bereits einen auf `https://api.github.com` begrenzten Client mit Credential-Resolver, Redirect-Verbot, 30-Sekunden-Timeout, 2-MiB-Antwortlimit und bereinigten Fehlermeldungen. `src/providers/github-projects.ts` und `src/integration-api.ts:144` unterstützen Projects samt Workspace-Verknüpfung. `src/skills/github-actions.ts:45` bietet Workflow-Dispatch und das Lesen expliziter Runs; dabei ist schon die reine Run-Inspektion aktuell adminpflichtig.

Wichtige Lücke: `github-actions/list-runs` filtert auf `event=workflow_dispatch` (`src/skills/github-actions.ts:88`). Dieser bestehende Pfad bildet nicht alle PR-/Push-CI-Läufe ab. Ein Git-Workspace-Checkpanel muss passend zum ausgewählten Commit/PR alle relevanten Runs und Checks abfragen. Der neueste Repo-Run oder Akidos einzelnes `ci: success` darf nicht als Freigabe für den aktuellen HEAD angezeigt werden.

Vorgeschlagene `GitHubRepositoryService` auf dem vorhandenen Client:

```ts
type RepositoryRemoteLink = {
  workspaceId: string;
  host: "github.com";
  owner: string;
  repo: string;
  // Credential-Referenz nur serverseitig, niemals Bestandteil des UI-DTO.
};

type RepositoryRemoteSummary = {
  repository: { host: string; owner: string; name: string };
  headSha?: string;
  prs: { state: "ok" | "unavailable"; count?: number };
  issues: { state: "ok" | "unavailable"; count?: number };
  checks: { state: "ok" | "unavailable"; headSha?: string; data: unknown[] };
  fetchedAt: number;
  truncated: boolean;
};
```

Vorgeschlagene Routen: `GET /api/git-workspace/github/summary?workspaceId=...&commit=...`, `/pulls`, `/issues`, `/checks`. Eingaben identifizieren einen zugelassenen Workspace; Owner/Repo und Credential werden serverseitig aufgelöst, nicht frei aus dem Browser übernommen. Eine per Git-Remote vorgeschlagene Zuordnung vor Speicherung anhand eines erlaubten Hosts validieren, credentialhaltige URLs nie anzeigen. Projects-Verknüpfung und Repository-Verknüpfung sind getrennt: ein Project kann mehrere Repositories enthalten.

Erste UI-Funktionen: PR des ausgewählten Branches/Commits, Review-Anforderungen und Draft-Status, verlinkte Issues, Check-/Workflow-Status mit Run-ID und HEAD-SHA, Zeitstempel und Links zur Quelle. Fehler, fehlende Berechtigung, Rate-Limit und abgeschnittene Pagination sichtbar unterscheiden; „unbekannt“ darf nicht zu null oder grün werden. Cache nach Operator/Credential-Berechtigungsstand, Repository und Commit trennen, kurze TTL, begrenzte Parallelität und Invalidierung nach Berechtigungsänderung.

PR-Erstellung, Issue-Erstellung, Review-Abgabe, Merge und Workflow-Dispatch sind ein späteres separates Paket mit Vorschau, konkretem Ziel und Audit. Für Merge ist eine erneute Prüfung desselben HEAD nötig. Git-Mutationen, GitHub-Mutationen und Provider-Ausführung behalten jeweils ihre Rechteprüfung; ein Approval im Canvas ist keine pauschale Administrationsvollmacht.

### Welche Akido-Funktionen bringen darüber hinaus Nutzen?

| Funktion | Verifiziertes Angebot | Nutzbare Integration / Einschränkung |
| --- | --- | --- |
| `github_activity` | Als MCP-Tool exponiert; Handler im Repo vorhanden | Cross-Repo-Digest mit Issues, gemergten PRs, CI-Fehlern und Sternen. Gute Vorlage für Überblick, aber keine vollständige PR-API. Fehler werden teilweise geschluckt; Resultate sind begrenzt. Der Handler schreibt einen Stern-Cache per SSH und wurde deshalb nicht aufgerufen. |
| `akido_create_pr_package`, `akido_review_diff`, `akido_debug_error`, `akido_review_selection` | Als MCP-Tools exponiert | Strukturierte Vorschläge für PR-Text und Reviews. Später als expliziter Benutzerauftrag nutzbar; Providerwahl, Datenversand und Kosten offenlegen. Intent-Handler besitzen automatisches Vault-Speichern, daher keine reinen Leseoperationen. PR-Paket erzeugen ist nicht PR erstellen. |
| `task_create` | Als MCP-Tool exponiert | GitHub-Issue-Erstellung. Passt zu „Finding als Issue übernehmen“ mit bearbeitbarem Entwurf, Repository-/Label-Scope und einer einzelnen bewussten Schreibaktion. In dieser Prüfung nicht ausgeführt. |
| `project_status`, `project_next_actions`, `project_blockers`, `aahp_staleness` | Als MCP-Tools exponiert | Ergänzung des Repository-Dashboards um Handoff-/Blockerinformationen. Remote-Projekt auf registrierten Conduit-Workspace abbilden, Quellenzeitpunkt und Host zeigen; keine automatische globale Projektsuche. |
| `git_sync_status`, `deploy_status` | Als MCP-Tools exponiert | Nützlich für Deployment-Drift. Sync-Status führt Fetch aus; nicht unter einem effektfreien Refresh verstecken. Für Deployment einen getrennten expliziten Statusauftrag und bekannte Hosts verwenden. |
| `kanban`, `akido_agenda`, `akido_eod`, Briefing-Werkzeuge | Als MCP-Tools exponiert | Optionaler persönlicher Aufgabenüberblick. Bei gemischten Aktionen Lesen/Schreiben einzeln klassifizieren. Kalender, tägliche Aufzeichnungen und Kommunikationskanäle sind zusätzliche Datenbereiche, kein notwendiger Bestandteil des Git-Panels. |
| `deriveInsights`, `computeMemoryInsights`, `buildGraph` | Interner Repo-Code; kein entsprechendes MCP-Tool exponiert | Ideen für belegte Karten/Graphen. Die Insights erkennen offene Bug-Notizen, Projektverknüpfungen und aktuelle Entscheidungen; sie optimieren keine Gesprächsprompts. Die Heuristik „späterer Review/Log im Projekt bedeutet angesehen“ ist kein Nachweis der Fehlerbehebung. |
| `ForgeClient` | Interner Repo-Code | Normalisiert GitHub/Forgejo-Repos, Issues und PRs. CI liefert für Forgejo bewusst `null`. Als Designvorlage für spätere Multi-Forge-Unterstützung brauchbar; nicht als funktionierende Forgejo-CI-Integration ausgeben. |

Quellen: [GitHub-Digest mit Cache-Schreibpfad](https://github.com/homeofe/akido-mcp/blob/78b457699ac66bf06506f643d67d65daf31707d2/src/tools/github-activity.ts#L45), [Intent-Handler und Autosave](https://github.com/homeofe/akido-mcp/blob/78b457699ac66bf06506f643d67d65daf31707d2/src/tools/intents.ts#L21), [Vault-Insights](https://github.com/homeofe/akido-mcp/blob/78b457699ac66bf06506f643d67d65daf31707d2/src/tools/vault.ts#L317), [Forge-Client](https://github.com/homeofe/akido-mcp/blob/78b457699ac66bf06506f643d67d65daf31707d2/src/forge/client.ts#L203).

### Adapter- und Sicherheitsgrenzen

Conduit enthält derzeit einen `SkillRegistry`, aber keinen allgemeinen Akido-MCP-Client. Die MCP-Bezeichnungen im CLI-Toolkatalog (`src/cli-mode.ts:210`) beschreiben Provider-Fähigkeiten; sie stellen keine Verbindung zu Port 3334 her.

Ein späterer Akido-Adapter gehört auf die Serverseite und exponiert eine kleine Allowlist eigener `SkillDefinition`s. Er braucht eine ausdrücklich konfigurierte Verbindung mit Transport, Endpoint/Prozess, Serveridentität und Schema-Version; Werkzeugerkennung verifiziert Namen und Eingabeschema. Browser dürfen weder beliebige Toolnamen/URLs noch SSH-Pfade wählen. Die heute im Codex-Client verfügbare Akido-Verbindung steht einem laufenden Conduit-Server nicht automatisch zur Verfügung.

Der Akido-HTTP-Code schützt nicht-GET-Dashboard-Aktionen mit `X-Dashboard-Token` oder Loopback-Prüfung; das ist kein workspacebezogenes Berechtigungsmodell. Die `/mcp`-Transportbehandlung liegt außerhalb dieses Dashboard-Gates. Ein pauschaler Browser-Proxy würde deshalb Conduits Rechte unterlaufen. Für Netzwerkfreigabe des Dienstes sind eine eigene authentifizierte Grenze, feste Ziel-Allowlist und Secret-Isolation erforderlich; localhost allein ist keine Benutzer-/Workspace-Identität. [Dashboard-Gate](https://github.com/homeofe/akido-mcp/blob/78b457699ac66bf06506f643d67d65daf31707d2/src/index.ts#L1262), [MCP-HTTP-Pfad](https://github.com/homeofe/akido-mcp/blob/78b457699ac66bf06506f643d67d65daf31707d2/src/index.ts#L1945)

Toolantworten, PR-Texte, Logs und Vault-Notizen sind unzuverlässige Daten: escaped darstellen, Größenlimits prüfen, keine darin enthaltenen Anweisungen in Routing oder Berechtigungen übernehmen. Tokens bleiben im Server-Vault. Autorisierung vor jedem Versuch erneuern, Timeouts/Abbruch propagieren und nur redigierte Metadaten auditieren. Verbindungsfehler dürfen nie einen automatischen Start eines breit berechtigten Akido-Prozesses auslösen; dessen Startpfad kann bereits Memory synchronisieren.

## 4. Priorisierte Umsetzungspakete mit Abnahme

Die Aufwände sind technische Schätzungen in Personentagen für eine mit dem Repo vertraute Person, inklusive zielgerichteter Tests und Review. Sie sind keine gemessenen Zeiten. Sie setzen die stabilisierte aktuelle UI voraus; keine gleichzeitige Migration aller Oberflächen, kein n8n-Import und keine zusätzliche Cloud-Infrastruktur sind enthalten.

| Priorität / Paket | Umfang und Abhängigkeit | Aufwand | Konkrete Abnahme |
| --- | --- | --- | --- |
| P0 – C0: Graph-Vertrag und Persistenz | Workflow-DTO, Roundtrip-Adapter, revisionsgeprüfte Plattform-API, verschlüsselte Collection, kontrollierter JSON-Import | 3–5 PT | Bestehendes Engineering-/Governance-Preset importiert und exportiert ohne Änderung an IDs, Abhängigkeiten, Parallelgruppen und Gates. Zyklus/51. Node wird serverseitig abgewiesen. Konflikt liefert 409. Import wiederholbar ohne Duplikate, Backup/Restore enthält Layout. Neustart-Semantik der Runs bleibt ausdrücklich geprüft. |
| P0 – G0: GitHub-Leseansicht | Repository-Zuordnung und Summary/PR-/Issue-/Check-Endpunkte auf `GitHubApi`; unabhängig vom Canvas | 3–5 PT | Zwei Workspaces können keine fremden Remote-Daten lesen. Checks gehören zum angezeigten SHA. 401/403/429, Timeout, leere Daten und abgeschnittene Seiten sind unterscheidbar. Fehler bleibt unbekannt. Kein Dispatch/Fetch/Write bei Refresh. |
| P1 – C1: React-Flow-Editor | Nach C0: Palette, Drag/Connect/Reconnect, Eigenschaften, Keyboard, Layout, Laufstatus und bestehende Freigaben | 4–7 PT | 50 Nodes mit Fan-out/Fan-in bedienbar; verschieben und neu laden erhält Positionen. Engine erhält identische Definition. Zoom/Drag startet keinen Run. Keyboard-Alternative funktioniert. DE/EN und beide Themes, Navigation/unmount, lokaler Asset-Build und Bundle-Differenz geprüft. |
| P1 – P0: Musterregister | Inkrementelle Turn-Beobachtung, mindestens zwei unabhängige Sitzungen, Priorisierung und Eigentümer-/Workspace-Grenzen | 4–6 PT | Feste Testgespräche mit Korrekturen erzeugen ein Muster; Einzelhinweis und kopierter Fork zählen nicht als mehrere Sitzungen. Wiederholung des Scans erzeugt keine Duplikate. Änderung/Löschung/Widerruf entzieht Belege und aktualisiert Zähler. Providerfehler erzeugt keinen Prompt-Mangel. |
| P1 – P1: Vorschläge im Dashboard | Nach Musterregister: Top-Vorschläge, Quellen, Scope, Annahme/Bearbeitung/Verwerfen, versionierter Katalogentwurf | 2–3 PT | Jeder Vorschlag hat echte sichtbare Belege und erklärte Priorität. Annahme erzeugt genau eine Version, verändert keinen laufenden Request und aktiviert keine unbekannten Tools. Ablehnung wird respektiert; Konflikte und Autorisierungswechsel sind geprüft. |
| P2 – C2: Anweisungen und Fallbacks | Nach C1: gepinnte Skill-/Prompt-Refs, kontrollierte Modell-Fallbacks und Versuchsprotokoll | 3–5 PT | Fehlende Skill-Version und verbotener Kandidat scheitern vor Aufruf. Alle Versuche zählen zum selben Budget. Abbruch/Budget-/Policyfehler werden nicht erneut versucht. Ein möglicherweise schreibender Agent wird nach Fehler nicht automatisch erneut gestartet. |
| P2 – A0: Begrenzter Akido-Adapter | Ein bis drei nützliche Tools, verifizierter Transport, Schemapinning, serverseitige Projektzuordnung, Effektprüfung | 3–5 PT | Falscher Transport/Server und unbekannte Tools bleiben deaktiviert. Tool-Schemawechsel wird erkannt. Beliebige Browser-Pfade/URLs werden abgewiesen. GET-ähnliche Werkzeuge mit Cache/Fetch/Autosave werden als Effekt geführt. Verbundene Codex-Tools sind keine Voraussetzung für Conduit-Runtime. |
| P2 – C3: Ausführbare Tool-Nodes | Nach C2/A0: diskriminierte Nodes, typisierte Bindings, Registry-Anbindung, Freigaben pro Effekt | 3–5 PT | Reine Anweisung kann keine Toolausführung auslösen. Nicht genehmigtes Schreiben wird vor Side Effect gestoppt. Toolausgabe kann keine nächste Toolberechtigung erzeugen. Fehler-/Timeout-/Abbruchpfade lassen keine unkontrollierten Wiederholungen zu. |
| P3 – P2: Feedback-Auswertung | Nach P1: nachgewiesene Nutzung/Version, lokale Ergebnisstatistik, optional beschränkte Aggregation | 2–4 PT | Klick und echte Ausführung werden unterschieden. Version/Request-Zuordnung vorhanden. Kleine Gruppen bleiben verborgen, Opt-out/Löschen wirkt auf Ableitungen. Keine Rohprompts im Export und keine automatische globale Regeländerung. |
| P3 – G1: GitHub-Schreibaktionen | Nach G0: einzelne Issue-/PR-Entwürfe und gegebenenfalls vorhandener Workflow-Dispatch | 2–4 PT | Vorschau nennt Repo, Branch/SHA und genaue Änderung. Je Aktion aktuelle Berechtigung und Audit. Keine automatische Wiederholung unklarer Writes; Dispatch ohne Run-ID wird nicht dem neuesten Run zugeschrieben. Merge erhält eine separate Prüfung. |

Empfohlene Startreihenfolge: **C0 und G0**, anschließend **C1 und das Prompt-Musterregister**. Damit entstehen schnell sichtbarer Nutzen und belastbare Verträge. Akido dient danach als gezielte Ergänzung; die vorhandene Pipeline-, Storage-, Auth- und Git-Infrastruktur bleibt die Grundlage.

## 5. Verifikation und verbleibende Unsicherheit

Diese Prüfung hat nur die vorliegende Dokumentation hinzugefügt. Sie hat Quellcode und API-Verträge gelesen, React-/React-Flow-Primärdokumentation geprüft, Akido-Metadaten inventarisiert, die MCP-Hilfe erfolgreich aufgerufen und die genannten lokalen HTTP-GETs geprüft. Sie hat keine ausführende Integration installiert oder funktional getestet. Die Testergebnisse des vorhandenen Workspace-Standes belegen keine bereits umgesetzte Canvas-, Musterregister- oder Akido-Integration.

Relevante bestehende Tests für die Umsetzung: `test/pipelines.test.ts`, `test/pipeline-http.test.ts`, `test/platform-vault.test.ts`, `test/git-workspace.test.ts`, `test/github-api.test.ts`, `test/github-projects.test.ts`, `test/skills/github-actions.test.ts`, `test/platform-http.test.ts`. Neue Tests sollen vor allem Roundtrip-Semantik, Quellen-/Berechtigungswiderruf, richtige SHA-Zuordnung und die Vermeidung doppelter Nebenwirkungen abdecken.

Noch nicht nachgewiesen sind die exakte Akido-Runtime-Version, die Funktionsfähigkeit aller 98 exponierten Tools, die Berechtigungen sämtlicher dahinterliegender Dienste und der konkrete Aufwand/Bundlegewinn eines React-Flow-Prototyps. Diese Punkte gehören in die jeweiligen Abnahmepakete und sind keine Voraussetzung dafür, C0, G0 und die lokale Musteranalyse zu beginnen.
