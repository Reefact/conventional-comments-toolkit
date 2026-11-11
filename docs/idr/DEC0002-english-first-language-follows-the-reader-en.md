# DEC0002 | English first, language follows the reader

*Français : [DEC0002-english-first-language-follows-the-reader-fr.md](DEC0002-english-first-language-follows-the-reader-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-09-01 | Accepted | Recovered on 2026-11-11 from the decision recorded in `CLAUDE.md` and commits `70e0902` and `3a5ab99` |  |

## Context

The repository's language convention existed in practice and was written nowhere. It drifted: commit messages switched to English along the way without anyone deciding it, and a review-trigger comment went out in French to a bot that reviews in English.

A first draft (commit `70e0902`) put commit messages in English and everything else in French. Two successive drafts listed files instead of stating a criterion, and both were caught by Codex reviews (pull requests #32 and #33): the first condemned the documents meant for an English-speaking audience to translation, the second filed the interface's English catalogue under "everything else is in French", although the specification requires a bilingual interface (§10).

## Decision

The language of a repository text is chosen by a single question, "who reads it?": what is read outside the team is written in English, and what is not follows the team's language, French.

## Rationale

A criterion does not age where a list of files does: both drafts by enumeration failed on files the list had not foreseen.

Commit messages and pull request content are read by anyone who clones or contributes to the repository: they are in English. Repository documents are in English first, with a French twin when possible, the pair carrying the `-en.md` and `-fr.md` suffixes; a document that exists in only one language is not a fault. Interface strings each stay in their own language, or the bilingual product would break. Internal tooling and code comments address the team and follow its language.

## Alternatives considered

### Alternative 1 — Listing the files by language

The rule's first two drafts. Rejected: caught twice on files that had not been foreseen.

## Consequences

### Positive

- A single question settles the cases no list had foreseen.

### Negative

- None recorded when the decision was made.

### Risks

- None recorded when the decision was made.

### Follow-up actions

- None recorded when the decision was made.
