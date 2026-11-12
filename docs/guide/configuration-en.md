# Configuration

**Languages:** English (this file) | [Français](configuration-fr.md)

The extension works with no configuration. A repository that wants its own labels, rules or
mode adds one file.

## The repository file

Put a `.conventional-comments.json` file at the root of the repository's **default branch**:

```json
{
  "version": 1,
  "mode": "assist"
}
```

Every key is optional: a key you leave out keeps the product default. The extension of every
reviewer reads this file from the pull request page, on their own session, without any token.

[`.conventional-comments.example.json`](../../.conventional-comments.example.json) shows the
shape of every key. It is an example, **not** the product defaults: it lists only a handful of
labels and turns one warning off to illustrate an override.

> On GitLab, the extension does not read the repository file yet: the product defaults apply
> there ([platforms](platforms-en.md)).

## Where the values come from

Three levels, the first that sets a key wins:

1. the repository file, `.conventional-comments.json`;
2. the organisation's configuration, a JSON document of the same shape served by a URL;
3. the product defaults.

Above them, an organisation can set a **floor** through the browser's enterprise policy: a
minimum mode and rules that no repository can relax. The URL of the organisation's
configuration also comes from that policy, never from a repository file
([deploying for an organisation](organization-en.md)).

Your own [settings](settings-en.md) only cover the interface language, your shortcuts and the
order of the buttons. They never change the mode or the list of labels.

### How levels combine

| Key | A lower level… |
|---|---|
| `labels`, `decorations.known` | overrides the properties of an entry with the same `id`, and can add entries. It never removes one: to retire a label, set `"enabled": false`. |
| `severities`, `shortcuts.abbreviations` | overrides or adds entries one by one, without erasing the others. |
| `exemptUsers`, `allowlistPatterns`, `toolCommands` | adds to the list. It cannot remove what a higher level put there. |
| `mode`, `rules.*`, `scope.*` and the other single values | replaces the value. |

So a repository that declares two labels still has all the shipped ones, plus or overriding
those two.

### When a change takes effect

A change applies to pull requests that are **already open**, as soon as the extension reads
it. The extension caches what it read for `configCacheTtlSeconds` (one hour by default), with
one exception: before it blocks a send, it always re-reads the configuration. A comment is
never blocked on a stale rule, and relaxing the mode lifts the blocking at the very next
attempt.

Tightening a rule can therefore make comments non-compliant, or threads blocking, on every
open pull request at once. Tighten in `assist`, watch what the pill and the banner report,
then move to `enforce` ([modes and adoption](modes-and-adoption-en.md)).

## Keys

### `mode`

`"off"`, `"assist"` (default) or `"enforce"`. See [modes and adoption](modes-and-adoption-en.md).

### `labels`

A list of labels, merged by `id` with the [shipped ones](labels-en.md).

| Property | Meaning | Default for a label you create |
|---|---|---|
| `id` | The word typed before the colon. Letters only: `followup`, not `follow-up`. | required |
| `enabled` | `false` retires the label: it is no longer offered, and typing it is `E-UNKNOWN-LABEL`. | `true` |
| `blockingByDefault` | Whether the label blocks when no decoration says otherwise. | `false` |
| `alwaysNonBlocking` | `true` forbids `(blocking)` on this label. | `false` |
| `kind` | `"remark"` raises a point, `"reply"` answers one, `"status"` says where the review stands. It places the button in the toolbar and changes no verdict. | `"remark"` |
| `aliases` | Other spellings accepted in input, such as `["bug"]`. | none |
| `icon` | Shown on the badge. | none |
| `color` | Colour of the button and the badge, such as `"#C2410C"`. Check its contrast in light and dark themes. | none |
| `description` | Tooltip of the **badge**: what the comment means for whoever reads it. | shipped text, if any |
| `usage` | Tooltip of the **button**: when to use the label. Without it, the button shows `description`. | shipped text, if any |

`description` and `usage` are shown as written, whatever the interface language. Written
empty (`""`), they remove the tooltip.

**Add a label:**

```json
{ "labels": [ { "id": "risk", "blockingByDefault": true, "icon": "⚠️", "color": "#C2410C",
                "description": "A regression risk raised by the reviewer.",
                "usage": "Flag a regression risk to assess before merging." } ] }
```

**Change a shipped label:**

```json
{ "labels": [ { "id": "issue", "aliases": ["bug"] },
              { "id": "todo", "blockingByDefault": false },
              { "id": "quibble", "enabled": true },
              { "id": "typo", "enabled": false } ] }
```

Two active labels cannot share a name. An alias that repeats the `id` of another active label
is dropped, an alias carried by two labels is dropped from both, and each removal is reported
as a configuration notice.

### `decorations`

```json
{ "decorations": {
    "allowFree": false,
    "known": [ { "id": "security", "forces": null },
               { "id": "must-fix", "forces": "blocking" } ] } }
```

- `allowFree` (default `true`): whether a decoration outside `known` is accepted. At `false`,
  an unknown decoration is `E-UNKNOWN-DECORATION`.
- `known`: decorations by `id`. `forces` is `"blocking"`, `"non-blocking"` or `null` for a
  purely descriptive decoration. Shipped: `blocking`, `non-blocking`, `if-minor`. A decoration
  whose `forces` is not `null` gets a segment in the toolbar.

### `severities`

The severity of a [diagnostic code](diagnostics-en.md): `"off"`, `"warn"` or `"error"`.
Default: empty, every code keeps its shipped severity.

```json
{ "severities": { "W-MISSING-DECORATION": "off" } }
```

An `E-` code cannot go below `"warn"`.

### `scope`

| Key | Meaning | Default |
|---|---|---|
| `validateReplies` | Validate replies in a thread. At `false`, a reply gets no diagnostic, except a `decision`. | `false` |
| `validateReviewSummary` | Validate the body of a review submitted as a whole. Ignored on Azure DevOps, which has no such body. | `true` |

Turning `validateReplies` on applies at once to open pull requests: every reply written
without a prefix becomes non-compliant. Let the team adopt the
[reply labels](labels-en.md#replying-to-a-point) first, require them afterwards.

### `rules`

| Key | Meaning | Default |
|---|---|---|
| `minSubjectLength` | Below it, `W-SUBJECT-TOO-SHORT`. | `5` |
| `maxSubjectLength` | Above it, `W-SUBJECT-TOO-LONG`. | `120` |
| `minDecisionSubjectLength` | Minimum length of the reason of a `decision`. | `20` |

### `exemptUsers`, `allowlistPatterns`, `toolCommands`

Three ways to leave comments out of validation. All three are **empty by default**.

| Key | Exempts | Example |
|---|---|---|
| `exemptUsers` | Comments written by these accounts, compared by login, ignoring case. | `["dependabot[bot]", "github-actions[bot]"]` |
| `allowlistPatterns` | Comments whose **whole** body, trimmed, matches one of these regular expressions. | `["^LGTM$"]` |
| `toolCommands` | Comments that **start** with a command addressed to a tool. | `["/*", "@dependabot", "@codex"]` |

`toolCommands` takes two kinds of entries, compared as exact strings:

- `"/*"` recognises any slash command at the start of the body: `/rebase`, `/retest`,
  `/azp run`… A path such as `/etc/hosts is wrong` is not taken for a command.
- an exact handle such as `"@dependabot"` recognises a mention of that account as the first
  word. There is no wildcard for mentions: `@alice can you look at this?` is a review comment.

A command cannot simply be given a label: most tools only read a command placed at the very
start of the comment.

`allowlistPatterns` is limited to 50 patterns of 256 characters, with no nested quantifier;
a pattern outside these bounds is ignored and reported. Anchor patterns at both ends:
`^bors retry` would also exempt `bors retry is broken since yesterday`.

An exempt comment has no label for the extension. A blocking remark written by an account in
`exemptUsers` is therefore **not counted** among the blocking threads. For an automated
reviewer, either leave it exempt and treat its remarks as advisory, or teach it the convention
([review skills](review-skills-en.md)).

### `shortcuts.abbreviations`

Abbreviations expanded by `Tab`, each mapped to the text inserted. See
[keyboard input](keyboard-input-en.md#abbreviations).

### Display

| Key | Meaning | Default |
|---|---|---|
| `language` | Interface language, `"en"` or `"fr"`, for those who set none in their settings. Without it, the extension follows the platform's language. | `null` |
| `badgeStyle` | `"pill"` or `"flat"`. | `"pill"` |
| `sessionIcon` | Icon of the review-session mention. | `"🤖"` |

### Compatibility and cache

| Key | Meaning | Default |
|---|---|---|
| `version` | Version of the configuration format. A file with a version the extension does not support makes it fall back on `assist`. | `1` |
| `coreMinVersion` | Minimum major version of the extension's rules engine this file needs. Same fallback. | `"1.0.0"` |
| `configCacheTtlSeconds` | How long the extension keeps what it read. | `3600` |

### Keys that do nothing in a repository file

- `configUrl` is ignored and reported: the address of the organisation's configuration only
  comes from the enterprise policy. Otherwise a repository could designate the very document
  meant to constrain it.
- `telemetry` cannot turn telemetry on: only the enterprise policy and each person's own
  consent can ([privacy policy](../../PRIVACY.md)).

## When the file is missing or wrong

| Situation | What the extension does |
|---|---|
| No file | Uses the organisation's configuration, then the product defaults. This is normal, not an incident. |
| Invalid JSON, or an unusable value for a known key (`"mode": "banana"`) | Falls back on the last valid level and shows an *invalid configuration* notice with the faulty line. |
| An unknown key | Ignores that key, reports it, applies the rest. |
| The file cannot be reached | Falls back on the level below and shows *Configuration unread*: it assists and no longer blocks. |
| A newer `version` or `coreMinVersion` than the extension supports | Falls back on `assist`, or on the enterprise floor if it is stricter, and reports it. |

A broken file never silently removes an enterprise floor.

## Recipes

**Stick to Conventional Comments.** Disable the six
[added labels](labels-en.md#sticking-to-conventional-comments).

**Let bots and commands through on GitHub:**

```json
{
  "exemptUsers": ["dependabot[bot]", "github-actions[bot]"],
  "toolCommands": ["/*", "@dependabot", "@copilot", "@coderabbitai", "@codex", "@claude",
                   "@mergifyio", "@renovate", "@rustbot", "@bors"]
}
```

On a GitHub Enterprise Server where one of these handles is a person's account, leave it out.

**Require labels on replies too:**

```json
{ "scope": { "validateReplies": true } }
```

**Block non-compliant comments in this repository:**

```json
{ "mode": "enforce" }
```

Read [modes and adoption](modes-and-adoption-en.md) first.

## Upgrading

**From a version without `toolCommands`.** Slash commands used to be exempted through a list
built into the GitHub adapter (`/azp`, `/rebase`). That list is gone and `toolCommands` is
empty by default: in `enforce` mode a `/rebase` is now rejected until the repository declares
it. Adding `"/*"` to `toolCommands` restores the exemption and widens it to every slash
command.

**Retired keys.** `formatSeverity`, `overrideLabel`, `resolverOverrideGroup`, `activation` and
`docUrl` served a component that no longer exists
([DEC0010](../idr/DEC0010-the-extension-is-the-whole-product-en.md)). A file that still
carries them stays readable: each is ignored and reported. `"mode": "warn"` is read as
`"assist"`, with a notice. Remove them to clear the notices.

**A label of your own called `thanks`, `done`, `ack`, `disagree`, `summary` or `reviewed`.**
Your entry now merges with the shipped label of the same name and inherits
`alwaysNonBlocking: true`, so `done (blocking):` becomes `E-CONFLICT`. Restore your label
with:

```json
{ "labels": [ { "id": "done", "alwaysNonBlocking": false } ] }
```

A label of your own called `fixed`, `acknowledged` or `thx` keeps its name: the shipped alias
of the same name gives way, and the removal is reported as a notice.

**Rules live in the extension, not in the file.** Two people running different versions of
the extension can apply different rules to the same file. `coreMinVersion` is the lever to
require a version.
