# Try the agent pipelines

These three short examples exercise actual provider calls through Conduit Bridge:

| Example | What happens | What the runner verifies |
| --- | --- | --- |
| Write and verify | An agent creates `hello.txt` in a new scratch directory, then a read-only peer reads it. | Both steps executed, the peer reports `VERIFIED`, and the file contains the expected greeting. |
| Approval checkpoint | A model drafts a welcome sentence; the next model step waits for approval. | The gated step has no output before approval and executes afterward, producing `APPROVED:`. |
| Parallel debate | Two independent perspectives debate README order; a third step synthesizes them. | Both perspectives complete before synthesis begins, and all three steps return content. |

The [JSON definitions](../../examples/pipelines/) use `{{model}}` and `{{peer_model}}` placeholders. The runner substitutes your selected advertised model IDs and registers unique copies. It preserves the normal pipeline prompt placeholders such as `{{previous_output}}` and `{{prior_steps}}`.

## Start the branch locally

Use Node.js 24 or newer. Authenticate your chosen CLI tools normally, then:

```sh
npm install
npm run build
node dist/cli.js start
```

Open [the local dashboard](http://127.0.0.1:31338/) and choose models from **Models**, or query `GET /v1/models`. The write-and-verify example requires CLI models with filesystem tools. The approval and debate examples can also use API or local inference providers. Provider availability and quotas depend on your own accounts.

## Run the examples

Replace the two model IDs below with values advertised by your bridge:

```sh
node scripts/demo-pipelines.mjs --model <model-id> --peer-model <peer-model-id> --allow-write-demo --approve-demo
```

Use the same model twice by omitting `--peer-model`. Each role still has its own request and pipeline step. For a debate with different providers, select two supported model IDs from different transports.

`--allow-write-demo` explicitly authorizes the file example. The runner creates a new temporary workspace; the prompt asks the agent to create only `hello.txt`. A working directory is not an OS sandbox: the selected CLI's native agent permissions still apply.

`--approve-demo` submits approval for the known, synthetic final-text step. Omit it to leave that run paused, reload the dashboard, and use the **Approval inbox** or **Open run** action to approve it yourself. The runner labels automated decisions as `community-demo-script`.

Run only the short debate without allowing file writes:

```sh
node scripts/demo-pipelines.mjs --case community-debate --model <model-id> --peer-model <peer-model-id>
```

If the bridge requires authentication, set `CONDUIT_AUTH_TOKEN` in the runner's environment. The runner does not print it or put it in a URL. It accepts only a loopback bridge origin.

The runner prints the new workspace and a `demo-results.json` path. It retains the demo repository, pipeline definitions and runs for dashboard inspection. It does not change existing provider permissions, budgets or credentials. Use `--workspace-parent <directory>` to choose where the new scratch directory is created.

## Inspect the results

Open **Pipelines** in the dashboard. Select a completed demo in **Execution history** to see each role, output, timing and dependency. The approval example should show a real output and execution timestamps for its final step. During a run, **Cancel run** cancels active work and prevents dependent steps from starting.

Open **Usage** to inspect the model request counts and estimated token/cost totals. A successful set of these examples invokes seven model steps across three runs. A retry or unrelated request can add provider attempts, so compare the demo run IDs and timestamps rather than assuming all account activity belongs to the demo.

The cost field is a versioned bridge planning estimate, not a provider invoice. CLI subscriptions, local inference and direct APIs have different billing models. Run and daily/monthly limits use the shared estimator; an upstream provider that ignores cancellation or an output limit can still incur additional usage.

## HTTP lifecycle

```text
POST /v1/pipelines/run              -> 202 with run.id
GET  /v1/pipelines/runs/{runId}      -> current run and step state
POST /v1/pipelines/runs/action      -> approve, reject or cancel
GET  /v1/metrics                    -> provider request statistics
GET  /v1/analytics/overview         -> dashboard aggregates
```

Example approval body:

```json
{
  "runId": "<run-id>",
  "action": "approve",
  "stepId": "final",
  "feedback": "Approved the short welcome example.",
  "operator": "community-reviewer"
}
```

The server validates the pending step and the effective execution policy again. Repeating an approval must not execute a completed step again. A pipeline definition is snapshotted into its run, so editing the template cannot change already-started work.

Full prompts, step outputs and the frozen definition stay in memory during the service lifetime. Disk history stores bounded summaries. Reloading the browser can recover an approval and its outputs while the same service is running. Restarting the bridge marks running and paused work **interrupted**; inspect its workspace and start a new run. The bridge cannot safely resume exact work after deliberately discarding its prompt and output context.

The [recorded PR 117 validation](../validation/pr117.md) includes a successful real
run of all three examples, debate responses, timings and known CLI limitations.

## If a run fails

Inspect the failed step before trying again. Common causes are unavailable model IDs, a disconnected CLI, a disabled agent policy, insufficient budget, or a provider timeout. The runner stops on a failed assertion and retains its partial report. It never converts a failed provider call into a synthetic success.

For the file example, inspect the dedicated scratch directory before rerunning. Avoid automatic retries of agent steps that may already have modified files. Each invocation of the demo runner creates a new directory and new IDs.
