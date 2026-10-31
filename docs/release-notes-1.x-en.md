# Release notes — Conventional Comments Toolkit, 1.x

What changed for you, release by release. For the full record — every constraint, every edge case,
every section of the specification an entry rests on — see
[CHANGELOG.md](https://github.com/Reefact/conventional-comments-toolkit/blob/main/CHANGELOG.md).

The extension starts in `assist` mode: it helps and it flags, it never blocks a submission. No
verifier (component B) ships yet: a comment is checked only in the browser of someone who has the
extension installed.

## 1.0.0-beta.19 — October 31, 2026

_When a part of the page is not recognised, the journal now records what the page showed at that moment, and the whole diagnostic downloads as an archive to attach to a bug report; editing a comment on GitHub no longer writes a false alarm._

### ✨ Features

- **The journal records what the page showed when something was not recognised.** A line now says how far the extension got in the page, what it found there instead and when it happened; for the merge button and the PR creation date, it also says whether the element showed up a moment later. That is often enough for a developer to find the cause without asking you to capture the page. It keeps the page's structure and interface attributes only, never the page's text: not what you type, not comments or code. Attribute values are kept, though, and an interface label such as a button's accessible name, or an account name, can appear in them. It stays on your device.

- **A skeleton of the page is kept from the moment of the problem, when your browser and storage allow it.** It is the page's structure, without the page's text, taken at the instant something failed rather than afterwards. Skeletons take at most 1 MB of the extension's storage, the oldest go first, and the extension never lets them crowd out anything else. When the browser cannot compress a skeleton or storage is short, none is kept, and the journal line simply has none.

### 🔧 Changed

- **"Copy the whole log" becomes "Download the diagnostic (.zip)".** The archive holds the journal, the skeletons still stored and a README that says what each file contains; attach it to an issue. Copying a single line works as before, and "Clear the log" now clears the skeletons too. The archive holds the addresses of the pages involved, which on an enterprise server name a repository and a review: read the archive before you share it, keeping in mind that an interface label can name an account.

### 🐛 Bug fixes

- **Editing a comment on GitHub no longer writes a false alarm to the journal.** A hidden field of GitHub's "Reference in new issue" dialog, which is not a comment field, was reported as a comment field not recognised although nothing was wrong.

## 1.0.0-beta.18 — October 30, 2026

_The settings page's journal says what went wrong in a sentence, records the extension's own errors and can be copied for a bug report; filtering threads by label works on GitHub again._

### ✨ Features

- **The journal on the settings page can be copied for a bug report.** Each line has a copy icon, and a button copies the whole journal. What you paste into an issue carries the extension version, your browser and what a developer needs to reopen the problem. Page content is not collected as a field of its own, but the address of the page is in the report, and the message and details of an error can contain snippets of what the extension was handling. Read the whole report, not only the address, before you paste it into a public issue.

- **Each journal line says what went wrong in a sentence.** "Merge button not found: it cannot be greyed out" instead of `merge-button`, with a level, `WARN` or `ERROR`. The technical name stays in the copy.

- **The extension now records its own errors.** A crash used to leave no trace. It now shows up as an `ERROR` line that says what the extension was doing, and the details are in the copy. They stay on your device.

### 🐛 Bug fixes

- **Filtering threads by label hides them on GitHub again.** GitHub forced every thread to stay visible, so a thread you had filtered out stayed on screen. Selecting `praise` no longer leaves an `issue` thread showing.

- **Clearing the filter gives a thread its original display back.** A thread that already had a forced display setting lost it once the filter was cleared, and GitHub's own styling could override it again.

## 1.0.0-beta.17 — October 29, 2026

_Two fields of the settings page no longer show up white in the dark theme._

### 🐛 Bug fixes

- **The "Button order" field and the configuration block of the added labels now follow the dark theme.** Both stayed white on a dark settings page, which made them hard to read and out of place next to the other fields. They now look like the rest of the page.

## 1.0.0-beta.16 — October 29, 2026

_The settings page tells you which version you are running, and the GitHub adapter reads a pull request's merge button and resolved conversations correctly again._

### ✨ Features

- **The settings page shows the extension's version next to its title.** A release candidate reads `v1.0.0-beta.16`, where `chrome://extensions` shows `1.0.0` for every beta, so you can tell which build you are running before you report a problem. Firefox shows its own version number.

### 🐛 Bug fixes

- **The banner no longer counts resolved conversations as unresolved.** On a pull request whose resolved conversations GitHub collapses, the banner listed them among the unresolved ones, `issue (blocking)` threads included. It now agrees with the Files changed view of the same pull request.

- **The extension finds the merge button of an open pull request on github.com again.** GitHub changed how the button is built and the extension no longer recognised it. Nothing changes on screen yet: the extension greys the button only when a verifier publishes a failing state, and none ships.

- **The settings page no longer reports false selector failures.** Its Status section listed searches that failed because there was nothing to find, such as the merge button of a merged pull request. They are no longer logged.

## 1.0.0-beta.15 — October 29, 2026

_A label's badge now tells the reader what a comment means, and its button tells the writer when to use it._

### 🔧 Changed

- **The badge and the button no longer show the same tooltip.** Hovering the label badge of a published comment tells you what the comment means, without an example: `issue` reads "A problem spotted in this code; the comment explains which one." Hovering the label's toolbar button tells you when to use it, then gives an example: "Flag a problem to fix, ideally with a lead." Every shipped label has both texts, in English and French. A badge text never claims more than the label says: whether a point blocks is still shown by the decoration badge next to it.

- **The reviewer skill shows priorities as coloured badges.** An agent following `skills/review-pull-request` now marks each finding with a P0 to P3 badge; where the image does not show, the reader sees `[P1]` as before.

### ✨ Features

- **A team can write each text: `labels[].usage` for the button.** In `.conventional-comments.json`, `description` now goes to the badge and `usage` to the button. Written, each replaces the shipped text; written empty (`""`), it removes that tooltip. Without `usage`, the button shows `description`, so a configuration written for 1.0.0-beta.14 keeps showing the same text on both.

## 1.0.0-beta.14 — October 29, 2026

_Labels explain themselves where you read them: a hover on a badge shows its definition, and a team can write its own. `quibble` steps aside for `nitpick`, and two skills let AI agents review the toolkit's way._

### ✨ Features

- **A badge tells you what its label means.** Hover the label badge of a published comment and you get the same tooltip as its toolbar button: the definition and an example, in the interface language. The badge also keeps the arrow cursor rather than the text-selection bar.

- **Your team can define its labels: `labels[].description`.** Write a description for a label you create, or for a shipped one such as `issue`, in `.conventional-comments.json`, and the tooltip of the button and the badge shows it. Written, it replaces the shipped definition and its example; written empty (`""`), it removes the tooltip; left out, a shipped label keeps its definition. It is shown as written, whatever the interface language.

- **Two review skills for AI agents.** `skills/review-pull-request` and `skills/respond-to-review` tell an agent how to review a pull request, or answer its review, with this toolkit's labels: findings followed up until verified, `reviewed:` once nothing is left, reply labels for the author, and never an approval or a merge. See the [README](https://github.com/Reefact/conventional-comments-toolkit/blob/main/README.md#review-skills-for-ai-agents).

### 🔧 Changed

- **`quibble` is off by default.** Conventional Comments itself describes it as "very much like nitpick", so the toolbar showed two buttons for one meaning. Use `nitpick`, or bring `quibble` back with `{ "id": "quibble", "enabled": true }` in `.conventional-comments.json`. Until you do, a `quibble:` comment is an unknown label where comments are validated.

- **`reviewed` now says when to use it.** Its tooltip read "you have finished reading"; it now reads "your points are dealt with, you have nothing to add". Post it once each of your points is fixed and checked, or set aside by a reply you accept. Any later change reopens your review. It still approves nothing.

- **The extension's description no longer mentions the companion server**, removed in 1.0.0-beta.13, in `chrome://extensions` and in the Release pages.

### 🐛 Bug fixes

- **A custom label no longer shows its internal key as a tooltip.** Hovering the button of a label your repository created, such as `risk`, showed "label.risk". It now shows its `description` if it has one, and nothing otherwise.

## 1.0.0-beta.13 — October 29, 2026

_Labels for replying to a review, every shipped label enabled by default, GitHub's comment box recognised again on today's pages — and the companion server retired, with no verifier in its place yet._

### ✨ Features

- **Labels for replying to a review.** `thanks`, `done`, `ack` and `disagree` answer a point; `reviewed` closes your own review and approves nothing. They are the toolkit's own addition, not part of Conventional Comments, and they never block. `fixed` is accepted for `done`, `acknowledged` for `ack` and `thx` for `thanks`; `?thx` expands to `thanks: ` and `?r` to `reviewed: `. They do not make replies require a label. A repository that wants to stick to Conventional Comments disables each of them with one `labels[]` entry: the options page shows that block and copies it for you.

- **The toolbar puts the replies on a line of their own.** Labels that raise a point come first; under a thin rule follow those that answer one — `thanks`, `done`, `ack`, `decision`, `disagree`, from the warmest to the firmest. A thin double rule separates the labels from the decorations.

- **You choose the order of the label buttons.** "Button order", in the options, takes a comma-separated list: the labels you list come first, the others follow in the default order, and the completion list follows the same order. It is a personal preference.

- **A label can say whether it raises a point or answers one**, with `labels[].kind` (`"remark"` or `"reply"`). A label you declare is `"remark"` unless you say otherwise. It changes no verdict.

- **Every line of the journal says which page it came from.** It recorded which selector failed and when, never where: faced with four lines stamped within the same second, nothing told you whether they came from one page or four. Each line now starts with a six-character mark — same mark, same page — and clicking it opens the exact recorded address in a new tab. That address stays on your device: when you have allowed telemetry, it still sends nothing but the selector's name. Lines already in the journal before this update have no address — it was not being recorded — and carry a neutral mark until their selector fails again, or until you clear the journal.

- **The journal clears from the options page.** A button empties it; tabs you already have open start measuring again straight away, and the section updates itself when one of them writes, without a reload.

- **The options page carries the extension's icon** before its title. The guided tour's button now reads "Guided tour", its full wording moving to the tooltip.

### 🔧 Changed

- **Every label the toolkit ships is enabled by default**, Conventional Comments' `typo`, `polish` and `quibble` included. A repository disables the ones it does not want.

- **If your configuration already defines `thanks`, `done`, `ack`, `disagree` or `reviewed`, it needs one property to keep working as before.** Your label now merges into the shipped one and becomes always non-blocking, so `done (blocking):` is refused. Add `"alwaysNonBlocking": false` to restore it.

- **New icons:** `praise` is now 👏, `decision` is ⚖️, and 🎉 goes to `reviewed`.

- **The check links to the toolkit's labels page by default**, https://conventionalcomments.io/docs/labels/, instead of conventionalcomments.org, which documents none of the labels the toolkit adds. A `docUrl` you set yourself is kept.

- **Two active labels can no longer share a name.** An alias that repeats another active label's name is removed, and the removal is reported. Before, the order of the label list decided which label a comment meant.

- **An enterprise floor no longer makes `decision` blocking.** Listing it under `labels.minimum` used to force it blocking, so a bare `decision:` opened a blocking thread while `decision (blocking):` was refused. The floor now only keeps it enabled.

- **A shipped abbreviation only expands to an enabled label.** `?ty`, `?po` and `?qui` used to insert the prefix of a disabled label, which validation then rejected. An abbreviation your repository defines itself is unaffected.

- **On Azure DevOps, the label prefix is no longer hidden and the subject no longer emphasised.** Nobody has yet measured how Azure DevOps renders a comment body, and the extension stopped assuming it renders like GitHub's. Badges stay, and the body shows whole.

- **The companion server is retired, and no verifier ships in its place.** It was never deployed. The specification now calls for a verifier that runs inside the platform and keeps no state, and [issue #56](https://github.com/Reefact/conventional-comments-toolkit/issues/56) tracks building one for GitHub. Until it exists, nothing checks comments after the fact and no status check is published: `enforce` still blocks a send in the extension, which anyone without it bypasses. The `server` and `exemptionLog` configuration blocks are now ignored, with a warning.

### 🐛 Bug fixes

- **GitHub's "Files changed" view is recognised again.** On pages as github.com serves them today, the extension found no button that publishes a comment, so under `enforce` a non-conforming comment could still be published there. It also treated editing a comment as writing a new one, treated the review summary as a line comment that can block the pull request, and gave no badges to threads. On the "Conversation" tab, editing a published comment was also treated as a line comment that can block. "Cancel" is still never intercepted.

- **GitHub: the pull request's creation date is read from the pull request itself.** That date decides whether a pull request predates `activatedAt`, and so whether the extension may block on it. It used to be the first date on the page — on a merged pull request, the merge date, so the same pull request could read two dates depending on the tab. When the date cannot be read, the extension does not block.

- **The privacy policy described a history the extension does not keep.** It announced "the last 50 times" an element was not recognised, while the journal keeps only one line per selection rule — fifty at most, each with its most recent observation. It now describes what is actually kept, the page address included.

## 1.0.0-beta.12 — September 8, 2026

_The guided tour is legible at last — the page behind it really does go dark, and its card sits above it instead of blending in — and the "Status" section says what it observed rather than what that might mean._

### ✨ Features

- **The "Status" section tells you what it is for.** It was the only section of the options page whose heading had nothing under it, so you had to read the two lines it shows to work out what it covered.

### 🐛 Bug fixes

- **The guided tour now dims the page around the part it is pointing at.** In the dark theme it barely dimmed at all — a dark veil over an already dark page changes almost nothing — so the tour looked like it was highlighting nothing, and its card, which had the same colour as the panels behind it, read as one more panel rather than as something floating above them. The rest of the page now goes properly dark in both themes, and the card carries a drop shadow you can actually see; in the dark theme it is also a lighter surface than the panels behind it.
- **The "Status" section no longer suggests the extension changed your pages.** It reported "pages whose structure changed under it", which reads as an accusation and, either way, claims more than the extension knows: what it records is that one of its selectors found nothing on the page. That can mean the page changed — or simply that the element is legitimately absent, like the merge button on a closed pull request. Both the section and the tour step now report what was actually observed.

## 1.0.0-beta.11 — September 8, 2026

_You now authorize every platform the same way — `github.com` included — so the extension asks before it works anywhere, and you can revoke that access at any time._

### ✨ Features

- **You choose where the extension works, and you can change your mind.** `github.com` used to be built into the extension: active from the moment you installed it, with no way to revoke that access from the extension itself. It now goes through the same one-click authorization as every other platform, and every domain you have allowed carries a "Withdraw" button. Domains authorized by your organisation's policy stay as they are — that is not this screen's call.
- **The options page opens automatically the first time and offers you a guided tour.** It introduces each section and explains what it is for; you can skip it at any point, close it with `Escape`, and it never comes back on its own. A "Replay the guided tour" button in the page header replays it whenever you want.
- **The options page now speaks French or English, like the rest of the extension.** It stayed in French whatever you had chosen — so someone who had set the interface to English saw English everywhere except on the settings page where they made that choice. The new language now takes effect immediately, rather than at the next reload.

### 🐛 Bug fixes

- **GitHub Enterprise Cloud with data residency now works at all.** A domain allowed as `*.ghe.com` was recorded under a mangled name, so the extension never recognised the pages it was authorized for. This is older than this release, and no test could see it: the flaw only appears in a browser, and the tests ran where it does not.
- **You no longer need to reload the tab you came from.** Allowing a domain from the options page left that tab inert — precisely the tab you were about to use. The extension now activates there immediately.
- **A failed revocation is no longer reported as successful.** When the browser refuses to remove an access, the screen used to report the domain as unconfigured afterwards — an anomaly it had created itself, while the access was in fact still granted. It now changes nothing and says why.
- **Revoking access from `chrome://extensions` now also clears the saved platform.** The platform you had chosen for that domain used to stay behind, so granting it again the same way silently restored the old choice instead of asking you.
- **The extension no longer loads itself on pages it does not support.** If you had granted access to all sites from the browser's own controls, its code was injected into every `https` page, where it could do nothing anyway. Patterns that do not identify a concrete host no longer appear as domains to configure either.
- **The interface no longer appears twice on a page covered by two of your authorizations**, and a tab left open for a long time no longer accumulates a copy of the extension's stylesheet.

### 🔧 Changed

- **After this update, the extension is silent on `github.com` until you allow it.** One click on "Activate" in the options page is enough. This step cannot be automated: the browser only grants a site permission after an explicit action from you. The page opens by itself to say so — but only if the update left you with no working domain at all; if you already had another one configured, the extension keeps working there and nothing tells you it is no longer active on `github.com`.
- **The options screen is rebuilt around the actual access states**: domains the extension already knows, where one click both authorizes and classifies; any other domain, where you say which platform it belongs to before granting; the list of what is configured; and, only when it is not empty, the domains you allowed from the browser rather than from this screen, where the extension is not active yet.
- **Each `visualstudio.com` organisation is now authorized individually** through the free-form field, with Azure DevOps pre-filled. The catalog entry it replaces asked for every organisation on those legacy addresses at once, when a workstation uses one.

## 1.0.0-beta.10 — September 5, 2026

_GitHub rewrote its "Files changed" view, and the extension had gone quiet on it: this release brings the whole toolkit back there, and makes diagnostics speak the language you picked._

### 🐛 Bug fixes

- **The comment tooling works again on GitHub's rewritten "Files changed" view.** GitHub now serves that page at `/pull/N/changes`, where the extension recognised nothing: no label toolbar, no quick entry, no live validation, no badges on published comments — precisely where a blocking `issue:` counts most. All of it is back. A page carrying an editing surface the extension does not recognise now leaves a diagnostic entry too, instead of being inert and silent at once.
- **Under `enforce`, a non-compliant comment can no longer be published from that view.** Neither by clicking *Reply* under a diff line, nor from the "Finish your comments" panel of a batch review, whose buttons sit in the overlay rather than beside the field. Only the keyboard path was guarded before, so a comment the extension had flagged could still be sent with a mouse.
- **Editing the root comment of a thread is validated again there.** It was taken for a reply, which the default configuration exempts from validation — an `issue:` root could be edited into anything without the extension looking. Published comments get their badges back too, resolved threads read as resolved instead of unknown, and the pull request banner shows the authors and bodies it was missing.
- **A blocking label in a review summary is warned about again.** In the "Finish your comments" body, `issue:` reported everything except the one warning that matters there: nobody can resolve a review summary, so it carries no blocking state. The same text in the conversation box has always said so.
- **The Preview tab shows badges on that view too.** Writing `issue: …` in a composer on `…/changes` and switching to *Preview* rendered the prefix in plain text, where the same switch on the conversation page showed the badge.
- **The composer looks like itself again on that view.** The toolbar sits above the field instead of being folded into a narrow column beside it, the compliance outline around the field is visible instead of clipped by the container that wraps it, and the toolbar, the field and the verdict pill are no longer squeezed against the frame that surrounds them. That spacing survives a trip through the *Preview* tab as well, which used to strip it until the composer was closed.
- **Diagnostic messages now follow the language you picked in the options page.** A French interface could show *Conforme, avec avertissements* above *This comment is blocking but has no discussion*: that one line took its language from the repository's configuration rather than from your own preference. Label names (`issue`, `praise`…) and diagnostic codes (`E-NO-LABEL`, `W-NO-DISCUSSION`…) stay untranslated in both languages — they are identifiers, and the check output names them the same way.

## 1.0.0-beta.9 — September 4, 2026

_The extension no longer gets in the way of a pull request's own description, no longer goes quiet on a page that starts out empty, and finally says why when it cannot read your configuration._

### ✨ Features

- When the configuration cannot be read, the options page now shows **why** — `HTTP 429`, a `TypeError`, a 404 that cannot be told from a refusal — together with the level it came from, instead of the bare word `unreachable`. The reason stays on your machine: it goes to `chrome.storage.local` and nowhere else.

### 🐛 Bug fixes

- **A pull request's own description is no longer treated as a review comment.** The convention says nothing about it, yet the label toolbar was drawn on it — and under `enforce` the submit guard applied to its Update button, so a description without a `label:` prefix could not be saved at all. Badges are gone from it too. Where a future GitHub rendering names things differently, the description simply behaves as it did before, never worse.
- **The "Configuration unread" banner no longer appears on every repository.** Every configuration read was failing before it left the browser, on public and private repositories alike, with a configuration file and without — so the extension always fell back to its degraded state. Repository-level configuration is readable again.
- **A page that had nothing to show no longer stops watching after five seconds.** On the *Files changed* view of a pull request with no thread yet, the first comment posted afterwards got neither badge nor banner until a full reload — and so did coming back to *Conversation* from another tab of the same pull request. A page that has not moved is still left alone; one that gains a comment, a thread or a published result is rendered again.
- **A missing page is no longer read as a hidden one while you are signed in.** GitHub masks a private resource as missing, and the extension trusted a page-scraped "private" signal that could be wrong on a public repository. Two independent signals must now agree before a 404 means an unreadable configuration.
- **The selector degradation journal is usable again.** Visiting a single closed pull request filled all fifty lines with one entry and evicted every real degradation, because the merge button it looks for is legitimately absent there. One line per selector now — and the opt-in telemetry, which inflated for the same reason, with it.

## 1.0.0-beta.8 — September 4, 2026

_Published comments read like titles — badges, then the subject in bold on the same line — and three ways a comment could silently lose its badges are closed._

### ✨ Features

- A published comment's subject is now shown **in bold on the badge line**, to the right of the badges, instead of starting on the line below them. A blank line separates it from the rest of the comment. Where the subject cannot be delimited safely — inline formatting carrying its own line break, for instance — the previous layout is kept rather than risking a wrong cut.

### 🐛 Bug fixes

- Editing a comment no longer strips its badges. The platform rewrites the rendered body on an update; the badges and the structured prefix went with it, and nothing brought them back until you reloaded the page.
- The structured prefix is re-hidden when the platform restores it on its own, which previously left `issue (blocking):` visible in the middle of an otherwise decorated comment.
- Leaving a pull request, or switching the extension to `mode: off`, no longer leaves part of a comment invisible. The badges were removed but the prefix stayed hidden, so an extension that declares itself inactive went on concealing text you had written.

### 🔧 Changed

- The composer toolbar now stacks **two rows** — labels, then decorations — so a narrow window or a side panel can no longer put a label button next to a decoration segment as if they were one kind of control.
- Label buttons no longer show their icon; badges on published comments still do. The buttons share one row's width, where an icon costs every other button; a badge stands alone at the head of its comment, where it costs nothing.

## 1.0.0-beta.7 — September 3, 2026

_The structured prefix disappears from a published comment — the badges already say it — except everywhere saying it twice was the safer answer._

### ✨ Features

- `issue (blocking): ` no longer appears in a published comment: the badges carry that information, so the text is hidden on screen. On screen only — the comment stored on the platform is untouched, and reopening the edit form shows it in full.
- Where the badges would not say the same thing, the text stays: a decoration you wrote that the configuration rejects, a case or punctuation defect the tool is meant to flag, decorations folded into a `+N` badge. Hiding those would erase the only trace of what you actually typed.
- A line that merely looks like a prefix — inside a code block, a quote, a list, a heading, a table or a `<details>` summary — is left alone.

### 🔧 Changed

- Every default label now has an icon and a colour, contrast-checked against WCAG 1.4.11.

## 1.0.0-beta.6 — September 3, 2026

_Decorations get badges of their own, and the whole display follows a configuration change while you watch._

### ✨ Features

- Each decoration on a published comment now gets its own badge beside the label: red where it forces the blocking character, green where it forces non-blocking, dashed where the decoration is declared nowhere.

### 🐛 Bug fixes

- Changing the configuration now refreshes what is already on screen — including on a tab you left open on a pull request. A label disabled mid-review loses its badge instead of keeping one for a state that no longer exists.
- **A comment box you already had open follows that change too, including whether it blocks your submission.** It went on applying the configuration captured when it opened, so an organisation switching from `enforce` to `off` left you blocked until you closed and reopened the box.

## 1.0.0-beta.5 — September 2, 2026

_Repository configuration is readable again on private repositories._

### 🐛 Bug fixes

- The extension reads your repository's and organisation's configuration on private repositories again. The read follows a redirect the browser refuses to authenticate; credentials are now dropped on that hop alone, so the file stays readable without asking you for any host permission.
- A configuration file that could not be read for lack of a session is no longer taken for a file that does not exist — which silently applied the wrong configuration.

## 1.0.0-beta.4 — September 1, 2026

_The decoration selector says what your comment carries, not what you last clicked._

### 🐛 Bug fixes

- The decoration selector now reflects the comment itself. A decoration you removed by editing the text, or one that left with a label the configuration disabled, no longer stays lit in the toolbar.

## 1.0.0-beta.3 — September 1, 2026

_Two permissions dropped from the manifest, telemetry that only exists if you ask for it, and the material for a store submission._

### 🔧 Changed

- **`activeTab` and the permanent `github.com` host permission are gone.** Hosts are granted optionally instead — the extension asks for what it needs, when it needs it.
- The pull-request banner is a summary, not a merge gate. The verdict belongs to the platform's own check, which is already red and already blocking; restating it here devalued both.

### ✨ Features

- Optional telemetry, off unless you turn it on, bound to the endpoint you consented to and configured by your organisation's policy rather than by a repository file.
- The version shown in `chrome://extensions` now distinguishes pre-releases: `1.0.0-beta.1` and `1.0.0-beta.2` no longer both read `1.0.0`.

### 🐛 Bug fixes

- **On GitHub Enterprise Server and self-hosted Azure DevOps Server, granting the host permission now actually gives you the extension.** The grant succeeded and nothing appeared: no adapter was ever built for that host. Which platform a host serves is now recorded with it, so a GHES domain and an Azure DevOps Server one are told apart.
- **An organisation configuration hosted outside your platform is readable again.** It never was: the page's own CORS policy blocked it whatever permission you had granted, leaving the extension permanently degraded and judging on two configuration levels where the server uses three.

## 1.0.0-beta.2 — August 24, 2026

_Bot and tool comments stop being flagged, and the toolbar stops sitting flush against the box._

### ✨ Features

- **A tool command is no longer reported as a malformed comment.** A slash command, or a mention from a bot you list in `toolCommands`, is exempt from validation — `/rebase` and `@dependabot recreate` go through untouched.

### 🐛 Bug fixes

- The toolbar and the live feedback line up with the comment box's own text instead of touching its border.
- A label's colour now paints the border of the active button rather than its background: the colour comes from your configuration, and using it as a background produced contrast as low as 1.54 where 4.5 is required.
- The toolbar's buttons are spaced again — a CSS comment closed one character early was silently eating the rule that spaced them.

## 1.0.0-beta.1 — August 24, 2026

_First installable build._

### ✨ Features

- The extension for GitHub and Azure DevOps: a toolbar over the comment box, quick keyboard entry, live feedback as you type, and a submission guard in `enforce` mode.
- The server companion (component B), self-hostable, which is the source of truth for conformance and for blocking a pull request's completion.
- Chromium and Firefox archives published on every tag, loadable without Node or npm.
