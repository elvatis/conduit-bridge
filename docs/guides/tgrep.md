# tgrep code search

`tgrep` is an optional local code-search engine. Conduit uses it to index a
registered workspace and answer fast regex-style searches without sending source
code to a model or a remote search service.

It is not semantic search and it does not generate embeddings. Think of it as a
locally indexed companion to ripgrep: useful when repeated searches across the
same source tree should be fast, while retaining a familiar text-search model.

## How search is chosen

For each authorized workspace search, Conduit uses this order:

1. A configured loopback `tgrep` daemon, when it answers its JSON-RPC health
   request.
2. The installed `tgrep` executable and that workspace's local index.
3. `rg --json --no-config` when tgrep is absent or unavailable.

Search results are not trusted merely because they appear in an index. Conduit
checks every returned path against the authorized workspace and reads the final
snippet through its filesystem authorization.

## Install and configure tgrep

Install a native `tgrep` executable from the
[upstream project](https://github.com/microsoft/tgrep) and make it available on
`PATH`, or give Conduit an absolute path through an ignored `.env` file:

```dotenv
TGREP_BINARY=C:/tools/tgrep/tgrep.exe
```

The optional settings below are for an externally started local daemon:

```dotenv
TGREP_URL=tcp://127.0.0.1:7700
TGREP_INDEX_PATH=C:/work/project
```

`TGREP_URL` must identify a loopback TCP endpoint. When configuring an external
daemon, set `TGREP_INDEX_PATH` to the exact workspace root before asking Conduit
to rebuild it. This prevents an approved request for one workspace from mutating
another daemon's index.

If neither variable is set, Conduit uses the local executable and stores each
workspace index under the runtime directory:

```text
<CONDUIT_HOME>/tgrep/<hash-of-canonical-workspace-path>/
```

The index is outside the source tree, so it does not add generated files to the
repository or alter a project's own tooling.

## Build an index

Select or register the workspace first. Indexing is an explicit execution action
and needs the applicable workspace permission. From a local administrator setup:

```powershell
Invoke-RestMethod http://127.0.0.1:31338/api/tgrep/index `
  -Method Post -ContentType application/json `
  -Body '{"cwd":"C:/work/project","approved":true}'
```

Use a complete rebuild when ignore rules or a large number of files changed:

```powershell
Invoke-RestMethod http://127.0.0.1:31338/api/tgrep/index `
  -Method Post -ContentType application/json `
  -Body '{"cwd":"C:/work/project","approved":true,"force":true}'
```

For a bridge with bearer authentication, include the administrator bearer header.
The current API accepts a registered `workspaceId` as well when the caller needs
to select a workspace explicitly.

## Run the managed daemon

For repeated searches, Conduit can start one tgrep daemon for a selected
workspace. tgrep chooses its own loopback port and writes its `serve.json`
discovery record beside the index.

```powershell
Invoke-RestMethod http://127.0.0.1:31338/api/tgrep/server `
  -Method Post -ContentType application/json `
  -Body '{"action":"start","cwd":"C:/work/project","approved":true}'
```

Check the owned process:

```powershell
Invoke-RestMethod http://127.0.0.1:31338/api/tgrep/server `
  -Method Post -ContentType application/json `
  -Body '{"action":"status"}'
```

Stop only the daemon the current bridge process started:

```powershell
Invoke-RestMethod http://127.0.0.1:31338/api/tgrep/server `
  -Method Post -ContentType application/json `
  -Body '{"action":"stop","approved":true}'
```

The bridge will not adopt a process only because a PID file exists. A stale
`tgrep-server.pid` needs inspection before it is removed.

## Search from the tool API

The `code-search` tool accepts a regex-style `pattern`, an optional `cwd`, and
up to 200 results. This request searches only the selected workspace:

```json
POST /v1/platform/tools/code-search/execute

{
  "workspaceId": "your-workspace-id",
  "arguments": {
    "action": "search",
    "pattern": "createContentCipher",
    "maxResults": 20
  }
}
```

Each result contains a workspace-relative file path, one-based line and column,
and a bounded source snippet. Use the same tool with `action: "index"`,
`"reindex"`, or `"status"` when your authenticated role permits it.

## Privacy and limits

- tgrep and its daemon are restricted to loopback connections.
- Indexes exclude `.git`, `.ssh`, `.conduit`, `.codex`, `.agents`, and
  `node_modules`; `.env` files are also excluded from search results.
- Search roots must remain inside the selected workspace after canonical path
  resolution. Traversal, links, stale paths, credential files, and oversized
  files are refused.
- Indexing and searches limit indexed file size to 64 KiB. Search patterns are
  limited to one line and 2,000 characters; results are capped at 200.
- A native subprocess is not an operating-system sandbox. Treat installed tools
  and their local data with the same care as other trusted desktop programs.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Search uses ripgrep | Install `tgrep`, set `TGREP_BINARY`, or start the managed daemon. The fallback is expected and remains local. |
| Index build fails | Confirm the executable is a native binary, the workspace exists, and the caller has execute permission for code search. |
| External daemon rebuild is rejected | Set `TGREP_INDEX_PATH` to that daemon's canonical workspace root. |
| A result is missing | Confirm the file is not ignored, excluded, larger than 64 KiB, or outside the authorized workspace. |
| The daemon cannot start | Inspect the old PID record and ensure another process is not already managing that index. |

The [integration reference](../reference/integrations.md) documents the related
HTTP routes. Runtime data and index locations are described in
[Storage and backups](storage.md).
