# GitLab captures — what was measured

Notes for the GitLab adapter, written while capturing gitlab.com pages (`test/fixtures/pages/`).
Everything here was read on a capture or measured in the browser, with its date; what was not
measured says so. The selectors (`src/selectors.ts`) will cite these captures.

Captured on 2026-11-08, on a personal test project (two merge requests, !1 and !2), with the
Conventional Comments extension disabled.

## Test merge requests

Created from the browser tab with the signed-in session, at the owner's request:
`POST /api/v4/projects/:id/repository/commits` (one file per branch), then
`POST /api/v4/projects/:id/merge_requests`. Comments were posted with
`POST /api/v4/projects/:id/merge_requests/:iid/discussions` — a `position` (diff refs, `new_path`,
`new_line`) makes a diff-line thread. The `X-CSRF-Token` header was read from the page and never
returned; the scripts returned only status codes and numbers.

## Secrets audit

2026-11-08, on the reduced pages of two merge requests (!1: 15 pages, !2:
`01-overview-nouveau-commentaire-mr2.html` and `04-changes-commentaire-ligne-mr2.html`),
`node scripts/check-captured-pages.mjs --audit` reports **no opaque value shared by the two
GitLab merge requests**. Its only finding, `meta[name=release] @content`, comes from the GitHub
captures (a site version fingerprint, already sorted as a constant). The GitLab captures keep no
`<meta>` at all after reduction. `node scripts/check-captured-pages.mjs`: no known session secret
in clear. No reducer rule had to be added for GitLab.

What the audit cannot see, as for any platform: a secret inside text or inside an attribute the
reducer keeps (`id`, `class`, `aria-*`, short `data-*`, URL paths) that is not opaque-looking.

## Comment editor: controls inventory

Every `button` / `input` of the form holding the field, in both editing modes (captures `01-…`
and `01-…-texte-riche`), sorted by what they change.

**Text only — no capture needed:** bold, italic, strikethrough, quote, "Insert code" (the `<>`
icon: inline code formatting, not a resize), link, lists, indent/outdent, the table-size grid,
"More options" (alert, code block, collapsible section, diagrams, table of contents…), "Insert
comment template", "Attach a file or image", "Add a quick action".

**Changes the element, its container or the submit path — one capture each:**

| Control | Status |
|---|---|
| "Switch to rich text editing" / "Switch to plain text editing" | captured: `01-overview-nouveau-commentaire-texte-riche.html` |
| "Go full screen" | captured: `01-overview-nouveau-commentaire-plein-ecran.html` |
| "Preview (Shift+Ctrl+P)" | to capture — state 9 |
| "Start review" | to capture — state 7 |
| "Comment type" (split button next to "Comment") | captured open: `01-overview-nouveau-commentaire-menu-type.html` |
| "internal note" checkbox (`data-testid="internal-note-checkbox"`) | to capture |
| "Close merge request" (same form) | captured with text typed: becomes "Comment and close merge request" |
| "Comment" submit button | captured empty (`01-…`) and with text typed (`01-…-rempli`) |

Keyboard submission (Ctrl+Enter) has no element: to test during final validation.

### Submit area, empty vs. filled

Measured on `01-overview-nouveau-commentaire.html` (empty) and `01-…-rempli.html` (text typed,
never sent):

- With an empty field, `button[type=submit]` ("Comment") and
  `button[data-testid="start-review-button"]` carry `aria-disabled="true"` and the class
  `disabled` — but NOT the `disabled` attribute (`button.disabled === false` in the live page).
  `:disabled` / `:enabled` cannot tell the two states apart. The "Comment type" toggle behaves the
  same way: it does not open while the field is empty.
- With text typed, `aria-disabled` is gone, and `button[data-testid="close-reopen-button"]` reads
  "Comment and close merge request": a second submit path in the same form.
- The typed text is not in the capture — a `<textarea>` value is not serialized into HTML.
- "Comment type" menu options: **Comment** ("Add a general comment to this merge request.",
  checked by default) and **Start thread** ("Discuss a specific suggestion or question that needs
  to be resolved."). Both are in the DOM even while the menu is closed.
- No draft survived: after clearing the field and reloading, it was empty, and no localStorage
  key matched `autosave|draft|note`.
- With **Start thread** selected (`01-…-type-fil.html`, text typed, never sent): the submit
  button reads "Start thread", and the close button "Start thread and close merge request". Same
  elements as with "Comment" — only their labels change. Switched back to "Comment" afterwards;
  after a reload the submit button read "Comment" again.
- With **internal note** checked (`01-…-note-interne.html`, text typed, never sent): the submit
  button reads "Add internal note", the close button "Add internal note and close merge request",
  and the field's placeholder becomes "Write an internal note…". Same elements, same classes.
  The checkbox's checked state is NOT in the capture (a property, not an attribute): only the
  labels and the placeholder tell this capture apart. Unchecked and cleared afterwards; after a
  reload: unchecked, empty, submit "Comment", 6 notes.

## Rich text mode

Measured on `01-overview-nouveau-commentaire-texte-riche.html`:

- the `<textarea>` is gone; the field is a `div[contenteditable="true"]`, classes
  `tiptap ProseMirror`, `aria-label="Comment"`;
- `data-testid="comment-field"` moves to a wrapping `div` and to an
  `input[type=hidden][name="note[note]"]` (presumably the value sent — not verified).

The mode is **remembered for the account**: after switching once, a reload, the Changes tab and
a thread reply all opened in rich text. The owner's account was switched back to Markdown and
checked after a reload.

Also captured in rich text: `04-…-texte-riche` (new diff-line comment), `05-…-texte-riche`
(reply in a diff-line thread), `06-overview-…-texte-riche` (editing a comment). In all three the
`<textarea>` is gone; the field is a `div[contenteditable].tiptap.ProseMirror` with
`aria-label="Reply to comment"`, and `data-testid="reply-field"` moves to an ancestor and to an
`input[type=hidden][name="note[note]"]` — the same shift as `comment-field` in `01-…-texte-riche`.
Ancestor test ids in that mode: `content_editor_editablebox`, `content-editor`, then the field's
own (`reply-field` / `comment-field`). Not captured in rich text: the review body.

## Full screen mode

Measured on `01-overview-nouveau-commentaire-plein-ecran.html`: same `<textarea>`, same classes
as in normal mode. Only the container (`zen-backdrop … fullscreen`) and `<html>`
(`zen-mode-fullscreen`) change. The submit buttons are hidden on screen but stay in the DOM.

Not measured: whether full screen is remembered — the state could not be read reliably right
after the click (two attempts).

## Thread fields

- A new diff-line comment (`04-…`), a reply (`02-…`, `05-…`) and an edit (`06-…`) use the same
  field: `data-testid="reply-field"`, `aria-label="Reply to comment"`, in the same
  `form.edit-note`. Only `04` contains the "Comment on line" label. Telling `thread-root`,
  `reply` and `edit` apart must rely on the surrounding structure — see "Editing a published
  comment" below.
- Each published comment also has a hidden `<textarea data-update-url="…/notes/<id>">` holding
  its Markdown source (for editing) — which is why a comment's text appears twice in `03-…`.

## Editing a published comment (state 06)

Measured on `06-overview-modification-commentaire.html` (pencil on the `issue:` comment, never
saved, then cancelled — the comment shows no "edited" mark):

- The edit field is again `textarea[data-testid="reply-field"][aria-label="Reply to comment"]`
  — the same attributes as a reply and a new diff-line comment. Its `id` is `note_note`.
  Buttons: "Save comment" and "Cancel".
- **Corrected** — a first version of this file said `form.edit-note` tells an edit apart. It
  does not: checked on every capture holding a `reply-field`, the field sits in
  `form.edit-note.common-note-form` in ALL of them — reply (`02`, `05`), new diff-line comment
  (`04`) and edit (`06`). Only the new general comment uses `form.new-note … js-main-target-form`.
- **Corrected** — the ancestor `li#note_<id>` does not reliably name the edited comment: a reply
  in a diff-line thread (`05`, both modes) also has `li#note_<id>` of the comment it answers as an
  ancestor. Taken alone, it would read a reply as an edit of that comment.
- What the captures do show around the form (to confirm when writing selectors):
  - reply: the form's ancestors include `[data-testid="reply-wrapper"]` (`02`: inside
    `li.discussion-reply-holder`; `05`: a `div`), which an edit does not have;
  - edit, Overview: the form sits in `div.note-body` of the edited `li#note_<id>[data-note-id]`;
  - edit, Changes: the form sits directly in `li[data-testid="noteable-note-container"]#note_<id>`
    (no `data-note-id` there), with no `reply-wrapper`;
  - new diff-line comment: no `li#note_…` ancestor at all; the form sits in
    `.rd-diff-line-discussions-list`.

The edit form holds **two** "Cancel" buttons. The first one in document order is not the
visible one (it sits with the upload controls, as in the new-comment form inventory): clicking
it left the form open. The visible "Cancel" is the one next to "Save comment". When proving that
Cancel is not intercepted, test the visible one — and do not take "the first Cancel" as a
selector.

## Published comment forms (state 03, continued)

Four more comments published on !1 (API, owner's agreement): a blocking comment with a
discussion, a comment with quoted code BEFORE its prefix line, a reply (`ack:`) in the
`issue: total()…` thread, and a diff-line comment on line 21 holding a native suggestion block.
Captured in `03-overview-commentaires-discussion.html` and `03-changes-commentaires-discussion.html`
(Rapid Diffs; only the two diff-line notes appear there).

- **Body container**: Overview `div.note-text.md`; Changes (Rapid Diffs) `div.md` without
  `note-text`. Inside, each Markdown block is a child: `p`, `ul`, `div.markdown-code-block`.
- **Prefix line**: its own `p`. With a discussion, it is the first `p`, followed by more `p` and
  `ul` siblings. With quoted code first, it is the `p` AFTER a `div.markdown-code-block` — not
  the first child.
- **Source positions**: rendered blocks keep `data-sourcepos` (`1:1-1:42` = line 1, columns
  1–42 of the raw Markdown) — the attribute survives the reduction. A candidate for mapping the
  prefix line of §3.4.1 to its rendered paragraph; to confirm when writing selectors.
- **Reply**: a separate `li#note_<id>` in the same discussion, after the thread's first note;
  its body is rendered the same way.
- **Native suggestion block**: the body container gets the class `suggestions` and
  `data-testid="suggestions-container"`; the block is
  `div.markdown-code-block > div.md-suggestion` (header with "Suggested change" and
  `[data-testid="apply-suggestion-dropdown"]`, then `table.md-suggestion-diff`) — while an
  ordinary code block is `div.markdown-code-block > pre.code`. Source syntax used:
  ```` ```suggestion:-0+0 ````. The spec gives no GitLab marker (§A.7, §B.6 cover GitHub and
  Azure DevOps only), so GitLab has no stage 0 until the owner amends it; this is the
  measurement such an amendment would need. "Apply suggestion" was not clicked.

## Review (state 07)

A draft review was started from the main form ("Start review" with a test text), its panel
opened, captured, then **discarded** ("Discard review", confirmed in an in-page modal). After a
reload: `GET …/merge_requests/1/draft_notes` returned 0 drafts, no "Pending" badge, no "Your
review" button, 6 notes as before.

- `07-overview-panneau-revue.html` — the "Submit your review" drawer (`.gl-drawer-body`), as it
  opens: approval radios (`value` = `reviewed` / `approved` / `requested_changes`; their `id`
  and `name` are generated — `gitlab_ui_radio_179` — not a hold), and the summary as a plain
  `input[data-testid="placeholder-input-field"]` ("Add optional summary content…").
- `07-overview-corps-revue.html` — after clicking the summary: it becomes a full Markdown editor,
  **`textarea[data-testid="comment-textarea"][name="review[note]"]`**, `aria-label="Comment"`, in
  the same drawer. This is the `review-body` zone. Its submit button:
  `button[data-testid="submit-review-button"][type=submit]` ("Submit review"); also "Continue
  review" (closes the drawer) and `button[data-testid="discard-review-btn"]`.
- **While a review is in progress, the main form's buttons change**: "Start review" is gone,
  replaced by "Add to review" and "Add comment now" — another submit path, in both captures.
  (Reply forms already show "Start a review" / "Add comment now", see `02` and `05`.)

Not captured: the review drawer in rich text mode; the drawer opened from the Changes view.

## Preview (state 09)

`09-overview-apercu.html` — main form, text typed (`suggestion (non-blocking): brouillon de
capture, ne pas envoyer`, never sent), then "Preview (Shift+Ctrl+P)". The rendered body is
`p` inside **`div.md` inside `div.js-vue-md-preview.md-preview-holder`**, inside
`div[data-testid="markdown-field"]` of `form.new-note[data-testid="comment-form"]`. The
`textarea[data-testid="comment-field"]` stays in the DOM. The toolbar button reads "Continue
editing" while the preview is shown. Unlike the typed value, the rendered preview IS in the
capture — it is HTML the page built from the text. Cleared afterwards; after a reload: empty
field, 6 notes.

Not captured: the preview of a reply, of a diff-line comment, of the review body.

## Closed merge request (state 08)

`08-overview-mr-fermee.html` — !2 closed (API `PUT …/merge_requests/2` with
`state_event: close`, at the owner's request), captured, then reopened the same way; checked:
`state: opened`, source branch `test/mr-b` intact.

- The completion control is gone: `button[data-testid="merge-button"]` is present on the open
  !2 (`01-…-mr2`) and absent here — the expected absence of §9.4.
- The comment form stays: `textarea[data-testid="comment-field"]` and
  `button[data-testid="close-reopen-button"]`, which now reads "Reopen merge request".
- New hooks on the closed page: `data-testid="reopen-merge-request"`, `merged-status-content`.

Not captured: a **merged** merge request (merging is irreversible on the test project).

## Diff views

The Changes tab shows a "Rapid Diffs (Beta)" dropdown, and the page holds a "Switch to classic
loading" button. **Corrected** — an earlier note (and the commit message of `04`) said the
captures use the classic view; that was not checked. The Changes captures (`04`, `05`, `06-changes`
and their variants) contain Rapid Diffs markup: `<diff-file>` elements and `rd-diff-…` classes
(`rd-diff-file`, `rd-discussion-row`, `rd-diff-line-discussions-list`). Whether Rapid Diffs is
this account's default, gitlab.com's default, or was switched on earlier is not measured; the
classic view is not captured. Open: capture the classic view too, or state it as not measured.

The "Rapid Diffs" dropdown holds three entries: "Learn more", "Leave feedback", and the
`button` "Switch to classic loading" (opened and closed without choosing, 2026-11-08). The
"Learn more" page (GitLab docs, "Changes in merge requests", read 2026-11-08) says Rapid Diffs
"is on by default on the merge request Changes tab", is in beta with some classic features
missing, and that after switching to classic loading "your preference persists across sessions"
— without saying whether the preference belongs to the account or to the browser. Per the docs,
then, Rapid Diffs is what a user sees unless they opted out; the classic view is what a user who
opted out sees.

### Classic view (captured)

With the owner's agreement, "Switch to classic loading" was chosen, three states captured, then
"Try Rapid Diffs" (a `button` the classic view shows in place of the dropdown) chosen again.
Measured: the choice survived a reload both ways; after switching back, the page held 18
`rd-diff` elements and the "Rapid Diffs" dropdown again. A "New! Suggest changes directly"
popover appeared in the classic view; its "Got it" was NOT clicked (it would record a dismissal
on the account) — the popover is in `04-changes-classique-…`.

- `04-changes-classique-commentaire-ligne.html` — new comment on line 16: no `rd-diff`; the
  label reads **"Commenting on lines +16 to +16"** (Rapid Diffs: "Comment on line +16"). The
  form sits in `.discussion-reply-holder` › `.notes-content` › `.notes_holder` (a
  `data-testid="notes-holder"` row of `.diff-grid`). No `li#note_…` ancestor.
- `05-changes-classique-reponse-fil-ligne.html` — reply: the form sits in
  `li.discussion-reply-holder.is-replying[data-testid="reply-wrapper"]`, as in the Overview
  (`02`), and has **no** `li#note_…` ancestor — unlike the Rapid Diffs reply (`05`).
- `06-changes-classique-modification-commentaire.html` — edit: the form sits in `div.note-body`
  of `li#note_<id>` (`timeline-entry`), as in the Overview edit — unlike the Rapid Diffs edit.

All three: the same `form.edit-note.common-note-form` and the same `reply-field` as everywhere
else. So the classic view's structure is the Overview's; Rapid Diffs is the odd one.
