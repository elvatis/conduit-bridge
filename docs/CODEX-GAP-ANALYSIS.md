# Conduit und Codex: belegte Funktionslücken

Stand: 08.09.2026. Geprüft wurde Conduit `cb87534` **einschließlich der laufenden,
noch nicht eingecheckten Änderungen**. Codex-Quellen wurden aus dem ausdrücklich
angefragten öffentlichen Repository `openai/codex`, Branch `main`, gelesen.
Die Quellenlinks auf `main` können sich ändern. Dies ist eine Quellcodeanalyse,
kein neuer Live-Test mit Modellen oder eine Sicherheitszertifizierung.

**Ergebnis:** Die nächste wesentliche Ausbaustufe ist ein gemeinsames
Task-/Turn-Laufzeitmodell mit bidirektionaler Provider-Anbindung. Zusätzliche
Ansichten allein lösen die Lücken bei Fortsetzung, Nachsteuerung und Freigaben
nicht. Die vorhandenen Speicher-, Rechte- und Budgetgrenzen sollten dabei
weiterverwendet werden.

## Vergleichsgrenze

CLI, SDK und App-Server sind öffentlich zugängliche Codex-Komponenten. Der
App-Server liefert ein Integrationsprotokoll für Rich Clients. Daraus folgt
keine vollständige Offenlegung der Desktop-Oberfläche, ihrer Fensterverwaltung
oder ihres Sidebar-Verhaltens. Die offizielle Übersicht bezeichnet IDE-Erweiterung
und Cloud ausdrücklich als nicht quelloffen. Desktop-UX wird hier daher als
Produktziel von nachgewiesenen offenen Protokollfunktionen getrennt.
[Open-Source-Übersicht](https://learn.chatgpt.com/docs/open-source),
[App-Server-Dokumentation](https://learn.chatgpt.com/docs/app-server).

## Bereits vorhanden oder in Arbeit

- **Vorhanden:** gespeicherte Chats mit Branching und Kontextprüfung, native
  CLI-Fortsetzung für passende Chat-Verläufe, begrenzte Runs, Freigabe-Gates,
  Rollen/Workspace-Prüfungen, parallele Pipeline-Schritte, Prompt-Splitting und
  ausführbare Skills. Diese Funktionen sind keine Neuentwicklungs-Lücken.
- **In diesem Branch umgesetzt:** gemeinsame Effort-Steuerung und Fast Mode sowie Execution-UI
  mit ersten strukturierten Codex-Ereignissen. Belege:
  [effort-slider.ts](../src/ui/effort-slider.ts),
  [fast-mode.ts](../src/fast-mode.ts),
  [execution-events.ts](../src/execution-events.ts).
- **In diesem Branch integriert, nicht erneut einplanen:** Repository-Analysen und Git-Workspace-
  Ansichten einschließlich History/Diffs/Branches/Worktrees. Belege:
  [repository-analytics.ts](../src/repository-analytics.ts),
  [git-workspace.ts](../src/git-workspace.ts). Routen, Zugriffskontrollen und
  Navigation sind integriert; UI- und Git-Fixture-Prüfungen sind in
  [der Validierung](validation/execution-workspace.md) dokumentiert.

## Priorisierte Lücken

P1 bedeutet nächster funktionaler Schwerpunkt; P2 folgt darauf. Die Einstufung
ist eine Produktpriorität und keine Behauptung einer Sicherheitslücke.

### P1: Eine Aufgabe über mehrere Turns fortsetzen

**Conduit:** `exSubmit()` erzeugt immer einen neuen `/runs`-Datensatz. Eine
ausgewählte Execution-Aufgabe wird durch eine weitere Nachricht nicht fortgesetzt.
Webchat-Sessions bilden einen separaten Pfad. `withCliSession()` verwendet native
Sitzungen nur im Chatmodus; `PlatformRunService` bietet für Agent-Runs keinen
Fortsetzungs-Turn und verbietet bewusst blindes Retry nach Seiteneffekten.
Belege: [execution.ts, exSubmit](../src/ui/execution.ts#L277),
[session-registry.ts, withCliSession](../src/session-registry.ts),
[platform-runs.ts, action](../src/platform-runs.ts#L198).

**Codex:** Das SDK modelliert einen `Thread` mit mehreren aufeinanderfolgenden
Turns; das Protokoll bietet `thread/resume` und `thread/fork`.
[SDK Thread](https://github.com/openai/codex/blob/main/sdk/typescript/src/thread.ts),
[Thread-Protokoll](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/common.rs#L519).

**Abnahme:** Nach Antwort und Browser-Neuladen bleibt dieselbe Task-ID erhalten;
eine zweite Nachricht erzeugt einen neuen Turn mit nachvollziehbarer Historie.
Agent-Fortsetzung, neue Aufgabe und Branch sind getrennte Aktionen. Workspace,
Provider-Profil und Berechtigungen werden erneut geprüft; abgeschlossene Tools
werden nicht nochmals ausgeführt.

### P1: Live-Nachsteuerung und ehrliche Pause-/Stop-Semantik

**Conduit:** Der Nachrichtenendpunkt weist parallele Sends mit 409 ab.
Run-Aktionen kennen `cancel`, `approve`, `reject`, `retry`, aber kein Steering.
„Pause updates“ verändert nur `exState.paused` und stoppt UI-Polling. Die
Oberfläche erklärt dies bereits korrekt. Belege:
[platform-api.ts, sessions/messages](../src/platform-api.ts),
[execution-workspace.ts, ex-live-pause](../src/ui/execution-workspace.ts#L132),
[platform-runs.ts, action](../src/platform-runs.ts#L198).

**Codex:** `turn/steer` adressiert den aktiven Turn mit `expectedTurnId`;
`turn/interrupt` unterbricht ihn. Ein generisches `turn/pause` zum Einfrieren
und späteren Fortsetzen desselben Prozesses wurde in den geprüften öffentlichen
Methoden **nicht gefunden**. `thread/resume` ist kein Beleg dafür.
[Steering-Vertrag](https://learn.chatgpt.com/docs/app-server#steer-an-active-turn),
[Turn-Methoden](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/common.rs#L977).

**Abnahme:** Eine Korrektur landet genau einmal im adressierten aktiven Turn;
veraltete Turn-IDs scheitern sichtbar. Provider ohne Steering bieten explizit
„Nachricht für danach“ oder „Stoppen und fortsetzen“. Eine echte kooperative
Pause müsste an Tool-Grenzen weitere Dispatches verhindern und ihren Zustand
serverseitig bestätigen. Ein Anzeigenstopp darf dafür nicht stehen.

### P1: Vollständiges, wiederherstellbares Ereignisprotokoll

**Conduit:** Erste `command`, `message` und `plan`-Events sind implementiert.
Der Codex-Parser lässt Dateiänderungen, MCP-Aufrufe und Web-Suche derzeit weg;
`cli-codex.chatStream()` liefert erst nach `chat()` den fertigen Text.
Die Execution-Ansicht pollt Snapshots. Es gibt noch keinen allgemeinen
sequenzierten Item-Verlauf mit Reconnect-Cursor über alle Provider.
Belege: [ExecutionEvent](../src/types.ts#L137),
[Codex-Parser](../src/execution-events.ts#L32),
[chatStream](../src/providers/cli-codex.ts#L342),
[Execution-Polling](../src/ui/execution.ts#L231).

**Codex:** Der öffentliche SDK-Item-Vertrag unterscheidet unter anderem
Dateiänderungen, MCP-Tool-Aufrufe, Web-Suche und Fehler neben Befehlen und Text.
[SDK Items](https://github.com/openai/codex/blob/main/sdk/typescript/src/items.ts).

**Abnahme:** Befehlsstart, laufende Ausgabe, Exit-Code, Dateipatch und Tool-Ergebnis
haben stabile IDs. Reconnect dupliziert keine Items; persistierte Endzustände
überleben einen Neustart. Abgeschnittene Ausgaben sind erkennbar. Nur öffentliche
Provider-Ereignisse werden dargestellt, kein erfundener interner Denkverlauf.

### P1: Freigaben für konkrete laufende Aktionen

**Conduit:** Run-/Pipeline-Gates sind vorhanden. Sie ersetzen keine Rückfrage
des laufenden Providers zu einem bestimmten Befehl oder Dateipatch. Das
Provider-Interface hat dafür keinen Request/Response-Kanal; CLI-Policies werden
vor dem Prozessstart als Flags gesetzt. Belege:
[ProviderAdapter](../src/types.ts), [cliPermissionArgs](../src/cli-mode.ts#L404),
[Run-Freigabe](../src/platform-runs.ts#L205).

**Codex:** Serveranfragen unterscheiden Command-, FileChange- und zusätzliche
Permission-Freigaben sowie strukturierte Benutzerrückfragen.
[Server Requests](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/common.rs#L1655).

**Abnahme:** Eine Freigabe zeigt den konkreten Befehl/Patch, Workspace und Umfang,
bindet an Task/Turn/Item/Request-ID und kann nach UI-Neuladen beantwortet werden.
Ablehnung, Ablauf, Widerruf und doppelte Antworten sind getestet. Eine frühere
Run-Freigabe erteilt keine unbegrenzte spätere Berechtigung.

### P2: Zustandsbehaftete Zusammenarbeit mehrerer Agenten

**Conduit:** Pipelines und `split-execute` führen reale parallele Abhängigkeits-
wellen aus. Deren Schritte sind jedoch keine dauerhaft adressierbaren
Kind-Agenten mit eigener Unterhaltung, Mailbox und Follow-up-Lebenszyklus.
Belege: [runPipeline](../src/pipelines.ts#L924),
[splitExecute](../src/skills/split-execute.ts#L9).

**Codex:** Der offene Handler besitzt Spawn-, SendInput-, Wait-, Resume- und
Close-Operationen für Agenten sowie vererbte Laufzeitkonfiguration.
[Multi-Agent-Handler](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/multi_agents.rs).

**Abnahme:** Zwei Kind-Agenten laufen unabhängig; ein Follow-up adressiert nur
das ausgewählte Kind. Eltern-ID, Status, Budget, Workspace und Ergebnisse sind
persistent. Abbruch und Kindfehler haben definierte Auswirkungen auf die Eltern-
Aufgabe. Statische DAG-Schritte bleiben als einfachere Ausführungsform erhalten.

### P2: Fähigkeiten pro Modell und Transport verhandeln

**Conduit:** Modellkatalog, Kontextgrenzen und Provider-Effort-Mappings existieren;
Fast Mode wird gerade ergänzt. `ModelDefinition` enthält noch keinen vollständigen
Vertrag für zulässige Efforts, Eingabemodalitäten, Steering, native Fortsetzung,
Tool-Events und interaktive Freigaben. Belege: [ModelDefinition](../src/types.ts),
[effortCapabilities](../src/effort.ts), [supportsFastMode](../src/fast-mode.ts).

**Codex:** `model/list` liefert modellbezogene Reasoning-Optionen und Modalitäten.
[Modelldiscovery](https://learn.chatgpt.com/docs/app-server#models).

**Abnahme:** Alle Composer nutzen denselben Capability-Datensatz. Nicht unterstützte
Optionen sind deaktiviert oder werden vor Dispatch erklärt. Fast Mode und Effort
bleiben unabhängig. Installierte CLI-Version, Account-Verfügbarkeit und
experimentelle Protokollfunktionen sind keine aus Modellnamen geratenen Zusagen.

### P2: MCP-/Plugin-Lebenszyklus statt Katalog-Verknüpfung

**Conduit:** Ausführbare `SkillRegistry`, versionierte Instruktionen und einzelne
Integrationen sind vorhanden. „Skills & plugins“ öffnet derzeit den Library-Tab.
MCP-Einträge in `KNOWN_TOOLS` sind Beschreibungen, kein allgemeiner MCP-Client mit
Discovery, OAuth, Ressourcen und Verbindungszustand. Belege:
[SkillRegistry](../src/skills/index.ts), [KNOWN_TOOLS](../src/cli-mode.ts#L210),
[Marketplace-Verknüpfung](../src/ui/execution-workspace.ts#L135).

**Codex:** Das Protokoll führt Plugin-/Skill- und MCP-Operationen.
Die Dokumentation markiert einzelne Plugin-Operationen als noch in Entwicklung;
deren Vorhandensein ist keine Produktionsfreigabe.
[Protokoll](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/common.rs),
[MCP und Plugin-API](https://learn.chatgpt.com/docs/app-server).

**Abnahme:** Ein freigegebener Test-MCP-Server kann verbunden, authentifiziert,
inspiziert und getrennt werden. Tool-Aufrufe durchlaufen die vorhandene Policy.
Deaktivierte Plugins sind nicht aufrufbar; Version und Herkunft sind sichtbar.

### P2: Workspace-/Navigationszustand mit Aufgaben verknüpfen

**Conduit:** Registrierung, Pfadgrenzen und Task-Filter bestehen bereits;
Pins werden browserlokal gespeichert. Git-Ansicht und Repository-Analysen sind
parallel in Umsetzung. Offen bleibt eine gemeinsame Zuordnung von Task,
Arbeitskopie/Worktree, geöffnetem Diff und wiederherstellbarer Navigation.
Belege: [WorkspaceManager](../src/workspaces.ts),
[Pins](../src/ui/execution-workspace.ts#L125),
[GitWorkspace](../src/git-workspace.ts).

**Abnahme:** Nach Neuladen öffnet dieselbe Aufgabe die richtige Arbeitskopie und
Ausgabe. Ein Wechsel der Git-Ansicht ändert nicht still den Arbeitsordner eines
laufenden Agenten. Pins und Archive folgen einer ausdrücklichen Nutzer-/Server-
Strategie. Die Desktop-Anordnung selbst bleibt ein eigenständiges UX-Ziel.

## Nächste Umsetzungspakete

1. **Laufzeitbasis:** providerneutrale Task/Turn/Item-IDs und Capability-Vertrag;
   für Codex einen optionalen App-Server-Adapter neben `exec` aufbauen. Bestehende
   Authentisierung, Profile, Limits und Speicher werden injiziert.
2. **Fortsetzen und beobachten:** persistente Turns, echter Item-Stream,
   Wiederverbindung, Steering und konkret gebundene Freigaben. Die vier P1-
   Abnahmen bilden den Integrationstest gegen einen deterministischen Protokoll-Fake.
3. **Zusammenarbeit:** adressierbare Kind-Agenten und MCP-Anbindung; zuerst mit
   lokalen Fakes, danach gezielte freigegebene Live-Checks.
4. **UI abschließen:** laufende Effort/Fast-, Git- und Analysearbeiten integrieren,
   an dasselbe Task-Modell anschließen und mit Reload, Tastaturbedienung und
   parallelen Aufgaben prüfen. Keine zweite konkurrierende Implementierung starten.

Nicht aus diesem Audit ableitbar sind die Übernahme der geschlossenen Desktop-
Oberfläche, Cloud-Parität oder ein universelles Einfrieren beliebiger Provider-
Prozesse. Dafür wären eigenständige Anforderungen und technische Nachweise nötig.
