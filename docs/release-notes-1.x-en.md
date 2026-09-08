# Release notes — Conventional Comments Toolkit, 1.x

What changed for you, release by release. For the full record — every constraint, every edge case,
every section of the specification an entry rests on — see
[CHANGELOG.md](https://github.com/Reefact/conventional-comments-toolkit/blob/main/CHANGELOG.md).

The extension starts in `assist` mode: it helps and it flags, it never blocks a submission. The
source of truth for conformance stays the server companion (component B).

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
