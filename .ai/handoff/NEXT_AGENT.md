# Übergabe an den nächsten Agenten

_Stand: 2026-09-01, Branch `fix/browser-login-single-port`_

## Ziel

Die Entwicklung wird auf einem Windows-Desktop-Rechner mit Codex fortgesetzt.
Der aktuelle Zwischenstand soll zuerst verstanden und unter Windows real getestet
werden. Der Produktfokus ist derzeit ausschließlich:

- Windows Desktop
- Linux Desktop

macOS und headless Linux Server sind nicht Teil des aktuellen Supports.

## Repository und GitHub

- Repository: `https://github.com/elvatis/conduit-bridge.git`
- Branch: `fix/browser-login-single-port`
- PR: `https://github.com/elvatis/conduit-bridge/pull/99`
- Vor der Arbeit immer synchronisieren:

```bash
git fetch origin
git switch fix/browser-login-single-port
git pull --ff-only origin fix/browser-login-single-port
```

Wenn der Branch lokal noch nicht existiert:

```bash
git fetch origin
git switch --track -c fix/browser-login-single-port origin/fix/browser-login-single-port
```

## Aktueller uncommitteter Arbeitsstand

Der Zwischenstand enthält automatische Erkennung des Standardbrowsers:

- `src/login/browser-discovery.ts` erkennt unter Windows den HTTPS-Standardbrowser
  über die Registry und unter Linux über `xdg-settings` und `.desktop`-Dateien.
- Chromium-basierte Browser werden unterstützt: Microsoft Edge, Google Chrome,
  Brave und Chromium.
- Firefox wird bewusst erkannt, aber mit einer verständlichen Fehlermeldung als
  nicht kompatibel für die native Chromium-CDP-Profilanbindung markiert.
- `src/login/display.ts` meldet Browsername, Browserfamilie, Profilpfad und
  Kompatibilität an die Display-Prüfung.
- `src/providers/base.ts` verwendet bei `browser.useDefaultProfile: true` den
  nativen Profilpfad des erkannten Standardbrowsers, sofern er verfügbar ist.
- `src/config.ts` aktiviert `browser.useDefaultProfile` standardmäßig.
- `src/types.ts` enthält die Browser-Konfiguration:
  `executablePath`, `userDataDir` und `useDefaultProfile`.
- `test/browser-discovery.test.ts` deckt Windows Edge und Linux Firefox ab.

Wichtig: Die neuen Änderungen wurden auf diesem Linux-System getestet, aber noch
nicht auf einem echten Windows Desktop mit Edge oder einem anderen Standardbrowser.
Der Windows-Echttest ist der nächste notwendige Schritt.

## Nächste Vorgehensweise

1. Branch und Arbeitsbaum prüfen. Keine fremden Änderungen überschreiben.
2. Auf Windows Abhängigkeiten installieren und die Suite ausführen:

```powershell
npm install
npm test
npm run typecheck
npm run build
```

3. Einen Testlauf mit dem tatsächlich als Standardbrowser eingestellten Browser
   durchführen. Für Emre ist das Microsoft Edge. Danach mindestens Chrome oder
   Brave berücksichtigen, wenn verfügbar.
4. Prüfen, dass beim Klick auf `Open login browser` der Standardbrowser mit dem
   bereits eingeloggten nativen Profil verwendet wird. Es darf nicht ungefragt
   ein neues Playwright-Chromium-Profil geöffnet werden.
5. Prüfen, dass Cookies und Sessiondaten im nativen Profil erhalten bleiben und
   ein Browser-Restart den Login wiederherstellen kann.
6. Prüfen, dass ein bereits laufender Browser mit gesperrtem Profil verständlich
   behandelt wird. Niemals ein Profil parallel schreibend öffnen oder die
   Profildaten kopieren.
7. Prüfen, dass Firefox eine klare Kompatibilitätsmeldung erhält. Keine stille
   Rückfalllogik auf Chrome einbauen.
8. Die Dashboard-Anzeige für den erkannten Browser ergänzen, falls sie die neuen
   Felder noch nicht sichtbar macht. Der Benutzer soll erkennen können, welcher
   Browser und welches Profil verwendet werden.
9. Entscheiden, ob `browser.executablePath` tatsächlich als expliziter Override
   implementiert werden soll. Aktuell ist das Feld typisiert, die automatische
   Erkennung ist aber der aktive Pfad.
10. Erst nach erfolgreichem Windows-Test README, Help, Changelog und AAHP-Status
    auf die verifizierten Ergebnisse aktualisieren.
11. Tests erneut ausführen, committen und nach PR #99 pushen.

## Architekturentscheidungen, die erhalten bleiben müssen

- Der Standardbrowser wird lokal auf dem Desktop gestartet, damit seine Cookies
  und sein Profil verwendet werden.
- Für einen entfernten OpenClaw-Server wird die lokale Bridge über einen SSH-
  Reverse-Tunnel bereitgestellt. Der Benutzerport bleibt `127.0.0.1:31338`.
- VNC, noVNC, websockify und die Ports `5900` und `6080` gehören nicht zurück in
  das Projekt.
- Die Browseroberfläche, falls sie für einen Login auf einem Remote-Linux-Desktop
  benötigt wird, läuft ausschließlich über die Conduit-Bridge auf Port 31338.
- Browserprofile werden unter `~/.conduit` verwaltet, sofern nicht bewusst das
  native Standardprofil verwendet wird. `CONDUIT_HOME` kann den Root verschieben.
- Keine Zugangsdaten, Cookies oder Sessionwerte in Logs, Tests, Commits oder PR-
  Kommentaren ausgeben.

## Verifizierter Zustand vor dieser Übergabe

- 350 Tests bestanden, 24 Testdateien
- Typecheck bestanden
- Build bestanden
- `git diff --check` bestanden
- Die neuen Windows-Pfadtests verwenden Windows-separators unabhängig vom Host-
  Betriebssystem
- Noch keine echte Windows-Live-Verifikation

