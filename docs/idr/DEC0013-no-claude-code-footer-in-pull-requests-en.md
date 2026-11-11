# DEC0013 | No Claude Code footer in pull requests

*Français : [DEC0013-no-claude-code-footer-in-pull-requests-fr.md](DEC0013-no-claude-code-footer-in-pull-requests-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-11-10 | Accepted | Recovered on 2026-11-11 from the decision recorded in `CLAUDE.md` and commits `ab97a29`, `9b2fd9c`, `e51a67b` and `106e27f` |  |

## Context

Claude Code sessions end a pull request description with the line "🤖 Generated with Claude Code" and the session link. A `CLAUDE.md` rule asking not to write them (commit `ab97a29`) was reverted the same day (commit `9b2fd9c`): on pull request #167, the pull request creation tool added its own footer to a body sent without one. Editing a description through that tool adds nothing (measured on pull request #165).

## Decision

A pull request description carries neither the "Generated with Claude Code" footer nor the session link, and a workflow removes them after creation.

## Rationale

An agent rule is not enough, since the creation tool adds its own footer: only a workflow the tool never touches can remove it afterwards. The `CLAUDE.md` rule stays, because it spares the workflow the form the session would write itself.

The workflow runs on `pull_request_target`, the only trigger whose token may write to a fork's pull request, and never checks out the pull request's code.

## Alternatives considered

### Alternative 1 — An agent rule alone

The decision's first version. Rejected: the creation tool adds its own footer, measured on pull request #167.

## Consequences

### Positive

- Pull request descriptions no longer carry the footer.

### Negative

- One more workflow, which writes to pull requests.

### Risks

- None recorded when the decision was made.

### Follow-up actions

- None recorded when the decision was made.
