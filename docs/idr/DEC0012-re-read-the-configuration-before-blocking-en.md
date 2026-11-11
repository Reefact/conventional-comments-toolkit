# DEC0012 | Re-read the configuration before blocking

*Français : [DEC0012-re-read-the-configuration-before-blocking-fr.md](DEC0012-re-read-the-configuration-before-blocking-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-11-10 | Accepted | Recovered on 2026-11-11 from the decision recorded in `specifications-fr.md` (§8.1.3, rule 3) and commits `0bc7f60` and `4867255` | Reviews of pull requests #162 and #166 |

## Context

The extension cannot learn that a remote configuration changed. It keeps the configuration in cache for `configCacheTtlSeconds`; a blocking decision made on that cache could block a send on a configuration already relaxed.

The organization's configuration is the switch for relaxing the `mode` across every repository that does not write it itself.

## Decision

Before blocking a send, whatever the diagnostic, the extension re-reads the configuration bypassing its cache, and if it no longer blocks, releases the submit control with an invitation to send again, without replaying the held send.

## Rationale

No send is thus blocked on a stale configuration, and relaxing the `mode` lifts any block from the next send attempt, without waiting for the cache to expire.

The original text records no reason for not replaying the send: it states only that there is no replay and no synthetic click, and one re-read in flight per editor, none while typing.

## Alternatives considered

No alternative was documented when the decision was made.

## Consequences

### Positive

- A relaxation takes effect at the next send.

### Negative

- Every block costs a re-read of the configuration.

### Risks

- The browser's HTTP cache is not measured: only the extension's cache is bypassed.

### Follow-up actions

- None recorded when the decision was made.
