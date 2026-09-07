# Firefox Add-ons (AMO) listing — content (EN)

Draft of the text fields for submission on **addons.mozilla.org** (AMO).
The AMO form differs more sharply from Chrome Web Store's than Edge's
does — different vocabulary ("Summary" rather than "Short description"),
Mozilla-specific licensing and data-collection fields, and a distinct
Firefox package (event page, `browser_specific_settings`). This document
reuses the content already approved in
[`store-listing-en.md`](store-listing-en.md) and details what is
specific to AMO.

See also [`store-listing-firefox-fr.md`](store-listing-firefox-fr.md)
for the French version.

## Technical prerequisite — verified while drafting this listing

The Gecko ID declared in `packages/extension/build.mjs`
(`browser_specific_settings.gecko.id`) carried an example domain
(`@example.org`) — a placeholder with no place in a real submission,
even though Mozilla does not require ownership of the domain used in
the ID. Fixed: it now points to
`conventional-comments-toolkit@conventionalcomments.io`, the project's
actual domain. Running `npm run build:extension` regenerates
`packages/extension/dist-ext/firefox/manifest.json` with this new ID —
that file, once zipped, is what gets submitted to AMO.

## What carries over as-is

- **Summary** (AMO's equivalent of the short description — **250
  character** limit, to confirm against the live form at submission
  time, more generous than Chrome Web Store's 132):
  > Conventional Comments assistant for GitHub code review: labels, validation, no code or comment content leaves your browser.

  (123 characters — comfortably under the AMO limit.)
- **Detailed description**: identical to `store-listing-en.md`.
- **Screenshots**: the five images in `assets/branding/ext-*.png`
  (1280×800) work as-is — AMO does not enforce a strict screenshot
  format the way Chrome Web Store does, but recommends something close
  to the 16:10 ratio already produced.
- **Privacy policy**: same URL used for the other stores,
  https://github.com/reefact/conventional-comments-toolkit/blob/main/PRIVACY.md
- **License**: Apache-2.0 — AMO explicitly asks for the source license
  in a dedicated field, unlike Chrome Web Store, which does not ask.

## What is specific to AMO

- **Category.** AMO's taxonomy differs from Chrome's; the closest match
  is **Web Development** — to confirm against the form's dropdown.
- **Submitted package.** The **Firefox** archive, not the Chromium one:
  `conventional-comments-toolkit-<version>-firefox.zip`
  (`docs/release-fr.md`), which carries
  `browser_specific_settings.gecko` instead of a `service_worker`.
- **Data collection declaration.** AMO asks for a structured checklist
  of data categories processed (not a free-text field like Chrome Web
  Store's "Permission justification"). Per
  [`store-permissions-justification-en.md`](store-permissions-justification-en.md):
  no personal data or browsing content is collected by default; only
  the optional telemetry — off by default and triple-locked (enterprise
  policy **and** explicit consent) — sends aggregated, non-identifying
  counters (labels used, diagnostic codes) and never comment, code, or
  diff text. Check AMO's corresponding boxes accordingly (likely: none
  of Mozilla's listed personal-data categories apply, since optional
  telemetry is neither on by default nor tied to any identity).
- **Manual source review.** Unlike Chrome Web Store, AMO may request
  access to the unminified source when the submitted bundle is built by
  a tool (here, `esbuild` — see `packages/extension/build.mjs`). Since
  the repository is public under Apache-2.0, pointing AMO at the
  repository URL (https://github.com/reefact/conventional-comments-toolkit)
  in the field provided is enough — no need to upload a separate source
  archive.
- **Contact fields.** AMO asks for a **support email address** and,
  optionally, a **homepage**. Neither has been decided yet in this
  repository (same gap as for Chrome Web Store and Edge) — needs
  deciding before submission.
- **Developer account.** A Mozilla account (free, no registration fee —
  unlike Chrome Web Store's one-time $5 fee) is needed, separate from
  the Google/Microsoft accounts used for the other two stores.
- **Review timing.** AMO advertises a near-immediate automated review
  for the initial "listed" (not "recommended") release, followed by a
  manual post-hoc review that can suspend the extension if it fails —
  unlike Chrome Web Store and Edge, where review happens before
  publication. Worth confirming against AMO's own documentation at
  submission time rather than assuming — this has not been measured
  here.

## Release notes for the first submission

Same as `store-listing-en.md`:

> Initial release. See the GitHub repository's commit history for
> development history.
