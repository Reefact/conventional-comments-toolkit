# GitHub captures — what was measured

Notes for the GitHub adapter, written while capturing github.com pages (`test/fixtures/pages/`).
Everything here was read on a capture or measured in the browser, with its date; what was not
measured says so. The selectors (`src/selectors.ts`) cite these captures.

Two capture sessions:

- **2026-10-28** — the classic Conversation and Files changed pages (`01-conversation-…` to
  `07-review-changes.html`, PRs 292, 294 and 331 of `Reefact/just-dummies`), copied by hand from
  DevTools, later reduced (2026-11-08).
- **2026-11-09** — the new **Overview** page (GitHub public preview of 2026-11-05, #131), plus an
  open PR in the classic view and in Files changed. Taken by a local Claude Code session driving
  Claude in Chrome, Conventional Comments extension disabled, reduced in the browser (skill
  `plateforme`, path A).

## Views

On an account enrolled in the preview, the same URL `/pull/N` serves either view; `?overview=true`
and `?overview=false` pick one. The view is read **in the page**, never in the URL
(`src/view.ts`):

| Marker (2026-11-09) | Overview | Classic |
|---|---|---|
| `#overview-comments` (heading of the comments section) | all 13 captures | none |
| header button `aria-label="Try the Overview page"` | none | present on an enrolled account |

Files changed (`/pull/N/changes`) is the same page in both views: same editor component, same
review threads (`[data-testid="review-thread"]`).

## Test pull requests (2026-11-09)

At the owner's request: two branches pushed with the owner's own Git credentials
(`cct-capture/a`, `cct-capture/b`, one small JavaScript file each), and two PRs opened from the
`compare` page — **#548** and **#549**, titled `[cct test] … — do not merge`. Comments posted on
#548 from the Overview page (field value set through the native setter plus an `input` event, so
that the editor's list auto-continuation could not alter the text):

| | Where | Form covered (state 3) |
|---|---|---|
| C1 | general comment | prefixed, no discussion |
| C2 | general comment | blocking, discussion of a paragraph and a list |
| C3 | general comment | a code block **before** the prefix line |
| L1 | line 7 of `sample-a.js` | thread root |
| R1 | reply in L1's thread | published reply with a response label (`done:`) |
| L2 | line 13 of `sample-a.js` | native ` ```suggestion ` block with a sentence |

A third-party bot (`chatgpt-codex-connector`) posts a review summary on every PR of this
repository; its comment is on the captures, as on the 2026-10-28 ones.

## Secrets audit

2026-11-09, on the 21 reduced GitHub pages (PRs 292, 294, 331, 547, 548):
`node scripts/check-captured-pages.mjs --audit` reports one field shared by different PRs,
`meta[name=release] @content` — a site version fingerprint, already sorted as a constant.
`node scripts/check-captured-pages.mjs`: no known session secret in clear. No reducer rule was
added. One reduction was refused, rightly: see `threadAnchor` below.

## Overview: editor controls inventory

Read on `01-overview-nouveau-commentaire.html`, every button of `form[aria-label="Add comment form"]`.

**Text only — no capture needed:** Heading, Bold, Italic, Quote, Code, Link, Unordered list,
Numbered list, Task list, Mention, Reference, Slash commands, More items, Saved replies, "Paste,
drop, or click to add files".

**Changes something:** the Write / Preview tabs (state 9), and the two buttons of the footer. No
rich text toggle, no full screen mode.

### Footers, empty vs. filled

Every editor footer is `[data-testid="markdown-editor-footer"]`, its buttons under
`[class*="childrenStyling__"]`. All buttons are `type="button"` — none is `type="submit"`.

| Editor | Empty | Filled | Structure |
|---|---|---|---|
| New general comment (01) | *Close pull request*, *Comment* (`aria-disabled="true"`) | *Close with comment*, *Comment* | *Close…* wrapped in a `div`, FIRST, `#pull-request-state-button`; *Comment* bare, second, `primary` |
| Same, merged PR (08) | *Comment* | not captured | *Comment* bare, FIRST, `primary` |
| Reply in a thread (02) | *Cancel*, *Resolve*, *Start a review*, *Reply* | *Cancel*, *Reply and resolve*, *Start a review*, *Reply* | *Cancel* bare, first, `default`; the others wrapped |
| Edit of a general comment (06) | *Cancel*, *Update comment* (`aria-disabled="true"` while unchanged) | not captured | both bare; *Cancel* first, `default` |
| Edit of a thread comment (06 `-fil-*`) | *Cancel*, *Update* | not captured | same shape |
| Review panel (07) | *Cancel*, *Submit review* | — | outside any `markdown-editor-footer`; `SubmitReviewButton__` |

What separates *Cancel* from every publishing button, on every capture: it is the only bare,
first, `data-variant="default"` button. `selectors.overviewSubmitButtons` takes everything else.
*Close with comment* and *Reply and resolve* post the comment: they are intercepted. Empty, they
close the PR or resolve the thread without a comment, and the guard never blocks an empty body
(`isExempt`, CA-19).

## Overview: where each field lives

| Field | Ancestor that classifies it | Zone, action |
|---|---|---|
| New general comment | `form[aria-label="Add comment form"]` | `conversation`, `compose` |
| Reply in a thread | `div[id^="pullrequestreview-"][data-testid="review-thread-focus-target"]`, **outside** `[data-testid="review-thread"]` | `reply`, `compose`; `threadId` = `id` of the group's first `div[id^="discussion_r"]` |
| Edit of a general comment | `article[id^="issuecomment-"]` | `conversation`, `edit`; `commentId` = the article's `id` |
| Edit of a thread root / reply | inside `[data-testid="review-thread"]`, in the comment's `div[id^="discussion_r"]` | `thread-root` / `reply`, `edit` — the shared code path, as on Files changed |
| Review body | the panel overlay | `review-body`, `compose` |
| Edit of a published review body | `article[id^="pullrequestreview-"]` (capture `06-…-corps-de-revue`, PR 530; *Cancel*, *Update review*) | `review-body`, `edit`; `commentId` = the article's `id` |

The group carries the REVIEW id (`pullrequestreview-…`), not the thread id. Permalinks on the
Overview read `#discussion_r…`, like the classic view (Files changed writes `#r…`).

## Overview: published comments (state 3)

- General comment body: `article[id^="issuecomment-"] .markdown-body.safe-html-box__…`.
- Thread comment body: `[data-testid="review-thread"] .SafeHTMLBox__…`.
- Published review body (a review submitted with a text, e.g. `reviewed:`):
  `article[id^="pullrequestreview-"] .markdown-body.safe-html-box__…` (PR 530). The group around a
  line thread also carries `pullrequestreview-…`, but it is a `div`, and its `article` has no `id`.
- PR description: `section[aria-label="Description"] .markdown-body.safe-html-box__…` — in no
  `article`, hence excluded by construction.

The shared `commentBody` chain finds the thread bodies first and stops there; on the Overview the
general comments had no badge. `selectors.overviewCommentBody` reads both families in one
candidate.

`threadAnchor`: the Overview status card carries links `…/pull/N?comments:mode=…#overview-comments`
outside any thread. The reducer strips their query, and the catch-all candidate `a[href*="#"]`,
compared over the whole page, read a changed `href`: the capture was refused. The candidate now
excludes `[href$="#overview-comments"]`; the winning candidate, thread by thread, is unchanged on
every earlier capture.

## Merge button (§6.5)

| Page | Where | When it is absent |
|---|---|---|
| Classic (03 `-pr-ouverte`) | `[data-testid="mergebox-partial"] [data-component="ButtonGroup"] button[data-variant="primary"]`, *Rebase and merge* | merged/closed/draft (`prSettledState`); a failing required check: mergeability icon `aria-label="Checks failing"` (diagnostic skeleton of #113) — nominal |
| Overview (03) | `[data-testid="for-you-item-row"][data-item-id="ready-to-merge"] button[data-variant="primary"]`, *Rebase and merge* | checks running: row `data-item-id="pending-checks"`, only *Enable auto-merge (rebase)*, `default` (01) — nominal; merged (08) |
| Files changed (04 `-pr-ouverte`) | none, on an open PR | always — the tab is not probed (#103) |

## Cross-view audit on real pull requests (2026-11-09)

The first capture series had no published review body, and every test passed. The owner found
the gap at validation. A scripted, read-only audit then ran with the extension enabled on 11
closed or open PRs of `just-dummies` (#132, #173, #198, #331, #342, #424, #508, #530, #537, #548),
in both views: for every rendered Markdown body, its kind, whether its prefix line (§3.4.1) holds a
label, and whether a badge was set — reading the page, not the adapter's selectors.

| Kind | Overview | Classic |
|---|---|---|
| general comment | 20/20 | 20/20 |
| thread comment | 6/6 | 6/6 |
| **review body** | **0/18** before the fix | 18/18 |

No badge on an unprefixed body. Collapsed (resolved or outdated) threads render no body until
expanded, in either view, and are not counted.

## Submit interception, validated in Chromium (2026-11-09)

Under `enforce` (temporary configuration on `just-dummies`), extension loaded, NON-compliant text
only — a compliant `Ctrl+Enter` test posted a comment on the classic view once, deleted since:

| View | Field | Blocked |
|---|---|---|
| Overview | new comment | *Comment*, *Close with comment*, `Ctrl+Enter` |
| Overview | edit of a general comment | *Update comment*, `Ctrl+Enter`; *Cancel* stays free |
| Overview | reply | not validated by default (`scope.validateReplies: false`) |
| Classic | new comment | *Comment*, *Close with comment*, `Ctrl+Enter` |

Two defects found that way and fixed: React RECREATES the Overview *Comment* button once the field
is filled, so a guard bound at attach time stayed on the old element (shared editor controller);
and the classic *Close with comment* (`button[name="comment_and_close"]`) was never in the
submit chain.

## Thread filter placement

The filter used to sit before the first rendered thread: inside that review's block (classic),
inside the first thread's box (Overview). It now goes before the timeline item holding the first
thread — `[data-testid="timeline-item"]` (Overview), `.js-timeline-item` (classic) — checked in
Chromium in both views.

## Not measured

- **Resolution state of an Overview thread.** No capture shows a resolved thread on the Overview;
  `getThreads()` reads `resolution: 'unknown'` there, which the banner counts as unresolved.
- **Editing the PR description on the Overview.** The exclusion rests on the ancestor
  `section[aria-label="Description"]`, not on the field.
- **Merge states other than ready / checks running / checks failing:** conflicts, review
  required, merge queue (`pullQueued`), several merge methods, a viewer without write access,
  the confirmation step after the click (#103).
- *Enable auto-merge* is not treated as a completion control: §6.5 names the merge button only.
- Keyboard submission (`Ctrl+Enter`) has no element; it is checked at the final validation.
- Filled footers of the edit forms and of the merged PR's comment field.

## Found while measuring, not fixed here

On all 21 captures, two chains find nothing: `checkRunTitles` (so the published `cc/1` line is
never read from the page) and `draftBadge`.

Fixed in the same pull request, because the final validation showed them in both views:

- `previewBody` found nothing (`previewViewerWrapper__`, capture 09): previews had no badges.
- `bannerMount` found nothing, and the banner fell back to the very top of the document, above
  GitHub's header. The PR page header is `header[data-component="SplitPageLayout.Header"]`, one
  per capture, holding the title, the state and the tabs; the banner goes right after it. On the
  Overview that header spans the whole window and centres its content inside itself (x = 32
  against a content column at x = 275, measured in Chromium with the extension loaded): the banner
  goes there after the PR status card, `[class*="CondensedForYouContainer__"]`, instead.
- A comment that quotes code BEFORE its prefix line (C3) got no badge: the rendered body was read
  as plain text, the code block lost its fences, and its first line became the prefix line
  (§3.4.1). `commentBodyText` (shared) now restores fences around `<pre>` and `> ` before quoted
  lines.
