# conventional-comments-toolkit

Browser extension + server companion enforcing [Conventional Comments](https://conventionalcomments.org/) in code reviews, for GitHub (github.com, Enterprise Cloud/EMU, Enterprise Server) and Azure DevOps (Services, Server).

- **Browser extension (component A)** — authoring assistance and real-time validation while writing review comments. Convenience and prevention; bypassable by construction.
- **Server companion (component B)** — the actual source of truth: verifies every comment after the fact, computes "blocking threads resolved", and publishes a required status check, so a PR can't be completed with an unresolved blocking comment even without the extension installed.

No comment, code, or diff content ever leaves the browser. The full specification (the normative source) is [`specifications-fr.md`](./specifications-fr.md) (in French).

## Layout

A TypeScript monorepo (npm workspaces). The full breakdown is in [`docs/architecture-fr.md`](./docs/architecture-fr.md).

```
packages/core           @cct/core            parser, validator, config, evaluation — shared verbatim by A and B
packages/adapters/*     @cct/adapter-*        client (component A) platform adapters + shared editor plumbing
packages/extension      @cct/extension        Manifest V3 extension — toolbar, quick input, feedback, guard
packages/server         @cct/server           component B — orchestrator, storage, admin, platform adapters
spikes/p1-prime         P1' spike             programmatic-write assumption, validated in Chromium
```

`packages/core/` holds every validation rule; it is consumed identically by both
components so that a comment judged compliant by the extension is always judged compliant
by the server, and conversely (§2). See [`docs/architecture-fr.md`](./docs/architecture-fr.md)
for how the A/B parity holds by construction.

## Getting started

```
npm install
npm test            # unit + integration tests (mapped to the acceptance criteria)
npm run build       # TypeScript build of every package
npm run checks      # repository guards: CA matrix ↔ tests, invisible-character escapes
npm run spike       # P1' spike: programmatic-write assumption in Chromium (§9.3)
npm run build:extension   # MV3 bundle into packages/extension/dist-ext (+ Firefox variant)
```

Starting from a machine with none of this installed? See the step-by-step Windows/PowerShell
guide: [`docs/extension-setup-en.md`](./docs/extension-setup-en.md) (French:
[`docs/extension-setup-fr.md`](./docs/extension-setup-fr.md)).

**Can't run `npm` at all?** Every tagged release carries the extension as a ready-to-load
zip — one for Chromium, one for Firefox. Download it from the
[releases page](https://github.com/reefact/conventional-comments-toolkit/releases),
unzip it, and load the folder (`chrome://extensions` → Developer mode → Load unpacked).
No Node, no npm, no Git. That path is for **trying the extension** and for machines where
the build chain can't be installed — it is not a deployment channel: an extension loaded
from a zip never auto-updates, and §10 routes every delivery of component A through the
public stores. How a release is cut: [`docs/release-fr.md`](./docs/release-fr.md).

## Configuration

A repository is configured by a `.conventional-comments.json` file on its default branch —
see [`.conventional-comments.example.json`](./.conventional-comments.example.json) for the
shape of every key (it is **not** the product defaults, which live in
`packages/core/src/config/defaults.ts`). Resolution, floor bounds, merge semantics and
pinning are specified in §8 and implemented in `packages/core/src/config/`.

**Upgrading from a version without `toolCommands`.** Slash commands used to be exempted
through a list built into the GitHub adapter (`/azp`, `/rebase`). That list is gone, and
`toolCommands` is **empty by default**, so those commands now need a label like any other
comment until the repository declares them — in `enforce` mode a `/rebase` is rejected
where it previously passed. A repository that relied on the built-in exemption restores it,
and widens it to every slash command, by adding `"/*"` to `toolCommands`. The example file
above carries the full recommended GitHub list, mentions included.

Note that this behaviour lives in `core/`, not in the configuration, so `fingerprint()`
(§9.2.2) cannot see it: while the extension and the server run different `core/` versions,
they apply different rules on GitHub while still reporting that they agree. The lever for
requiring a `core/` version across an organization is `coreMinVersion` (§8.2), not the
fingerprint.

### Response labels and `reviewed` (on by default, not part of Conventional Comments)

Conventional Comments gives review **feedback** a vocabulary and says nothing about **replying**
to it. The toolkit adds four response labels of its own, plus `reviewed` to close your review.
These five **added labels** are **not part of Conventional Comments**: an extension of this tool,
shipped enabled, that a repository can turn off (§3.1, §3.2). Every label the toolkit ships is
enabled by default, including Conventional Comments' `typo`, `polish` and `quibble`; disable the
ones you don't want.

| Label | Meaning | Also accepted |
|---|---|---|
| `thanks` | Says thank you, taking no position on the point or the code. | `thx` |
| `done` | The code changed because of the remark. | `fixed` |
| `ack` | Received and accepted; the code has not changed. | `acknowledged` |
| `disagree` | Declines the remark, and the subject says why. Carries no authority, resolves nothing. | |
| `reviewed` | Closes your own review: you have finished reading. Approves nothing. | |

```text
issue (blocking): platform CSS tokens leak into the shared stylesheet
done: removed the platform-specific token
```

`reviewed` is the label people used to fake with `praise: review done`. It says you are done
reading; approval stays with the platform's own control. It is not a reply: it answers no
point, it says where your review stands. `thanks` fills the gap a plain "thanks!" reply left:
with `scope.validateReplies` on, it had to be written `note: thanks`.

Every label has a **kind** (`labels[].kind`): `"remark"` raises a point, `"reply"` does not. The
toolbar shows the remark labels first — `reviewed` among them —, then, always on a line of their
own under a thin horizontal rule, the reply labels: `thanks`, `done`, `ack`, `decision`,
`disagree`. A label you declare is `"remark"` unless
you write `"kind": "reply"`. The kind changes no verdict.

**Button order.** By default, the order of conventionalcomments.org, then `reviewed`; the replies
go from the warmest to the firmest. In the extension's options, *Button order* takes a
comma-separated list, for example `suggestion,nitpick,disagree`: the labels you list come first
in their own group, remarks or replies, the others follow in the default order. Spaces are ignored. It is a personal
preference, synced by your browser; it changes no verdict and applies to the next comment box
that opens. The completion list (`/` or `:`) follows the same order.

**To stick to Conventional Comments**, disable them, one entry each — there is no separate
switch (§8.2). The extension's options page shows this block and copies it for you:

```json
{ "labels": [ { "id": "thanks", "enabled": false },
              { "id": "done", "enabled": false },
              { "id": "ack", "enabled": false },
              { "id": "disagree", "enabled": false },
              { "id": "reviewed", "enabled": false } ] }
```

With no existing `.conventional-comments.json`, this block can be the whole file. Otherwise, add
the five entries to its existing `labels` array, or create that property, without replacing the
other keys: pasting the block into an existing file makes it invalid JSON, and replacing the file
drops your other settings.

The labels change **which labels exist**, nothing else. They do not require replies to carry a
label: that is `scope.validateReplies`, still `false` by default, so a reply is not validated at
all unless you turn it on (§4.1). They do not change the mode, and none of the five can make a
thread blocking. `decision` is unchanged and remains the only reply that can close a blocking
thread on someone else's behalf (§6.1.1); `disagree` is an opinion and resolves nothing.

If you point `docUrl` at your own documentation, it is worth doing: its default,
conventionalcomments.org, documents none of these labels.

**Upgrading with a label already called `thanks`, `done`, `ack`, `disagree` or `reviewed`.** Your entry
now merges into the shipped one (§8.1.4) and inherits `alwaysNonBlocking: true`, so
`done (blocking):` becomes `E-CONFLICT`. Restore your label with:

```json
{ "labels": [ { "id": "done", "alwaysNonBlocking": false } ] }
```

A label of your own called `fixed`, `acknowledged` or `thx` is a different case. Two active labels may
not share a name: an alias that repeats another active label's id is removed from its carrier.
Since `done` is enabled by default, it is the shipped alias `fixed` that goes and your label
that stays. An alias carried by two labels is removed from both. Each removal is reported as a
configuration warning (§8.2).

**Upgrading the extension and the verifier.** Because these labels are on by default, the
configuration fingerprint of a repository with no configuration changes (§9.2.2). While the two
run different versions, the extension reports the mismatch and stops blocking the send. Update
them together.

## Modes and adoption (§7)

`assist` (default) → `warn` → `enforce`. Operational procedures — rollback, the
prerequisites for `enforce`, activation and the dry-run report — are in
[`docs/operations-fr.md`](./docs/operations-fr.md).

## Acceptance criteria

Every acceptance criterion `CA-01`…`CA-39` (§11) is covered by at least one automated test.
The mapping from each criterion to its test files is in
[`docs/ca-matrix-fr.md`](./docs/ca-matrix-fr.md); the `CA-NN` identifiers appear literally in the
tests, and CI fails if that stops being true.

## Continuous integration

Five workflows, each answering a different question. Only **CI** is meant to be a required
check on `main`; the others report without gating.

| Workflow | Question it answers | When |
|----------|--------------------|------|
| [`ci.yml`](./.github/workflows/ci.yml) | Does everything compile and does every test pass, on both supported Node versions? | push to `main`, every PR |
| [`conformance.yml`](./.github/workflows/conformance.yml) | Do the repository's own rules still hold — CA matrix in step with the tests, invisible characters written as escapes, normative spec untouched by a code PR? | push to `main`, every PR |
| [`extension-package.yml`](./.github/workflows/extension-package.yml) | Does the MV3 bundle build, stay free of remote code (§10), and keep both manifests loadable? Publishes the Chromium and Firefox bundles as artifacts. | push to `main`, PRs touching `packages/` |
| [`browser-smoke.yml`](./.github/workflows/browser-smoke.yml) | Does the §9.3 programmatic-write strategy still hold in a current Chromium — the one thing happy-dom cannot tell us? | daily (04:17 UTC), PRs touching adapters or the spike |
| [`release.yml`](./.github/workflows/release.yml) | Can someone install the extension without any build chain? Builds, verifies and publishes the Chromium and Firefox zips as a GitHub Release. | tag `v*`, manual dry run |

The selector smoke test of §9.4 runs on pages captured from each platform
(`packages/adapters/<id>/test/fixtures/pages/`): `npm run check:captured-selectors` checks that
happy-dom, where the real-page tests run, matches exactly the elements Chromium matches.
Against the *live* platforms, only what an anonymous visitor can see is checked, weekly, by
[`github-selectors-canary.yml`](./.github/workflows/github-selectors-canary.yml). Composers
need a signed-in session and are not checked live.

## Status against the specification phases (§14)

| Phase | Content | State |
|-------|---------|-------|
| P0 | Baseline measurement (review time, compliance) | Operational task, not code — see `docs/operations-fr.md` |
| P1 | `core/` (parser, validator, config) + unit tests | Implemented |
| P1' | Programmatic-write spike (GitHub React + Azure DevOps) | Assumption validated in Chromium; remaining platform assumptions documented with their fallbacks (`spikes/p1-prime/README-fr.md`) |
| P2 | Extension `assist` on GitHub | Implemented |
| P3 | Azure DevOps adapter | Implemented, with the P1' fallbacks in place |
| P4 | `warn` mode + indicators (§12) | Implemented (`computeIndicators`, admin endpoint) |
| P5 | Server companion + status checks | Implemented |
| P6 | `enforce` on a pilot repo, then rollout | Prerequisites and rollback documented (`docs/operations-fr.md`); the org-admin steps are deployment-time |

License: Apache-2.0.
