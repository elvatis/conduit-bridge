# Browser Login

Conduit Bridge supports interactive sign-in for Grok, Claude, Gemini, ChatGPT, and Perplexity.

The same flow works on a local desktop and on a Linux server reachable only through SSH.

## Design goals

- The browser presents a consistent native identity.
- `navigator.webdriver` stays false.
- A person completes every sign-in and security check.
- Remote interaction uses the existing bridge listener on port `31338`.
- No separate remote-desktop service or stable viewer port is required.
- Cookies, tokens, passwords, URL fragments, and prompt content never enter diagnostics.

## Browser lifecycle

1. Conduit checks the graphical rendering session and Chromium binary.
2. It clears only a stale Chromium profile lock.
3. It starts ordinary headed Chromium with a persistent provider profile.
4. Chromium exposes a random loopback-only DevTools endpoint.
5. Conduit attaches after launch and verifies that `navigator.webdriver === false`.
6. The built-in viewer captures the active page as JPEG.
7. The viewer accepts only validated pointer, wheel, keyboard, and text events.
8. The person completes sign-in.
9. Conduit closes the login browser, waits for the profile lock, and verifies authentication.
10. Session restore starts the same native browser identity and attaches afterwards.

The private DevTools listener is an internal process detail. It binds only to `127.0.0.1`, uses a random port, and must never be forwarded or exposed. Port `31338` is the only user-facing service port.

## Why Chromium starts separately

Playwright's normal persistent-context launcher enables automation behavior. Several providers reject production sign-in in that browser, and its identity can contradict itself.

Conduit starts Chromium as a normal process with:

- the browser's real user agent
- the browser's real platform
- no user-agent override
- no stealth flag
- no `--enable-automation`
- a fixed nonzero private DevTools port

After attachment, Conduit evaluates the browser identity. Login and restore stop if the browser reports `navigator.webdriver === true`.

## Local desktop

Start Conduit Bridge:

```bash
node dist/cli.js start --host=127.0.0.1 --port=31338
```

Open `http://127.0.0.1:31338/`, choose **Providers**, and start a login.

The Chromium window appears on the local Windows, macOS, or Linux desktop. The provider card also exposes the built-in viewer.

## Remote Linux server

### 1. Provide an internal display

A server without a desktop needs Xvfb:

```bash
Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp
```

Start the bridge with the same display:

```bash
DISPLAY=:99 node dist/cli.js start --host=127.0.0.1 --port=31338
```

### 2. Forward the bridge

On your workstation:

```bash
ssh -L 31338:127.0.0.1:31338 <server>
```

Open:

```text
http://127.0.0.1:31338/
```

### 3. Sign in

1. Open **Providers**.
2. Choose **Start login**.
3. Wait for `browser_ready` or `waiting_for_user`.
4. Choose **Open login browser**.
5. Sign in and complete any provider security check.
6. Return to the provider card and choose **Check login status**.

The viewer route is provider-scoped:

```text
/v1/login/<provider>/viewer
```

Its frame and input routes are authenticated by the same bridge policy:

```text
GET  /v1/login/<provider>/frame
POST /v1/login/<provider>/input
```

Raw DevTools commands are not exposed.

## systemd user services

Virtual display:

```ini
# ~/.config/systemd/user/conduit-xvfb.service
[Unit]
Description=Conduit Bridge virtual display

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp
Restart=always
RestartSec=2
PrivateTmp=true

[Install]
WantedBy=default.target
```

Bridge:

```ini
# ~/.config/systemd/user/conduit-bridge.service
[Unit]
Description=Conduit Bridge
After=network-online.target conduit-xvfb.service
Wants=network-online.target conduit-xvfb.service

[Service]
Type=simple
WorkingDirectory=/path/to/conduit-bridge
Environment=DISPLAY=:99
ExecStart=/usr/bin/node /path/to/conduit-bridge/dist/cli.js start --host=127.0.0.1 --port=31338
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
```

Enable both:

```bash
systemctl --user daemon-reload
systemctl --user enable --now conduit-xvfb conduit-bridge
```

Verify:

```bash
systemctl --user is-active conduit-xvfb conduit-bridge
ss -ltnp | grep 31338
curl http://127.0.0.1:31338/health
```

The expected user-facing listener is `127.0.0.1:31338`.

## Login states

| State | Meaning |
|---|---|
| `starting` | Preparing display, profile, and browser |
| `browser_ready` | Chromium is running and the viewer can open |
| `waiting_for_user` | Complete sign-in |
| `verifying` | Checking the saved profile |
| `authenticated` | Provider session verified |
| `challenge_detected` | A security check needs the person |
| `blocked` | Provider refused the browser or network |
| `timeout` | Attempt exceeded its time budget |
| `failed` | Browser, display, or verification failed |
| `cancelled` | The attempt was stopped and cleaned up |

## Authentication signals

A provider is not considered authenticated because one selector exists.

Conduit combines:

- provider-specific authenticated selectors
- provider-specific session cookie names
- expected host and path
- logged-out selectors as a veto
- security-check classification

Cookie values are never read into diagnostics. Cookie checks are scoped to the current provider origin.

## Security boundaries

- Keep `31338` bound to loopback.
- Use SSH forwarding for remote access.
- Treat viewer access like access to the account running the browser.
- Require `authToken` and explicit allowed origins for any external bind.
- Do not expose Chromium's private DevTools listener.
- Run the service as an unprivileged user.
- Keep browser profiles and `~/.conduit` owner-only.
- On a multi-user host, configure Xauthority or isolate the virtual display so other local accounts cannot attach.

The bridge rejects cross-site state changes and foreign browser WebSocket origins. URL queries and fragments are removed before login diagnostics are stored or returned.

## Sandbox behavior

Conduit requests the Chromium OS sandbox by default. If the host cannot start Chromium with that sandbox, Conduit reports the downgrade and retries without it.

Prefer fixing the host's Chromium sandbox support. Use `chromiumNoSandbox` only as an explicit compatibility choice.

## Troubleshooting

### No graphical session

- Confirm `DISPLAY` is set in the bridge service.
- Confirm Xvfb is active.
- Run `xdpyinfo -display :99`.

### Chromium is not installed

```bash
npx playwright install chromium
```

### Profile already in use

Stop the live Chromium process using that provider profile. Conduit removes stale locks only. It does not break a lock owned by a live process on the same host.

### Viewer waits for the browser

- Confirm the provider login is active.
- Reload the provider card and open its current viewer link.
- Check Activity for a browser launch or sandbox error.

### Security check remains visible

Complete it manually. If the provider still refuses the session, use the matching direct API or CLI transport.

### Login succeeds but restore fails

Open Technical details on the provider card. Restore is deliberately conservative. A logged-out button or missing provider-specific positive signal keeps the provider unavailable.

### Remote dashboard does not open

- Confirm the SSH tunnel is still active.
- Confirm the service listens on `127.0.0.1:31338`.
- Confirm no local process already occupies workstation port `31338`.

## CLI controls

```text
conduit-bridge login <provider>
conduit-bridge login <provider> --status
conduit-bridge login <provider> --recheck
conduit-bridge login <provider> --cancel
```

`--local` is for a machine with a locally visible desktop. Use the dashboard viewer for a remote server.
