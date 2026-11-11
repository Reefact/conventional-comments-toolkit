# DEC0010 | The extension is the whole product

*Français : [DEC0010-the-extension-is-the-whole-product-fr.md](DEC0010-the-extension-is-the-whole-product-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-11-10 | Accepted | Recovered on 2026-11-11 from the decision recorded in `specifications-fr.md` (§2) and commit `04e7492` |  |

## Context

The specification described two components: the browser extension (component A), and a verifier running in the platform's continuous integration (component B), which published a compliance status set against the merge. The verifier's code had already left `main` (`b3009b8`), and the pull request meant to replace it (#90) was closed.

A browser extension acts on the client side only: it can stop a click, not the publication of a comment through the API, a CLI, an IDE, another browser or a machine without the extension.

## Decision

The product is the browser extension alone, and it does not control the completion of a pull request.

## Rationale

The original text records no rationale beyond the decision. It notes that each team may rely, on the continuous-integration side, on its platform's native options, for instance mandatory resolution of conversations.

## Alternatives considered

No alternative was documented when the decision was made.

## Consequences

### Positive

- The specification describes only one component, the one that exists.

### Negative

- The toolkit itself no longer prevents the merge of a pull request that carries unresolved blocking threads; a platform can still require it through its own options.

### Risks

- None recorded when the decision was made.

### Follow-up actions

- Remove from the code the reading of the published status and the greying of the merge button (next pull request).
- Consequences in the specification: O3 means signalling unresolved blocking threads, never preventing the merge; the banner reads only the page, and its single source is the threads read in the DOM; `enforce` no longer depends on the pull request's age nor on any published state; `warn` becomes an alias of `assist`, reported as obsolete, the two modes being identical on the extension's side; the floor has a single channel; the keys only the verifier used (`formatSeverity`, `overrideLabel`, `resolverOverrideGroup`, `activation`, `docUrl`) are retired and reported as unknown; a thread resolution counts whoever made it, the governance rule existing only for the verifier; §12 is limited to the extension's telemetry; phases P0 and P5 and 13 acceptance criteria are removed, with no renumbering; CA-06 and CA-18 become non-regression tests, and the `CRLF` line-ending rule stays normative.
