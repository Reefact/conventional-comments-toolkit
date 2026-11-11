# DEC0009 | No email address in captures

*Français : [DEC0009-no-email-address-in-captures-fr.md](DEC0009-no-email-address-in-captures-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-11-09 | Accepted | Recovered on 2026-11-11 from the decision recorded in `packages/adapters/azdo/CAPTURES.md` and commit `1e495d1` |  |

## Context

A platform's captured pages are versioned in the repository, which is public, reduced to their storable form. The Azure DevOps Microsoft account menu (`.mectrl_root`) sits closed in the DOM of every page, and shows the signed-in account's email address in clear. Measured on 2026-11-09: it was in the first 25 Azure DevOps captures, which had not been pushed.

The account's display name also appears, as comment author and in `aria-label`s.

## Decision

No versioned capture keeps an email address, and the account's display name stays in them.

## Rationale

The email address is personal data, and the captures are published with the repository. The original text records no reason for keeping the display name; it notes it as comment author and in `aria-label`s.

## Alternatives considered

No alternative was documented when the decision was made.

## Consequences

### Positive

- Versioned captures no longer publish an email address.

### Negative

- The capturing account's display name stays visible in the captures.

### Risks

- None recorded when the decision was made.

### Follow-up actions

- None recorded when the decision was made.
