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
> right inside GitHub's native editor (github.com, GitHub Enterprise
> Server, GitHub Enterprise Cloud) — and, optionally, Azure DevOps
> (Services and self-hosted Server).
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

## Gap fixed — UI recognition on a self-hosted domain

Fixed and tested (`content-internal.ts`,
`packages/extension/test/extra-hosts.test.ts`): granting the optional
host permission on a GitHub Enterprise Server or self-hosted Azure
DevOps Server domain, then tagging it with a platform on the options
page, now correctly activates the UI — `bootstrap()` passes the granted
`extraHosts` into the matching adapter. The "GitHub Enterprise Server /
Azure DevOps Server" claim can stay in the listing.

## Gap fixed — `configUrl` on a third-party domain

Fixed and tested (`packages/extension/test/org-config-relay.test.ts`):
`getOrgConfig()` used to call `fetch` from the content script, subject
to the host page's CORS — a host permission changes nothing there,
since the request is issued on behalf of the page's origin. Reading an
organization `configUrl` hosted on a domain **distinct** from the
platform now goes through the service worker (`cct-fetch-config`).
Same-origin reads — the displayed repository's
`.conventional-comments.json`, and a `configUrl` hosted on the platform's
own domain — stay direct: they need no relay.

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

**If the "Configuration unread" banner shows up in a screenshot**: the
diagnosis written here for several versions was right about its premise
and wrong about its conclusion, and it is worth correcting rather than
replacing. Right: a **missing** file returns `absent` with
`degraded: false` and shows no banner (§10, "a simply absent file is a
nominal case, not a degradation"). Wrong: "adding a config file will not
make it go away". It was the opposite — the banner appeared **because
there was a file**. The `raw` route on github.com redirects to
`raw.githubusercontent.com` as soon as the file exists, that origin
answers `Access-Control-Allow-Origin: *`, and the browser rejects the
wildcard whenever the request carries credentials: the `fetch` threw, the
read returned `unreachable`, and the banner appeared on precisely those
repositories that had a configuration to read.

Fixed: the read is sent without cookies. On a **public** repository it
succeeds and the banner disappears. On a **private** one the route
refuses without a session, so the banner stays — and now says something
true: the extension could not read. (GitHub readily masks private
resources as missing, so a 404 there is reclassified as an unreadable
configuration as soon as the page says the repository is private;
otherwise the extension would conclude "no configuration".) Take
screenshots on a public repository, or on one with no configuration
file.
