# Workspace examples

## Explore the interface

1. Start the bridge and open **Execution > Explore a sample**. The sample shows
   illustrative agents and command events without starting a provider.
2. Expand a command to inspect its output and exit status. Collapse and reopen
   the execution plan. **Pause updates** freezes display refresh only.
3. Drag the navigation's right edge, reload, and confirm the width is retained.
   Focus the divider and press Enter to restore its default width.
4. Open **Git workspace** for a registered repository. Expand Branches, select
   a history entry and inspect its file diff. **Repository analytics** provides
   range selection, production/test series, snapshot pinning and CSV export.
5. Open **Chat history**, create a project, and use the **Project** selector
   above an existing conversation to group it. Reload and reopen the chat to
   see its retained messages and workspace.

The read-only tour in [assets/demo.gif](../../assets/demo.gif) uses entirely
illustrative data. [Its English recording script](../../assets/README.md) can
be rerun against the current UI source without a running bridge.

## Queue a bounded review

Copy [review-request.json](review-request.json) to a temporary file. Replace
`{{model}}` with a planning-capable CLI model advertised by `GET /v1/models`.
Replace `{{workspace_id}}` and `{{workspace_path}}` with the matching values from
`GET /v1/platform/workspaces`. Use an effort level supported by that model.

Submit the resolved file to your local bridge:

```sh
curl http://127.0.0.1:31338/v1/platform/runs \
  -H "Content-Type: application/json" \
  --data-binary @review-request.local.json
```

An authenticated bridge also requires the operator's authorization header.
In Windows PowerShell, use `curl.exe` with the same arguments on one line.

The run should appear in **Execution** waiting for approval. Review its
workspace, model and limits before approving it. Rejection ends the pending
run. Approval permits a real provider request; the sample tour above does not.
Open the completed step for its public output and any available command events.
Cost limits use bridge estimates and may differ from provider billing.

## Build a two-step approval workflow

[review-pipeline.json](review-pipeline.json) supplies a chat-only template.
Replace the model placeholders with advertised IDs and POST the resolved JSON
to `/v1/pipelines`. Queue it with this body at `/v1/pipelines/run`:

```json
{
  "pipelineId": "workspace-review-example",
  "prompt": "Review the execution toolbar: align icon centers, verify keyboard focus, and check layout at 390 and 1920 pixels."
}
```

The first step drafts criteria from the supplied text. The second step waits
for approval before producing a checklist. It does not inspect your repository
or substitute for running the checks. Follow the
[pipeline lifecycle guide](../../docs/guides/pipelines.md#http-lifecycle) to
approve, reject or cancel a run, and inspect the evidence in Execution.

For real file writing, peer verification and a parallel debate, use the
[existing pipeline runner](../../docs/guides/pipelines.md#run-the-examples).

## Reproduce the functional checks

Run `npm test`, `npm run test:ui` and `npm run build` using the
[contributor setup](../../CONTRIBUTING.md#dashboard-verification). Browser
tests submit settings and review actions only to fixtures. The
[validation record](../../docs/validation/execution-workspace.md) distinguishes
those checks from real Git service fixtures and local browser inspection.
