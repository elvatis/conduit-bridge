# Examples

Start with a small task whose result you can check. The dashboard's **Help**
page contains the same starting points and can reopen the introduction.
**Use as draft** appends an example to your existing input and focuses it;
review it before sending. Selecting the Insights example only opens that page.

## Understand a topic

Open **Chat**, choose an available model and adapt this draft:

> Explain the difference between a saved conversation, a reusable memory and an
> agent run. Use one concrete example for each. Finish with one question that
> helps me choose the right starting point.

A useful answer distinguishes stored messages, reusable context and recorded
execution. Follow up where the explanation remains unclear. The example makes
no workspace changes.

## Review a change

Choose the registered repository in **Execution**, then use:

> Review the current workspace changes without editing files. Summarize the
> intended behavior, identify concrete defects with file references and suggest
> the smallest useful checks. Separate observed findings from assumptions.

Review the proposed findings and open the referenced files in **Git workspace**.
A useful finding names a trigger, an incorrect result and the affected code.
If the model claims it ran checks, verify the recorded execution evidence.
The prompt does not replace the permission and approval controls on the run.

## Make a bounded plan

Open **Execution** and start with:

> Plan an improvement to this workspace's getting-started documentation. First
> identify its audience and missing examples. Propose three small steps with
> acceptance criteria. Do not change files or run commands yet.

Check that each step has an observable completion condition. For example,
"add one runnable first-request example and confirm its internal links" is
more reviewable than "improve the documentation". Adjust the scope before
authorizing implementation.

## Combine earlier conversations

Suppose your own saved conversations contain these statements:

| Message | Candidate category |
| --- | --- |
| "We chose SQLite for retained conversations." | Decision |
| "The restart check retained all seven chats." | Reported result |
| "Check input width whenever a help icon is added." | Lesson |
| "The encrypted backup restore still needs testing." | Open task |

Open **Insights** and choose **Build insights**. Local BitNet reads eligible
messages and selects representative original statements. Expand each item's sources, compare
the excerpt with the full message and check whether the category fits. These
are illustrative candidate results; the selection can omit a point or put it
in a different category. The displayed wording comes directly from a message.

If you add another conversation, the report becomes out of date. Refresh it to
include the new history. If you edit or remove an analyzed source, its derived
report disappears until a new analysis completes. See
[Session insights](../guides/session-insights.md) for coverage, cancellation,
source validation and local-model limits.

## Find controls with the keyboard

1. Press **Ctrl+K** or **Command+K** and type part of a page name.
2. Use Up/Down to select a result and Enter to open it. The page heading receives
   focus. Search includes pages hidden by your navigation preferences.
3. Press Escape to close search and return to the invoking control.
4. On a fresh visit, choose the brief introduction offer. Later, reopen it from
   Help. Dismissing the offer persists in that browser.

The **Skip to content** link appears on keyboard focus. Dialogs keep their
background inactive, support Escape and return focus when closed. On narrow
screens, focus the introduction's content region to scroll it with the keyboard.

## More complete examples

- [Execution, Git and repository analytics](../../examples/workspace/README.md)
- [Pipelines with review and approvals](../guides/pipelines.md)
- [REST conversations, memory, skills and runs](../guides/platform.md)
- [Storage adapters and backups](../guides/storage.md)
