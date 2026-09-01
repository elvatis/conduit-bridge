# Desktop autostart

Conduit Bridge is currently supported on **Windows Desktop** and **Linux
Desktop**. The browser profile and visible Chromium window stay in the
interactive desktop user's session.

The project does not support macOS or a headless Linux server as a local bridge
deployment at this time. If the API client runs on a remote server, run the
bridge on the supported desktop and use the SSH reverse tunnel described below.

The default runtime root is `~/.conduit` on Linux and
`%USERPROFILE%\.conduit` on Windows. Set `CONDUIT_HOME` before running the
installer if a managed workstation needs another central directory. The
application and the generated launcher then use the same root.

## Linux Desktop

Build the project and install the desktop-session entry:

```bash
npm run build
./scripts/install-autostart.sh
```

The installer creates the runtime launcher:

```text
~/.conduit/bin/conduit-bridge-start
```

The desktop integration entry is registered at
`~/.config/autostart/conduit-bridge.desktop` and points to that launcher. It
starts at the next graphical login and inherits the user's desktop display. It
does not start a virtual display and does not install or use VNC components. To
remove both entries:

```bash
./scripts/uninstall-autostart.sh
```

To use a project directory other than the current checkout:

```bash
./scripts/install-autostart.sh /path/to/conduit-bridge
```

Verify after logging in:

```bash
curl http://127.0.0.1:31338/health
ss -ltn | grep 31338
```

The only expected user-facing listener is `127.0.0.1:31338`.

## Windows Desktop

Build the project, then run PowerShell from the checkout:

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

The installer creates the runtime launcher
`%USERPROFILE%\.conduit\bin\conduit-bridge-start.ps1`, then registers a
per-user Task Scheduler task named `Conduit Bridge` with an interactive logon
trigger and starts it immediately. The launcher uses the Node executable found
on the current user's `PATH` and starts:

```text
node dist/cli.js start --host=127.0.0.1 --port=31338
```

To remove the task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-autostart.ps1
```

Verify in PowerShell:

```powershell
Invoke-WebRequest http://127.0.0.1:31338/health
Get-NetTCPConnection -LocalPort 31338 -State Listen
```

The task runs as the logged-in desktop user. This is required so Chromium can
open its visible window and reuse that user's profile. The runtime files stay
under `%USERPROFILE%\.conduit`; the checked-out project remains the code source.

## Remote OpenClaw client

When OpenClaw runs on a Linux server, do not start a second Conduit Bridge on
that server. Start the bridge on Windows Desktop or Linux Desktop and create a
reverse tunnel from the workstation:

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -R 127.0.0.1:31338:127.0.0.1:31338 <server>
```

The remote client can then use:

```text
http://127.0.0.1:31338/v1
```

The tunnel exposes only the bridge's loopback listener on the server. Browser
profiles, cookies, local storage, and the visible browser remain on the
desktop. The tunnel is available while the workstation and SSH connection are
online.

## Troubleshooting

- If the bridge does not start, run `npm run build` and start it manually once.
- If login reports no graphical session on Linux, run the bridge inside the
  logged-in desktop session and check `DISPLAY` or `WAYLAND_DISPLAY`.
- If Windows starts the task but Chromium is not visible, confirm the task has
  an **Interactive** logon trigger and is running as the desktop user.
- If port 31338 is busy, stop the second bridge process or update the client
  endpoint. Do not expose the bridge on a public interface without its auth
  configuration.
