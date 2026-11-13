# Modes and adoption

**Languages:** English (this file) | [Français](modes-and-adoption-fr.md)

How far the extension goes, from silent to blocking, and how a team gets there without
breaking its workflow.

## The three modes

| Mode | Toolbar and keyboard input | Diagnostics shown | Send blocked |
|---|:---:|:---:|:---:|
| `off` | No | No | No |
| `assist` (default) | Yes | Yes | No |
| `enforce` | Yes | Yes | Yes, for a comment with an error |

A repository sets its mode in [its configuration file](configuration-en.md#mode); an
organisation can set a default for all its repositories and a minimum none of them can go
below ([deploying for an organisation](organization-en.md)). Nobody sets the mode from the
extension's settings page.

`warn` no longer exists. A configuration that still says `"mode": "warn"` is read as
`"assist"`, with a notice asking to update it.

## What `enforce` does

When a comment has at least one **error**, the send button is greyed out, and the extension
intercepts every attempt to send, by mouse or keyboard (`Ctrl+Enter`, `Cmd+Enter`). The reason
is announced to screen readers, and the button stays reachable with `Tab`. Warnings never
block.

Blocking needs two conditions:

1. the effective mode is `enforce`;
2. the extension could **read** the configuration. If it could not, it shows *Configuration
   unread* and behaves as in `assist`: a send is never refused in the name of a rule that
   could not be read.

Before it blocks, the extension re-reads the configuration, bypassing its cache. If the
re-read configuration no longer blocks the comment, the button is released and a message
invites you to send again.

## What `enforce` does not do

**The extension is a guard rail, not a wall.** It runs in the browser where it is installed.
A comment posted through the platform's API, a command-line tool, an IDE, another browser or
a machine without the extension is not checked. Nothing in the product checks those
comments afterwards.

**It does not control the merge.** Unresolved blocking threads are *reported* by the banner;
the extension never prevents a merge
([DEC0010](../idr/DEC0010-the-extension-is-the-whole-product-en.md)). A team that wants
merges gated on resolved conversations uses its platform's own settings, such as required
conversation resolution.

**There is no bypass button**, and that is deliberate. Such a button would control nothing,
since the extension can be disabled in two clicks, and it would move the justification out of
the review. When a blocking point will not be addressed, say so in the thread with a
[`decision`](writing-comments-en.md#closing-a-blocking-thread-without-making-the-change):
readable by everyone, where the discussion took place, kept with the pull request.

## Recommended path

```text
assist  →  enforce on a pilot repository  →  rollout
```

1. **Start in `assist`**, the default. People get the toolbar, the pill and the badges;
   nothing is refused.
2. **Settle the rules while still in `assist`.** Adjust labels, severities, exemptions for
   bots and commands. A change applies at once to open pull requests, so this is the moment to
   see what the pill and the banner report.
3. **Meet the prerequisites before any repository moves to `enforce`:**
   - the [rollback procedure](#rolling-back) is written and the person who runs it is named,
     with the list of repositories that write their own `mode`;
   - the indicators that tell whether the pilot is ready (compliance rate, warning rate) can
     be computed. **They cannot yet:** the opt-in telemetry counts labels inserted through
     the extension and diagnostics shown, but no event counts the comments written or sent,
     so no rate has a denominator. Until it does, choose the pilot and write the procedure,
     but keep the pilot in `assist`.
4. **Switch one pilot repository to `enforce`**, with `{ "mode": "enforce" }` in its file.
5. **Roll out**, repository by repository or through the organisation's configuration.

Before the switch, check the cases that would otherwise surprise people:

- commands addressed to bots (`@dependabot rebase`, `/retest`) need `toolCommands`, or they
  are refused like any comment without a label;
- accounts that comment automatically need `exemptUsers`;
- on GitLab, the send guard does not apply yet, and people using GitLab's rich text editor
  get no assistance at all ([platforms](platforms-en.md)).

## Rolling back

Relaxing the mode lifts the blocking at the next send attempt, with no cache to wait for.
The order matters: a floor at `enforce` overrides everything below it, and a repository that
writes its own `mode` overrides the organisation's configuration:

1. the enterprise floor, if it imposes `enforce`;
2. the organisation's configuration, which covers every repository that does not write its
   own `mode`;
3. each repository that writes `"mode": "enforce"` in its own file. List them before the
   switch, not during the incident.

To check the rollback: on a test pull request, send a comment without a label. It must go out.

The operating procedures in full, in French: [`operations-fr.md`](../operations-fr.md).
