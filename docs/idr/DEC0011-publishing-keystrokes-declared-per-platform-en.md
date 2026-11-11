# DEC0011 | Publishing keystrokes declared per platform

*Français : [DEC0011-publishing-keystrokes-declared-per-platform-fr.md](DEC0011-publishing-keystrokes-declared-per-platform-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-11-10 | Accepted | Recovered on 2026-11-11 from the decision recorded in `specifications-fr.md` (§9.2.3) and commit `5ee23c2` |  |

## Context

Under `enforce`, a non-compliant comment was published on Azure DevOps by pressing Ctrl+Enter while the *Comment* button had the focus. Measured on 2026-11-10 in Chrome: Enter, Ctrl+Enter and Space on that button send the publish request on the key itself, without firing a click. The shared guard stopped only clicks on submit controls, and a Ctrl+Enter hard-coded in the field.

## Decision

Each adapter declares the keystrokes that publish on its platform, from the field and from a focused submit control, and the shared guard stops only what the adapter declares.

## Rationale

A keystroke is not the same from one platform to another, and one platform's must never affect the others: an Azure DevOps keystroke written in shared code would have changed the behaviour on GitHub and GitLab.

The method is mandatory in the contract, so that a new platform cannot forget to declare it.

## Alternatives considered

No alternative was documented when the decision was made.

## Consequences

### Positive

- The keystrokes measured on Azure DevOps are stopped, with no change on GitHub and GitLab.

### Negative

- Every adapter has to measure and declare its keystrokes.

### Risks

- A keystroke an adapter does not declare is not stopped.

### Follow-up actions

- None recorded when the decision was made.
