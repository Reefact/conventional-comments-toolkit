# DEC0004 | Spec amendments ship with their code

*Français : [DEC0004-spec-amendments-ship-with-their-code-fr.md](DEC0004-spec-amendments-ship-with-their-code-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-09-24 | Accepted | Recovered on 2026-11-11 from the decision recorded in `CLAUDE.md` and commit `fe37170`, which retired the CI guard on 2026-10-24 |  |

## Context

`specifications-fr.md` is the normative reference for behaviour, and the repository's rule forbids changing it to match the implementation: an amendment is a design decision.

A CI step refused any pull request that changed `specifications-fr.md` together with code.

## Decision

A pull request may change `specifications-fr.md` together with the code that implements it.

## Rationale

An amendment of the contract ships with the code that implements it.

The rule the guard protected does not depend on it: the specification is still never bent to the implementation, and review judges an amendment as a design decision.

## Alternatives considered

No alternative was documented when the decision was made.

## Consequences

### Positive

- An amendment of the contract and its implementation arrive together.

### Negative

- No mechanical guard reports any longer that a pull request touches the specification.

### Risks

- None recorded when the decision was made.

### Follow-up actions

- None recorded when the decision was made.
