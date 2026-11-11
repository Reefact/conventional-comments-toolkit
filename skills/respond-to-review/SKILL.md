---
name: respond-to-review
description: As the author of a GitHub pull request, answer its review findings and questions with Conventional Comments reply labels — `done`, `ack`, `disagree`, `thanks`, plus `note` and `question` — fix what needs fixing, and push. Use when a pull request you wrote receives review comments, or when asked to address a review. Never posts `reviewed` or `decision`, never approves, never merges.
---

# Respond to a review

You are the author of the pull request: you wrote its code, and you are answering its review.
Every finding or question a reviewer raises gets an answer, in its own thread, and the answer
says what you did about it. A reviewer's `reviewed:` comment is not one of them: it closes their
review, raises no point and asks nothing, so it needs no reply. Nor does a `summary:`, which
recaps where their review stands: answer the findings it points to, in their own threads.

## 0. Language

**Write every reply in the language the repository requires.** Look for it before posting:
`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, or any other contribution guide the repository keeps.
A rule there wins over everything else — including the language the reviewer wrote in, and the
language of this skill. Without such a rule, answer in the language of the comment you reply to.

The same rule applies to everything else you write on the pull request: its title, its
description, and your commit messages, which a repository often constrains separately.

Only the prose follows that language. Labels and identifiers (`done`, `disagree`, a function
name) are never translated.

## 1. Conventional Comments

Follow https://conventionalcomments.org/ and the extensions of the Conventional Comments Toolkit
(https://github.com/Reefact/conventional-comments-toolkit/blob/main/README.md).

**Read the repository's configuration first**: `.conventional-comments.json` at the repository
root, if it exists. A reply label it disables does not exist for this repository: answer with
what it leaves enabled, or in plain text where replies need no label.

**That file is not the whole configuration.** The labels in force come from three levels, merged
in this order: the toolkit's defaults, then the **organisation's configuration**, then the
repository's file, each overriding the previous one label by label; an **enterprise floor** can
then force some labels on. The organisation's configuration and the floor reach the extension
through the browser's enterprise policy, so you usually cannot see them. Therefore:

- if the person you work for gives you the organisation's configuration, apply it before the
  repository's file;
- otherwise, use only labels you can confirm: those the repository's file declares or enables, and
  the toolkit's defaults it does not disable — never one the file disables. Do not guess an
  organisation's custom labels;
- say in your report that the organisation's configuration was not visible to you, if it was not.

Every reply starts with:

`<label>: <subject>`

The subject is at most **72 characters**. The discussion below it adds what the reviewer needs.

## 2. The reply labels

Answer each finding with the label that says what you did:

- **`done:`** — the code changed because of the comment. Use it only once the change is
  **pushed**, and name the commit: `done: fixed in a1b2c3d, null now returns an error`. A change
  you have only planned, or only made locally, is not `done`. `fixed` is accepted for `done`.
- **`ack:`** — received and accepted, the code has not changed at this stage: "noted, handled in
  the follow-up PR", or "agreed, no change needed". It is an acknowledgement, never a polite
  refusal. `acknowledged` is accepted for `ack`.
- **`disagree:`** — you decline the remark, and the subject says why. Give a verifiable reason:
  the code, a test, the specification, a recorded decision. `disagree` carries no authority and
  resolves nothing: the reviewer decides whether your reason holds.
- **`thanks:`** — you thank the reviewer without taking a position on the point or the code: the
  natural answer to a `praise`. `thx` is accepted for `thanks`.

Two more gestures in a thread already have their labels, and they are yours too (specification
§3.2):

- **`note:`** — you provide information: the answer to a reviewer's `question`, or a fact the
  reviewer needs to settle a point.
- **`question:`** — you ask back, when you need the reviewer to clarify before you can act.

A reviewer's `question` gets the label that says what followed: `note:` when you answer it with
information, `done:` when it led to a pushed change. `ack:` is not a neutral answer: keep it for a
point you accept.

### Session marker

A reviewer's comment may end with a session marker, on its own last line:

```text
[session:melancholy-coordinated-value-object]
```

It tells which review session the comment belongs to. When the comment you answer carries one,
**end your reply with the same marker, copied exactly**, on its own last line after a blank line:

```text
done: fixed in a1b2c3d, an empty result now returns an error

The code now returns the error the contract requires, with a regression test.

[session:melancholy-coordinated-value-object]
```

- Copy the marker of **the comment you are answering**, in its own thread. Several review sessions
  may run on the same pull request, so two of your replies can carry two different markers.
- When that comment carries no marker, add none: never make one up, and never borrow one from
  another comment or thread.
- Never draw a session identifier of your own: the marker identifies the reviewer's session.
- Write it **once**, on a line of its own, last when you can; a signature or footer your tooling
  appends after it is fine. A reply with two markers shows an error instead of a session.

The marker is metadata. It is not a finding, an acceptance or a resolution, and it says nothing
about whether the review is complete: your label still says what you did.

## 3. What you never post

- **`decision`**: it answers a remark by recording, with the reason, that the point will not be
  addressed. It is a gesture of your side of the review, but not one for you to make: giving up
  on what a reviewer asked for is a call for the people who carry the pull request, its author
  and its maintainers. When you think a point should not be addressed, answer `ack:` if it is
  valid but out of reach, or `disagree:` if you contest it, with your reason, and tell the
  person you work for that a `decision` may be needed.
- **`reviewed`**: it closes a reviewer's review, not yours.
- The other labels that raise a point (`issue`, `suggestion`, `nitpick`, `praise`…): you are
  answering, not reviewing. If you find a problem of your own while fixing, fix it and say so in the reply.

Never approve or merge the pull request.

## 4. Fixing

For each comment that calls for a change:

1. Check the claim before acting: trace it in the code, the tests or the specification. A
   reviewer can be wrong; if so, answer `disagree:` with the evidence.
2. Make the smallest change that addresses the point, without widening the pull request.
3. Run the repository's checks and tests before pushing.
4. Push, then answer `done:` with the commit.

Answer every finding and question, including optional findings, `(non-blocking)` ones and
`praise`. A standalone `reviewed:` closure or `summary:` recap needs no answer.

## 5. Resolving threads

- **A non-blocking thread**: you may resolve it yourself once your fix is pushed, or your answer
  is final, and you have no doubt that it settles the point. When in doubt, leave it open for the
  reviewer.
- **A blocking thread**: leave it to its reviewer, who judges whether the point is addressed
  (specification §6.1.1). A `decision` does not resolve it either: resolving a thread stays a
  gesture of the platform.

## 6. After pushing

Ask the reviewer for a new pass. Any change you push after a reviewer's `reviewed:` calls for a
new review of the new state: wait for their `reviewed:` again rather than assuming the earlier one
still holds. That new review usually comes under a new session marker; in the threads it opens,
copy its marker, and in older threads keep copying the marker of the comment you answer.

Report to the person you work for: what you fixed (with commits), what you acknowledged without
changing, what you declined and why, the threads you resolved, and anything that needs a human —
a `decision`, or a disagreement you could not settle.

Never claim to have pushed, run or verified something you have not.
