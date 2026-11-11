# DEC0008 | Azure DevOps on dev.azure.com only

*Français : [DEC0008-azure-devops-on-dev-azure-com-only-fr.md](DEC0008-azure-devops-on-dev-azure-com-only-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-11-09 | Accepted | Recovered on 2026-11-11 from the decision recorded in `packages/adapters/azdo/CAPTURES.md` and commit `a9d8d3c` |  |

## Context

The Azure DevOps adapter was rewritten on 25 captures of `dev.azure.com`; its earlier versions had been written from memory and had never worked. The `{org}.visualstudio.com` hosts and Azure DevOps Server were not captured.

The header of `specifications-fr.md` nonetheless lists "Azure DevOps (Services, Server)" among the targets.

## Decision

The Azure DevOps adapter recognizes only `dev.azure.com`.

## Rationale

Every selector of the adapter cites the capture that justifies it: a host that was not captured has no measurement to ground its selectors.

## Alternatives considered

No alternative was documented when the decision was made.

## Consequences

### Positive

- The adapter only claims to work where it was measured.

### Negative

- Organizations on `{org}.visualstudio.com` or on Azure DevOps Server are not covered.

### Risks

- The specification's header and this decision do not say the same about Azure DevOps Server.

### Follow-up actions

- None recorded when the decision was made.
