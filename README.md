# conventional-comments-toolkit

Browser extension + server companion enforcing [Conventional Comments](https://conventionalcomments.org/) in code reviews, for GitHub (github.com, Enterprise Cloud/EMU, Enterprise Server) and Azure DevOps (Services, Server).

- **Browser extension (component A)** — authoring assistance and real-time validation while writing review comments. Convenience and prevention; bypassable by construction.
- **Server companion (component B)** — the actual source of truth: verifies every comment after the fact, computes "blocking threads resolved", and publishes a required status check, so a PR can't be completed with an unresolved blocking comment even without the extension installed.

No comment, code, or diff content ever leaves the browser. The full specification (the normative source) is [`specifications-fr.md`](./specifications-fr.md) (in French).

## Layout

A TypeScript monorepo (npm workspaces). The full breakdown is in [`docs/architecture.md`](./docs/architecture.md).

```
packages/core           @cct/core            parser, validator, config, evaluation — shared verbatim by A and B
packages/adapters/*     @cct/adapter-*        client (component A) platform adapters + shared editor plumbing
packages/extension      @cct/extension        Manifest V3 extension — toolbar, quick input, feedback, guard
packages/server         @cct/server           component B — orchestrator, storage, admin, platform adapters
spikes/p1-prime         P1' spike             programmatic-write assumption, validated in Chromium
```

`packages/core/` holds every validation rule; it is consumed identically by both
components so that a comment judged compliant by the extension is always judged compliant
by the server, and conversely (§2). See [`docs/architecture.md`](./docs/architecture.md)
for how the A/B parity holds by construction.

## Getting started

```
npm install
npm test            # unit + integration tests (mapped to the acceptance criteria)
npm run build       # TypeScript build of every package
npm run spike       # P1' spike: programmatic-write assumption in Chromium (§9.3)
```

## Configuration

A repository is configured by a `.conventional-comments.json` file on its default branch —
see [`.conventional-comments.example.json`](./.conventional-comments.example.json) for the
shape of every key (it is **not** the product defaults, which live in
`packages/core/src/config/defaults.ts`). Resolution, floor bounds, merge semantics and
pinning are specified in §8 and implemented in `packages/core/src/config/`.

## Modes and adoption (§7)

`assist` (default) → `warn` → `enforce`. Operational procedures — rollback, the
prerequisites for `enforce`, activation and the dry-run report — are in
[`docs/operations.md`](./docs/operations.md).

## Acceptance criteria

Every acceptance criterion `CA-01`…`CA-39` (§11) is covered by at least one automated test.
The mapping from each criterion to its test files is in
[`docs/ca-matrix.md`](./docs/ca-matrix.md); the `CA-NN` identifiers appear literally in the
tests.

## Status against the specification phases (§14)

| Phase | Content | State |
|-------|---------|-------|
| P0 | Baseline measurement (review time, compliance) | Operational task, not code — see `docs/operations.md` |
| P1 | `core/` (parser, validator, config) + unit tests | Implemented |
| P1' | Programmatic-write spike (GitHub React + Azure DevOps) | Assumption validated in Chromium; remaining platform assumptions documented with their fallbacks (`spikes/p1-prime/README.md`) |
| P2 | Extension `assist` on GitHub | Implemented |
| P3 | Azure DevOps adapter | Implemented, with the P1' fallbacks in place |
| P4 | `warn` mode + indicators (§12) | Implemented (`computeIndicators`, admin endpoint) |
| P5 | Server companion + status checks | Implemented |
| P6 | `enforce` on a pilot repo, then rollout | Prerequisites and rollback documented (`docs/operations.md`); the org-admin steps are deployment-time |

License: Apache-2.0.
