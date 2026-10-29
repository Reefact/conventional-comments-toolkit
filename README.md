# conventional-comments-toolkit

Browser extension enforcing [Conventional Comments](https://conventionalcomments.org/) in code reviews, for GitHub (github.com, Enterprise Cloud/EMU, Enterprise Server) and Azure DevOps (Services, Server).

- **Browser extension (component A)** — authoring assistance and real-time validation while writing review comments. Convenience and prevention; bypassable by construction.
- **Verifier (component B)** — the source of truth the specification describes: it verifies every comment after the fact, computes "blocking threads resolved", and publishes a required status check, so a PR can't be completed with an unresolved blocking comment even without the extension installed. **No verifier ships today.** The companion server that used to fill this role is removed: the specification now requires a verifier that runs *inside* the platform and keeps no state (§6.4), and [issue #56](https://github.com/Reefact/conventional-comments-toolkit/issues/56) tracks building one for GitHub. Until then, objective O3 is not enforced anywhere.

No comment, code, or diff content ever leaves the browser. The full specification (the normative source) is [`specifications-fr.md`](./specifications-fr.md) (in French).

## Layout

A TypeScript monorepo (npm workspaces). The full breakdown is in [`docs/architecture-fr.md`](./docs/architecture-fr.md).

```
packages/core           @cct/core            parser, validator, config, evaluation — shared verbatim by A and B
packages/adapters/*     @cct/adapter-*        client (component A) platform adapters + shared editor plumbing
packages/extension      @cct/extension        Manifest V3 extension — toolbar, quick input, feedback, guard
spikes/p1-prime         P1' spike             programmatic-write assumption, validated in Chromium
skills/*                agent skills          review a pull request, or answer its review, in Conventional Comments
```

`packages/core/` holds every validation rule; it is consumed identically by both
components so that a comment judged compliant by the extension is always judged compliant
by the verifier, and conversely (§2). See [`docs/architecture-fr.md`](./docs/architecture-fr.md)
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
(§9.2.2) cannot see it: while the extension and the verifier run different `core/` versions,
they apply different rules on GitHub while still reporting that they agree. The lever for
requiring a `core/` version across an organization is `coreMinVersion` (§8.2), not the
fingerprint.

### Response labels and `reviewed` (on by default, not part of Conventional Comments)

Conventional Comments gives review **feedback** a vocabulary and says nothing about **replying**
to it. The toolkit adds four response labels of its own, plus `reviewed` to close your review.
These five **added labels** are **not part of Conventional Comments**: an extension of this tool,
shipped enabled, that a repository can turn off (§3.1, §3.2). Every label the toolkit ships is
enabled by default, including Conventional Comments' `typo` and `polish`; disable the ones you
don't want. The one exception is `quibble`, shipped but disabled: Conventional Comments itself
defines it as a `nitpick` under another name. Enable it with `{ "id": "quibble", "enabled": true }`.

| Label | Meaning | Also accepted |
|---|---|---|
| `thanks` | Says thank you, taking no position on the point or the code. | `thx` |
| `done` | The code changed because of the remark. | `fixed` |
| `ack` | Received and accepted; the code has not changed. | `acknowledged` |
| `disagree` | Declines the remark, and the subject says why. Carries no authority, resolves nothing. | |
| `reviewed` | Closes your own review: your points are dealt with, you have nothing to add. Approves nothing. | |

```text
issue (blocking): platform CSS tokens leak into the shared stylesheet
done: removed the platform-specific token
```

`reviewed` is the label people used to fake with `praise: review done`. It says your review is
over; approval stays with the platform's own control. It is not a reply: it answers no point,
it says where your review stands. `thanks` fills the gap a plain "thanks!" reply left: with
`scope.validateReplies` on, it had to be written `note: thanks`.

**When to post `reviewed`.** It closes your review as a whole, not one reading pass: a review
covers raising points, following how they are handled and checking the fixes. Post it once each
of your points is dealt with — fixed and checked, or set aside by a reply you accept, which a
non-blocking point may legitimately be — and a last read turns up nothing new. While one of your
points is still open, whatever its priority, so is your review. It only covers the pull request
as you examined it: any later change reopens your review, the new changes must be examined, and
a new `reviewed` may only be posted once every closing condition holds again. Each reviewer
closes their own. What the pull request needs to be merged — approvals, required reviewers —
stays with the platform: the toolkit does not count `reviewed`, and no number of them amounts to
an approval. This is a convention the toolkit states, not one it checks (§3.2).

**Describe a label: `labels[].description` and `labels[].usage`.** A label's two tooltips answer
two questions. The **badge** of a published comment tells whoever reads it what the comment
means; the **toolbar button** tells whoever writes when to use the label, followed by an example.
A repository or an organisation can write its own texts, for a label it creates or for a shipped
one:

```json
{ "labels": [ { "id": "risk",
                "description": "A regression risk raised by the reviewer.",
                "usage": "Flag a regression risk to assess before merging." },
              { "id": "issue", "description": "Here: a defect that breaks a test or a contract." } ] }
```

`description` goes to the badge, `usage` to the button; without `usage`, the button shows
`description`. Written, each replaces the shipped text (and, on the button, its example); written
empty (`""`), it removes that tooltip; left out, a shipped label keeps its texts. They are shown
as written, whatever the interface language, and change no verdict.

Every label has a **kind** (`labels[].kind`): `"remark"` raises a point, `"reply"` does not. The
toolbar shows the remark labels first — `reviewed` among them —, then, always on a line of their
own under a thin horizontal rule, the reply labels: `thanks`, `done`, `ack`, `decision`,
`disagree`. A thin double rule then separates the labels from the decorations. A label you declare is `"remark"` unless
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

The check links to the toolkit's labels page by default (`docUrl`:
https://conventionalcomments.io/docs/labels/). That page is the place for every label the
toolkit ships, saying which ones are not part of Conventional Comments; its update for the added
labels is tracked in Reefact/conventionalcomments.io#42. If your team documents its own variant,
point `docUrl` there.

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

**Upgrading the extension and the verifier.** Because these labels are enabled by default, the
configuration fingerprint changes even for a repository with no custom configuration (§9.2.2).
While the two
run different versions, the extension reports the mismatch and stops blocking the send. Update
them together.

## Review skills for AI agents

Two skills let an AI agent take part in a review the way this toolkit expects. Each is a
`SKILL.md` file that Claude Code loads as is, and that any other agent can be given as
instructions:

- [`skills/review-pull-request`](./skills/review-pull-request/SKILL.md), for the **reviewer**:
  publishes findings as Conventional Comments, rated P0 to P3, follows them up until each fix is
  verified, and closes its review with `reviewed:` once nothing is left. It never approves and
  never merges: those stay human decisions.
- [`skills/respond-to-review`](./skills/respond-to-review/SKILL.md), for the **author** of the
  pull request: answers every finding and question with `done:`, `ack:`, `disagree:` or
  `thanks:` — or `note:` to inform and `question:` to ask back —, pushes the fixes, and never
  posts `reviewed` or `decision`.

Both read the repository's `.conventional-comments.json` first, so they only use the labels it
enables.

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
| P4 | `warn` mode + indicators (§12) | `warn` implemented. The §12 indicators are not: they were an endpoint of the removed server, and the section now states that none of them needs collecting as it happens — each recomputes in batch from what the platform keeps |
| P5 | Verifier + status checks | **Not delivered.** The companion server is removed (it was never deployed); its replacement is designed in §6.4 and §A.8 and tracked by [#56](https://github.com/Reefact/conventional-comments-toolkit/issues/56). Azure DevOps has no verifier either, and §B.7 says why |
| P6 | `enforce` on a pilot repo, then rollout | Blocked on P5: `enforce` means nothing without a verifier. Prerequisites and rollback are documented (`docs/operations-fr.md`) |

License: Apache-2.0.
