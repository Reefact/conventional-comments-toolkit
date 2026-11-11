# DEC0014 | Slugger names review sessions

*Français : [DEC0014-slugger-names-review-sessions-fr.md](DEC0014-slugger-names-review-sessions-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-11-11 | Accepted | Recovered on 2026-11-11 from the decision recorded in pull request #188 and its review threads |  |

## Context

The review skill marks every comment with a session identifier, drawn from a random source. This repository chose to name them with Slugger, recorded in `.claude/skills/review-pull-request/session-id.md`, and `dotnet-tools.json` declares the `slugger.cli` .NET tool.

The agents reviewing this repository outside Claude Code did not read that choice, and their environment has no .NET SDK. Since `cli-v1.1.0`, Slugger publishes a native binary, `slugger-linux-x64`, attested by its release workflow.

Measured: downloading that binary takes 0.44 to 0.70 s for 4.8 MB, and checking its SHA-256 takes 9 ms. A reviewer first asked to run the native binary before the installed tool, with a versioned cache; they could not measure that an agent task finds the cache of a previous one, and withdrew both requests.

NuGet keeps restored packages in its own cache. The native binary exists only for Linux x64.

## Decision

This repository's review sessions are named by Slugger, run from the declared .NET tool, failing that from a global install, failing that from the native binary downloaded and checked against a pinned SHA-256, and failing that by a GUID drawn by a command.

## Rationale

An installed, cached tool needs no download; running it after the native binary would impose, with no cache, a download and access to GitHub on every review. The manifest is the repository's explicit choice, and the .NET tool runs on every platform, where the native binary covers only Linux x64.

The native binary is the way in for machines without .NET, the agents' containers. The SHA-256 pinned in the skill's text guarantees that a replaced file is never run, and the command is chained so that a failed download or check stops it in any shell.

A cache would save only half a second, and only if the container survives from one review to the next, which is not measured; it would add shell steps and failure states of its own.

## Alternatives considered

### Alternative 1 — The native binary first, even with .NET

Proposed in review. Rejected: with no cache, it imposes a download on every review where an installed tool already runs.

### Alternative 2 — A versioned cache of the native binary

Proposed in review. Rejected: no measured gain in an agent container, and longer shell logic.

### Alternative 3 — A GUID

The skill's fallback option. Rejected as the repository's choice: Slugger gives readable names.

## Consequences

### Positive

- An agent without .NET names its sessions with Slugger.
- A replaced binary is never run.

### Negative

- A machine without .NET downloads the binary on every review.

### Risks

- None recorded when the decision was made.

### Follow-up actions

- Update the binary's version and SHA-256 with every new Slugger release adopted.
- Moving the manifest from `slugger.cli` 1.0.0 to 1.1.0 is a separate versioning decision.
