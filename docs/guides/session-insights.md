# Insights from saved conversations

Open **Insights** (**Erkenntnisse**) in the main navigation and choose
**Build insights**. Local BitNet reads the complete messages in your own saved
chats and produces four sections: results, decisions, lessons and tasks/requests.
The summary is extractive: BitNet selects representative original statements
and groups them. Result text stays in the source's wording and language.
The page shows how many chats and messages are available, which messages are
excluded, and the analysis progress. Use the stop icon to cancel a running job.

Expand **Sources** below an item to see an exact excerpt and open its original
message. Check the message's role and surrounding conversation before relying
on the summary. An assistant's claim that a test passed is still a claim in a
conversation; the summary does not independently rerun that test.

## What is included

- Every nonempty message with complete status, including long messages split
  into small sections. Pending, failed, interrupted and empty messages are
  counted as excluded. Attachments are included only where their text is
  already part of a saved message.
- All of the current operator's accessible saved chats, across its permitted
  workspaces. An administrator's report also stays within that administrator's
  own chats; it does not combine other operators' histories.
- Both user and assistant messages. A request is evidence of requested work,
  not proof of completion or of its current status.

BitNet can omit details or assign a wrong category. A selected task request may
already have been resolved elsewhere in the conversation; inspect its context.
Exact excerpt matching checks where evidence came from; it cannot prove the
model's interpretation or the truth of the original statement.
An empty category means the model returned no items there, not that the history
contains no relevant information.

## Local processing and saved progress

The feature uses `bitnet/auto` with a loopback `BITNET_URL`. A remote BitNet URL
is rejected. It has no cloud-model fallback. See [BitNet setup](bitnet.md) if
the local service is unavailable.

Extraction groups never combine different messages. Each request uses bounded
text fragments and a JSON schema with valid categories and source indices.
Allowed excerpts are drawn from the current input. Each extracted item must
contain one of those exact excerpts. The application resolves the source from
the matching excerpt instead of trusting the model's numeric citation. An invalid
response is retried once; continued invalid output fails the job with a generic
error. Completed sections remain available for another attempt.

Results from the same category are reduced by selecting representative excerpts
until at most three items remain per category. Selected items retain original excerpts
and up to eight source messages. This is a concise summary, not an exhaustive
index. Every eligible input section is processed even when it contributes no
final item. For a specific phrase, use [Vault search](platform.md#vault-search-and-prompt-scans).

Progress and results use the existing encrypted platform store and backup
format. Cancelling, reaching the 30-minute job limit or restarting the bridge
keeps completed extraction batches. **Continue analysis** reuses them if the
sources, analysis language and credential are unchanged. The combining phase may
run again. Each BitNet request has a 120-second limit and a 512-token output
budget; only one insights job runs at a time. The local model's context capacity
still applies, especially for unusually dense source text.

Adding messages marks an existing report out of date while leaving it readable.
Editing or deleting any analyzed message, removing source access or changing
the credential hides the derived report. These checks run before and after
inference, before commits and on every report read. A fresh analysis uses the
current history. Refreshing an unchanged completed report reuses it without
calling BitNet again.

Insights do not create memories, execute tasks or alter the original chats.
An operator chooses when to start or continue an analysis. Viewers and reviewers
can read their own available report but cannot start or cancel jobs.

## HTTP interface

Use the normal platform bearer credential. Owner IDs supplied by a client do
not change the analysis scope.

| Request | Behavior |
| --- | --- |
| `GET /v1/platform/insights` | Own coverage, stale flag, job progress and optional report. |
| `POST /v1/platform/insights/refresh` with `{"language":"de"}` or `{"language":"en"}` | Queues local processing with HTTP 202. Operator/admin required; another active job returns 409. |
| `POST /v1/platform/insights/cancel` with `{}` | Cancels only the caller's active job. Operator/admin required. |

`job.status` is `idle`, `running`, `complete`, `cancelled`, `interrupted` or
`error`. `job.phase` is `reading` or `merging`; `completed` and `total` count
extraction batches. `report` includes coverage counts, `generatedAt`, requested
`language`, and items with `kind`, `text` and `sources`. Language controls the
analysis instructions; original result text is never translated. Public sources contain
`sessionId`, `messageId`, one-based `messageNumber`, `title` and the verified
original `quote`. Private
content hashes and authorization versions are not returned.

See the [worked example](../examples/README.md#combine-earlier-conversations)
and [validation record](../validation/session-insights.md).
