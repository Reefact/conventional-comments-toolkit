# DEC0003 | An inert Prettier configuration

*Français : [DEC0003-an-inert-prettier-configuration-fr.md](DEC0003-an-inert-prettier-configuration-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-09-08 | Accepted | Recovered on 2026-11-11 from the decision recorded in `CLAUDE.md` and commit `d925fae` | Review of pull request #63 |

## Context

The repository's code is formatted by hand, and no setting makes Prettier idempotent on it: it restructures rather than wraps. A `prettier --write` run on seven files in progress produced about 580 lines of noise in an already-pushed commit, which had to be undone by hand.

A `.prettierrc` file had been added to pin the style. The Prettier extension for VS Code has a `prettier.requireConfig` setting, widely enabled, that refuses to format while no local configuration exists: adding the file switched developers who also had `editor.formatOnSave` enabled from "does not format" to "formats" (review of pull request #63).

Measured across all sources: with `requirePragma: true`, no file is rewritten; without it but with the rest of the configuration, 106 files (+3,611 / −1,122 lines); with no configuration at all, 140 files (+17,850 / −10,662).

## Decision

The repository's Prettier configuration carries `requirePragma: true`, so that Prettier formats no file that does not ask for it with a Prettier pragma (`@format` or `@prettier`).

## Rationale

The file meant to protect was creating the hazard on humans' editors, which `CLAUDE.md` does not protect; `requirePragma` is the only key that makes the command harmless, measured both ways.

The other keys only bound the damage on the day someone removes `requirePragma`, by a factor of 6 (28,512 lines of churn against 4,733); they also pin the style for the day Prettier is adopted, or for a file brought into it by a pragma. `singleQuote` and `trailingComma: es5` are what the code uses everywhere; `printWidth: 100` matches its actual convention — the 95th percentile of code lines at 94 columns, comments hand-wrapped around 95 —, where `120` would churn less (88 files, +1,932) but describe the code poorly.

## Alternatives considered

### Alternative 1 — A `.prettierignore` covering the sources

The other option offered in the review of pull request #63. Rejected by the author: an ignore file that really covered the sources would amount to listing the whole repository; the list would age with the first directory added, and a new file would be formatted without anyone noticing. The pragma reverses the burden: it is the file that has to ask to be formatted.

## Consequences

### Positive

- `prettier --write` and format-on-save no longer rewrite the repository.

### Negative

- The configuration file says the opposite of what one would expect from it: the repository is not formatted by Prettier.

### Risks

- Removing `requirePragma` unknowingly would rewrite more than a hundred files.

### Follow-up actions

- None recorded when the decision was made.
