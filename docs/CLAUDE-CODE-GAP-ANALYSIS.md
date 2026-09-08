# Conduit und Claude Code: belegte Funktionslücken

Stand: 08.09.2026. Vergleichsbasis ist Conduit `cb87534dcaf9d03e70226c00ff1e5c9262db9a92`
einschließlich der zu diesem Zeitpunkt vorhandenen, noch nicht eingecheckten
Änderungen. Geprüft wurden Quellcode und offizielle Anthropic-Dokumentation.
Es wurden keine kostenpflichtigen Modellaufrufe oder externen Änderungen ausgeführt.
Die verlinkten Dokumentationsseiten und Repository-Dateien auf `main` sind veränderlich.

**Ergebnis:** Für eine mit Claude Code vergleichbare Arbeitsoberfläche fehlen
vor allem eine interaktive Provider-Laufzeit, zuverlässige Werkzeugereignisse
und die Verbindung zwischen Aufgabe, Arbeitskopie und Review. Git-Ansichten,
Effort/Fast-Regler und ausführbare Skills sind inzwischen vorhanden; sie sollten
für diese nächste Ausbaustufe wiederverwendet werden.

## Was hier tatsächlich verglichen wird

Das angefragte [Repository anthropics/claude-code](https://github.com/anthropics/claude-code)
enthält unter anderem README, Changelog, Beispiele, Plugins und Issue-Tracking.
Es ist keine vollständige Veröffentlichung des Desktop- oder CLI-Laufzeitquellcodes.
Die [Lizenzdatei](https://github.com/anthropics/claude-code/blob/main/LICENSE.md)
verweist auf Anthropics Commercial Terms. Der Bericht übernimmt deshalb keine
Behauptung einer frei kopierbaren vollständigen App-Implementierung.

Die Referenzen werden getrennt betrachtet:

- **Desktop:** dokumentierte Benutzerfunktionen im Code-Tab der Claude-App.
- **CLI/Agent SDK:** dokumentierte Integrationsmöglichkeiten; deren Verfügbarkeit
  in der CLI bedeutet noch keine Anbindung in Conduit.
- **Experimentell:** Funktionen mit ausdrücklichem Vorschau- oder Experimentstatus.

P1 bezeichnet eine Lücke im täglichen Ausführen, Kontrollieren oder Fortsetzen
von Coding-Aufgaben. P2 bezeichnet einen anschließenden Produktivitätsausbau.
Die Prioritäten und Abnahmekriterien sind Empfehlungen aus dem lokalen Vergleich.

## Bereits vorhanden

| Bereich | Nachgewiesener Conduit-Stand |
| --- | --- |
| Chats und Kontext | Persistierte Sessions, Nachrichtenversionen, Branching, Zusammenfassung, Kontextauswahl und scoped Memory in [PlatformContentService](../src/platform-content.ts#L145). |
| Native CLI-Fortsetzung | [SessionRegistry](../src/session-registry.ts#L16) verwaltet passende Chat-Verläufe mit exklusiver Lease und Provider-Session-ID. |
| Modelle | Modellkatalog, Accounts, Effort sowie separates Fast-Flag; Claude erhält diese Optionen in [ClaudeCliProvider](../src/providers/cli-claude.ts#L120). |
| Begrenzte Ausführung | Run-Status, Iterationen, Budgets, Gates und Artefakte in [PlatformRunService](../src/platform-runs.ts#L13); parallele Pipelines und [split-execute](../src/skills/split-execute.ts). |
| Erweiterungen | Versionierter Prompt-/Agent-Katalog in [platform-catalog.ts](../src/platform-catalog.ts#L125) und ausführbare Tools mit Schema und Autorisierung in [SkillRegistry](../src/skills/index.ts). |
| Repository | Status, Branches, Historie, Diff und begrenzte Git-Aktionen einschließlich Worktree-Erstellung in [git-workspace.ts](../src/git-workspace.ts#L205), dazu [Repository-Analytics](../src/ui/repository-analytics.ts). |
| Automatisierte Analyse | Wiederkehrende Vault-Scans und Vorschläge in [PlatformVaultService](../src/platform-vault.ts#L42). |

## P1: Laufzeit und täglicher Coding-Ablauf

### 1. Claude-Ereignisse kommen erst nach Abschluss an

**Referenz:** Die CLI unterstützt `stream-json`, partielle Nachrichten und
strukturierte Ausgaben für Unteragenten. Diese Optionen liefern eine nutzbare
Grundlage für einen Ereignisadapter.
[CLI-Referenz](https://code.claude.com/docs/en/cli-reference).

**Lokaler Befund:** [ClaudeCliProvider](../src/providers/cli-claude.ts#L141)
wählt `json` oder `text`. `chatStream()` wartet auf `chat()` und liefert danach
einen einzigen Textblock. Der vorhandene Callback `onExecutionEvent` wird dort
nicht bedient. Der gemeinsame [ExecutionEvent-Typ](../src/types.ts#L138)
kennt nur Commands, Nachrichten und Pläne; [execution-events.ts](../src/execution-events.ts#L26)
enthält einen Codex-Parser. Eine sichtbare Ablaufansicht beweist deshalb noch
keine vergleichbare Claude-Telemetrie.

**Abnahme:** Ein kontrollierter Claude-Prozess liefert vor Prozessende mindestens
Textdelta, Tool-Start und Tool-Ende mit korrelierter ID. Dateiänderung,
Tool-Ergebnis und Unteragent-Zuordnung bleiben unterscheidbar. Fragmentierte
JSON-Zeilen, fehlerhafte Frames, Abbruch und erneutes Laden erzeugen weder
doppelte Ereignisse noch einen fälschlich erfolgreichen Abschluss. Bestehende
Redaktion und Größenlimits gelten für alle neuen Ereignisse.

### 2. Ausgewählte Agent-Aufgaben lassen sich nicht als dieselbe Aufgabe fortsetzen

**Referenz:** Das Agent SDK dokumentiert langlebige Eingabe-Streams, aufeinanderfolgende
Nachrichten, Unterbrechung und fortgesetzten Kontext.
[Streaming Input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode).

**Lokaler Befund:** [exSubmit](../src/ui/execution.ts#L274)
erstellt über `/runs` stets einen neuen Run. Die Auswahl einer bestehenden
Aufgabe wird nicht zu einer weiteren Nachricht dieser Aufgabe.
[withCliSession](../src/session-registry.ts#L76)
aktiviert native Fortsetzung nur im Chat-Modus. Die
[Run-Aktionen](../src/platform-runs.ts#L197)
bieten Gates, Abbruch und begrenzten Retry, aber keine Eingabewarteschlange für
weitere Turns. Die UI beschriftet ihre lokale Polling-Pause inzwischen korrekt
als „Pause updates“; diese stoppt keine Ausführung.

**Abnahme:** Ein Follow-up landet unter derselben Task-ID mit neuer Turn-ID,
korrektem Workspace und vollständiger Herkunft. Während eines laufenden Turns
wird Eingabe wahlweise eingereiht oder über eine nachgewiesene Provider-Funktion
zur Unterbrechung verarbeitet. Die Oberfläche zeigt den tatsächlichen Zustand
an. Abbruch beendet genau den adressierten Turn; wiederholte Requests führen
keine Änderung zweimal aus. Provider ohne diese Fähigkeiten werden kenntlich gemacht.

### 3. Tool-Freigaben und Rückfragen brauchen einen Rückkanal

**Referenz:** Das SDK kann Tool-Anfragen und `AskUserQuestion` über `canUseTool`
an die Host-Anwendung geben und auf die Entscheidung warten. Bereits durch
Regeln oder einen Modus erlaubte Tools erreichen diesen Callback nicht immer.
[Freigaben und Benutzereingaben](https://code.claude.com/docs/en/agent-sdk/user-input).

**Lokaler Befund:** [cliPermissionArgs](../src/cli-mode.ts#L404)
setzt für Claude-Agent-Ausführung `bypassPermissions`. Die vorhandenen Run- und
Pipeline-Gates betreffen ganze Ausführungsschritte. Der
[ProviderAdapter-Vertrag](../src/types.ts#L221)
hat keinen Host-Dialog für eine bestimmte Tool-Anfrage oder Modellrückfrage.
Die Autorisierung ausführbarer Conduit-Skills ist vorhanden, ersetzt diesen
Rückkanal innerhalb eines nativen Claude-Prozesses jedoch nicht.

**Abnahme:** Eine tatsächliche Tool-Anfrage zeigt Operation, Argumente, Ziel und
anfragenden Turn; der Tool-Aufruf beginnt erst nach gültiger Entscheidung.
Einmalige Freigabe, begrenzte Regel und Ablehnung werden getrennt gespeichert.
Fremde, abgelaufene oder bereits beantwortete Anfragen lassen sich nicht
bestätigen. Abbruch beendet auch offene Dialoge. Plan-Modus bleibt beim
Übergang in die Implementierung erkennbar und wirksam.

### 4. Aufgabe, Worktree und Review sind noch getrennte Oberflächen

**Referenz:** Desktop bietet isolierte Git-Arbeitskopien pro Session,
zeilenbezogenes Diff-Feedback sowie CI-Status mit optionalem Auto-Fix und Auto-Merge.
[Desktop: Sessions und Review](https://code.claude.com/docs/en/desktop).

**Lokaler Befund:** [GitWorkspaceService](../src/git-workspace.ts#L291)
kann Worktrees erstellen. Die Auswahl in [git-workspace.ts](../src/ui/git-workspace.ts#L174)
ändert die Git-Ansicht; [exSubmit](../src/ui/execution.ts#L281)
übergibt dagegen den ausgewählten registrierten Workspace-Pfad. Eine persistierte
Task-Worktree-Bindung und strukturierte Review-Kommentare mit Rückführung zum
Agenten fehlen. [github-actions](../src/skills/github-actions.ts#L46)
kann Workflows auslösen und Runs prüfen, bildet aber keinen an den Task und
PR-Head gebundenen Review-/CI-Lebenszyklus ab.

**Abnahme:** Zwei Aufgaben desselben Repositories schreiben in die jeweils
zugeordnete Arbeitskopie. Reload und Follow-up behalten die Bindung. Ein
Diff-Kommentar enthält Datei, Seite, Zeile und Revision und wird im richtigen
Task beantwortet. Ein CI-Ergebnis wird nur dem geprüften Commit zugeordnet;
ein neuer Push macht alte Ergebnisse sichtbar veraltet. Merge und Bereinigung
verwenden ausdrücklich konfigurierte Regeln und berücksichtigen fremde Änderungen.

## P2: Arbeitsumgebung und Erweiterbarkeit

### 5. Browser-Vorschau und direkte Datei-/Terminalarbeit

**Referenz:** Desktop dokumentiert eine App-Vorschau mit DOM-/Screenshot-Prüfung,
Bedienaktionen, Serversteuerung, integrierten Terminal-Tabs und einem Datei-Editor.
[Desktop-Arbeitsumgebung](https://code.claude.com/docs/en/desktop).

**Lokaler Befund:** [browserSkill](../src/skills/browser.ts)
holt öffentliche HTTP-Seiten als Text; JavaScript, Cookies und private Ziele
sind ausdrücklich ausgeschlossen. Damit lässt sich kein lokaler Dev-Server
visuell bedienen. [sandboxSkill](../src/skills/sandbox.ts)
führt begrenzte Prozesse aus und sammelt Ausgabe, hat aber keinen interaktiven
PTY-/stdin-Lebenszyklus. Die bestehenden Textanhänge und Diffs sind ein Anfang.

**Abnahme:** Ein an den Task gebundener Dev-Server startet mit kontrolliertem
Port, liefert Logs und wird gezielt beendet. Eine Browser-Sitzung prüft eine
lokale Testseite per DOM, Screenshot und Klick. Dateiänderungen warnen bei
zwischenzeitlich geändertem Inhalt. Ein Terminal behält cwd und Prozess-ID,
kann Eingaben empfangen und nach Tab-Wechsel weiter angezeigt werden.
Die öffentliche Fetch-Funktion behält ihre bisherigen Netzwerkgrenzen.

### 6. Datei-Checkpoints zusätzlich zum Gesprächs-Branching

**Referenz:** Claude kann eigene direkte Datei-Edits zusammen mit oder unabhängig
vom Gespräch zurücksetzen. Shell-Änderungen, externe Änderungen und viele
Unteragent-Edits sind davon nicht vollständig erfasst; Checkpoints ersetzen Git nicht.
[Checkpointing](https://code.claude.com/docs/en/checkpointing).

**Lokaler Befund:** [branchSession und editMessage](../src/platform-content.ts#L251)
verändern Gesprächsdaten. Es gibt dort keine Dateisnapshots pro Turn und keine
Prüfung, welche Arbeitskopie seit diesem Turn anderweitig verändert wurde.
Ein Gesprächs-Branch stellt deshalb keinen früheren Codezustand her.

**Abnahme:** Unterstützte Dateioperationen erhalten vorher/nachher Hash und
Snapshot. „Nur Gespräch“, „Nur erfasste Dateien“ und „Beides“ sind getrennte
Aktionen. Ein Restore zeigt einen Diff und lehnt zwischenzeitlich fremd geänderte
Dateien ab. Nicht erfasste Shell- und externe Änderungen werden ausdrücklich
als nicht rücksetzbar ausgewiesen.

### 7. Dynamische Unteragenten statt ausschließlich statischer Teilaufgaben

**Referenz:** Claude-Unteragenten besitzen eigenen Kontext, Instruktionen und
Tool-Zugriff. [Unteragenten](https://code.claude.com/docs/en/sub-agents).
Die darüber hinausgehenden Agent Teams mit Koordination zwischen eigenständigen
Sessions sind experimentell, standardmäßig deaktiviert und unter anderem bei
Wiederaufnahme und verschachtelten Teams eingeschränkt.
[Agent Teams](https://code.claude.com/docs/en/agent-teams).

**Lokaler Befund:** Pipelines und [split-execute](../src/skills/split-execute.ts)
führen unabhängige Arbeit parallel aus. Es fehlt ein gemeinsames Modell für
persistierte Kind-Agenten, Follow-ups, Mailboxen und auf einzelne Kinder
begrenzte Unterbrechung. Ein DAG-Schritt ist derzeit kein fortsetzbarer Agent.

**Abnahme:** Der Eltern-Task startet zwei begrenzte Kinder, liest deren Zustand,
sendet einem Kind ein Follow-up und beendet das andere gezielt. Herkunft,
Kontextfreigabe, Workspace und Budget werden pro Kind aufgezeichnet. Ein
Host-Neustart markiert nicht wiederanbindbare Prozesse als unterbrochen.
Experimentelle Claude-Team-Parität ist ein eigenes späteres Paket.

### 8. Plugin-/MCP-Lebenszyklus und Ereignis-Hooks

**Referenz:** Claude-Plugins bündeln Skills, Agents, Hooks sowie MCP-/LSP-Konfiguration.
[Plugin-Struktur](https://code.claude.com/docs/en/plugins).
Hooks bieten definierte Eingriffspunkte wie `PreToolUse`.
[Hooks-Referenz](https://code.claude.com/docs/en/hooks).

**Lokaler Befund:** [PlatformCatalogService](../src/platform-catalog.ts#L125)
versioniert Texte und Referenzen; [SkillRegistry](../src/skills/index.ts)
führt registrierte Module aus. MCP-Bezeichnungen in
[cli-mode.ts](../src/cli-mode.ts#L210) sind
Werkzeugbeschreibungen, kein Host mit Serverstart, Verbindungsstatus, OAuth,
Reconnect und Installation. Native Claude-Konfiguration kann bereits wirken,
wird aber nicht als durchgängiger Conduit-Lebenszyklus verwaltet.

**Abnahme:** Ein Plugin hat Quelle, Version, Komponenten und sichtbaren Zustand.
Ein Test-MCP-Server lässt sich verbinden, aufrufen, trennen und nach Ausfall
erneut verbinden. Deaktivieren entzieht seine Tools. Hooks haben begrenzte
Laufzeit, eindeutige Ergebnisse und können keine Host-Rollenprüfung umgehen.

### 9. Allgemeine Zeitpläne statt ausschließlich Vault-Intervall

**Referenz:** Claude unterscheidet sessionbezogene `/loop`-Aufgaben, Desktop-Zeitpläne
und Cloud-Routinen. Laufzeit, Persistenz und Voraussetzungen unterscheiden sich;
eine CLI-Schleife ist kein jederzeit laufender Cloud-Scheduler.
[Geplante Aufgaben](https://code.claude.com/docs/en/scheduled-tasks).

**Lokaler Befund:** [PlatformVaultService](../src/platform-vault.ts#L131)
plant spezialisierte Gesprächsanalysen. Die Execution-Verknüpfung „Automations“
führt in diesen Bereich. Eine frei konfigurierbare Wiederholung eines Prompts
mit Ziel-Task, Workspace, Budget, Zeitzone und Benachrichtigungsregel fehlt.

**Abnahme:** Ein gespeicherter Zeitplan kann aktiviert, deaktiviert und gelöscht
werden. Fälligkeiten werden nach Neustart deterministisch behandelt; parallele
Ticks erzeugen keinen Doppelstart. Rollen und Budget werden bei Ausführung
erneut geprüft. Unveränderte Prüfergebnisse erzeugen keine neue Benachrichtigung,
sofern der Nutzer keine regelmäßigen Statusmeldungen gewählt hat.

### 10. Sichtbare Herkunft von Kontext und echte Bildanhänge

**Referenz:** Claude unterscheidet Projektinstruktionen aus `CLAUDE.md` und
automatisch gesammelte Erinnerungen; beide sind Kontext und keine harte
Berechtigungsgrenze. [Projekt-Memory](https://code.claude.com/docs/en/memory).
Das SDK unterstützt Bilder als strukturierte Inhaltsblöcke.
[Streaming Input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode).

**Lokaler Befund:** Scope-Prüfungen und Memory-Auswahl bestehen bereits in
[prepareContext](../src/platform-content.ts#L311).
Eine gemeinsame Ansicht der tatsächlich wirksamen nativen Projektdateien,
Kataloginstruktionen und Host-Memories fehlt. [ChatMessage](../src/types.ts#L133)
enthält nur String-Content; [exAttachFiles](../src/ui/execution.ts#L293)
akzeptiert begrenzte Textdateien, die an den Prompt angehängt werden.

**Abnahme:** Vor einem Turn zeigt die Kontextansicht Herkunft, Scope und
Versionsstand der vom Host eingebrachten Inhalte; providerseitig unbekannter
Kontext wird als unbekannt bezeichnet. Ein PNG wird als Bildinhalt an einen
nachweislich geeigneten Provider übergeben. Nicht unterstützte Modelle erhalten
eine klare Fehlermeldung; ein Dateiname darf keinen erfolgreichen Bildupload vortäuschen.

## Begrenzte Umsetzungspakete

| Paket | Umfang | Nachweis am Ende |
| --- | --- | --- |
| A: Claude-Transport | P1.1, erweiterte Ereignistypen, Capability-Angaben | Prozess-Fixtures zeigen echte Zwischenereignisse, Abbruch und begrenzte Speicherung. |
| B: Interaktive Tasks | P1.2–3 auf bestehendem Store, Rollen und Budgets | HTTP-Integrationstest mit Follow-up, Rückfrage, Freigabe, Reload und konkurrierendem Request. |
| C: Coding-Review | P1.4 und danach P2.6 | Zwei isolierte Aufgaben, revisionsgebundener Kommentar, Commit-genauer CI-Status und konfliktgeprüfter Restore. |
| D: Arbeitsoberfläche | P2.5 und Bildteil von P2.10 | Lokale Fixture-App mit Preview, Dateikonflikt und interaktivem Testprozess; kein bezahltes Modell erforderlich. |
| E: Orchestrierung | P2.7–9 und verbleibende Kontextanzeige | Fake-Provider/MCP-Server plus virtuelle Uhr belegen Lebenszyklen, Widerruf und genau einen Start pro Fälligkeit. |

Remote-/Cloud-Handoff und native Computersteuerung sind mögliche weitere
Produktbereiche. Desktop dokumentiert lokale und entfernte Sessions sowie
Computer Use als Research Preview auf macOS/Windows mit Planbeschränkungen.
[Desktop-Referenz](https://code.claude.com/docs/en/desktop).
Sie benötigen eigene Host-, Identitäts- und Bereitstellungskonzepte und sind
keine Voraussetzung für die fünf oben begrenzten Pakete.

Die gemeinsame Task-/Turn-Basis überschneidet sich mit der
[Codex-Gap-Analyse](../docs/CODEX-GAP-ANALYSIS.md).
Sie sollte einmal implementiert werden; Claude-spezifische Flags und SDK-Details
gehören in den Provider-Adapter. Dieser Bericht ändert ausschließlich Dokumentation.
