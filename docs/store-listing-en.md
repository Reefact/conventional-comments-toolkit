# Chrome Web Store listing — content (EN)

Draft of the text fields for the submission form. See also
[`store-listing-fr.md`](store-listing-fr.md) for the French version and
[`store-permissions-justification-fr.md`](store-permissions-justification-fr.md)
for the permission justification.

## Category

**Developer Tools** — closest Chrome Web Store category: the extension
assists writing code review comments, not general productivity or social
tools.

## Short description (132 characters max)

> Conventional Comments assistant for GitHub code review: labels, validation, no code or comment content leaves your browser.

(123 characters — within the limit.)

**Correction (Codex, second pass):** the previous unconditional "nothing
leaves your browser" was false — `language`/`directShortcuts` sync via
`chrome.storage.sync` when Chrome Sync is on. Narrowed to the content
guarantee, which does hold unconditionally.

## Detailed description

> **Conventional Comments Toolkit** helps teams write clear code review
> comments that follow the
> [Conventional Comments](https://conventionalcomments.org/) convention,
> right inside GitHub's native editor on github.com — and, optionally,
> Azure DevOps Services.
>
> **⚠️ Not yet true of the shipped build — see the note at the end of this
> file:** support for GitHub Enterprise Server and Azure DevOps Server
> (self-hosted) is designed for but not wired end to end. Do not list
> them in the store submission until that's fixed.
>
> **What the extension brings**
> - A toolbar to insert standard labels
>   (`issue`, `suggestion`, `question`, `nitpick`...) without retyping
>   them.
> - Input validation with immediate visual feedback when a comment
>   doesn't follow the convention.
> - A keyboard-driven quick-input mode for people who'd rather not touch
>   the mouse.
> - Works standalone, no backend required: the extension assists and
>   validates even without the optional team-governance server
>   component.
>
> **Privacy by design**
> No comment, code, or diff content ever leaves your browser. No
> telemetry by default. No authentication token stored. Minimal
> permissions: no `<all_urls>` access — domains beyond GitHub (Azure
> DevOps, enterprise configuration hosts) are only requested on demand,
> with your explicit confirmation.
> See the full privacy policy:
> https://github.com/reefact/conventional-comments-toolkit/blob/main/PRIVACY.md
>
> **For organizations**
> An optional server component (not required to use the extension) lets
> teams enforce the convention as a merge requirement for pull requests,
> with a governed and auditable exemption mechanism.
>
> Public source code under the Apache-2.0 license:
> https://github.com/reefact/conventional-comments-toolkit

## Known gap blocking the "Enterprise Server" claim

Verified against the code (`content-internal.ts`, `bootstrap()`):
granting the optional host permission on a GitHub Enterprise Server or
self-hosted Azure DevOps Server domain injects the content script, but
`bootstrap()` never passes the granted `extraHosts` into
`GithubClientAdapter` / `AzdoClientAdapter`, so `matchesHost()` still only
recognizes `github.com` / `dev.azure.com` — no UI ever appears on those
self-hosted domains. Fix that wiring (or scope this listing down to
github.com + Azure DevOps Services) before submitting with any
self-hosted claim.

## Release notes for the first submission

> Initial release. See the GitHub repository's commit history for
> development history.

## Screenshot shot list (not produced in this document)

These require a real GitHub session and can't be generated
automatically here. Scenarios to cover, in priority order for the store
listing:

1. The Conventional Comments toolbar shown above a GitHub review comment
   editor, on a real pull request.
2. A label inserted (e.g. `suggestion:`) with the validation visual
   feedback (compliant state, success styling).
3. A non-compliant comment with the error visual feedback.
4. The options page (`options.html`) showing language selection and
   enabling an optional Azure DevOps domain.
5. (Optional) A resolved discussion thread overview, if the
   before/after contrast helps convey the product's value.

Chrome Web Store recommended format: 1280×800 or 640×400, PNG or JPEG,
up to 5 screenshots.

**If the "Configuration unread" banner shows up in a screenshot**, it is
**not** because the repository lacks a `.conventional-comments.json`.
`ClientConfigResolver` enters the degraded state (§5.4) only when a read
returns `unreachable`; a **missing** file returns `absent` with
`degraded: false` and shows no banner — per §10 ("a simply absent file
is a nominal case, not a degradation"). The banner therefore means a
`fetch` genuinely failed against
`https://{host}/{owner}/{repo}/raw/HEAD/.conventional-comments.json`
(network error, or an HTTP status other than 404): inspect that request
in the network tab — **adding a config file will not make it go away**.
