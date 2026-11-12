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

These need a real session on each platform — and, for GitLab and Azure DevOps,
the optional host permission granted. They cannot be produced from this
repository.

**The constraint that dictates the list**: the Chrome Web Store accepts **five**
screenshots, and the extension covers **three platforms** (appendices A, B and
C). Each shot must therefore carry two things at once — one platform, and one
moment of the product. The split below makes that fit without repeating itself.

1. **GitHub — writing.** The toolbar (§5.1) above the native pull request
   comment editor, a label inserted with its decoration (`suggestion
   (non-blocking):`) and the compliant visual feedback (§5.3). This is the
   **tile** shown in search results: frame it tight on the editor rather than
   the whole page, and check it still reads at small size.
2. **GitHub — reading.** An already published thread as the extension renders
   it (§5.5): label and decoration badges, hidden prefix with the subject
   brought forward, and the header banner counting unresolved blocking threads.
   This is what nothing else shows — the review as it is read back, not as it
   is written.
3. **GitLab — validation refusing.** A non-compliant comment in a merge request
   editor, with the error feedback (§5.3), and the send blocked (§5.4) if the
   demonstration configuration runs in `enforce`. Double duty: the third
   platform, and the error state.
4. **Azure DevOps — the same thing elsewhere.** Toolbar and badges on an Azure
   DevOps pull request, the domain having been enabled on demand. Double duty:
   the second platform, and evidence that optional activation works — which the
   permissions justification asserts elsewhere.
5. **The options page** (`options.html`): language, granted domains with the
   platform bound to each, label order. Show it **populated** — an empty page
   demonstrates nothing.

Two scenes are worth capturing **outside** the store listing, for the README or
the website, for lack of room here: keyboard quick input (§5.2) and the
per-label thread filter (§5.5).

**Conditions that apply to all five.**

- Format: PNG, exactly **1280×800** (the store also accepts 640×400).
- **Public, invented content.** These images are published as they are: never a
  private repository, a real customer project, or a third party's name or
  address. Dedicated demonstration repositories, on all three platforms.
- **A single theme** — light or dark — across the whole series.
- **No degraded banner** (§5.4) on screen: see the next section.
- Every shot must be **reproducible**: record the URL and the gestures that
  produced it, next to the image.

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

Fixed: the read is sent with `credentials: 'same-origin'` — the session
travels with the first hop, not with the redirect. The banner disappears
on a **public** repository, and on a **private** one too as long as a
session is open. It remains only for a signed-out visitor, and then says
something true: the extension could not read.

That last sentence hid a second defect, and it is worth keeping the
record. GitHub readily masks private resources as missing, so a 404 was
reclassified as an unreadable configuration **as soon as the page said
the repository was private** — a page-scraped signal, and therefore a
fallible one. It did fail: on a signed-in pull request page of a
**public** repository, the visibility probe answered "private", the
nominal 404 became `unreachable`, and the banner appeared on a
repository that simply had no configuration — the most ordinary case
there is. The reclassification now needs **two** independent signals to
agree: no session in the page (`meta[name="user-login"]` empty or
absent) **and** a repository reported private. The mask only exists for
an anonymous request, so an open session is enough to give the 404 back
its ordinary meaning, whatever the visibility probe says.
