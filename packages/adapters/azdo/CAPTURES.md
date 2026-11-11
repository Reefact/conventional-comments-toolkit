# Azure DevOps captures — what was measured

Notes for the Azure DevOps adapter, written while capturing dev.azure.com pages
(`test/fixtures/pages/`). Everything here was read on a capture or measured in the browser, with
its date; what was not measured says so. The selectors (`src/selectors.ts`) will cite these
captures.

The previous `index.ts` and `selectors.ts` were written from memory, without any capture, and are
being rewritten from scratch on these measurements.

## Test organization and project

2026-11-09: a personal organization, `sylva-cct-test`, created by the owner (the profile form
and Microsoft's terms are the owner's to accept), and a project `cct-test` (Git, Basic process)
holding a single repository `cct-test`.

The project is **private**, and no public project can be made. Measured on 2026-11-09:
- *Organization settings → Policies* shows no "Allow public projects" policy — only
  application connection, user and privacy policies;
- the project creation form offers a single visibility, *Private*, and links to GitHub for a
  public project;
- Microsoft's documentation, *Change project visibility to private* (learn.microsoft.com,
  updated 2026-11-03, read 2026-11-09): "You can no longer create new public projects or change
  a private project to public", and existing public projects convert to private in 2027.

Consequence for issue #50 and for the online canary: no pull request of a project we own can be
read anonymously. Whether a pull request of an EXISTING public project of another organization
is readable without a session until 2027 was not measured — and would only be a temporary
canary.

## Test pull requests

Created on 2026-11-09 from the browser tab with the signed-in session, at the owner's request,
by the REST API (`api-version=7.1`), cookie-authenticated: `credentials: 'include'` and the
header `X-TFS-FedAuthRedirect: Suppress` were enough, no token was read from the page. The
scripts returned only status codes and numbers.

- `POST …/_apis/git/repositories/cct-test/pushes` with `oldObjectId` all zeros: initial commit
  on `main` (`README.md`), then one branch per pull request, each adding one small code file —
  `test/pr-1` (`src/greet.js`), `test/pr-2` (`src/sum.js`);
- `POST …/_apis/git/repositories/cct-test/pullrequests`: PR **1** and PR **2**, both towards
  `main`, titled `[test] …`, "Do not merge".

## Capture conditions

Captured with the Conventional Comments extension disabled, the window at desktop width
(viewport 1484–1600 px wide). Azure DevOps switches to a one-column layout in a narrow window
(measured at 799 px: the right-hand column — reviewers, tags, work items — moves under the
description). Measured on 2026-11-09 in the live page, new-comment field open on PR 1, at 1279
then 806 px: the editor's ancestor chain up to `.repos-comment-card`, its 14 buttons (names, ids,
classes), the chain of a rendered body up to the timeline row, and the buttons of
`.repos-pr-header` are IDENTICAL. The only difference is one classless layout `<div>` fewer
between `table.activity-feed-list` and `.repos-pr-details-page`. No narrow capture was taken:
nothing an adapter anchors on changes. (Only class lists and counts were read, no page text.)

The reducer script was installed once per tab as `window.__cctReduce(file)` (skill `plateforme`,
second usage): `npm run build:page-reducer` refuses `--no-selectors` while `src/selectors.ts`
exists, so the comparison before/after reduction runs on the OLD candidates written from
memory — harmless (a candidate that finds nothing finds nothing on both sides), and meaningless
as a measurement of them.

## State 1 — new general comment (Overview)

`01-overview-nouveau-commentaire-replie.html` (field not yet clicked) and
`01-overview-nouveau-commentaire.html` (field open, empty), PR 1, 2026-11-09.

- **Collapsed**, the field is an `<input>` (`.bolt-textfield-input`, `aria-label` and
  `placeholder` "Add a comment..."), inside a `.repos-comment-card` of the activity feed
  (`table.activity-feed-list.can-add-comments`). It is a placeholder, not the editor: a click
  replaces it.
- **Open**, the editor is a `<textarea>` with `aria-label="Add a comment"` and the class
  `threadId--1` (a new thread has no id yet), inside `.repos-discussion-thread >
  .repos-discussion-thread-reply`. A SECOND `<textarea>` sits next to it,
  `.bolt-textfield-auto-adjust-hidden`, same `threadId--1` class, no `aria-label`: the hidden
  mirror that sizes the field. It must not be observed as an editor.
- Buttons, empty field: *Cancel* (`button.bolt-button`, enabled) and *Comment*
  (`button#__bolt-comment--2.bolt-button.primary`, class `disabled`, `aria-disabled="true"`, NO
  `disabled` attribute — `:disabled` does not see it).

### Comment editor: controls inventory

Every `button` of the editor container, on `01-overview-nouveau-commentaire.html`:

- **Text only — no capture needed:** *Mention someone*, *Mention a work item*, *Mention a pull
  request*, *Insert a file*, *Header* (menu of heading levels), *Bold*, *Italic*, *Code*,
  *Link*, *Bulleted List*, *Numbered List*, *Task List*.
- **Send path:** *Comment* (submit) and *Cancel*. No split button, no send-type menu, no
  checkbox in the editor.
- **Changes the element or its container:** none found — no rich-text toggle, no full-screen
  button, and no *Preview* tab in this editor.

Filled (`01-overview-nouveau-commentaire-rempli.html`, text typed, never sent): *Comment* keeps
its id and loses `disabled` / `aria-disabled`, class `enabled`. Enter inserts a new line, it does
not send (measured in the line editor). Whether the element is RE-CREATED when the field fills
was not measured.

The field was emptied and cancelled, then the page reloaded: the collapsed `<input>` came back,
no `<textarea>` left — no draft kept.

## State 2 — reply in a thread (Overview)

`02-overview-reponse-fil.html` (open, empty) and `…-rempli.html`, PR 1, thread of the blocking
`issue`. Every thread of the Overview ends with a collapsed `<input placeholder="Write a reply...">`
and a *Resolve* button. Open, the reply is the same `<textarea aria-label="Add a comment">` as a
new comment, with THREE buttons: *Cancel*, *Reply & resolve*, *Reply* (primary). Both *Reply*
and *Reply & resolve* send (§B.6). Filled, both lose their disabled state.

## State 3 — published comments

Published on 2026-11-09 by the REST API (`POST …/pullRequests/{id}/threads`, then
`…/threads/{id}/comments` for replies; a line thread takes `threadContext` with `filePath` and
`rightFileStart`/`rightFileEnd`, and `pullRequestThreadContext` with the file's
`changeTrackingId` from `…/iterations/1/changes`), except the suggestion comment, sent from the
line editor.

| PR | Thread | Form |
|---|---|---|
| 1 | 1 | `praise:` one line — later set `fixed` |
| 1 | 2 | `issue (blocking):` + paragraph + list; reply `done:` with a paragraph |
| 1 | 3 | fenced code BEFORE the `suggestion:` line — later set `closed` |
| 1 | 4 | no label — later set `wontFix` |
| 1 | 5 | line thread (`src/greet.js` l. 9), `nitpick:`; reply `ack:` |
| 1 | 8 | line thread (l. 2), a sentence + native suggestion block |
| 2 | 6 | `question (non-blocking):`; reply `disagree:` — later set `byDesign` |
| 2 | 7 | line thread (`src/sum.js` l. 3), `todo:` + paragraph — later set `pending` |
| 3 | 9 | line thread on a MODIFIED file (`README.md` l. 4), `chore:` |

Captures: `03-overview-commentaires-prefixes.html` (PR 1, all active), `03-overview-fils-resolus.html`
(PR 1 after the statuses), `03-overview-commentaires-prefixes-pr2.html`,
`03-files-commentaires-prefixes.html`, `03-files-suggestion-native.html`, and the side-by-side
and full-screen variants below.

- **The Overview activity feed is virtualized.** On load, only the rows near the viewport get
  their comment bodies; the others are `tr.bolt-timeline-row` with no `.markdown-content`.
  Scrolling mounts them, and they stay mounted after scrolling back (measured on PR 1). The
  first capture 03 missed two threads this way and was retaken after scrolling to the bottom.
  The adapter must therefore treat bodies as appearing LATE.
- A rendered body is `.markdown-content` inside `.repos-discussion-comment` inside
  `.repos-comment-viewer` inside `.repos-discussion-thread`. The `id` of `.repos-comment-viewer`
  is NOT a comment id: several comments share it.
- A fenced code block renders a *Copy to clipboard* button INSIDE `.markdown-content`, before the
  code: its text is the first text of the body.
- **Native suggestion**: the *Insert a suggestion* button (`#__bolt-pr-suggestion`, line editor
  only) inserts `` ```suggestion `` + the current line + `` ``` `` — the info string is
  `suggestion`, as on GitHub (§B.6 left it to establish). Rendered as a "Suggested change" box
  with an *Apply change* button.

## States 4, 5 — line comment and reply in the code view (Files)

`04-files-commentaire-ligne.html` / `-rempli`, `05-files-reponse-fil-ligne.html` / `-rempli`.
The gutter shows a comment icon on hover; the new-thread editor is the same `<textarea
aria-label="Add a comment">`, class `threadId--1`, buttons *Cancel* / *Comment*
(`#__bolt-comment--N`). Its toolbar has one more button than the Overview's: *Insert a
suggestion*. A reply in a line thread has *Cancel* / *Reply & resolve* / *Reply*, as on the
Overview.

## State 6 — editing

`06-files-modification-commentaire.html` (root comment, Files), `06-overview-modification-commentaire.html`
(root, Overview), `06-overview-modification-reponse.html` (a reply, Overview). The hover toolbar
of one's own comment has *Edit*, *Delete*, *Like this comment*, *Copy link* — *Delete* sits
right next to *Edit* and opens an in-page confirmation (not a native dialog). In edit mode the
`<textarea>` sits INSIDE the `.repos-discussion-comment` being edited, the body displayed below
it is the LIVE PREVIEW of the edit (see state 9), and the buttons are *Cancel* / *Update & resolve* / *Update* — both send.

**The pull request description, being edited** (#50): `06-overview-modification-description.html`,
PR 1, 2026-11-10 — *Edit description* clicked, nothing typed, then *Cancel* (nothing saved). The
editor opens INSIDE its own card, `.repos-pr-description-card`, under `.repos-pr-details-page`,
outside any `.repos-discussion-thread`: one `<textarea class="bolt-textfield-input">` and its
hidden twin, with a formatting toolbar and *Cancel* / *Save*. Measured in the live page too: the
`editors` chain matches neither textarea. The description is therefore not a zone (§4.1), and the
adapter's fallback to `conversation` (which carries a blocking state) is never reached for it.

## Diff modes (Files) — memorized for the account

- **Inline / Side-by-side** (a toggle button next to the file count): side-by-side puts the
  thread in the right-hand column. It survives a reload: memorized. Captured on PR 3 (a modified
  file; a fully added file shows only one side): `03-…-cote-a-cote`, `04-…`, `05-…`, `06-…`.
  The owner's mode was *Inline*; it was restored and checked after a reload.
- **Full screen** (*Enter/exit full-screen mode*): the PR header, with *Complete*, collapses to a
  one-line bar. `03-files-commentaires-prefixes-plein-ecran.html`,
  `05-files-reponse-fil-ligne-plein-ecran.html`. Whether it is memorized was not measured (exited
  before reloading).

## State 7 — review body: not applicable

Azure DevOps has no batch review with a body (§B.6): a vote (*Approve* split button) carries no
text.

## State 8 — closed pull request

PR 2 abandoned by the API (`PATCH …/pullrequests/2`, `status: abandoned`):
`08-overview-pr-abandonnee.html`. *Complete* is replaced by *Reactivate*; the *Add a comment...*
field is still there. A COMPLETED (merged) pull request was not captured.

## State 9 — preview: a LIVE preview, no tab

No editor has a *Preview* tab or button — but Azure DevOps renders a live preview UNDER the
editor as soon as the field has text: a `.markdown-content` in `.repos-discussion-thread-reply`
(in the `-rempli` captures 01, 02, 04, 05; absent when the field is empty). In edit mode, the body
shown in the edited comment is that preview. This state was first declared "not applicable"
for want of a tab; the owner saw the preview at validation (2026-11-09). The captures already held
it: one more `.markdown-content` in every `-rempli` page.

## What the adapter reads, and where (measured while writing `src/selectors.ts`)

- **Thread id.** No attribute of a thread carries it, except the class `threadId-<n>` of its
  COLLAPSED reply `<input>` — `n` is the API thread id (1 to 9 on the captures, each in the thread
  the API names so). A new-thread editor carries `threadId--1`. When the reply is OPEN, the
  collapsed input is replaced and the id is gone from the page (02). The adapter remembers it per
  thread element, and falls back on the root comment's `time[datetime]` (to the millisecond).
- **Comment number in its thread**: `button#__bolt-delete-comment-<n>` (1 = root). Rendered on
  one's OWN comments only, and removed from a comment being edited (06).
- **Author**: display name in `aria-label` of `.repos-comment-header-persona`; no account id in the
  page. The current user's display name is on the persona next to each collapsed reply field.
- **Thread state**: no structural mark. Classes, attributes and markup of active and resolved
  threads are identical (compared on 03-overview-fils-resolus); only localized TEXT differs — the
  state label (`Active`, `Pending`, `Resolved` for `fixed`, `Won't fix`, `Closed`, and `Unknown` for
  `byDesign`) and the footer button (`Resolve` on active/pending, `Reactivate` on every resolved
  status, `byDesign` included). Read in English; any other UI language gives `unknown`.
- **Rendered body shape** (§5.5), measured in the live page on a test comment (PR 1, thread 11):
  every line end of a paragraph is a `<br>`, simple or forced; paragraphs are `<p>`.
- **Editor footer**: *Cancel* is ALWAYS the first button of the row, on the four kinds of editor;
  the send buttons follow (primary = plain send, the other = send and resolve).
- **PR creation date**: the LAST row of the activity feed (`tr.bolt-timeline-last-row
  time.activity-card-time`), equal to the API creation date to the millisecond. The only date in
  the header is that of the last state change (21:13 on the abandoned PR). No creation date in the
  Files view.
- **PR state**: the header pill has `pr-status-active` / `pr-status-abandoned`. On the abandoned PR
  the *Complete* slot holds *Reactivate*. Full screen is marked by `.full-screen`, and has no
  *Complete* button.
- **Code blocks** render a *Copy to clipboard* button INSIDE the body
  (`.copy-btn-container > button.copy-btn`, then `pre.hljs`); the native suggestion renders as a
  diff table in `div[id^="md-transform-replacement-"]`, not as a `<pre>`.

## Not measured

- Hosts `{org}.visualstudio.com` and Azure DevOps Server: not captured, NOT recognized by the
  adapter (DEC0008).
- A COMPLETED (merged) pull request; a comment by another user (the *Delete* button, the persona);
  an interface in another language than English.
- Note for §10: the REST API accepts the browser's session cookies, from the page and from a
  content script (see "Repository config read") — the premise "les API publiques n'acceptent pas
  l'authentification par cookie de session" does not hold for Azure DevOps. Not acted on.
- The creation date of a LONG pull request: it is read in the last activity row, which a long,
  virtualized feed may not have rendered at load; the extension then never blocks (unknown date).
- The editor chrome (styles, geometry): neutral answer. Theme TOKENS were measured on 2026-11-09
  in dark theme (`src/platform.css`); the light theme is not measured.

## Personal data in the captures

The Microsoft account menu (`.mectrl_root`, `#mectrl_currentAccount_secondary`) is in the DOM of
every page, closed, and carries the signed-in account's EMAIL ADDRESS. The reducer now drops that
region for Azure DevOps (`PLATFORM_RULES.azdo.dropSelectors`), and `check:captured-pages` refuses
any clear email address; the 25 captures were reduced again, none keeps it. The display name of
the account stays, as comment author and in `aria-label`s (DEC0009).

## Live validation (2026-11-09, extension built from this branch)

Checked in the browser, on the test pull requests, without sending anything (the API showed the
same comment count per thread afterwards):
- Overview: toolbar and degraded-state notice on the new comment, the reply and the edit of a
  root; `E-NO-LABEL` and `W-MISSING-DECORATION` under the field; a label button writes into the
  field and Azure DevOps sees it (its *Comment* button turns enabled, its hidden auto-size twin
  copies the value — the §B.2 desynchronisation risk does not show on this field).
- Badges and subject on published comments and on the live preview; thread filter above the
  activity feed, hiding whole rows; banner counting the blocking threads of the page.
- Files, Inline and Side-by-side: toolbar on the line comment and on a reply, no filter.
- NOT validated on that day: blocking a send (the extension was degraded, §B.4 not measured —
  done on 2026-11-10, see "Repository config read"); the light theme; a cross audit over real,
  varied pull requests (no such organisation available).

## Repository config read (§B.4, 2026-11-10)

A test file `{"version": 1, "mode": "enforce"}` was pushed to `main` of `cct-test`, then an
`activation.activatedAt` before the test pull requests was added (without it, §6.2.3 keeps every
pull request out of scope, and nothing blocks — by design). That was the rule on the day of the
measurement; the activation scope and its key are retired since, with the verifier (§2, §8.2):
`enforce` now blocks without any date, and an `activation` key is ignored and reported.

Measured from a signed-in pull request page, on
`/{org}/{project}/_apis/git/repositories/{repo}/items?path=/.conventional-comments.json&api-version=7.1`:

| Case | Answer |
|---|---|
| file present, `credentials: 'same-origin'` or `'include'` | 200, no redirect, the file's RAW content |
| file present, `Accept: application/json` | 200, but item METADATA instead of the content |
| file absent | 404 (`TF401174`), no redirect |
| `credentials: 'omit'` (no session) | redirected to `*.vssps.visualstudio.com/_signin`, 203, HTML |

The request stays same-origin for an open session: the case `check:content-script-cors` measures
for a content script without host permission. A 404 is reliable: a signed-out visitor is
redirected, not served a masking 404 (unlike GitHub).

Then live, with the extension built from the branch: the degraded notice is gone, the diagnostic
turns from warning to error (`enforce` applies), *Comment* gets `aria-disabled="true"` (Azure
DevOps styles a disabled button by its `disabled` CLASS, so it still LOOKS enabled), and a click
on it with a non-compliant comment is stopped — the API showed no new comment. Ctrl+Enter on the
FOCUSED BUTTON, however, published one: Azure DevOps' buttons act on the key, without a click.
Fixed by the `submitKeystrokes()` contract (PR #147), validated live afterwards with a probe
that blocked every publish request; the published test comment was deleted (owner's consent).

## Changelog watch (skill `plateforme`, §6)

Sources checked on 2026-11-09:
- sprint release notes on Microsoft Learn, `https://learn.microsoft.com/en-us/azure/devops/release-notes/<year>/sprint-<n>-update`
  — the latest, sprint 281, is dated 2026-10-27; its **Azure Repos** section is the one to read;
- the Azure DevOps blog RSS feed, `https://devblogs.microsoft.com/devops/feed/` — answers, six
  posts between 2026-10-13 and 2026-11-05;
- the roadmap, `https://learn.microsoft.com/en-us/azure/devops/release-notes/features-timeline`
  (updated 2026-11-06), Repos rows.

Already worth watching for this adapter: the new Monaco-based Wiki editor (public preview, sprint
281) — if the pull request comment editor ever moves to it, the field is no longer a `<textarea>`;
Copilot code reviews in Azure Repos, which post comments into threads; "Pull request commenter
filtering" (roadmap, 2026 Q4).
