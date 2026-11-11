# conventional-comments-toolkit

Browser extension enforcing [Conventional Comments](https://conventionalcomments.org/) in code reviews, for GitHub (github.com, Enterprise Cloud/EMU, Enterprise Server) and Azure DevOps (Services, Server).

GitLab (gitlab.com) gets the authoring assistance and real-time validation, but not the send guard: the extension cannot read a repository's configuration there yet, so it never blocks on GitLab (specification, annex C). GitLab Self-Managed and Dedicated are not measured yet.

The product is the browser extension, and only the extension (§2): authoring assistance and
real-time validation while writing review comments, an optional send guard (`enforce`, §5.4),
and a banner counting the pull request's unresolved blocking threads (§5.5). Convenience and
prevention; bypassable by construction.

**The toolkit does not control pull request completion** ([DEC0010](docs/idr/DEC0010-the-extension-is-the-whole-product-en.md)).
Unresolved blocking threads are *reported*, never prevented from merging. An earlier version of
the specification described a second component, a verifier running in the platform's CI and
publishing a required status check; it is removed, together with what existed only for it —
the resolution governance, the per-PR exemption, the activation date and the configuration
fingerprint. A team that wants merges gated on resolved conversations uses its platform's own
settings, such as required conversation resolution.

No comment, code, or diff content ever leaves the browser. The full specification (the normative source) is [`specifications-fr.md`](./specifications-fr.md) (in French).

## Layout

A TypeScript monorepo (npm workspaces). The full breakdown is in [`docs/architecture-fr.md`](./docs/architecture-fr.md).

```
packages/core           @cct/core            parser, validator, config — every validation rule
packages/adapters/*     @cct/adapter-*        platform adapters + shared editor plumbing
packages/extension      @cct/extension        Manifest V3 extension — toolbar, quick input, feedback, guard
spikes/p1-prime         P1' spike             programmatic-write assumption, validated in Chromium
skills/*                agent skills          review a pull request, or answer its review, in Conventional Comments
```

`packages/core/` holds every validation rule and has no dependency on the browser or on any
platform; the adapters and the extension consume it. See
[`docs/architecture-fr.md`](./docs/architecture-fr.md).

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
from a zip never auto-updates, and §10 routes every delivery of the extension through the
public stores. How a release is cut: [`docs/release-fr.md`](./docs/release-fr.md).

## Configuration

A repository is configured by a `.conventional-comments.json` file on its default branch —
see [`.conventional-comments.example.json`](./.conventional-comments.example.json) for the
shape of every key (it is **not** the product defaults, which live in
`packages/core/src/config/defaults.ts`). Resolution, floor bounds, merge semantics and
when a change takes effect are specified in §8 and implemented in `packages/core/src/config/`.

**Upgrading from a version without `toolCommands`.** Slash commands used to be exempted
through a list built into the GitHub adapter (`/azp`, `/rebase`). That list is gone, and
`toolCommands` is **empty by default**, so those commands now need a label like any other
comment until the repository declares them — in `enforce` mode a `/rebase` is rejected
where it previously passed. A repository that relied on the built-in exemption restores it,
and widens it to every slash command, by adding `"/*"` to `toolCommands`. The example file
above carries the full recommended GitHub list, mentions included.

Note that this behaviour lives in `core/`, not in the configuration: two extensions running
different `core/` versions apply different rules to the same file. The lever for requiring a
`core/` version across an organization is `coreMinVersion` (§8.1.3, rule 5).

**Retired keys.** `formatSeverity`, `overrideLabel`, `resolverOverrideGroup`, `activation` and
`docUrl` served only the removed verifier and have left the schema (§8.2). A configuration that
still carries them stays readable: each is an unknown key, ignored and reported as a
configuration warning, with no fallback. `"mode": "warn"` is read as `"assist"`, with an
"obsolete value" warning (§7). Remove them to clear the warnings.

### Response labels, `summary` and `reviewed` (on by default, not part of Conventional Comments)

Conventional Comments gives review **feedback** a vocabulary and says nothing about **replying**
to it. The toolkit adds four response labels of its own, plus `summary` to recap a review pass
and `reviewed` to close your review. These six **added labels** are **not part of Conventional
Comments**: an extension of this tool, shipped enabled, that a repository can turn off (§3.1, §3.2). Every label the toolkit ships is
enabled by default, including Conventional Comments' `typo` and `polish`; disable the ones you
don't want. The one exception is `quibble`, shipped but disabled: Conventional Comments itself
defines it as a `nitpick` under another name. Enable it with `{ "id": "quibble", "enabled": true }`.

| Label | Meaning | Also accepted |
|---|---|---|
| `thanks` | Says thank you, taking no position on the point or the code. | `thx` |
| `done` | The code changed because of the remark. | `fixed` |
| `ack` | Received and accepted; the code has not changed. | `acknowledged` |
| `disagree` | Declines the remark, and the subject says why. Carries no authority, resolves nothing. | |
| `summary` | Recaps the review or one pass: what was checked, what is still open. Raises no point, answers none, closes nothing. | |
| `reviewed` | Closes your own review: your points are dealt with, you have nothing to add. Approves nothing. | |

```text
issue (blocking): platform CSS tokens leak into the shared stylesheet
done: removed the platform-specific token
```

`reviewed` is the label people used to fake with `praise: review done`. It says your review is
over; approval stays with the platform's own control. It is not a reply: it answers no point,
it says where your review stands. `thanks` fills the gap a plain "thanks!" reply left: with
`scope.validateReplies` on, it had to be written `note: thanks`.

`summary` is the recap of a review pass — what was checked, what is still open — that used to be
written as plain prose or under `note:`. It is the counterpart of `reviewed`: `summary` says where
an ongoing review stands, `reviewed` that it is closed. A `summary` never stands in for
`reviewed`, even when no point is left open; posted after your `reviewed`, it reads as if your
review had reopened.

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

Every label has a **kind** (`labels[].kind`): `"remark"` raises a point, `"reply"` answers one,
and `"status"` does neither — it says where the review stands (`summary`, `reviewed`). The
toolbar shows the remark labels first, then the status labels, which always close that line;
then, always on a line of their own under a thin horizontal rule, the reply labels: `thanks`,
`done`, `ack`, `decision`, `disagree`. A thin double rule then separates the labels from the
decorations. A label you declare is `"remark"` unless you write `"kind": "status"` or
`"kind": "reply"`. The kind changes no verdict; it keeps replies and status labels out of the
label statistics that measure review culture, such as the share of `praise`.

**Button order.** By default, the order of conventionalcomments.org, then `summary` and
`reviewed`; the replies go from the warmest to the firmest. A remark label you create comes
before `summary` and `reviewed`, which close the first line. In the extension's options, *Button order* takes a
comma-separated list, for example `suggestion,nitpick,disagree`: the labels you list come first
in their own group — remarks, status labels or replies —, the others follow in the default order. Spaces are ignored. It is a personal
preference, synced by your browser; it changes no verdict and applies to the next comment box
that opens. The completion list (`/` or `:`) follows the same order.

**To stick to Conventional Comments**, disable them, one entry each — there is no separate
switch (§8.2). The extension's options page shows this block and copies it for you:

```json
{ "labels": [ { "id": "thanks", "enabled": false },
              { "id": "done", "enabled": false },
              { "id": "ack", "enabled": false },
              { "id": "disagree", "enabled": false },
              { "id": "summary", "enabled": false },
              { "id": "reviewed", "enabled": false } ] }
```

With no existing `.conventional-comments.json`, this block can be the whole file. Otherwise, add
the six entries to its existing `labels` array, or create that property, without replacing the
other keys: pasting the block into an existing file makes it invalid JSON, and replacing the file
drops your other settings.

The labels change **which labels exist**, nothing else. They do not require replies to carry a
label: that is `scope.validateReplies`, still `false` by default, so a reply is not validated at
all unless you turn it on (§4.1). They do not change the mode, and none of the six can make a
thread blocking. `decision` is unchanged: it is the reply with which those who carry the pull
request — its author, its maintainers — record, with a reason, that a point will not be addressed
(§6.1.1). `disagree` is an opinion. Neither resolves a thread.

**Upgrading with a label already called `thanks`, `done`, `ack`, `disagree`, `summary` or `reviewed`.** Your entry
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

## Review skills for AI agents

Two skills let an AI agent take part in a review the way this toolkit expects. Each is a
directory under `skills/`, whose `SKILL.md` Claude Code loads as is and any other agent can be
given as instructions. Install or hand over **the whole directory**, not the `SKILL.md` alone: the
reviewer's relies on the files beside it — how to choose session identifiers, and the Slugger
theme it draws them from.

- [`skills/review-pull-request`](./skills/review-pull-request/SKILL.md), for the **reviewer**:
  publishes findings as Conventional Comments, rated P0 to P3, follows them up until each fix is
  verified, and closes its review with `reviewed:` once nothing is left. It never approves and
  never merges: those stay human decisions.
- [`skills/respond-to-review`](./skills/respond-to-review/SKILL.md), for the **author** of the
  pull request: answers every finding and question with `done:`, `ack:`, `disagree:` or
  `thanks:` — or `note:` to inform and `question:` to ask back —, pushes the fixes, and never
  posts `reviewed` or `decision`.

Both read the repository's `.conventional-comments.json` first, so they only use the labels it
enables. The reviewer ends each of its comments with a `[session:<identifier>]` line, the same for
the whole review session, and the author copies it into the reply to that comment, so a reader can
tell parallel review sessions apart. Each agent session draws its own identifier from a random
source, checks that the pull request does not carry it yet, and never takes one from the pull
request, from another session or from an earlier conversation. The identifier is a readable name drawn by
[Slugger](https://github.com/Reefact/slugger), used without asking when it already runs — or, on
Linux x64 without .NET, through its native build, downloaded and checked against a pinned SHA-256.
The choice is made once per installation and recorded in a committed `session-id.md` beside the
skill: where none is recorded yet, the reviewer skill offers Slugger once and records the answer —
Slugger, or a GUID. Once a choice is recorded it is never asked again; where a recorded Slugger
cannot run on a machine, that session draws a GUID by a command instead, and its report says why.
A Slugger name also gets a description: one idiomatic sentence that renders its words, in the
language of the review's comments, appended after an em dash and in italics —
`[session:disheartening-reviewed-implementation — *We reviewed the implementation, and frankly,
it was disheartening.*]`. The extension shows the name, and the
sentence on hover; the author's reply copies the marker as written, description included.

## Modes and adoption (§7)

`off`, `assist` (default), `enforce`; the recommended path is `assist` → `enforce` on a pilot
repository → rollout. `warn` is retired and read as `assist`. Operational procedures — the
prerequisite for `enforce` and the rollback order — are in
[`docs/operations-fr.md`](./docs/operations-fr.md).

## Acceptance criteria

Every acceptance criterion of §11 is covered by at least one automated test.
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
| P1 | `core/` (parser, validator, config) + unit tests | Implemented |
| P1' | Programmatic-write spike (GitHub React + Azure DevOps) | Assumption validated in Chromium; remaining platform assumptions documented with their fallbacks (`spikes/p1-prime/README-fr.md`) |
| P2 | Extension `assist` on GitHub | Implemented |
| P3 | Azure DevOps adapter | Implemented, with the P1' fallbacks in place |
| P4 | Opt-in telemetry and the §12 indicators | **Partly implemented.** Opt-in counters ship: a label inserted through the extension, a diagnostic code shown, a selector degradation — with mode and repository, never free text —, sent only to a collection point declared by enterprise policy and accepted by the person. **The §12 indicators do not follow from them yet**: no event counts written or submitted comments, so the compliance and warning *rates* have no denominator, and a label typed or pasted by hand is missing from the distribution. Those events and the restitution remain to be built |
| P6 | `enforce` (send guard, §5.4) on a pilot repo, then rollout | **Blocked on P4** (§14). The send guard is implemented, and choosing the pilot and writing the rollback procedure can start now; switching the pilot to `enforce` waits for the §12 indicators. Rollback order: [`docs/operations-fr.md`](./docs/operations-fr.md) |

P5 (the verifier) and P0 (the baseline measurement, which only served an indicator that needed
the platform's API) are removed from the specification; their identifiers are not reused.

License: Apache-2.0.
