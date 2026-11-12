# Labels and decorations

**Languages:** English (this file) | [Français](labels-fr.md)

Every label the extension ships, what it means, and what makes a comment blocking. A
repository can change this list ([configuration](configuration-en.md#labels)); what follows
is what you get with no configuration at all.

## Labels that raise a point

These are the labels of [Conventional Comments](https://conventionalcomments.org/). They open
a point; they are first the reviewer's.

| Label | Use it to… | Example | Blocking by default | Can be made blocking |
|---|---|---|:---:|:---:|
| 👏 `praise` | Point out something remarkable in the code. | `praise: very readable error handling` | No | Yes |
| 🔍 `nitpick` | Flag a minor preference, with nothing at stake. | `nitpick: trailing comma` | No | **No** |
| 💡 `suggestion` | Propose an improvement and say why. | `suggestion (non-blocking): extract a method` | No | Yes |
| 🔨 `issue` | Flag a problem to fix, ideally with a lead. | `issue: memory leak in the handler` | **Yes** | — |
| 📌 `todo` | Ask for a small but necessary change. | `todo: rename the variable` | **Yes** | — |
| ❓ `question` | Ask for clarification before concluding. | `question (non-blocking): why this choice?` | No | Yes |
| 💭 `thought` | Share an idea, asking for nothing. | `thought: we could factor this out later` | No | **No** |
| 🧹 `chore` | Ask for a side task before merging (job, doc, config…). | `chore: re-run the coverage job` | **Yes** | — |
| 📝 `note` | Share information everyone should know. | `note: this module is being reworked in Q3` | No | **No** |
| 🔤 `typo` | Flag a typo. | `typo: "recieve" → "receive"` | No | Yes |
| ✨ `polish` | Propose a finishing touch, without changing the meaning. | `polish: align the imports` | No | Yes |
| 🪶 `quibble` | Flag a debatable detail. **Shipped disabled.** | `quibble: slightly long name` | No | Yes |

`quibble` is the one label shipped disabled: Conventional Comments defines it as a `nitpick`
under another name, and two buttons for one meaning only leave an arbitrary choice. A
repository that wants it enables it with `{ "id": "quibble", "enabled": true }`.

"Use at least one `praise` per review" is good practice, not a rule: the extension never
checks it.

## Labels that are not part of Conventional Comments

Conventional Comments gives review **feedback** a vocabulary and says nothing about
**replying** to it, and it invites teams to diverge from its list. The extension adds seven
labels of its own. They are ordinary labels: same format, same decorations, same rules. None
of them can open a blocking thread.

### Replying to a point

| Label | Use it to… | Example | Also accepted |
|---|---|---|---|
| 🤝 `thanks` | Say thank you, without taking a position on the point or the code. | `thanks: thanks for the careful review` | `thx` |
| ✅ `done` | Say the code changed because of the remark. | `done: removed the platform-specific token` | `fixed` |
| 👌 `ack` | Accept a point without changing the code at this stage. | `ack: understood, I'll keep it in mind for the next module` | `acknowledged` |
| ✋ `disagree` | Decline a remark and say why. An opinion: it carries no authority and resolves nothing. | `disagree: the mapping is intentionally platform-independent` | |
| ⚖️ `decision` | Record, with a reason, that a point will **not** be addressed. Written by those who carry the pull request, in the thread it closes. | `decision: out of scope, debt tracked in PROJ-142` | |

```text
issue (blocking): platform CSS tokens leak into the shared stylesheet
```
```text
done: removed the platform-specific token
```

**`done`, `ack` or `disagree`?** A reply takes a position on one question: did the code
change, and if not, do I concede the point?

- The code changed → `done`.
- The code did not change and the point was valid (cost, scope, priority, or simply "noted")
  → `ack`.
- The code did not change because you contest the point → `disagree`.

`ack` is not a polite refusal: `ack: right, but I'm leaving it as is` is a `disagree`.

**`disagree` is not `decision`.** `disagree` is an opinion anyone can voice. `decision`
records a choice of those who carry the pull request; its subject must give the reason in at
least 20 characters, and it is validated even where replies are not
([closing a thread without making the change](writing-comments-en.md#closing-a-blocking-thread-without-making-the-change)).
Neither resolves the thread: that stays a gesture of the platform.

### Saying where a review stands

| Label | Use it to… | Example |
|---|---|---|
| 📋 `summary` | Recap a review or one pass: what was checked, what is still open. Closes nothing. | `summary: two points checked, one still open` |
| 🎉 `reviewed` | Close your own review: your points are dealt with, you have nothing to add. Approves nothing. | `reviewed: fixes checked, nothing to add` |

**When to post `reviewed`.** It closes your review as a whole, not one reading pass. Post it
once each of your points is dealt with (fixed and checked, or set aside by a reply you
accept) and a last read turns up nothing new. Any later change to the pull request reopens
your review. Each reviewer closes their own. What the pull request needs to be merged
(approvals, required reviewers) stays with the platform: the extension does not count
`reviewed`, and no number of them amounts to an approval.

A `summary` never stands in for `reviewed`, even when no point is left open.

### Sticking to Conventional Comments

Six of these seven labels form the **added labels**: `thanks`, `done`, `ack`, `disagree`,
`summary` and `reviewed`. A team that wants the upstream list only disables them in the
repository's configuration, one entry each. The [settings page](settings-en.md#added-labels)
shows the block and copies it for you:

```json
{ "labels": [ { "id": "thanks", "enabled": false },
              { "id": "done", "enabled": false },
              { "id": "ack", "enabled": false },
              { "id": "disagree", "enabled": false },
              { "id": "summary", "enabled": false },
              { "id": "reviewed", "enabled": false } ] }
```

`decision` is not in that group, so that removing the additions does not switch it off.

## Decorations

A decoration sits in parentheses between the label and the colon. Several are separated by
commas.

| Decoration | Effect |
|---|---|
| `(blocking)` | The comment is blocking, whatever its label. |
| `(non-blocking)` | The comment is not blocking, whatever its label. |
| `(if-minor)` | Not blocking: address the point only if the effort is small. |
| A free decoration: `(security)`, `(perf)`, `(a11y)`… | None. It describes the comment. Allowed by default (`decorations.allowFree`). |

```text
suggestion (non-blocking, perf): cache the compiled pattern
```

A decoration is one word made of letters, digits and hyphens. `(non blocking)`, `()` and
`(blocking,,)` are errors; `(BLOCKING)` and `( blocking )` are accepted with a warning and a
one-click fix.

`suggestion` and `question` say nothing by themselves about whether the point blocks, so the
extension warns when they carry none of the three decorations above.

## What makes a comment blocking

The first rule that applies wins:

1. A label that can never be blocking (`nitpick`, `thought`, `note` and the seven labels of
   the extension) with `(blocking)` is an **error**, `E-CONFLICT`.
2. `(blocking)` together with `(non-blocking)` or `(if-minor)` is an **error**, `E-CONFLICT`.
3. `(blocking)` alone → blocking.
4. `(non-blocking)` or `(if-minor)` → not blocking.
5. No such decoration → the label decides: `issue`, `todo` and `chore` are blocking, the
   others are not.

| Comment | Blocking? |
|---|---|
| `issue: …` | Yes |
| `issue (non-blocking): …` | No |
| `issue (if-minor): …` | No |
| `suggestion: …` | No, with a warning asking for a decoration |
| `suggestion (blocking): …` | Yes |
| `nitpick (blocking): …` | Error |

A blocking comment opens a **blocking thread** when it is the first comment of a thread that
can be resolved. The banner counts those threads while they are unresolved
([the banner](writing-comments-en.md#once-comments-are-published)). Editing `issue:` into
`note:` makes the thread non-blocking: the extension reads the current state of the page and
keeps no history.

## Aliases

An alias is another spelling accepted for a label: `fixed:` is read as `done:`, `thx:` as
`thanks:`, `acknowledged:` as `ack:`. An alias produces no diagnostic; the extension offers
to rewrite it to the label's name, without insisting. A repository can declare its own, for
example `bug` for `issue` ([configuration](configuration-en.md#labels)).
