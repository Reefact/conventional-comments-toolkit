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

## [1.0.0-beta.13] - 2026-09-08

### Added

- **Every line of the selector journal says which page its degradation came from** (§9.4). The journal recorded which selector chain failed and when, never where: four lines stamped within the same second gave no way to tell one page from four. Each entry now carries the page address, read at the moment of the degradation rather than at injection — GitHub navigates in place, so the URL a content script saw when it loaded is not the page the chain failed on, and a chain is re-reported when the tab changes pull request. The options page renders that address as a six-character mark computed on the normalised page — origin, path, and the query parameters that name a view — so `?diff=split` and `#discussion_r1` do not turn one page into three, while Azure DevOps's `?_a=files` and `?_a=overview` stay two: same mark, same page. The mark links to the exact address recorded, fragment included, and opens it in a new tab. That address stays on the device: telemetry still carries only the chain's name (§10). Entries written before this version have no address — an upgrade keeps the journal — and render as a neutral mark of the same width, saying so on hover, until their chain is reported again or the journal is cleared: an address cannot be invented for a degradation observed before it was recorded.

- **The journal can be emptied from the options page, and open tabs start measuring again** (§9.4). It had no way to be cleared, and its entries survived reloads and tabs. Clearing also tells the content scripts to forget which chains they have already reported: a chain is reported once per tab, so without that, reproducing a failure on the very page where it had just been seen wrote nothing. The section follows the storage now instead of reading it once at load, so what a tab records appears without reloading the screen.

- **The options page carries the extension's icon before its title**, at the height of the title and its subtitle together. The guided tour's button reads *Guided tour*, with *Replay the guided tour* as its tooltip, and sits slightly lighter than the page's other buttons — at that icon size the header would otherwise no longer fit on one line.

### Fixed

- **The privacy policy described a journal nobody keeps** (§9.4, §10). Both languages announced "the last 50 times" the extension failed to recognise an element, while the journal is deduplicated by selector chain: fifty rules at most, each holding only its most recent observation — a rule that fails a thousand times still occupies one line. `docs/store-permissions-justification-fr.md` carried the same wording, contradicted it a line later, and still claimed that nothing writes `selectorFailures`. All three now describe the data that exists, including the page address this release adds to it, and both policy headers carry the date of that revision.

## [1.0.0-beta.12] - 2026-09-08

### Added

- **The "Status" section of the options page carries a subtitle**, like every other section on that screen. It was the only heading with nothing under it saying what the section is for.

### Fixed

- **The guided tour dims the page enough to be seen doing it, and in the dark theme its card no longer wears the colour of the panels it covers** (§10). Measured rather than judged: in the dark theme, a 55 % black veil laid over a background that is already almost black removed **less than 10 %** of its luminosity, so the tour claimed to spotlight one panel while the rest of the page looked untouched; and the card took `--bg-surface`, the panels' own colour, seven points away from the page background. The veil now removes at least 60 % of the background's luminosity in both themes, and the card is a raised surface: lighter than the panels in the dark theme, and — in the light theme, where a raised surface is already white and no colour is left to gain — separated by a drop shadow strong enough to register against a properly dimmed page. `npm run check:options-tour` measures both on the pixels really painted, which is the only place they can be read: the dimming is a drop shadow, and `getComputedStyle` reports one on the element that casts it, never on the elements it covers.

- **The "Status" section says what it observed, not what it inferred** (§9.4). Its two texts — the guided tour's step and the section's own subtitle — both spoke of the pages' *structure*: first « les pages dont la structure a changé **sous elle** », which reads as if the extension had done the changing, then « changements de structure détectés », which turns a symptom into a settled cause. What `SelectorLog.degraded()` actually records is that one selector chain matched nothing, and a chain matching nothing is not proof that anything changed: `getCompletionControl()` logs whenever the merge button is missing, and on a closed pull request its absence is the norm — the reason that log is deduplicated per chain in the first place. Both texts now report the symptom the extension can see: selectors that did not find the elements they expected.

## [1.0.0-beta.11] - 2026-09-08

### Changed

- **No host is pre-declared any more, `github.com` included** (§2, §A.1, §A.4, §B.4). It was the one host injected statically by the manifest's `content_scripts`: active without any permission, and with no way for the extension itself to revoke that access. That asymmetry is measured rather than assumed — `chrome.permissions.getAll()` does report a manifest-declared permission, and `remove()` refuses it with Chrome's own message, *"You cannot remove required permissions."* — and it is the whole reason for the rule: a consent the product cannot withdraw is not a consent the product can offer. Two earlier justifications for this rule were written from memory and were wrong (a manifest host is not "revocable by nothing" — the browser keeps its own site-access controls — and it does appear in `chrome.permissions`); the comments now carry the measured one. **Consequence for an existing installation: the extension stays silent on `github.com` until one click on "Activate".** `permissions.request()` requires a human gesture that a service worker cannot produce, so no automatic migration exists; the options page opens itself instead, once, on install and on an update that left no served domain.

- **The options screen is rebuilt around the four states an access can be in.** Known domains, whose address and platform the extension already knows, so one click authorizes and classifies together; other domains, where the platform is chosen *before* the grant; configured domains, which can only be removed, never reclassified; and unconfigured domains — granted outside this screen, therefore carrying no platform — hidden entirely when empty. The first two panels were named after a way of hosting until a legacy `visualstudio.com` organisation broke the split: it is cloud and belongs to the second, while a data-residency GHE Cloud breaks it the other way. What separates them is whether the extension already knows the address.

- **`*.visualstudio.com` is no longer offered in the catalog** (§2, minimal permissions). A known suffix is not a known host: that pattern grants access to every Azure DevOps organisation on legacy URLs when a workstation uses one. Such organisations now go through the free-form field, where `inferPlatform()` already pre-fills Azure DevOps on that suffix, so the grant covers that one organisation. `dev.azure.com` stays — the organisation lives in the path, so it is a fixed host and authorizing it is the minimum possible for that domain.

- **The content script is registered once, over the hosts actually served**, rather than once per granted origin. Two granted patterns can cover the same page — a broad grant plus `github.com`, or a policy-authorized `*.corp.example` plus the `ghes.corp.example` inside it — and one registration per origin meant the script ran twice there. That also retires the per-origin identifier, whose derivation had to be injective and was not: a slug, then a slug plus a 32-bit FNV-1a, still collide.

### Added

- **A granted host can be withdrawn from the extension itself** (§A.4, §B.4). Each configured domain carries a "Withdraw" button; previously the only way to revoke an optional host permission was the browser's own extension page. Hosts classified by enterprise policy carry no such button — revoking a policy-mandated permission is not this screen's call.

- **The options page is available in French and in English** (§10, Internationalisation). It was hardcoded French while offering an "Interface language" setting that changed every other surface but its own: someone who had set the interface to English saw English on their pull requests, and still saw French on the settings page where they made that choice. The language now resolves from your preference, then from the browser's — §8.1.2's middle level, the effective configuration, has no meaning here since it resolves for a repository and this page shows none — and changing it applies immediately rather than at the next reload.

- **A guided tour, played once on the first opening of the options page**, naming each section and what it is for. It skips the "unconfigured domains" panel unless that anomaly is already present, remembers being finished *or* skipped, closes on `Escape`, keeps keyboard focus inside the tour while it is open and restores the previous focus afterwards, and announces each step through an `aria-live` region (§10, Accessibilité). A "Replay the guided tour" button in the page header replays it.

### Fixed

- **Data residency worked nowhere outside the tests** (§A.4). `hostnameOf()` trusted the URL parser to preserve a leading wildcard: Node does, Chromium percent-encodes it, so a granted `*.ghe.com` was tagged `%2A.ghe.com`, which `matchScore()` no longer reads as a wildcard. The defect predates this release and no test could see it — they ran in the only environment where the claim holds. The wildcard is now stripped before parsing and restored after, and `npm run smoke:mv3` measures the browser fact that makes the workaround necessary.

- **A broad grant injected the extension into every `https` page.** Registration followed the permission while activation follows the classification, and the widest pattern the browser can grant here designates no host at all: `content.js` and `styles.css` were injected everywhere, where they could then do nothing for want of a tag. Registration now derives from the same crossing as the published split. That same phantom host appeared in the options list as a domain to classify, where classifying it activated no adapter; `hostnameOf()` now rejects any pattern with no concrete host.

- **The tab you were looking at stayed inert until a reload.** A dynamic registration only applies to subsequent loads, which is exactly the main path: you open the options page from a platform tab, grant the host, and that tab received nothing. Measured in a real Chromium (`npm run check:open-tab-injection`), which also confirms that catching up requires no additional permission. The catch-up asks each tab whether it already has the script before injecting, so a long-lived tab no longer accumulates one copy of the stylesheet per service-worker wake — `insertCSS` is an insertion, not an "ensure", and three identical calls need three `removeCSS` to clear.

- **A refused revocation claimed to have succeeded.** `permissions.remove()` reports whether it removed anything and the callback ignored it: the platform tag was purged for a still-granted permission, leaving the access in place, the adapter off, and the host in the unconfigured panel — the screen reporting an anomaly it had just created. A refused removal now changes nothing and says so.

- **A host revoked from `chrome://extensions` kept its classification.** The purge lived only in the "Withdraw" button, so re-granting the same host outside this screen silently restored the old platform instead of surfacing the domain as unconfigured. `permissions.onRemoved` closes that cycle whatever the revocation's origin.

## [1.0.0-beta.10] - 2026-09-05

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

- **The composer is no longer squeezed against its frame on the rewritten "Files changed" view**
  (§5.1, §5.3). Two screenshots of the same composer looked nothing alike, and eight pixels
  explained the gap: the extension pads the container that frames the toolbar, the field and the
  pill, and it recognised that container on the legacy DOM only, so here the frame squeezed all
  three. Measured at real focus on both generations — `.CommentBox-container` on one, Primer's
  `MarkdownInput` wrapper on the other, each drawing a 1px border and a 2px outline — the
  container to pad is the one that *draws the frame*, whatever it is called. Asking that question
  returns the very element the legacy DOM already used, so nothing can move there. Two more
  spacings come with it, settled by eye on the rendered page and each a named variable: eight
  pixels between the field's text and the state ring, which the zeroed padding had left it flush
  against, and four between the field and the verdict pill, which read as part of the box rather
  than as a verdict about it. That margin is constant across every state, so it displaces the
  space `min-height` reserves instead of making it vary — the no-layout-shift property of §5.3 is
  untouched.

- **The compliance outline around the field is visible again on the rewritten "Files changed"
  view** (§5.3). It was drawn all along — measured green on the text area — and then clipped:
  the state ring is an `outline` so that it never pushes the page around, but an outline paints
  *outside* the element's box, and on that view the field sits in a Primer wrapper with
  `overflow: hidden` and exactly the same box. A negative `outline-offset` brings the ring inside
  the box, where nothing clips it — but only where a clipping ancestor hugs *both* horizontal
  edges of the field, one shared edge being an accident any layout produces. Insetting it
  everywhere was the first answer, and it bit the text: on the legacy DOM `cct-editor` zeroes the
  field's horizontal padding, so a ring drawn inside cut into the first letter. The ring inherits
  the sleeve's corner radius too, rather than a written value — the textarea has none, so an
  inset ring was a square rectangle in a rounded box and had its four corners cut in turn.

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
  single thread, so no thread can ever adopt its neighbour's resolved state. The identifiers the
  contract asks for — `threadId` for every reply zone and every edit, `commentId` for every edit
  (§9.2.3) — came out undefined here, since neither the comment container nor
  `[data-testid="review-thread"]` carries an `id`; they are read from the permalink the view
  already exposes (`…/pull/48/changes#r3932637709`), whose fragment is kept verbatim because it
  is an opaque identifier and not a value to interpret. As with the composer, each failure now
  leaves a journal entry (§9.4) instead of failing in silence.

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

[1.0.0-beta.13]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.12...v1.0.0-beta.13
[1.0.0-beta.12]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.11...v1.0.0-beta.12
[1.0.0-beta.11]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.10...v1.0.0-beta.11
[1.0.0-beta.10]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.9...v1.0.0-beta.10
[1.0.0-beta.9]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.8...v1.0.0-beta.9
[1.0.0-beta.8]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.7...v1.0.0-beta.8
[1.0.0-beta.7]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.6...v1.0.0-beta.7
[1.0.0-beta.6]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.5...v1.0.0-beta.6
[1.0.0-beta.5]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.4...v1.0.0-beta.5
[1.0.0-beta.4]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.3...v1.0.0-beta.4
[1.0.0-beta.3]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.2...v1.0.0-beta.3
[1.0.0-beta.2]: https://github.com/Reefact/conventional-comments-toolkit/compare/v1.0.0-beta.1...v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/Reefact/conventional-comments-toolkit/releases/tag/v1.0.0-beta.1
