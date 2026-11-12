# Development

For people who work **on** the toolkit. To use the extension, start with the
[user guide](README-en.md).

The working rules of the repository are in [`CLAUDE.md`](../CLAUDE.md) (in French; they hold
for humans and agents alike) and its important decisions in [`docs/idr/`](idr/README-en.md).
[`CONTRIBUTING.md`](../CONTRIBUTING.md) is the short version.

## Layout

A TypeScript monorepo (npm workspaces). The full breakdown is in
[`architecture-fr.md`](architecture-fr.md).

```
packages/core           @cct/core            parser, validator, config — every validation rule
packages/adapters/*     @cct/adapter-*       platform adapters + shared editor plumbing
packages/extension      @cct/extension       Manifest V3 extension — toolbar, quick input, feedback, guard
spikes/                 browser measurements  what happy-dom cannot tell, measured in a real Chromium
skills/*                agent skills          review a pull request, or answer its review, in Conventional Comments
```

`packages/core/` holds every validation rule and has no dependency on the browser or on any
platform; the adapters and the extension consume it.

## Getting started

```
npm install
npm test                  # unit + integration tests (mapped to the acceptance criteria)
npm run build             # TypeScript build of every package
npm run checks            # repository guards that need no browser, build included
npm run build:extension   # MV3 bundle into packages/extension/dist-ext (+ Firefox variant)
```

Starting from a machine with none of this installed? See the step-by-step Windows/PowerShell
guide: [`extension-setup-en.md`](extension-setup-en.md) (French:
[`extension-setup-fr.md`](extension-setup-fr.md)).

Some commands question the **browser** rather than the code, and drive a real Chromium through
`playwright-core`: `npm run smoke:mv3`, `npm run spike`, and most `npm run check:*` commands
listed in [`CLAUDE.md`](../CLAUDE.md). Once per machine: `npx playwright-core install chromium`.
`package.json` is the reference for what exists.

The images of the documentation are produced by `npm run docs:screenshots`, from the shipped
components ([`scripts/doc-screenshots.mjs`](../scripts/doc-screenshots.mjs)). Run it again
when the toolbar, the pill or the badges change.

## The specification

[`specifications-fr.md`](../specifications-fr.md) (in French) is the **normative** functional
reference. It is never edited to match the implementation; an amendment is a design decision,
and may ship with the code that implements it
([DEC0004](idr/DEC0004-spec-amendments-ship-with-their-code-en.md)).

## Acceptance criteria

Every acceptance criterion of §11 is covered by at least one automated test. The mapping from
each criterion to its test files is in [`ca-matrix-fr.md`](ca-matrix-fr.md); the `CA-NN`
identifiers appear literally in the tests, and CI fails if that stops being true.

## Continuous integration

Only **CI** is meant to be a required check on `main`; the others report without gating.
[`.github/workflows/`](../.github/workflows) is the reference.

| Workflow | Question it answers | When |
|----------|--------------------|------|
| [`ci.yml`](../.github/workflows/ci.yml) | Does everything compile and does every test pass, on both supported Node versions? | push to `main`, every PR |
| [`conformance.yml`](../.github/workflows/conformance.yml) | Do the repository's own rules still hold — CA matrix in step with the tests, invisible characters written as escapes, normative spec untouched by a code PR? | push to `main`, every PR |
| [`extension-package.yml`](../.github/workflows/extension-package.yml) | Does the MV3 bundle build, stay free of remote code (§10), and keep both manifests loadable? Publishes the Chromium and Firefox bundles as artifacts. | push to `main`, PRs touching `packages/` |
| [`browser-smoke.yml`](../.github/workflows/browser-smoke.yml) | Does the §9.3 programmatic-write strategy still hold in a current Chromium — the one thing happy-dom cannot tell us? | daily (04:17 UTC), PRs touching adapters or the spike |
| [`release.yml`](../.github/workflows/release.yml) | Can someone install the extension without any build chain? Builds, verifies and publishes the Chromium and Firefox zips as a GitHub Release. | tag `v*`, manual dry run |

The selector smoke test of §9.4 runs on pages captured from each platform
(`packages/adapters/<id>/test/fixtures/pages/`): `npm run check:captured-selectors` checks that
happy-dom, where the real-page tests run, matches exactly the elements Chromium matches.
Against the *live* platforms, only what an anonymous visitor can see is checked, weekly, by
[`github-selectors-canary.yml`](../.github/workflows/github-selectors-canary.yml). Composers
need a signed-in session and are not checked live.

## Releasing

How a release is cut: [`release-fr.md`](release-fr.md). The changelog is
[`CHANGELOG.md`](../CHANGELOG.md); the release notes for people who use the extension are
[`release-notes-1.x-en.md`](release-notes-1.x-en.md) and
[`release-notes-1.x-fr.md`](release-notes-1.x-fr.md).

## Status against the specification phases (§14)

| Phase | Content | State |
|-------|---------|-------|
| P1 | `core/` (parser, validator, config) + unit tests | Implemented |
| P1' | Programmatic-write spike (GitHub React + Azure DevOps) | Assumption validated in Chromium; remaining platform assumptions documented with their fallbacks (`spikes/p1-prime/README-fr.md`) |
| P2 | Extension `assist` on GitHub | Implemented |
| P3 | Azure DevOps adapter | Implemented, with the P1' fallbacks in place |
| P4 | Opt-in telemetry and the §12 indicators | **Partly implemented.** Opt-in counters ship: a label inserted through the extension, a diagnostic code shown, a selector degradation — with mode and repository, never free text —, sent only to a collection point declared by enterprise policy and accepted by the person. **The §12 indicators do not follow from them yet**: no event counts written or submitted comments, so the compliance and warning *rates* have no denominator, and a label typed or pasted by hand is missing from the distribution. Those events and the restitution remain to be built |
| P6 | `enforce` (send guard, §5.4) on a pilot repo, then rollout | **Blocked on P4** (§14). The send guard is implemented, and choosing the pilot and writing the rollback procedure can start now; switching the pilot to `enforce` waits for the §12 indicators. Rollback order: [`operations-fr.md`](operations-fr.md) |

P5 (the verifier) and P0 (the baseline measurement, which only served an indicator that needed
the platform's API) are removed from the specification; their identifiers are not reused.
GitLab entered the scope later ([DEC0007](idr/DEC0007-gitlab-in-scope-en.md)); what its
adapter covers is in the [platforms](guide/platforms-en.md) page.

## Other maintainer documents

| Document | Content |
|---|---|
| [`architecture-fr.md`](architecture-fr.md) | The packages and what `core/` guarantees |
| [`operations-fr.md`](operations-fr.md) | Adoption path, prerequisites to `enforce`, rollback procedure |
| [`ca-matrix-fr.md`](ca-matrix-fr.md) | Each acceptance criterion and the tests that cover it |
| [`session-marker-rendering-fr.md`](session-marker-rendering-fr.md) | How the review-session marker is rendered |
| [`release-fr.md`](release-fr.md) | Cutting a release |
| [`store-listing-en.md`](store-listing-en.md), [`store-listing-fr.md`](store-listing-fr.md) | Draft of the store listing |
| [`store-permissions-justification-fr.md`](store-permissions-justification-fr.md) | Permission justification for the store review |
| [`idr/`](idr/README-en.md) | Important Decision Records |
| [`../A-FAIRE-fr.md`](../A-FAIRE-fr.md) | What remains to be done |
