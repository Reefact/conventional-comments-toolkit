# DEC0006 | Diagnostic reports as issues

*Français : [DEC0006-diagnostic-reports-as-issues-fr.md](DEC0006-diagnostic-reports-as-issues-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-10-31 | Accepted | Recovered on 2026-11-11 from the decision recorded in the `diagnostic` skill, `CLAUDE.md` and commit `8f25e81` |  |

## Context

The extension's options page exports diagnostic archives (`cct-diagnostic-*`): a `report.json` and page skeletons. The first report received (#113) revealed a selector that relied on an attribute the page changes with its state (`data-variant` follows the checks), not with its structure.

A report fixed on its own pushes towards handling a particular case while breaking others, or the general case.

## Decision

Every diagnostic report is recorded as a `diagnostic` issue, one per distinct cause, its archive kept as received on a `diagnostic/<date>-<chain>` branch, and nothing is fixed on `main` until about thirty issues are open.

## Rationale

Thirty causes side by side show what they have in common; a single one shows nothing. The unit is the distinct cause: two reports with the same cause make one issue.

Keeping the raw archive on its own branch keeps the original measurement without mixing it with the code; it is the only exception to the rule that a session pushes only to the branch it designates.

## Alternatives considered

No alternative was documented when the decision was made.

## Consequences

### Positive

- Fixes address common causes rather than isolated cases.

### Negative

- A reported defect waits, on `main`, until the batch is gathered.

### Risks

- None recorded when the decision was made.

### Follow-up actions

- None recorded when the decision was made.
