# Insights from saved conversations

Open **Insights** (**Erkenntnisse**) in the main navigation and choose
**Build insights**. Local BitNet reads the complete messages in your own saved
chats and produces four sections: results, decisions, lessons and tasks/requests.
The summary is extractive: the application identifies supported statement types
and BitNet selects representative original statements. Result text stays in the
source's wording and language; selection cannot change its category or sources.
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

The summary is deliberately selective. A selected task request may
already have been resolved elsewhere in the conversation; inspect its context.
Exact excerpt matching checks where evidence came from; it cannot prove the
truth of the original statement. An empty category means no sufficiently clear
statements were selected there; it does not establish that none exist.

## Selection and categories

Whole source sentences are considered before transport chunking, so a negation
or question mark cannot be lost by classifying a truncated suffix. Conservative
English/German evidence rules distinguish explicit recorded choices, requested
or pending work, reusable advice and reported observations. For example:

| Original statement | Treatment |
| --- | --- |
| `Which database should we choose?` | Omitted; no choice has been recorded. |
| `We have not decided to use SQLite.` | Omitted; not a recorded decision. |
| `We decided not to use a cloud database.` | Decision, including the negation. |
| `Could you add a restore test?` | Task/request, not a result. |
| `The restore test passed.` | Reported result. |
| `Lesson learned: verify backup restoration.` | Lesson. |
| A codeword recall, exact echo instruction or standalone test token | Omitted. |

Tentative suggestions, hypothetical choices, quoted examples, Markdown code
blocks, headings and tables are not mined for facts. Statements without a
recognized signal, single sentences longer than 480 characters and excerpts
that exceed the encoded input budget are omitted
instead of being guessed or cut into misleading fragments. These are precision
guards with a recall tradeoff, not a universal language classifier. Unusual
wording and other languages may be missed. Source context remains important.

BitNet ranks only eligible statement IDs. The application keeps each ID's
wording, category and provenance together. When a section contains several
categories, it preserves at least one statement from each available category;
many results cannot erase the section's only decision, lesson or request.

## Local processing and saved progress

The feature uses `bitnet/auto` with a loopback `BITNET_URL`. A remote BitNet URL
is rejected. It has no cloud-model fallback. See [BitNet setup](bitnet.md) if
the local service is unavailable.

Extraction groups never combine different messages. Each request uses bounded
candidate text and a JSON schema containing only valid statement IDs and the
required selection count. Duplicate IDs, unknown IDs, an incorrect count and
extra fields are independently rejected. An invalid response is retried once;
continued invalid output fails the job with a generic error. Completed sections
remain available for another attempt. Sections with no eligible statements are
counted as processed without an unnecessary inference request.

Results from the same category are reduced by selecting representative excerpts
until at most three items remain per category. Reduction also selects only IDs;
it cannot rewrite an item or move it into another category. Selected items retain original excerpts
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
calling BitNet again. Reports from earlier selection formats are invalidated and
rebuilt so previously misclassified statements do not survive in the cache.

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
