# Diagnostics

**Languages:** English (this file) | [Français](diagnostics-fr.md)

Every code the status pill can show, what triggers it and how to fix it.

The prefix of a code gives its **default** severity: `E-` for an error, `W-` for a warning. A
repository or an organisation can change it ([change a severity](#change-a-severity)), so what
counts is the **effective** severity the pill shows. A comment with at least one effective
error is non-compliant; a comment with warnings only stays compliant. Warnings never block a
send; errors do, and only in `enforce` mode ([modes](modes-and-adoption-en.md)).

## How a comment is checked

1. **The prefix is recognised**, or it is not. This step reports at most one problem and
   stops there: nothing useful can be said about a prefix that could not be read.
2. **The content is checked**: decorations, subject, discussion. These checks add up, and the
   pill lists them all, so that fixing one does not reveal the next.

Each message matches what you just typed. `The build is broken since this morning` gets the
expected format (`E-NO-LABEL`). `attention: the build is broken` has the right shape and gets
the list of labels (`E-UNKNOWN-LABEL`).

## Prefix

| Code | Triggered by | Example | Fix |
|---|---|---|---|
| `E-NO-LABEL` | The comment does not start with `label: subject`. | `The build is broken` | Add a label: `issue: the build is broken`. |
| `E-MALFORMED-PREFIX` | The line starts with a known label, but the prefix is malformed. The message names the exact reason. | `issue (blocking: x`, `issue blocking): x`, `issue (blocking) x`, `issue:x` | Close or open the parenthesis, add the colon, add a space after the colon. One click when the correction can be computed. |
| `E-UNKNOWN-LABEL` | The shape is right, but the label is not in the configured list. | `isue: x` | Use one of the listed labels; the closest one is proposed. |
| `W-CASE` | The label is written in another case. | `Issue: x` | One click: `issue: x`. |

## Decorations

| Code | Triggered by | Example | Fix |
|---|---|---|---|
| `E-DECORATION-SYNTAX` | A decoration is not a word of letters, digits and hyphens: forbidden character, inner space, empty element, empty parentheses. | `(perf*)`, `(non blocking)`, `(blocking,,)`, `()` | Write `(non-blocking)`, remove the empty element. |
| `E-UNKNOWN-DECORATION` | An unknown decoration, in a repository that turned free decorations off (`decorations.allowFree: false`). | `issue (urgent): x` | Use a known decoration. |
| `E-CONFLICT` | `(blocking)` on a label that can never be blocking, or two decorations that contradict each other. | `nitpick (blocking): x`, `issue (blocking, non-blocking): x` | Keep one intention. |
| `W-DECORATION-STYLE` | Upper case, spaces inside the parentheses, a duplicate, or no space before the parenthesis. | `(BLOCKING)`, `( blocking )`, `issue(blocking): x` | One click to the canonical form. |

## Subject

| Code | Triggered by | Example | Fix |
|---|---|---|---|
| `E-EMPTY-SUBJECT` | Nothing after the colon. | `issue:` | Add a one-line summary. |
| `E-DECISION-SUBJECT` | A `decision` reply whose reason is shorter than `rules.minDecisionSubjectLength` (20 by default). | `decision: ok` | State the reason. |
| `W-SUBJECT-TOO-SHORT` | A subject shorter than `rules.minSubjectLength` (5 by default). | `issue: bug` | Say a little more. |
| `W-SUBJECT-TOO-LONG` | A subject longer than `rules.maxSubjectLength` (120 by default). | | Keep the summary on the first line, move the rest to the discussion. |

## Discussion and context

| Code | Triggered by | Example | Fix |
|---|---|---|---|
| `W-NO-DISCUSSION` | A **blocking** comment with nothing outside its prefix line. | `issue: memory leak` alone | Explain why the point must be addressed. |
| `W-MISSING-DECORATION` | A `suggestion` or a `question` without `(blocking)`, `(non-blocking)` or `(if-minor)`. A free decoration such as `(perf)` does not silence it. | `suggestion: extract a method` | Say whether the point blocks. |
| `W-NOT-BLOCKABLE` | A blocking comment written where no thread can be resolved, such as GitHub's general conversation. It will not be counted among the blocking threads. | `issue: please rebase` as a general comment | Write it on a line of the diff, or make it `(non-blocking)`. |
| `W-SESSION-MULTIPLE` | More than one `[session:…]` line: no session is designated. | | Keep a single marker line. |

## Change a severity

A repository can change the severity of a code with `severities`
([configuration](configuration-en.md#severities)):

```json
{ "severities": { "W-MISSING-DECORATION": "off", "W-SUBJECT-TOO-LONG": "error" } }
```

Two limits hold whatever the configuration says: an `E-` code can be lowered to a warning but
never turned off, and `W-SESSION-MULTIPLE` can never become an error.

## Configuration notices

After the diagnostics, the pill can show notices about the configuration itself. They change
no verdict.

| Notice | Meaning |
|---|---|
| Key ignored: it would relax the enterprise floor | The repository or the organisation set a value below the minimum that the enterprise policy imposes (the floor). The floor applies. |
| Unknown or retired key, obsolete value | The key is ignored; the rest of the file applies. `"mode": "warn"` is read as `"assist"`. |
| Invalid configuration | The file cannot be parsed or a known key has an unusable value. The extension falls back to the last valid level: the organisation's configuration, then the product defaults. |
| Unsupported version | The file was written for a newer version of the extension. The extension falls back to `assist`, or to the enterprise floor if it is stricter. |

*Configuration unread* is different: the extension could not reach the file at all. It then
assists without blocking ([FAQ](faq-en.md#the-pill-says-configuration-unread)).
