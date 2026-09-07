# Permission justification — Chrome Web Store submission

This document is the draft to copy/paste into the Chrome Web Store
submission form (the extension listing's *Permission justification*
section). It covers the permissions declared in
`packages/extension/src/manifest.json` and relies on the guarantees in
§10 of `specifications-fr.md` ("Security", "Privacy").

Keep it in sync with `manifest.json` — otherwise the Google review and
this document drift apart silently.

See also [`store-permissions-justification-fr.md`](store-permissions-justification-fr.md)
for the French original.

## Single purpose

> Conventional Comments Toolkit helps people who review code on GitHub
> (and, optionally, Azure DevOps) write comments that follow the
> Conventional Comments convention: a toolbar to insert labels, input
> validation with visual feedback, right inside the platform's native
> comment editor. The extension performs no other function.

## Declared permissions

### `storage`

**Actual use (verified against the code,
`packages/extension/src/options/options.ts` and `content-internal.ts`):**
- `chrome.storage.sync`: interface language (`language`) and direct
  keyboard shortcuts (`directShortcuts`) — these two preferences
  **sync across the user's Chrome account devices** when Chrome Sync is
  on (see the note below).
- `chrome.storage.local`: current degraded state (`degradedState`),
  purely diagnostic.
- `chrome.storage.managed`: reads the enterprise policy floor (§8.1.1),
  never written to by the extension.

**Correction (Codex review on this document, this round):** the
previous claim — "nothing in the production code writes to it" — was
wrong. `persistSelectorFailure()` (`content-internal.ts:286`) does
write to `chrome.storage.local` under the `selectorFailures` key, via
`appendToJournal()` (`storage.ts:69`); it is wired into `SelectorLog`'s
callback (`content-internal.ts:436-437`), which calls it on every new
selector degradation. The log shown in settings (`options.ts:85`,
read-only from the options page) is therefore fed by a real write, not
data that stays empty forever — describe it as such in the submission
form.

There is **no** persisted "allowed repositories" list, and the read
cache for `.conventional-comments.json` (`ClientConfigResolver`) is an
in-memory `Map` — **owned by the content script, not the service
worker** (`bootstrap()` instantiates it in `content-internal.ts:118`) —
not a `chrome.storage` entry. Its scope is therefore **per tab**: it is
lost every time that context unloads (navigation, page reload), not
just on browser restart.

**Justification:** these preferences need to survive the tab closing;
this is the only permission that allows that under MV3. No data is sent
to any extension-run server — the only egress path for
`chrome.storage.sync` is the user's own Google account sync
infrastructure, not a third-party service run by the extension.

### `scripting`

**Actual use (verified):** **dynamically registering and unregistering
the content script on optional hosts** the user has themselves
authorized (Azure DevOps, GitHub Enterprise Server, an internal
domain) — via `chrome.scripting.registerContentScripts()` and
`unregisterContentScripts()` in `background.ts`, the only calls to
this API anywhere in the code.

This is **not** what injects the extension on github.com: that host is
covered by the manifest's static `content_scripts.matches` entry, and
`registerContentScriptForOrigin()` **explicitly excludes** it from its
dynamic mechanism.

**Justification:** the manifest's `content_scripts` entry is static and
cannot enumerate self-hosted enterprise domains ahead of time. Without
`scripting`, granting the host permission for `dev.azure.com` or a GHES
instance from the options page would inject the script **nowhere** —
the permission would be granted with no effect. This API is only called
for an origin the user has just authorized, never globally.

### `activeTab` — removed from the manifest

This permission was declared but consumed by no code (no call to
`chrome.tabs` or `chrome.scripting.executeScript`; the toolbar action
only calls `chrome.runtime.openOptionsPage()`, which doesn't need it).
A permission declared without real usage is exactly the kind of gap a
Google reviewer flags — it has been removed from the manifest (see
`packages/extension/src/manifest.json`).

**Deliberate divergence from `specifications-fr.md`.** §10 of the
specification lists `storage`, `scripting`, `activeTab` as the minimal
set — that text is **not** edited to match this removal, following this
repository's rule that the spec is the normative reference and is never
rewritten to track the implementation. The divergence is therefore
known and deliberate, not a silent reconciliation: if a real use for
`activeTab` shows up later (contextual diagnostics on the active tab,
for instance), the permission will be reintroduced along with its
justification.

### `host_permissions` — the static `https://github.com/*` entry was removed

Verified against the code: this static permission was not the trigger
for any identified code path.
- Toolbar injection is covered by the manifest's
  `content_scripts.matches: ["https://github.com/*"]`, which is
  sufficient on its own under MV3 — with no matching
  `host_permissions` entry needed.
- Reading `.conventional-comments.json`
  (`getRepoConfig()`/`getOrgConfig()`) does go to `github.com`, the
  page's own origin. **Correcting a claim that was wrong here for
  several versions**: "so it never crosses a CORS boundary" does not
  follow. The `raw` route **redirects** to `raw.githubusercontent.com`
  as soon as the file exists, and that origin answers with
  `Access-Control-Allow-Origin: *` — a wildcard the browser rejects the
  moment the request carries credentials. The read used to throw on any
  repository that actually had a configuration file. It is now sent with
  **`credentials: 'same-origin'`**, and the detail matters: the **first
  hop**, same-origin as the page, carries the session — GitHub allows it
  — while the **redirect**, which crosses an origin, no longer carries
  it, so the wildcard is accepted. A **private** repository therefore
  stays readable as long as a session is open, **with no host
  permission at all**; that is exactly what a `credentials: 'omit'`,
  written here first, gave up for nothing in return. What remains is the
  signed-out visitor, whom the route refuses — with which status code
  was not measured (the development environment's proxy answers on its
  behalf instead), so both cases are handled: a direct 403, and a 404 —
  GitHub readily masking private resources as "nonexistent" — which gets
  reclassified as soon as the page reports a private repository,
  otherwise the extension would conclude "no configuration" and apply
  the lower enforcement levels while claiming it had actually read the
  file. Reading an organization's `configUrl` faces the same ambiguity
  **without** a way to resolve it — the document lives in a different
  repository, whose displayed page says nothing about its visibility: a
  404 read without a session is therefore reported as unreadable there,
  the true nominal case being no `configUrl` declared at all. The
  service worker relay applies the same rule, for a reason of its own:
  its origin is `chrome-extension://`, so `same-origin` authenticates
  nothing there whatsoever. A `configUrl` hosted on a **private**
  github.com repository is therefore not readable from a page on another
  platform — the read *says so*, instead of concluding there is no
  configuration. Following the redirect by hand to authenticate only the
  first hop is not possible: measured, the response comes back opaque
  and its `Location` header is unreadable. The CORS mechanics, on the
  other hand, are measured by `npm run check:content-script-cors`, not
  assumed.
- **On this route, and only this route.** The choice is made by URL
  (`configCredentials()`): host `github.com` **and** path `/raw/`. Both
  reads go through it — the repository's own configuration, and the
  organization's `configUrl` when it points at that same route, a case
  where the service-worker relay rightly declines (same-origin URL as
  the page). Everywhere else, `include` stays the rule: on a GitHub
  Enterprise Server host accepted via `extraHosts`, no cross-origin
  redirect has been observed, and the session is precisely what makes a
  private repository's configuration readable. Stripping cookies where
  nothing has been measured would break an access path that currently
  works — the absence of measurement is an argument for leaving it
  alone, not for generalizing.
- **Consequence for the permission**: reading a **private** repository's
  configuration would require a host permission on `github.com` and a
  trip through the service worker. That is not requested today — the
  extension prefers to show that it could not read rather than demand
  access at install time.
- `registerContentScriptForOrigin()` (`background.ts`) **explicitly
  excludes** `https://github.com/*` from its dynamic activation
  mechanism.

`specifications-fr.md` (§2, line 1780) frames github.com as the only
host that can be "pre-declared", as opposed to optional hosts — the
spirit of that text is honored: access to github.com stays static, via
`content_scripts.matches`, without going through
`optional_host_permissions`. Removing the redundant `host_permissions`
entry does not contradict the spec, unlike the `activeTab` removal
above.

### `optional_host_permissions`: `https://*/*`

**Use:** this permission is **never active by default**. It is
requested at runtime, one domain at a time, with the user's explicit
confirmation, in two specific cases:

1. the organization uses Azure DevOps (`dev.azure.com`,
   `*.visualstudio.com`, or a self-hosted Azure DevOps Server domain);
2. the organization references a configuration file (`configUrl`,
   §8.1.3 of the specification) hosted on an internal domain distinct
   from the platform domains above.

**Justification:** the universe of self-hosted Azure DevOps Server
domains and internal enterprise domains cannot be enumerated ahead of
time — this is the documented use case for
`optional_host_permissions` in Chrome's own documentation, for an
extension that must stay usable in an enterprise environment without
shipping a separate version per organization domain. Without this
optional permission, the extension would either be unusable on
self-hosted Azure DevOps, or forced to request `<all_urls>` as a static
permission — a strictly broader scope than what is requested here. The
user stays in control of the grant: no domain is activated without
their explicit action in the extension's options page.

**✅ A granted domain now activates the matching adapter.** Fixed: the
content script was indeed injected on the authorized host
(`background.ts`, `registerContentScriptForOrigin`), but `bootstrap()`
(`content-internal.ts`) used to instantiate `GithubClientAdapter`/
`AzdoClientAdapter` without passing them the granted hosts. The options
page now maps each host to a platform (`hostPlatforms`,
`chrome.storage.local`) — a host that is granted but not mapped still
activates no adapter, rather than being guessed — and `bootstrap()`
passes the matching list as `extraHosts` to the right constructor.
Tested (`packages/extension/test/extra-hosts.test.ts`).

**✅ An organization's `configUrl` is now actually readable.** Fixed:
both adapters' `getOrgConfig()` used to call `fetch` directly from the
content script, a context whose requests are issued on behalf of the
page's origin and remain subject to that page's CORS policy ("Content
scripts initiate requests on behalf of the web origin that the content
script has been injected into and therefore content scripts are also
subject to the same origin policy", Chrome documentation, *Cross-origin
network requests*). The host permission granted for that domain changed
nothing there: an organization document hosted outside the platform's
own domain stayed unreadable, and the extension fell into a permanent
degraded state. The read now goes through the service worker (message
`cct-fetch-config`), the only context where this permission actually
applies.

Two clarifications worth having ready if a reviewer asks about this:

- **The relay only serves third-party origins.** The displayed
  repository's `.conventional-comments.json` file lives on the page's
  own origin: it is read directly, with no host permission and no
  relay. The same applies to a `configUrl` hosted on the platform's own
  domain — the page can read it itself, and the worker couldn't.
- **The worker does not follow the URL it is handed — it checks it
  against its own copy.** `configUrl` comes exclusively from the
  enterprise policy channel (`chrome.storage.managed`), which the
  worker re-reads for itself; a URL that does not match is refused
  without ever being fetched. A content script therefore cannot use the
  worker as an authenticated relay toward some other granted domain of
  its choosing.

Tested in `packages/extension/test/org-config-relay.test.ts`, and the
messaging mechanics are verified in a real Chromium instance by
`npm run smoke:mv3`.

## What the extension does not do (to have ready if a reviewer asks)

- No comment, code, or diff content ever leaves the browser (§10,
  "Privacy").
- **Telemetry: wired in, off by default, triple-locked.** This point
  has changed — the form now needs to describe it rather than answer
  "no collection at all". Nothing is ever sent unless all three of the
  following hold: the browser-pushed **enterprise policy** declares
  `telemetry.enabled`, it declares an `https:` collection endpoint
  (`telemetry.endpoint`), **and** the person checks the dedicated box on
  the options page, which displays that address right next to it. Both
  keys are declared in `packages/extension/src/managed-schema.json`: a
  key absent from that schema is never carried by the browser policy —
  Chrome silently drops it — which `npm run check:managed-keys` now
  verifies for every managed key the code reads.

  **The collection endpoint comes from that one channel only**, never
  from the resolved configuration. This is the same reasoning §8.1.1
  already applies to `configUrl` — a repository must not get to name
  the very document meant to constrain it — applied to the collector: a
  repository's `.conventional-comments.json` file can neither turn
  telemetry on nor choose where it goes. To a reviewer who asks: **no
  third-party repository can make the extension emit anything.**

  **The consent covers ONE destination**, the one that was displayed on
  screen. It is stored on-device (`chrome.storage.local`), **does not
  sync** to the account's other devices, **immediately disarms already
  open tabs** when withdrawn, and stays revocable even after the policy
  stops declaring a collection endpoint.

  **What is sent**, on a periodic flush and never on keystrokes: the
  displayed repository (`host/scope`), the mode, and counters keyed by
  identifiers — labels used, diagnostic codes, degraded selector
  strings (§10, §9.4). The vocabulary is closed by a regular
  expression: a value that doesn't have the shape of an identifier is
  **dropped**, never truncated or sanitized, so that no fragment of
  typed text can ever travel this path. No cookie is attached
  (`credentials: 'omit'`).

  The request carries **neither cookie nor referrer**: without a
  `referrerPolicy`, the default `Referer` header would carry the full
  URL of the review page, PR identifier included. `npm run check:beacon`
  reads the headers an actual collector receives, and
  `npm run check:content-script-io` verifies that the shipped code does
  set that policy.

  **No extra permission is requested for any of this**: the POST is
  sent in `no-cors` mode, whose response is never read — behavior
  measured in a real browser by `npm run check:beacon`, not assumed.
  This is unlike reading `configUrl`, which needs the response and
  therefore does go through the service worker.
- No authentication token (PAT) or secret is stored by the extension,
  and it never authenticates against any token-based API. **It does,
  however, issue network requests**, and that should be said plainly:
  reading the displayed repository's `.conventional-comments.json` via
  the `raw` route, and, when an enterprise policy floor names a
  `configUrl`, reading that organization document. **Correction (Codex
  review on this document, this round):** claiming all of these
  requests carry the full session cookie set (`credentials: 'include'`)
  contradicted the `host_permissions` section earlier in this same
  document, and was wrong for the most common route. Three cases, not
  one: reading the displayed repository goes out with
  **`same-origin`**, on `github.com` plus the `/raw/` path
  (`configCredentials()`), for the reason already detailed above — the
  first hop, same-origin as the page, carries the session, while the
  cross-origin redirect no longer does; an organization `configUrl`
  that names a domain **distinct** from the platform goes through the
  service-worker relay, whose `chrome-extension://` origin carries
  **no** github.com cookie at all; and it is only elsewhere — a
  `configUrl` that is same-origin with the page, outside that specific
  `raw` route — that `include` stays the default rule. In every case
  these are reads: no content ever travels outward.
- No remote code: `content_security_policy` forbids any script that
  isn't bundled inside the extension, and there is no CDN dependency.
- Public, auditable source code (Apache-2.0 repository).
