# The settings page

**Languages:** English (this file) | [Français](settings-fr.md)

The extension's settings page opens by itself after installation. Afterwards, click the
extension's icon in the browser toolbar (pin it from the puzzle-piece menu if it is hidden).
A **Guided tour** button, at the top, replays the introduction.

The page sets what belongs to **you**: which sites the extension may work on, and a few
personal preferences. The mode and the list of labels are not here. They belong to the team
and live in the repository's [configuration](configuration-en.md).

## Allowed domains

The extension works on the domains listed here, and only on them. Until one is allowed, it is
inactive everywhere.

| Panel | What it does |
|---|---|
| **Known domains** | GitHub.com, Azure DevOps Services, GitLab.com. One click grants access; the browser asks you to confirm. |
| **Other domains** | For a host of your own. Type the domain, choose the platform that serves it, then **Allow**. Choose *Other (organisation configuration host only)* for a host that only serves your organisation's configuration. |
| **Configured domains** | What you allowed. **Withdraw** removes the access. A domain marked *enterprise policy* was set by your organisation and cannot be withdrawn here. |
| **Unconfigured domains** | Domains that got access from the browser's own *Site access* menu, with no platform. The extension does nothing on them until you associate a platform, or withdraw the access. |

[Which domain for which platform](platforms-en.md#domains).

## Local preferences

| Preference | What it does |
|---|---|
| **Interface language** | English or French. By default the extension follows the `language` key of the configuration (repository file, then the organisation's), then the platform's language; this setting comes first, for you alone. |
| **Direct shortcuts** | `Alt` + letter combinations that insert a label. One per line, such as `Alt+R=reviewed`; `Alt+D=` disables a shipped shortcut. See [keyboard input](keyboard-input-en.md#direct-shortcuts). |
| **Button order** | Labels to put first in the toolbar, separated by commas: `suggestion,nitpick,disagree`. The labels you list come first within their group (remarks, status labels such as `summary`, replies); the others follow in the default order. The completion list follows the same order. |

These preferences follow you through your browser's sync, if it is on. Shortcuts and button
order apply to the next comment field that opens.

## Added labels

The six labels the extension adds to Conventional Comments (`thanks`, `done`, `ack`,
`disagree`, `summary`, `reviewed`) are enabled by default. This section shows the
configuration block that disables them, and **Copy the configuration** puts it in your
clipboard.

The button disables nothing by itself: the block goes into the repository's
`.conventional-comments.json`, which the whole team shares. With no existing file, the block
can be the whole file; otherwise add its six entries to the existing `labels` list
([why these labels exist](labels-en.md#labels-that-are-not-part-of-conventional-comments)).

## Telemetry

Off by default. The checkbox has no effect until your organisation declares a collection
endpoint through its enterprise policy. The page shows that endpoint before you agree. Only
aggregate counters are sent, never the text of a comment, of code or of a diff, nor the
address of the page ([privacy policy](../../PRIVACY.md)).

## Status

Where to look when something does not behave as expected.

- **Configuration:** whether the last read succeeded, and the configuration notices of that
  read, with the repository they concern.
- **Journal:** the things the extension looked for in a page and did not find (a comment
  field, a send button, a thread anchor…) and the errors it caught. An entry says what was
  looked for, not why it was missing: a button that is absent on a closed pull request is
  normal.
- **Download the diagnostic (.zip):** an archive to attach to a bug report. It holds the
  journal and, for each element not found, a skeleton of the page: tags and a short list of
  interface attributes, never the text of a comment, of code or of a field. **Read
  `report.json` before sharing it:** page addresses name repositories and pull requests, and
  an interface label can name an account.
- **Clear the log** empties the journal.
