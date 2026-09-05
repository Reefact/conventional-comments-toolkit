# Changelog

All notable, user-facing changes to the **Conventional Comments Toolkit** browser extension are
documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Section numbers in an entry
(§5.5, §9.4…) point at [`specifications-fr.md`](specifications-fr.md), the normative reference.

Entries for `1.0.0-beta.1` through `1.0.0-beta.7` were written after the fact, from each tag's
own commit range, when this file was introduced at `1.0.0-beta.8`. They collapse review rounds
into the outcome that shipped: `1.0.0-beta.7` carries thirteen commits refining one behaviour,
and what a reader needs from them is the behaviour, not the thirteen.

## [Unreleased]

### Fixed

- **The Preview tab shows badges on the rewritten "Files changed" view too** (§5.5). Writing
  `issue: …` in a composer on `…/changes` and switching to *Preview* rendered the prefix in
  plain text, while the same switch on the conversation page showed the badge. Nothing was
  written for that view in the first place: the legacy preview happens to carry `comment-body`,
  the class the extension already reads, and the rewritten one carries neither that nor the
  class its review threads use. It took a second selector chain rather than one more candidate
  in the existing one — a chain returns the matches of the *first* candidate that matches
  anything, so an appended candidate would never have been reached while a thread is on the
  page (the reported case), and a prepended one would have hidden the thread bodies as soon as
  a preview opened. The preview now also counts among the rendered bodies, which is what wakes
  the render up when the tab is switched: opening it changes no published summary, no thread
  id, and no comment count. Measured on GitHub's shipped bundles rather than on the page —
  `…/changes` answers 302 to `/files` without a session — and the selector file says which
  chunks, what they render, and what that kind of measurement cannot promise.

- **The review panel's own submit button is guarded too** (§4.3). The click guard reached the
  inline composer but not "Finish your comments": its two buttons are not inside the container
  that holds the field — measured, they live in the overlay carrying the panel, ten levels up —
  so the lookup, which stopped at the first ancestor that *matched*, returned nothing and a
  non-compliant review stayed publishable under `enforce`. It now keeps the first container that
  actually carries buttons. Telling that panel's buttons apart needed no guesswork: the one that
  publishes wears its own component's class, which *Cancel* does not.

- **Diagnostic messages now follow the language picked in the options page** (§5.3, which wants
  them "in the language resolved per §8.1.2"). Everything the extension writes itself already
  did — the validation pill, the *Fix* button, the banner — but the one text that comes from
  `core/` did not: it picks its language from the configuration's `language` key, and that key
  is what reached it, never the language resolved for the browser. On a repository that does not
  set it — the default — a French interface therefore showed *Conforme, avec avertissements*
  above *This comment is blocking but has no discussion*. The local preference now wins, as
  §8.1.2 orders it, and a repository that does set `language` still decides for anyone who has
  expressed no preference of their own. Label identifiers (`issue`, `praise`…) and diagnostic
  codes (`E-NO-LABEL`, `W-NO-DISCUSSION`…) stay untranslated in both languages: they are
  identifiers, and the check output (§6.3.1) names them the same way.


- **Under `enforce`, a non-compliant comment can no longer be published by clicking on the
  rewritten "Files changed" view** (§4.3). That composer has no `form`, so the submit-control
  lookup fell back to the field's direct parent — a `<span>` holding nothing but the field —
  and wired no control at all; only the keyboard path survived. Its footer carries three
  buttons, and telling apart the two that publish from the one that cancels took measuring:
  Primer's buttons are `type="button"`, `data-variant` reads `default` for *Reply* as for
  *Cancel*, and there is no test id, label or shortcut hint to go by. The one measured
  difference is structural — *Cancel* is a bare button and the group's first child, the other
  two are each wrapped — so the selector asks for both, since the wrapper alone would fail on
  the dangerous side the day GitHub wraps *Cancel* too.

- **The composer keeps its spacing after a trip through the Preview tab.** Switching to
  Preview and back remounts the editor on the rewritten Files changed view, and React rewrites
  the class list of the field's wrapper — taking with it the class that carries the extension's
  own 8px inset. The field itself survives, classes and all, so nothing re-attached and the
  spacing stayed lost until the composer was closed. The classes the extension puts on the page
  are now watched and put back when the platform takes them, the same way its badges already
  are.

- **A blocking label in a batch review's body is warned about again** (§4.1, which validates
  that body but denies it any blocking state — nobody can resolve a review summary). On the
  rewritten Files changed view the "Finish your comments" panel matched none of the chain's
  three candidates, so the field fell through to the thread-root fallback and was credited with
  a blocking state it cannot carry. The symptom was one missing line: `issue:` there reported
  `E-EMPTY-SUBJECT` and `W-NO-DISCUSSION` but not `W-NOT-BLOCKABLE`, where the same text in the
  conversation box reports all three. The panel is recognised by two measured containers of its
  own component, appended to the chain so the generations that already matched cannot move.

- **The compliance outline around the field is visible again on the rewritten "Files changed"
  view** (§5.3). It was drawn all along — measured green on the text area — and then clipped:
  the state ring is an `outline` so that it never pushes the page around, but an outline paints
  *outside* the element's box, and on that view the field sits in a Primer wrapper with
  `overflow: hidden` and exactly the same box. A negative `outline-offset` brings the ring
  inside the box, where nothing clips it, at the cost of one pixel of inset everywhere else.

- **The toolbar sits above the field again on the rewritten "Files changed" view** (§5.1, and
  §5.3 for the feedback pill below it). Both were inserted as immediate siblings of the text
  area, which puts them above and below only if the field's own parent stacks its children —
  true of the legacy DOM, false here, where that parent is a Primer `<span>` laid out as a row.
  The ten label buttons were folded into a narrow column beside the field, and the pill into a
  second one. They now go into the nearest ancestor that actually stacks, found by asking the
  style engine rather than by naming a platform container — one more name that would age. Where
  the immediate parent already stacks it is kept, so the legacy geometry is untouched.

- **Review threads are read again on the rewritten "Files changed" view.** Four chains that
  read the page came back empty there, and the consequences were spread across the product: no
  badge on any published comment (§5.5) — the raw `issue (non-blocking):` prefix stayed visible
  where the extension normally hides it behind a badge; every thread reported as unresolved-state
  unknown; empty authors and bodies in what the banner reads; and, most costly, **editing the
  root comment of a thread was classified as a reply**, which §4.1 exempts from validation by
  default — an `issue:` root could be edited into anything without the extension looking. Two
  facts had to be measured rather than assumed: the resolution marker sits *beside*
  `[data-testid="review-thread"]` rather than inside it, so a resolved thread read as unknown;
  and this view has no named edit form, the editor's position inside the comment being what
  distinguishes an edit from a new reply. The neighbouring box is only consulted when it holds a
  single thread, so no thread can ever adopt its neighbour's resolved state. As with the
  composer, each failure now leaves a journal entry (§9.4) instead of failing in silence.

- **The comment tooling is back on the rewritten "Files changed" view** (§4.1, whose first row
  calls an inline diff comment the core of review — the one zone, with a thread root, that
  carries a blocking state). GitHub now serves that page at `/pull/N/changes`, where the
  composer is a Primer `<textarea>` that none of the chain's six candidates matched: no toolbar,
  no quick input, no validation, precisely where a blocking `issue:` counts. The visible oddity
  was the mirror image of the useful behaviour — the toolbar still appeared in the general
  conversation box, only to warn through `W-NOT-BLOCKABLE` that a blocking label does nothing
  there. Three measured handles now catch the field, ordered from the most specific to the
  widest and each sufficient on its own; neither Primer's build hash nor React's generated id is
  one of them, because both change on every deployment. The miss no longer goes unrecorded
  either: `observeEditors` was the one probe in the GitHub adapter that journaled nothing when
  its chain came back empty, so the extension was inert and silent at once. It now writes a
  degradation entry (§9.4) when a page carries an editing surface no candidate recognises —
  never when no composer is simply open, which is the norm.

## [1.0.0-beta.9] - 2026-09-04

### Fixed

- **The pull request's own description is no longer treated as a review comment** (§4.1, which
  places it outside the convention's scope). The editor that "Edit" opens on it matched the
  comment-editor chain, and the zone fallback — no thread, no review body, no conversation form,
  therefore a diff-line comment — classified it as a thread root, the one zone that carries a
  blocking state. The visible symptom was the label toolbar drawn on a text the convention says
  nothing about; the costly one was invisible: under `enforce`, the submit guard applied to the
  description's own Update button, so a description without a `label:` prefix could not be saved
  at all. Badges are gone from it too (§5.5). The exclusion matches on the containers around the
  field rather than the field itself, because GitHub serves that textarea from a fragment it
  refuses without a session: only the containers could be measured. Where a future rendering
  names them differently, nothing matches and the description behaves as it did before — never
  worse.
- **A page that had nothing to show no longer stops watching after five seconds.** The hydration
  window was meant to bound retries on a page still filling in; it also stopped the observer for
  good on a page that never had anything, and only then. That is the ordinary state of the
  *Files changed* view of a pull request with no thread yet: the first inline comment posted
  afterwards received neither badge nor banner until a full reload, and so did returning to
  *Conversation* from another tab of the same pull request, which is not a navigation and does
  not restart the window. The window now bounds repetition, not lifetime: a page that has not
  moved is still left alone, a page that gains a comment, a thread or a published result is
  rendered again.

- **The "Configuration unread" banner no longer appears on every repository.** Both client
  adapters held the global `fetch` in a private field and called it as a method, which passes the
  adapter instance as the receiver. In the isolated world of a content script Chromium refuses
  that receiver — `Failed to execute 'fetch' on 'Window': Illegal invocation` — so every
  configuration read threw, every read returned `unreachable`, and the degraded state of §5.4 was
  permanent: on public repositories and private ones, with a configuration file and without. The
  repository level of §8.2 was not merely unreadable on GitHub, it never left the browser.
  `npm run check:content-script-cors` now measures both call shapes inside a real content script,
  which is the only place the difference exists — probed in a page's main world, Chromium accepts
  the very same receiver.
- **A 404 is no longer reclassified as an unreadable configuration while a session is open**
  (§8.2). GitHub masks a private resource as missing, so a 404 was treated as unreadable as soon
  as the page reported a private repository. That is a page-scraped signal, and it can lie: it
  answered "private" on a signed-in pull request page of a public repository. The mask only
  exists for an anonymous request, so the reclassification now needs two independent signals to
  agree — no session in the page, and a repository reported private.
- **The selector degradation journal is usable again** (§9.4). The completion-control probe
  records a degradation whenever it does not find the merge button, and it runs on every DOM
  mutation: on a closed pull request, where that absence is the norm, a single visit filled the
  50-line journal with `merge-button` and evicted every real degradation. One line per selector
  now, timestamped at the most recent page load that saw it fail, bounded both within a tab and
  across the shared journal — and the opt-in telemetry, which inflated for the same reason, with
  it.

### Added

- **The degraded state says why.** The adapters build a reason on every unreadable read
  (`HTTP 429`, `TypeError: …`, a 404 indistinguishable from a refusal) and it was discarded on the
  spot. The options page now shows it with the level it came from — `repo: …`, `org: …` — instead
  of the bare word `unreachable`. The string stays local: it goes to `chrome.storage.local` and
  nowhere else (§10).

## [1.0.0-beta.8] - 2026-09-04

### Added

- **The subject of a published comment is now read on the badge line, in bold, to the right of
  the badges (§5.5).** The line reads as a title — badges, then what it is about — instead of a
  banner of badges followed by text restarting underneath. A blank line separates it from the
  rest of the comment, but only where the body resumes on the next line of the same paragraph:
  where it resumes in a new paragraph, the platform already spaces it. The badges are placed
  inside the element that holds the subject, which is what puts them in inline flow with it.
  Where the subject's boundary cannot be established — a badge projection that would lose
  information, a first level that is not a plain paragraph, or a hard line break living inside
  inline formatting such as `**subject  \nbody**` — nothing moves: badges above, text untouched
  below (§9.4).

### Fixed

- **A comment updated by its author keeps its badges.** The platform rewrites the rendered body
  on an update, which took the badges with it and brought the structured prefix back in plain
  text. Neither of the two signatures that gate a re-render moved — the comment count was
  unchanged and review threads do not cover a top-level comment — so the comment stayed
  permanently undecorated until the page was reloaded.
- **The prefix masking is repaired when it alone is undone.** `.cct-hidden-prefix` hides its
  content through `display: none`, a rendering property: `textContent` keeps reporting the masked
  text word for word, so a rehydration that rebuilds the native text subtree while leaving the
  badges in place changed nothing either signature could see. The repair existed; nothing opened
  the door to it.
- **Leaving a pull request, or switching to `mode: off`, no longer leaves part of the comment
  invisible (§7).** The cleanup removed the badges and stopped there — the structured prefix
  stayed hidden, so an extension declaring itself inactive went on concealing text its author
  had written, until the page was reloaded. Everything the rendering puts down is now undone
  together, and the text nodes are rejoined.

### Changed

- **The composer toolbar stacks two rows — label buttons, then decoration controls — instead of
  flowing as one run (§5.1).** A single wrapping run let the available width cut wherever it
  liked, with no idea that a label button and a decoration segment are gestures of different
  natures; a narrow window, a side panel, or a repository enabling the optional labels put them
  side by side as if they were one. Overflow now moves to the next line inside its own row.
- **Label buttons no longer carry their icon; badges still do (§5.1, §5.5).** A badge stands
  alone at the head of its comment, where the icon costs nothing. The buttons are a row sharing
  one width: what one takes, it takes from every other. The ten default buttons went from 762 px
  to 579 px in total width.

## [1.0.0-beta.7] - 2026-09-03

### Added

- **The structured prefix is hidden from a published comment's display (§5.5).** `issue
  (blocking): ` disappears from the rendered body, whose information the badges already carry —
  on screen only: the node is purely client-side, the text stored server-side is never touched,
  and reopening the edit form shows the full text again.
- **Hiding is refused wherever the badges would not carry the same information, or where the
  boundary cannot be trusted.** A decoration written but rejected, decorations folded into a
  `+N` overflow badge, a case or punctuation defect the diagnostics exist to report, a syntax
  error in the parentheses — in each case the written text stays visible, because it is the only
  remaining trace. So does a prefix-looking line inside a code block, a quote, a list, a
  heading, a table, a `<details>` summary or raw HTML, where the source's own syntax has
  disappeared from the rendered text and the line was never a prefix at all.
- A leading emoji (`🔥 issue: x`) stays visible: it is tolerated on input but ignored by the
  analysis, and has no relation to the icon the badge shows.

### Changed

- **Every default label now carries an icon and a colour**, and those colours were raised to meet
  WCAG 1.4.11 border contrast.
- Label badges match the reference mockup's size — larger and semi-bold — so the label stays what
  catches the eye beside its decoration badges.

## [1.0.0-beta.6] - 2026-09-03

### Added

- **One badge per resolved decoration, beside the label badge (§3.3, §5.5).** A red outline where
  the decoration forces the blocking character, green where it forces non-blocking, and a dashed
  outline for a free decoration declared nowhere. A comment with thousands of free decorations
  renders at most twelve plus a `+N` badge, and a carrier decoration is never folded into it.

### Fixed

- **Badges follow a configuration change while the page is open (§8.1.2)** — including on an idle
  tab, where nothing else would have noticed. A label disabled mid-review loses its badge; a
  decoration that becomes a carrier gains its colour.
- **An editor already open follows that change too, submission guard included.** It kept
  validating against the effective configuration captured when it was attached, so a switch from
  `enforce` to `off` — or the reverse — never reached it until the box was closed and reopened:
  a reviewer could stay blocked by a rule the organisation had just lifted. Open editors are now
  updated in place whenever a render applies a new configuration, and reconciliation is
  serialized so two changes landing together cannot leave half the surfaces on the old one.
- A render whose pull request was navigated away from mid-flight is rejected instead of writing
  into the page that replaced it.
- A decoration rejected by the configuration is never exposed for display (§3.3, §5.5).

## [1.0.0-beta.5] - 2026-09-02

### Fixed

- **Repository and organisation configuration is read again on private repositories.** The read
  travels a redirect to `raw.githubusercontent.com`, which answers `Access-Control-Allow-Origin:
  *` — a wildcard the browser refuses as soon as the request carries cookies. Credentials are now
  dropped on that route alone: the first hop stays authenticated, the redirect is anonymous, and a
  private repository stays readable without any host permission.
- **A 404 read without a session no longer counts as proof that a file is absent**, for a
  repository or an organisation: an unauthenticated read of a private path answers 404 exactly as
  a missing file does, and treating the two alike silently applied the wrong configuration.

## [1.0.0-beta.4] - 2026-09-01

### Fixed

- **The decoration selector reflects what the comment actually carries, not what was last
  clicked.** Core is asked on every gesture, so a decoration written by hand, removed by an edit,
  or lost with a label that was disabled no longer survives in the selector as a state nothing in
  the text supports.

## [1.0.0-beta.3] - 2026-09-01

### Changed

- **`activeTab` and the static `github.com` host permission are gone from the manifest.** Hosts
  are granted optionally instead, the split is computed in the service worker — the only context
  where `chrome.permissions` exists — and published to the content script, which cannot read it
  itself.
- The pull-request banner is a summary, not a merge precondition: the verdict belongs to the
  platform's own check, already red and already blocking, and restating it here devalued both. The
  label filter moved down to the threads it controls.

### Added

- **Telemetry, off unless consented to**, bound to the endpoint it was consented for, armed per
  pull request, with the collector taken from managed policy rather than from configuration.
- Public store material: `PRIVACY.md`, the Chrome Web Store listing in both languages, and a
  written justification for every permission requested.
- The manifest carries `version_name`, so `1.0.0-beta.1` and `1.0.0-beta.2` no longer both show as
  `1.0.0` in `chrome://extensions`.

### Fixed

- **A granted GitHub Enterprise Server or self-hosted Azure DevOps Server host is actually
  usable.** Granting the permission injected the content script, but no adapter was ever
  constructed with that host — so nothing appeared on the page, despite the grant succeeding.
  The platform each host serves is now recorded alongside it: the options page takes any domain
  in one free-text field, and forwarding the same list to both adapters would have made the
  GitHub one claim every host, silently breaking Azure DevOps Server recognition.
- **An organisation `configUrl` hosted outside the displayed platform is readable again.** The
  content script issues requests on behalf of the page's own origin and stays subject to its
  CORS policy, whatever host permission was granted — so that document was never readable: the
  extension resolved two configuration levels where the server resolves three, sat permanently
  degraded, and its fingerprint could never match the server's (§8.1.3, rule 2). The read now
  goes through the service worker's relay, which already existed and had no caller.
- Every key of an enterprise floor document is vetted, not four of thirteen, and every level-2
  read is routed through the vetted floor rather than the raw one.

## [1.0.0-beta.2] - 2026-08-24

### Added

- **Tool commands are exempt from validation (CA-40).** A generic slash command and a closed list
  of bot mentions, both declared in configuration as `toolCommands`, matched case-insensitively —
  so a `/rebase` or a `@dependabot recreate` is no longer flagged as a malformed comment.

### Fixed

- The composer's inner padding matches its margin, on the modern GitHub comment box and on the
  React composer recognised by `data-testid` — the toolbar and the live feedback no longer sit
  flush against the border while the field's own text does not.
- A label's colour paints the border of the active state, never its background: the colour comes
  from configuration, so its luminance is unknown when the text colour has to be chosen, and the
  measured contrast fell as low as 1.54 against the 4.5 §10 requires.
- The `.cct-toolbar` rule was silently eaten by the CSS parser — a comment closed early by a `*/`
  sequence inside it — leaving the toolbar's buttons glued together in production while the
  stylesheet read correctly. A repository guard now checks that every written rule survives the
  parser.

## [1.0.0-beta.1] - 2026-08-24

### Added

- **First installable build.** The parser, validator, configuration and evaluation engine
  (component A's core); the browser extension for GitHub and Azure DevOps — client adapters,
  composer toolbar, quick keyboard entry, live feedback and submission guard; and the
  self-hostable server companion (component B) with its orchestrator, SQLite storage, admin
  surface and Docker image.
- Chromium and Firefox bundles, published as installable zips on every tag.
- A weekly canary over the GitHub Primer CSS variables the stylesheet depends on, which caught
  GitHub's rename of its colour tokens.

[Unreleased]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.8...HEAD
[1.0.0-beta.8]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.7...v1.0.0-beta.8
[1.0.0-beta.7]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.6...v1.0.0-beta.7
[1.0.0-beta.6]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.5...v1.0.0-beta.6
[1.0.0-beta.5]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.4...v1.0.0-beta.5
[1.0.0-beta.4]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.3...v1.0.0-beta.4
[1.0.0-beta.3]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.2...v1.0.0-beta.3
[1.0.0-beta.2]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.1...v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/Reefact/conventional-comments-toolkit/releases/tag/v1.0.0-beta.1
