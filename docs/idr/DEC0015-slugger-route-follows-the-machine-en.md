# DEC0015 | Slugger route follows the machine

*Français : [DEC0015-slugger-route-follows-the-machine-fr.md](DEC0015-slugger-route-follows-the-machine-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-11-17 | Proposed | Proposes to supersede DEC0014; DEC0014 stays the decision in force until this one is accepted |  |
| 2026-11-17 | Accepted |  |  |

## Context

DEC0014, accepted, names this repository's review sessions with Slugger, run from the .NET tool declared in `dotnet-tools.json`, failing that from a global install, failing that from the native binary downloaded and checked against a pinned SHA-256, failing that by a GUID. The choice was recorded in `.claude/skills/review-pull-request/session-id.md`, and `session-id-setup.md` sat beside the skill to record it elsewhere.

The review skill shipped by this repository was revised to review pull requests and merge requests on GitHub, GitLab and Azure DevOps. The revision carries the native Slugger block inline, with the same version, asset and SHA-256 as DEC0014, and replaces the GUID by a Python draw from `code-review.json`, the Slugger theme shipped with the skill. It forbids using a binary or a tool manifest found in the repository under review.

A tool manifest in a repository is part of that repository. The skill is installed in repositories other than this one.

Measured on 2026-11-17 in a Linux x64 container with the .NET SDK 10.0.115:

- installing `Slugger` 1.2.0 with `dotnet tool install --tool-path`, from a temporary directory and with `https://api.nuget.org/v3/index.json` as the only source, contacted `api.nuget.org` alone and ran;
- `dotnet nuget verify` shows the package carries NuGet.org's repository signature;
- the tool's runtime configuration targets `net10.0`;
- the native block ran, and exited non-zero without running anything when its SHA-256 was altered;
- the Python script ran and drew names.

DEC0014 measured the native download at 0.44 to 0.70 s for 4.8 MB, and its SHA-256 check at 9 ms. The native binary exists only for Linux x64.

## Decision

This repository's review sessions are named by Slugger's native build on Linux x64, otherwise by its .NET tool installed in a temporary directory when a .NET 10 SDK is present, otherwise by a Python draw from the Slugger theme shipped with the skill, and the repository neither records a naming choice beside the skill nor declares the tool.

## Rationale

The route depends on the machine, which the skill can read with one command, and not on what the repository under review contains: nothing of that repository is run, which a skill installed in other repositories needs.

The native build comes first on the platform that has it because it is the route whose bytes are checked against a pinned SHA-256; DEC0014 measured its cost as half a second per review.

The .NET tool covers the machines the native build does not, with a pinned version and NuGet.org's signature. Run from a temporary directory with an explicit source, it reads no NuGet or SDK configuration from the repository under review.

The Python draw replaces the GUID because it reads the same vocabulary as Slugger, so a session keeps a readable name, and it needs no network.

The skill asks the person only when a route that fits the machine has failed: there, a retry can change the outcome. Where no route fits, there is nothing to repair, so it does not ask.

## Alternatives considered

### Alternative 1 — DEC0014's order, with the Python draw in place of the GUID

Offered during the exchange. Not retained: it runs the tool that the repository under review declares, or one installed on the machine, before the route whose bytes are checked.

### Alternative 2 — The native build only

The revised skill as received. Not retained: on a machine that is not Linux x64, every review would reach the question or the Python draw.

### Alternative 3 — Keeping the GUID as the last resort

DEC0014's fourth route. Not retained: the Python draw gives a readable name from the same vocabulary, and a GUID has no words to describe.

## Consequences

### Positive

- The route is chosen by the machine and nothing of the repository under review is run.
- A machine without Linux x64 or .NET still names its sessions with words.
- One source of the instructions: the skill, with no installation file to record a choice.

### Negative

- A Linux x64 machine that has .NET installed downloads the native binary on every review, which DEC0014 had rejected.
- The .NET route has no pinned checksum: trust rests on NuGet.org's signature and the pinned version.
- Routes 1 and 2 are bash blocks; a machine with no POSIX shell reaches the Python draw.

### Risks

- The Python draw reproduces Slugger's `threeOrTwo` mode as the skill describes it; it was not compared with Slugger's own output.
- Whether `dotnet tool install` enforces package signature verification by default was not measured.

### Follow-up actions

- Update the version and SHA-256 of the native block, and the version of the .NET block, with every new Slugger release adopted.
- When this IDR is accepted, add the `Superseded by DEC0015` line to DEC0014's status and update both indexes in the same change.
- `dotnet-tools.json`, `session-id.md` and `session-id-setup.md` are removed with the change that proposes this IDR.
