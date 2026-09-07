# Microsoft Edge Add-ons listing — content (EN)

Draft of the text fields for submission on the Microsoft Edge Add-ons
**Partner Center**. Since Edge is Chromium-based and accepts the same
Manifest V3 bundle, this document **reuses as-is** the content already
approved in [`store-listing-en.md`](store-listing-en.md) (Chrome Web
Store) and only details what actually differs between the two
submission forms.

See also [`store-listing-edge-fr.md`](store-listing-edge-fr.md) for the
French version.

## What is strictly identical to the Chrome Web Store listing

- **Submitted package**: the same Chromium archive used for the Chrome
  Web Store (`conventional-comments-toolkit-<version>-chromium.zip`,
  `docs/release-fr.md`) — no separate build variant is needed for Edge,
  unlike Firefox.
- **Short description** (see `store-listing-en.md`):
  > Conventional Comments assistant for GitHub code review: labels, validation, no code or comment content leaves your browser.
- **Detailed description**: identical to `store-listing-en.md`.
- **Screenshots**: the five images in `assets/branding/ext-*.png`
  (1280×800) work as-is — Partner Center accepts the same format
  (1280×800 or 640×400) and allows up to **10** images (versus 5 on the
  Chrome Web Store), so nothing needs trimming, though more could be
  added later if new screenshots are produced.
- **Privacy policy**: same URL,
  https://github.com/reefact/conventional-comments-toolkit/blob/main/PRIVACY.md
- **Listing icon**: `packages/extension/src/icons/icon-128.png`.

## What differs from the Chrome Web Store form

- **Category.** Partner Center uses its own taxonomy; the closest match
  is **Developer tools**, to confirm against the dropdown at submission
  time — the exact label may differ slightly from Chrome Web Store's.
- **Short description limit.** Not re-verified in this document against
  the current Partner Center form (no access to it from this
  environment) — the description above (123 characters in English) sits
  comfortably under the Chrome Web Store limit, which is a reasonable
  starting point, but **should be confirmed against whatever limit
  Partner Center actually displays before submitting**, rather than
  assumed identical.
- **No per-permission "permission justification" form**, unlike Chrome
  Web Store. Partner Center instead asks for a more general statement
  about data collected and intended use. The content of
  [`store-permissions-justification-en.md`](store-permissions-justification-en.md)
  remains the best source to answer those questions (no content
  collection, telemetry off by default and triple-locked, no stored
  token) — reword it to fit whatever free-text field the form provides
  rather than pasting it verbatim.
- **Required contact fields.** Partner Center requires a **support
  email** and, optionally, a **website**. Neither has been decided yet
  in this repository (the same gap identified for the Chrome Web Store)
  — needs deciding before submission: a dedicated contact address, or a
  link to the repository's GitHub issues.
- **Developer account.** A Partner Center account, separate from the
  Chrome Web Store developer account, is needed (Microsoft credentials),
  with no registration fee — unlike Google's one-time $5 Chrome Web
  Store fee.
- **Review timing and nature.** Edge review may include additional
  automated analysis on top of Chrome's; no data on typical turnaround
  is available here — worth observing during the "shell" submission
  mentioned in `docs/operations-fr.md` ("Store review", which
  recommends starting it early, regardless of which store it targets).

## Release notes for the first submission

Same as `store-listing-en.md`:

> Initial release. See the GitHub repository's commit history for
> development history.
