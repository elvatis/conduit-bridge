# VS Code WebSocket bridge

Conduit exposes a dedicated bidirectional WebSocket endpoint at `ws://127.0.0.1:31338/vscode`. It is separate from `/v1/events`: the event socket remains server-to-client only and never accepts commands.

The extension must send its bearer in the HTTP upgrade header:

```http
GET /vscode HTTP/1.1
Connection: Upgrade
Upgrade: websocket
Sec-WebSocket-Version: 13
Authorization: Bearer <platform-or-bridge-token>
```

Tokens are not accepted in the URL or a WebSocket subprotocol. When an `Origin` header is present, it must match the bridge allowlist. The bridge authenticates again for every message, so revoking an operator or rotating the bridge token closes an existing connection before it can do more work.

## Client example

VS Code extensions run in Node and can use the audited `ws` client package to set an upgrade header. This client dependency belongs in the extension; conduit-bridge does not require a WebSocket package.

```ts
import WebSocket from 'ws';

const socket = new WebSocket('ws://127.0.0.1:31338/vscode', {
  headers: { Authorization: `Bearer ${await loadTokenFromSecretStorage()}` },
  maxPayload: 256 * 1024,
});

socket.on('message', raw => {
  const message = JSON.parse(raw.toString());
  if (message.type === 'stream-chunk') appendToEditorPreview(message.payload.delta);
  if (message.type === 'response') finishRequest(message.requestId, message.payload);
  if (message.type === 'usage') updateCostDisplay(message.payload);
  if (message.type === 'error') showError(message.payload.message);
});

function send(type: string, requestId: string, payload: object) {
  socket.send(JSON.stringify({ type, requestId, payload }));
}
```

Every client message is a JSON object with a unique `requestId`, one of four request types, and an object payload:

```ts
type Inbound = {
  requestId: string;
  type: 'chat' | 'inline-edit' | 'agent-session' | 'cost-query';
  payload: Record<string, unknown>;
};
```

The bridge sends `response`, `stream-chunk`, `usage`, or `error` messages carrying the same `requestId`. Up to four requests may be active on one connection. Messages are limited to 256 KiB. Disconnecting aborts active HTTP and provider work.

## Chat

Start an ephemeral platform session and stream one turn:

```ts
send('chat', 'chat-1', {
  model: 'cli-codex/gpt-5.6-sol',
  workspaceId: 'my-workspace',
  content: 'Explain the failing test.',
  maxOutputTokens: 1200,
});
```

The final `response` contains the created `sessionId` and the normal platform turn result. Supply that `sessionId` on later messages to continue the canonical conversation. To cancel a live turn without closing the socket:

```ts
send('chat', 'cancel-1', { action: 'cancel', targetRequestId: 'chat-1' });
```

Chat is routed through `/v1/platform/sessions` and its message endpoint. Platform role, workspace, model, profile, memory, rate, concurrency, and budget checks therefore apply unchanged.

## Inline edit proposal

Inline edit always uses platform chat mode and returns a proposal for the extension to show in a diff. The bridge does not write the file or accept an `apply` option.

```ts
send('inline-edit', 'edit-1', {
  model: 'cli-codex/gpt-5.6-sol',
  workspaceId: 'my-workspace',
  filePath: 'src/cache.ts',
  languageId: 'typescript',
  instruction: 'Make this lookup safe when the entry is missing.',
  code: editor.document.getText(editor.selection),
});
```

The final payload has this shape:

```json
{
  "kind": "inline-edit",
  "sessionId": "session-...",
  "proposal": "replacement source text",
  "applyRequired": true
}
```

The extension remains responsible for presenting a diff and obtaining explicit user acceptance before editing the document.

## Durable agent session

Agent starts always enter the durable platform run queue with `mode: "agent"` and `requiresApproval: true`. The client cannot override either field.

```ts
send('agent-session', 'agent-1', {
  action: 'start',
  model: 'cli-codex/gpt-5.6-sol',
  workspaceId: 'my-workspace',
  repository: 'conduit-bridge',
  prompt: 'Implement the reviewed cache change and run its focused tests.',
  maxIterations: 3,
  maxCostUsd: 0.5,
});
```

The response contains a durable run in `waiting_approval`. A reviewer can approve or reject it; an operator can cancel it. The platform API checks the current role, owner, workspace grant, repository policy, credential version, concurrency limit, and budget for each action.

```ts
send('agent-session', 'agent-status', { action: 'status', runId: 'run-...' });
send('agent-session', 'agent-approve', { action: 'approve', runId: 'run-...' });
send('agent-session', 'agent-reject', { action: 'reject', runId: 'run-...', feedback: 'Needs a narrower change.' });
send('agent-session', 'agent-cancel', { action: 'cancel', runId: 'run-...' });
```

Agent responses are accompanied by a `usage` message containing the run's current `costUsd`, token count, and status. Poll `status` to follow a queued or running durable job.

## Cost query

Cost queries expose only runs the current platform operator may view. Omitting `runId` aggregates the authorized run list; supplying one returns that run's counters.

```ts
send('cost-query', 'cost-all', {});
send('cost-query', 'cost-one', { runId: 'run-...' });
```

The bridge sends a `usage` message and a final `response` with `costUsd`, `tokens`, and `runCount`. It does not return other operators' prompts or run inputs.

## Errors and transport behavior

Errors have a bounded, redacted structure:

```json
{
  "type": "error",
  "requestId": "chat-1",
  "payload": {
    "message": "The request could not be completed",
    "status": 500,
    "code": "internal_error"
  }
}
```

Clients must send masked text frames. Fragmented text is supported. Binary data, invalid UTF-8, unmasked frames, oversized messages, and invalid control frames close the connection with the appropriate WebSocket status. Ping frames receive pong frames. A normal bridge shutdown sends close status `1001` and aborts active requests.
