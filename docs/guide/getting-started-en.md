# Getting started

**Languages:** English (this file) | [Français](getting-started-fr.md)

Ten minutes from nothing installed to a first review comment written with the toolbar.

## What you need

- Chrome, Edge or another Chromium browser, or Firefox 128 or later.
- A pull request you can comment on, on GitHub, Azure DevOps or GitLab
  ([what works on which platform](platforms-en.md)).

Nothing else: no account, no token, no server.

## 1. Install the extension

Every release carries the extension as a ready-to-load archive, one for Chromium browsers and
one for Firefox.

1. Open the [releases page](https://github.com/reefact/conventional-comments-toolkit/releases)
   and download `conventional-comments-toolkit-<version>-chromium.zip` (or `-firefox.zip`).
2. Unzip it somewhere you will keep. The browser re-reads that folder each time it starts,
   so deleting it disables the extension.
3. Load it:
   - **Chrome, Edge:** open `chrome://extensions`, turn on **Developer mode**, click
     **Load unpacked** and pick the unzipped folder, the one that directly contains
     `manifest.json`.
   - **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary
     Add-on** and pick the `manifest.json` of the unzipped folder. Firefox removes a temporary
     add-on when it closes.

An extension loaded this way does not update itself: a new version means downloading and
loading it again. To build the extension from source instead, follow the
[step-by-step build guide](../extension-setup-en.md).

## 2. Allow your platform

The extension's settings page opens by itself after installation, with a short guided
tour. You can reopen it at any time by clicking the extension's icon in the browser toolbar.

**The extension is inactive everywhere until you allow a domain.** It asks for no site access
at installation; you grant it one domain at a time.

- Under **Known domains**, click the platform you use: GitHub.com, Azure DevOps Services
  (`dev.azure.com`) or GitLab.com. The browser asks you to confirm.
- For a host of your own (GitHub Enterprise Server, Azure DevOps Server, a
  `visualstudio.com` organisation, GitLab Self-Managed), type its domain under **Other
  domains** and choose the platform that serves it **before** clicking **Allow**.

The domain then appears under **Configured domains**, where you can withdraw the access at
any time. The [settings page](settings-en.md) guide describes the rest of that screen.

## 3. Write your first comment

Open a pull request on the domain you allowed, reload the page if it was already open, and
click into the field of a **new** comment. Replies in a thread are not validated by default, so
the pill stays silent there.

1. A **toolbar** appears with one button per label: `praise`, `nitpick`, `suggestion`,
   `issue`…
2. Type your remark, for example `this name does not say what the variable holds`.
3. A **status pill** under the field says the comment is non-compliant: it has no label yet.
4. Click **nitpick** in the toolbar. The comment becomes:

   ```text
   nitpick: this name does not say what the variable holds
   ```

   The pill changes to *Compliant*.
5. Publish the comment with the platform's usual button. Once published, its label is shown
   as a coloured badge.

That is the whole loop: write, pick a label, publish.

## What the extension does by default

- It **assists and never blocks**. The default mode is `assist`: a non-compliant comment is
  flagged and still goes out. Blocking is a choice a team makes for a repository
  ([modes and adoption](modes-and-adoption-en.md)).
- It works **without any configuration file**. A repository that wants its own labels or
  rules adds a `.conventional-comments.json` file ([configuration](configuration-en.md)).
- **No comment, code or diff content leaves your browser** ([privacy policy](../../PRIVACY.md)).

## Where to go next

| To… | Read |
|---|---|
| know every part of the toolbar, the pill, the badges and the banner | [Writing review comments](writing-comments-en.md) |
| write labels without the mouse | [Keyboard input](keyboard-input-en.md) |
| choose the right label | [Labels and decorations](labels-en.md) |
| understand a message of the pill | [Diagnostics](diagnostics-en.md) |
| set the rules for your repository | [Configuration](configuration-en.md) |
| find out why something does not show up | [FAQ and troubleshooting](faq-en.md) |
