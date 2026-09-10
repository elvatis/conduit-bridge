/** German display text for the bridge's own tool catalog; tool IDs remain stable. */
export const TOOL_COPY_DE: Record<string, [string, string]> = {
  Write: ['Dateien erstellen', 'Erstellt neue Dateien oder überschreibt bestehende Dateien im festgelegten Arbeitsbereich.'],
  Edit: ['Dateien bearbeiten', 'Ändert gezielt Texte und Abschnitte bestehender Dateien im Arbeitsbereich.'],
  MultiEdit: ['Mehrere Dateien bearbeiten', 'Führt zusammengehörige Änderungen an mehreren Dateien in einem Vorgang aus.'],
  Read: ['Dateiinhalte lesen', 'Liest und prüft Dateiinhalte, ohne Änderungen vorzunehmen.'],
  ListDir: ['Verzeichnisstruktur prüfen', 'Listet Verzeichnisse und Einträge auf und prüft die Ordnerstruktur im Arbeitsbereich.'],
  FileSearch: ['Code durchsuchen', 'Durchsucht Dateinamen, Pfadmuster und Textinhalte im Arbeitsbereich.'],
  Bash: ['Shell-Befehle ausführen', 'Führt Shell-Skripte und Bash-Befehle im Systemterminal aus.'],
  Terminal: ['Interaktive Terminalsitzung', 'Startet länger laufende interaktive Terminalsitzungen und verkettete Prozesse.'],
  Command: ['Systembefehle ausführen', 'Führt nicht interaktive Systembefehle und Programme auf dem Rechner aus.'],
  WebSearch: ['Im Web suchen', 'Fragt externe Suchmaschinen nach aktuellen öffentlichen Informationen ab.'],
  Fetch: ['HTTP-Inhalte abrufen', 'Ruft entfernte Inhalte und Dokumentation mit ausgehenden HTTP-GET-Anfragen ab.'],
  Browse: ['Webseiten untersuchen', 'Navigiert durch Webseiten und prüft sie in einer lokalen Browsersitzung ohne sichtbares Fenster.'],
  NotebookEdit: ['Notebook-Zellen bearbeiten', 'Ändert Zellinhalte, Metadaten und Markdown in Jupyter-Notebooks.'],
  NotebookRead: ['Notebooks lesen', 'Prüft die Struktur, Ausgaben und Ausführungszustände von Notebooks, ohne sie zu ändern.'],
  NotebookRun: ['Notebook-Code ausführen', 'Führt Codezellen eines Jupyter-Notebooks in einem aktiven lokalen Python-Kernel aus.'],
  Patch: ['Dateiänderungen anwenden', 'Wendet Patches und Ersetzungen aus einem Zeilenvergleich direkt auf Dateien im Arbeitsbereich an.'],
  WorkspaceWrite: ['Im Arbeitsbereich schreiben', 'Erstellt Verzeichnisse und überschreibt Dateien mit vollständigem Schreibzugriff im Arbeitsbereich.'],
  mcp_call: ['MCP-Werkzeuge aufrufen', 'Führt externe Funktionen registrierter Server des Model Context Protocol aus.'],
  mcp_list: ['MCP-Werkzeuge ermitteln', 'Ermittelt verfügbare Fähigkeiten, Werkzeuge und Schemas aktiver MCP-Server.'],
  mcp_read: ['MCP-Ressourcen lesen', 'Ruft Ressourcen und Dokumentation aktiver MCP-Server ab, ohne sie zu ändern.'],
  GrokBrowse: ['Webrecherche mit Grok', 'Recherchiert über die Grok-CLI im Internet und auf der Plattform X.'],
  GeminiSearch: ['Google-Suche mit Gemini', 'Verwendet die Google-Suche für Gemini-Modelle über die Antigravity-CLI.'],
  ClaudeArtifacts: ['Artefakte anzeigen', 'Erstellt Claude-Artefakte und zeigt ihre visuelle Vorschau an.'],
};

export const SYSTEM_TOOL_COPY_DE: Record<string, string> = {
  'Git Version Control':'Git-Versionsverwaltung', 'Node.js Runtime':'Node.js-Laufzeit', 'Node Package Manager':'Node-Paketverwaltung', 'NPX Package Runner':'NPX-Paketausführung', 'Bash Shell':'Bash-Shell', 'Python Interpreter':'Python-Interpreter', 'Docker Engine CLI':'Docker-CLI', 'Go Toolchain':'Go-Werkzeuge',
  'Version Control':'Versionsverwaltung', 'Runtime Environments':'Laufzeitumgebungen', 'Package Managers':'Paketverwaltung', 'Shell Environments':'Shell-Umgebungen', Containerization:'Containerverwaltung', 'Build Systems':'Build-Systeme', 'Coding Agent CLIs':'Programmieragenten-CLIs',
};
