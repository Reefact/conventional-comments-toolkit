# Review skills for AI agents

**Languages:** English (this file) | [Français](review-skills-fr.md)

Two skills let an AI agent take part in a review the way this toolkit expects: one for the
agent that reviews, one for the agent that answers. Each is a directory under
[`skills/`](../../skills). Claude Code loads its `SKILL.md` as is; any other agent can be
given that file as instructions.

| Skill | For | What the agent does |
|---|---|---|
| [`review-pull-request`](../../skills/review-pull-request/SKILL.md) | The **reviewer** | Publishes its findings as Conventional Comments, rated P0 to P3, follows them up until each fix is verified, and closes its review with `reviewed:` once nothing is left. |
| [`respond-to-review`](../../skills/respond-to-review/SKILL.md) | The **author** of the pull request | Answers every finding and question with `done:`, `ack:`, `disagree:` or `thanks:` (or `note:` to inform, `question:` to ask back) and pushes the fixes. |

Neither approves nor merges: those stay human decisions. The author's skill never posts
`reviewed` or `decision`.

Both read the repository's `.conventional-comments.json` first, so they only use the labels
it enables.

## Install

Install or hand over **the whole directory**, not the `SKILL.md` alone: the reviewer's skill
relies on the files beside it, which say how review-session identifiers are chosen.

## Review sessions

When several agents, or several runs of one account, review the same pull request, the
platform says who wrote a comment but not which session produced it. The reviewer therefore
ends each of its comments with a marker line, the same for its whole session:

```text
issue (blocking): the retry loop never stops on a 4xx answer

A 404 is retried forever.

[session:disheartening-reviewed-implementation]
```

The author's skill copies the marker into its reply to that comment. The extension hides the
line and shows `🤖 session: disheartening-reviewed-implementation` at the bottom of the
comment ([writing review comments](writing-comments-en.md#once-comments-are-published)).

- Each session draws its own identifier from a random source and checks that the pull
  request does not carry it yet. It never takes one from the pull request, from another
  session or from an earlier conversation.
- The identifier is a readable name drawn by [Slugger](https://github.com/Reefact/slugger),
  or a GUID. The choice is made once per installation and recorded in a `session-id.md` file
  committed beside the skill; where none is recorded yet, the reviewer's skill offers Slugger
  once and records the answer.
- A Slugger name can carry a description: one sentence built from its words, written after an
  em dash and in italics. The extension shows the name, and the sentence on hover:

  ```text
  [session:disheartening-reviewed-implementation — *We reviewed the implementation, and frankly, it was disheartening.*]
  ```

A marker is optional metadata. It is removed before validation and changes no verdict; a
comment with more than one marker designates no session and gets a warning.
