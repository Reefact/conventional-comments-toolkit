# DEC0005 | One platform per pull request

*Français : [DEC0005-one-platform-per-pull-request-fr.md](DEC0005-one-platform-per-pull-request-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-10-27 | Accepted | Recovered on 2026-11-11 from the decision recorded in `CLAUDE.md` and commits `c08b35a` and `2dd4a7f` | Review of pull request #78 |

## Context

The GitHub interface is finished; an Azure DevOps fix or the creation of the GitLab adapter must not be able to break it. An adapter's package runs only on its platform, while shared code runs on all of them: a pull request that changes both also changes every other platform, without saying so.

## Decision

A pull request touches a single platform, or shared code, never both, except a pull request that touches every platform: a contract if it also touches shared code, otherwise an all-platforms pull request.

## Rationale

Separating the shared change from the platform change makes visible what touches every platform, and protects the platforms a pull request does not target.

A contract pull request is accepted because a contract change has to apply everywhere at once. Documentation, shared tests and tooling outside `packages/` are neutral; a platform's registration files are neutral only in the pull request that creates it. The same day, following the review of pull request #78 (commit `2dd4a7f`), the exception extends to the pull request that removes a platform: removing an adapter requires removing its registration, and no split stays green — the adapter first leaves dead imports, the registration first fails `platform-registry.test.ts`. The same commit sets apart the pull request that touches every platform and no shared code: calling it a contract claimed shared code it does not contain; it stays accepted, under its own name.

The rule is checked by `npm run check:pr-scope`, which CI runs on every pull request.

## Alternatives considered

No alternative was documented when the decision was made.

## Consequences

### Positive

- A platform pull request can no longer change the other platforms without saying so.

### Negative

- A shared change and its use by a platform take two pull requests.

### Risks

- With two platforms, a pull request that touches both and shared code passes for a contract; whether it really is one remains a question for review.

### Follow-up actions

- None recorded when the decision was made.
