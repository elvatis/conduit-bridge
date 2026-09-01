// Built-in browser-login viewer.
//
// Chromium renders on the supported local desktop. Conduit captures only the
// active login page and accepts a small, validated set of input events through
// its existing authenticated HTTP listener. VNC, noVNC and websockify are not
// part of this path.

import type { IncomingMessage, ServerResponse } from 'node:http';

export type LoginViewerInput =
  | { type: 'pointer'; action: 'move' | 'down' | 'up' | 'click'; x: number; y: number; button?: 'left' | 'middle' | 'right' }
  | { type: 'wheel'; deltaX: number; deltaY: number }
  | { type: 'key'; action: 'down' | 'up'; key: string }
  | { type: 'text'; text: string };

export function loginViewerUrl(provider: string): string {
  return `/v1/login/${encodeURIComponent(provider)}/viewer`;
}

function viewerHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Conduit Login Browser</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    html,body{height:100%;margin:0;background:#07111f;color:#dbeafe;font:14px system-ui,sans-serif}
    body{display:grid;grid-template-rows:auto 1fr}
    header{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#0d1d31;border-bottom:1px solid #243b55}
    header strong{font-size:15px}
    header span{color:#93a9c3}
    #status{margin-left:auto;padding:5px 9px;border-radius:999px;background:#18304e}
    #stage{display:grid;place-items:center;min-height:0;padding:12px;overflow:hidden}
    #screen{display:block;max-width:100%;max-height:100%;object-fit:contain;outline:none;cursor:crosshair;box-shadow:0 14px 50px #000a;background:#fff;touch-action:none}
    #screen:focus{box-shadow:0 0 0 2px #4da3ff,0 14px 50px #000a}
  </style>
</head>
<body>
  <header><strong>Conduit login</strong><span id="provider"></span><span id="status">Connecting</span></header>
  <div id="stage"><img id="screen" alt="Live browser page" tabindex="0" draggable="false"></div>
  <script>
    const viewerSuffix = '/viewer';
    const base = location.pathname.endsWith(viewerSuffix)
      ? location.pathname.slice(0, -viewerSuffix.length)
      : '';
    const provider = base.split('/').pop() || '';
    const screen = document.getElementById('screen');
    const status = document.getElementById('status');
    document.getElementById('provider').textContent = decodeURIComponent(provider);
    let stopped = false;
    let naturalWidth = 1;
    let naturalHeight = 1;
    let inputChain = Promise.resolve();
    let pendingMove = null;
    let moveTimer = null;
    let pendingWheel = {deltaX:0,deltaY:0};
    let wheelTimer = null;

    function send(event) {
      inputChain = inputChain.then(async () => {
        try {
          const response = await fetch(base + '/input', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(event),
          });
          if (!response.ok) status.textContent = response.status === 409 ? 'Login browser closed' : 'Input rejected';
        } catch {
          status.textContent = 'Connection lost';
        }
      });
      return inputChain;
    }

    function point(event) {
      const box = screen.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(naturalWidth, (event.clientX - box.left) * naturalWidth / box.width)),
        y: Math.max(0, Math.min(naturalHeight, (event.clientY - box.top) * naturalHeight / box.height)),
      };
    }

    screen.addEventListener('pointermove', event => {
      pendingMove = point(event);
      if (moveTimer) return;
      moveTimer = setTimeout(() => {
        moveTimer = null;
        const p = pendingMove;
        pendingMove = null;
        if (p) send({type:'pointer',action:'move',x:p.x,y:p.y});
      }, 75);
    });
    screen.addEventListener('pointerdown', event => {
      event.preventDefault();
      screen.focus();
      try { screen.setPointerCapture(event.pointerId); } catch {}
    });
    screen.addEventListener('pointerup', event => {
      event.preventDefault();
      try { screen.releasePointerCapture(event.pointerId); } catch {}
    });
    screen.addEventListener('click', event => {
      event.preventDefault();
      const p = point(event);
      send({type:'pointer',action:'click',x:p.x,y:p.y,button:event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left'});
    });
    screen.addEventListener('contextmenu', event => event.preventDefault());
    screen.addEventListener('wheel', event => {
      event.preventDefault();
      pendingWheel.deltaX += event.deltaX;
      pendingWheel.deltaY += event.deltaY;
      if (wheelTimer) return;
      wheelTimer = setTimeout(() => {
        wheelTimer = null;
        const wheel = pendingWheel;
        pendingWheel = {deltaX:0,deltaY:0};
        send({type:'wheel',deltaX:wheel.deltaX,deltaY:wheel.deltaY});
      }, 50);
    }, {passive:false});
    screen.addEventListener('keydown', event => {
      event.preventDefault();
      send({type:'key',action:'down',key:event.key});
    });
    screen.addEventListener('keyup', event => {
      event.preventDefault();
      send({type:'key',action:'up',key:event.key});
    });
    screen.addEventListener('paste', event => {
      event.preventDefault();
      const text = event.clipboardData && event.clipboardData.getData('text/plain');
      if (text) send({type:'text',text});
    });

    async function refresh() {
      if (stopped) return;
      try {
        const response = await fetch(base + '/frame?at=' + Date.now(), {cache:'no-store'});
        if (response.status === 409) {
          status.textContent = 'Waiting for login browser';
          setTimeout(refresh, 500);
          return;
        }
        if (!response.ok) throw new Error('frame unavailable');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const previous = screen.src;
        screen.onload = () => {
          naturalWidth = screen.naturalWidth || 1;
          naturalHeight = screen.naturalHeight || 1;
          status.textContent = 'Connected';
          if (previous.startsWith('blob:')) URL.revokeObjectURL(previous);
        };
        screen.src = url;
      } catch {
        status.textContent = 'Reconnecting';
      }
      setTimeout(refresh, 250);
    }
    refresh();
  </script>
</body>
</html>`;
}

export function serveLoginViewer(req: IncomingMessage, res: ServerResponse): void {
  if ((req.method ?? 'GET') !== 'GET' && (req.method ?? 'GET') !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const html = viewerHtml();
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self' blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'",
  });
  if (req.method === 'HEAD') res.end(); else res.end(html);
}

export function validateLoginViewerInput(value: unknown): LoginViewerInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (input.type === 'pointer') {
    const action = input.action;
    const button = input.button ?? 'left';
    if (!['move', 'down', 'up', 'click'].includes(String(action))) return null;
    if (!['left', 'middle', 'right'].includes(String(button))) return null;
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) return null;
    return {
      type: 'pointer',
      action: action as 'move' | 'down' | 'up' | 'click',
      x: Math.max(0, Math.min(10_000, Number(input.x))),
      y: Math.max(0, Math.min(10_000, Number(input.y))),
      button: button as 'left' | 'middle' | 'right',
    };
  }
  if (input.type === 'wheel') {
    if (!Number.isFinite(input.deltaX) || !Number.isFinite(input.deltaY)) return null;
    return {
      type: 'wheel',
      deltaX: Math.max(-4000, Math.min(4000, Number(input.deltaX))),
      deltaY: Math.max(-4000, Math.min(4000, Number(input.deltaY))),
    };
  }
  if (input.type === 'key') {
    if (!['down', 'up'].includes(String(input.action)) || typeof input.key !== 'string' || input.key.length > 40) return null;
    return { type: 'key', action: input.action as 'down' | 'up', key: input.key };
  }
  if (input.type === 'text') {
    if (typeof input.text !== 'string' || input.text.length > 16_384) return null;
    return { type: 'text', text: input.text };
  }
  return null;
}
