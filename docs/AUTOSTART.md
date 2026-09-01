# Desktop autostart

Conduit Bridge supports Windows Desktop and Linux Desktop. Autostart launches
the same API/CLI/local gateway as a normal manual start. It does not need a
graphical login flow or access to a browser profile.

Runtime configuration, PID data, launchers, and logs live below
`%USERPROFILE%\.conduit` on Windows or `~/.conduit` on Linux. Set
`CONDUIT_HOME` before installation only when required.

## Windows Desktop

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

The installer creates
`%USERPROFILE%\.conduit\bin\conduit-bridge-start.ps1`, registers the
per-user Task Scheduler task `Conduit Bridge`, and starts it. The launcher
runs `node dist/cli.js start --host=127.0.0.1 --port=31338`.

It records the PID in `%USERPROFILE%\.conduit\conduit-bridge.pid` and writes
stdout and stderr below `%USERPROFILE%\.conduit\logs`.

Verify:

```powershell
Invoke-WebRequest http://127.0.0.1:31338/health
Get-NetTCPConnection -LocalPort 31338 -State Listen
Get-ScheduledTask -TaskName "Conduit Bridge"
```

Uninstall:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-autostart.ps1
```

## Linux Desktop

```bash
npm run build
./scripts/install-autostart.sh
```

The installer creates `~/.conduit/bin/conduit-bridge-start` and registers
`~/.config/autostart/conduit-bridge.desktop`.

Verify with `curl http://127.0.0.1:31338/health` and
`ss -ltn | grep 31338`. Remove it with
`./scripts/uninstall-autostart.sh`.

## Troubleshooting

- Run `npm run build` and start `node dist/cli.js start` manually once.
- Confirm that Node.js and required provider CLIs are on the user's `PATH`.
- Authenticate CLI tools as that same user before enabling autostart.
- Configure API keys in Dashboard Settings or the task's protected environment.
- If port 31338 is occupied, stop the duplicate bridge process.

The only expected user-facing listener is `127.0.0.1:31338`.
