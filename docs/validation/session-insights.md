# Session insights and usability validation

Recorded 2026-09-08 on Windows for PR #120. This records a development build,
not a released version or an accessibility certification.

## Automated checks

- After the selection/category repair: the complete Vitest suite passes
  690 tests in 72 files in 30.82 seconds. All nine affected browser cases pass
  in 53.8 seconds, including long original excerpts at 320/1280 pixels,
  source-message correspondence and the accessibility matrix below.
- The initial complete Playwright suite passed 57 cases in 1.6 minutes with Microsoft
  Edge. The matrix covers all 23 navigation pages and six platform panes in
  English and German at 390, 768, 1280, 1920 and 3840 CSS pixels.
- The final source-excerpt, deduplication and source-label refinements
  additionally passed all 52 insights, HTTP and translation tests and the
  production build. Six affected browser cases and the final source-link
  case also pass, including both narrow and desktop accessibility checks.
- axe-core WCAG A/AA checks passed on 23 pages, six panes and expanded
  navigation, plus populated insights, introduction, page search and Help
  examples at 320 and 1280 pixels. The checks found and led to fixes for
  low-contrast Git metadata and a scrollable introduction region that could
  not receive keyboard focus. Input boundaries and focus rings were also
  strengthened. No accessibility rule was excluded.
- Keyboard tests verify first-visit dismissal, persistence, Help re-entry,
  focus restoration, search arrows/Enter/Escape, no-result handling, current
  page semantics and opening a source message. A filled native search input
  initially consumed Escape to clear its value; explicit handling now closes
  the dialog and restores focus.
- Draft examples preserve existing input and never submit a request. Insight
  tests exercise read-only roles, refresh/cancellation, preserved expanded
  sources during polling, rejected writes, retry and owner/source invalidation.
- Secret Scan and npm audit pass; the audit reports zero vulnerabilities.
  Supply Chain Guard 6.0.15 finds zero reportable issues, retaining the two
  reviewed line-specific exceptions described in the
  [supply chain review](../operations/supply-chain-review.md).

Service contracts cover all complete input messages and their last sentences, Unicode boundaries,
owner separation even with administrator visibility, excluded unfinished
messages, strict JSON/category/source validation, original excerpt matching,
bounded statement IDs, duplicate/count rejection, one retry, hierarchical merging, unchanged-history
reuse and reopening a saved report through a new storage instance. They also
cover cancellation of an uncooperative provider, saved-batch continuation, recovery after a failed final durable commit,
source editing/deletion, uncited-source invalidation, revoked credentials,
empty history and generic errors without persisted provider excerpts.

HTTP tests reject invalid languages, remote BitNet URLs and unauthorized
start/cancel requests. They verify the local model, JSON schema, output budget,
own-session scope and absence of private hashes or authorization versions in
the returned report. Model output is mocked in automated tests; those tests
validate application behavior, not model accuracy.

## Native BitNet: selection/category repair

The running native BitNet b1.58 2B service uses a 2048-token context and eight
threads. The initial implementation accepted original excerpts but still let
the model choose their categories. A fixed synthetic set of 18 English/German
cases reproduced the defect: only 7 passed. Both database-choice questions
became decisions, a codeword question became a result, a standalone test token
became a lesson and an undecided statement became a decision.

The repaired path passes all 18 cases. Nine clear statements use actual BitNet
inference; nine irrelevant or unsupported inputs are rejected before inference.
Three additional native scenarios pass: mixed-category coverage despite many
results, hierarchical selection across six decisions, and deduplication with
three separate source messages. The complete native run passes 21 of 21 checks
with 21 inference calls. These are fixed regression examples, not an estimate
of accuracy on arbitrary conversations.

Reproduce explicitly from the repository root, with local BitNet running:

```sh
node scripts/check-native-insights.mjs --run
```

The runner uses only committed synthetic fixtures and an ephemeral in-memory
conversation store. It emits case IDs, expected/actual categories, pass/fail and
source-check booleans, without logging provider prompts or response bodies.
It requires a loopback endpoint and fails if a check fails.

Whole sentences receive conservative English/German evidence checks before
transport chunking. Explicit choices, requests/pending work, reusable advice
and observations have distinct signals. Questions, unmade choices, hypothetical
suggestions, code blocks, quoted examples and test echoes are rejected. BitNet
can only select existing IDs; wording, category and provenance remain attached.
Each input selection preserves available category diversity, and hierarchical
reduction cannot relabel statements or generate text. Format 3 invalidates old
free-form and model-classified reports.

Additional offline regressions cover German negation with umlauts, a decision
against an option, decisions with a hypothetical future benefit, embedded
questions, repeated failures that are observations rather than lessons,
unmade decisions under a `Decision:` label, negations across batch boundaries
and bounded, terminating reduction of escape-heavy source text. An intermediate
HTTP fixture encountered a one-off OS-assigned port rejected by native fetch;
the complete final suite, including that fixture, passed on rerun.

The local bridge was rebuilt and restarted after pure statistics showed zero
in-flight requests, running pipelines and approval-waiting pipelines. All seven
existing chats were retained. At 10:52:20 local time the repaired analysis
completed all 34 messages and saved an empty report: these chats contain provider
continuity/persistence test exchanges and generic help, without sufficiently
clear supported insights. The previous five misleading entries are gone.
Original persistence and codeword-handoff messages were checked in the UI;
the chats themselves were unchanged. A further restart on the final build
preserved the corrected report's generation timestamp, coverage and empty items.
Bridge and native BitNet remain healthy.

## Earlier visual and persistence checks

Before the category repair, the extractive report's generation timestamp and
source excerpts survived a process restart. A source link opened and focused
the matching original message. Storage reopening and source links remain covered
by automated regressions in the repaired version.

The refreshed English GIF uses the current evidence classifier on seven
synthetic messages, asserting that a question and two echo messages are omitted
while four supported statements retain their categories. It shows numbered
source links, opens the exact original message, and includes Help examples,
introduction re-entry and page search. Captions remain readable above dialog
backdrops. Recording intercepts all requests and asserts that it sent no
mutations or provider calls. Source frames and decoded final GIF frames were
visually inspected. FFprobe confirms 1200x800 pixels, 407 frames and 40.7
seconds, approximately 2.01 MiB. Earlier desktop and narrow screenshots were
also checked for spacing, clipping, hierarchy and readable source text.

## Remaining verification limits

Automated accessibility checks cover only the rendered fixture states. They
do not establish screen-reader usability in every browser, operating system,
zoom setting or real dataset. Human assistive-technology review remains useful.
The application validates source existence and exact excerpts, not the truth
of a conversation. The category gates deliberately omit unclear phrasing,
unsupported languages and individual sentences over 480 characters. They are
not a universal semantic classifier. Ranking, hierarchical selection and
representative citations can omit detail; consult full messages and Vault
search for exhaustive evidence. A task request is not proof that it is still open.
