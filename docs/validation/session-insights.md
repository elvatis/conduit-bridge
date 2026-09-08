# Session insights and usability validation

Recorded 2026-09-08 on Windows for PR #120. This records a development build,
not a released version or an accessibility certification.

## Automated checks

- Complete final Vitest suite: 633 tests in 71 files passed in 28.71 seconds.
- Complete Playwright suite: 57 cases passed in 1.6 minutes with Microsoft
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

Service contracts cover all eligible message fragments, Unicode boundaries,
owner separation even with administrator visibility, excluded unfinished
messages, strict JSON/category/source validation, original excerpt matching,
bounded schema references, one retry, hierarchical merging, unchanged-history
reuse and reopening a saved report through a new storage instance. They also
cover cancellation of an uncooperative provider, saved-batch continuation, recovery after a failed final durable commit,
source editing/deletion, uncited-source invalidation, revoked credentials,
empty history and generic errors without persisted provider excerpts.

HTTP tests reject invalid languages, remote BitNet URLs and unauthorized
start/cancel requests. They verify the local model, JSON schema, output budget,
own-session scope and absence of private hashes or authorization versions in
the returned report. Model output is mocked in automated tests; those tests
validate application behavior, not model accuracy.

## Native BitNet and visual checks

The running native BitNet b1.58 2B service uses a 2048-token context and eight
threads. Synthetic conversations exercised the actual provider and structured
schema. They exposed incorrect source indices, invented excerpts, category
mistakes and output remaining in English despite a German target language.
Source numbers are now limited to existing inputs, extraction is confined to
one message and allowed excerpts come directly from its text. Application-side
validation independently checks them and resolves source IDs from matching
excerpts instead of trusting model-selected indices. Invalid output is retried once and is
never silently accepted.

Native checks also exposed unsupported free-form summary text. The final
implementation therefore uses extractive summaries: the schema permits only
original excerpts, and the application uses the selected excerpt as the result
text. Both extraction and combining preserve that invariant. Earlier free-form
report formats are invalidated and rebuilt. The final synthetic check completes
with unchanged original text. Selection and classification remain model
judgments; the interface and guide explain omissions and category errors.
Original text stays in its source language.

The local bridge was rebuilt and restarted only after pure statistics showed
zero in-flight requests, running pipelines or approval-waiting pipelines. Its
existing seven chats remain visible. The first live all-history attempt
stopped on invalid evidence and retained its completed sections; the refined
build continued from that saved state. The final extractive analysis completed
all 34 complete messages from seven chats at 10:02:03 local time. Its five
distinct selected statements remained available after a further process
restart, with the same generation timestamp. A source link opened and focused
the matching original message. Multiple source messages from the same chat
have distinct numbered labels. Bridge and native BitNet health checks pass.

These chats are synthetic provider-continuity and persistence checks. The
model still placed some questions in unsuitable categories, which demonstrates
why the UI labels its selection and category judgments as fallible. The result
text itself is an unchanged source excerpt.

The regenerated English GIF includes an illustrative source-linked summary
and Help examples. The recording intercepts all requests and asserts that it
sent no mutations or provider calls. Desktop and narrow screenshots were
visually inspected for spacing, clipping, hierarchy and readable source text.

## Remaining verification limits

Automated accessibility checks cover only the rendered fixture states. They
do not establish screen-reader usability in every browser, operating system,
zoom setting or real dataset. Human assistive-technology review remains useful.
The application validates source existence and exact excerpts, not the truth
of a conversation or the model's semantic interpretation. Hierarchical
summaries and representative citations can omit detail; consult full messages
and Vault search for exhaustive evidence.
