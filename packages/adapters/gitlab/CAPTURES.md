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

So far only state 01 is captured in rich text; the other zones (reply, diff-line comment, edit)
still need a rich text capture.

## Full screen mode

Measured on `01-overview-nouveau-commentaire-plein-ecran.html`: same `<textarea>`, same classes
as in normal mode. Only the container (`zen-backdrop … fullscreen`) and `<html>`
(`zen-mode-fullscreen`) change. The submit buttons are hidden on screen but stay in the DOM.

Not measured: whether full screen is remembered — the state could not be read reliably right
after the click (two attempts).

## Thread fields

- A new diff-line comment (`04-…`) and a reply in a diff-line thread (`05-…`) use the same field:
  `data-testid="reply-field"`, `aria-label="Reply to comment"`. Only `04` contains the
  "Comment on line" label. Telling `thread-root` from `reply` must rely on the surrounding
  structure — to measure when writing selectors.
- Each published comment also has a hidden `<textarea data-update-url="…/notes/<id>">` holding
  its Markdown source (for editing) — which is why a comment's text appears twice in `03-…`.

## Editing a published comment (state 06)

Measured on `06-overview-modification-commentaire.html` (pencil on the `issue:` comment, never
saved, then cancelled — the comment shows no "edited" mark):

- The edit field is again `textarea[data-testid="reply-field"][aria-label="Reply to comment"]`
  — the same attributes as a reply and a new diff-line comment. Its `id` is `note_note`.
- What tells it apart is its form: `form.edit-note` (a new comment's form is
  `form.new-note … js-main-target-form`). Buttons: "Save comment" and "Cancel".
- The comment being edited is the ancestor `li#note_<id>[data-note-id="<id>"]` — a candidate for
  `commentId`.

In the Changes view (`06-changes-modification-commentaire.html`, pencil on the line-8 comment,
cancelled): the same `form.edit-note`, the same field attributes, the same buttons. The ancestor
is `li#note_<id>` again, but WITHOUT `data-note-id` here — the `id` is the attribute both views
share.

The edit form holds **two** "Cancel" buttons. The first one in document order is not the
visible one (it sits with the upload controls, as in the new-comment form inventory): clicking
it left the form open. The visible "Cancel" is the one next to "Save comment". When proving that
Cancel is not intercepted, test the visible one — and do not take "the first Cancel" as a
selector.

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

## Diff views

The Changes tab offers a "Rapid Diffs (Beta)" view next to the classic one. All captures so far
use the classic view. Whether to capture Rapid Diffs too is open.
