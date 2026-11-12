# Platforms

**Languages:** English (this file) | [Français](platforms-fr.md)

What the extension does on each platform, and what it does not do yet. One extension carries
the three adapters; each is active only on the domains you allowed.

## At a glance

| | GitHub | Azure DevOps | GitLab |
|---|:---:|:---:|:---:|
| Toolbar, keyboard input, status pill | Yes | Yes | Yes, in the Markdown editor only |
| Badges on published comments | Yes | Yes | Yes |
| Banner of unresolved blocking threads | Yes | Yes | Yes |
| Thread filter | Yes | Yes | Yes, except on the *Changes* tab |
| Reads the repository's `.conventional-comments.json` | Yes | Yes | **Not yet** |
| Send guard (`enforce`) | Yes | Yes | **No** |
| A general comment can open a blocking thread | No | Yes | Yes, when published with *Start thread* |
| Body of a review submitted as a whole | Yes | Does not exist | Yes |
| Suggestion block read as a `suggestion` | Yes | Yes | Not yet |

## Domains

| Offer | Domain | In the settings page |
|---|---|---|
| GitHub.com | `github.com` | *Known domains*, one click |
| GitHub Enterprise Cloud with data residency | your own subdomain of `ghe.com` | *Other domains*: type it, choose GitHub |
| GitHub Enterprise Server | your own domain | *Other domains*: type it, choose GitHub |
| Azure DevOps Services | `dev.azure.com` | *Known domains*, one click |
| Azure DevOps Services, legacy URL | `<organisation>.visualstudio.com` | *Other domains*: type it, choose Azure DevOps |
| Azure DevOps Server | your own domain | *Other domains*: type it, choose Azure DevOps |
| GitLab.com | `gitlab.com` | *Known domains*, one click |
| GitLab Self-Managed, GitLab Dedicated | your own domain | *Other domains*: type it, choose GitLab. **Not measured.** |

No domain is granted at installation, `github.com` included. You type your own subdomain
rather than allowing all of `ghe.com` or `visualstudio.com`: the extension only gets the one
host you use.

## GitHub

- Both pull request pages are supported: the classic *Conversation* page and the newer
  *Overview*, and *Files changed*.
- The general conversation of a pull request has no "resolve" button, so a blocking label
  written there cannot open a blocking thread. The pill says so with `W-NOT-BLOCKABLE`.
- Submitting a review validates its body (`scope.validateReviewSummary`); approving with no
  text stays possible.
- A thread is resolved when the conversation is marked *Resolved*.
- The repository file is read through the page's own session: private repositories work for
  anyone signed in with access to them.

## Azure DevOps

- Every send button goes through validation: *Comment*, *Reply*, *Reply & resolve*, *Update*,
  *Update & resolve*, *Reply & reactivate*.
- A general comment is a thread with a status, like a comment on a line: a blocking label
  there counts among the blocking threads.
- A thread counts as unresolved while its status is *Active* or *Pending*, or when it has
  none. Any other status counts as resolved.
- There is no review body: `scope.validateReviewSummary` is ignored.
- Pipeline comments are posted by `Project Collection Build Service (<Org>)` or
  `<Project> Build Service (<Org>)`: those are the names to put in `exemptUsers`.

## GitLab

Measured on gitlab.com only.

- **The extension does not read the repository file on GitLab yet.** It applies the product
  defaults, shows *Configuration unread*, and therefore **never blocks a send** there, whatever
  the mode.
- **Only the Markdown editor is handled.** GitLab lets each person switch to a rich text
  editor and remembers the choice. In that editor the extension stays out entirely: no
  toolbar, no validation. Switch back with *Switch to plain text editing* under the field.
- A general comment published with *Start thread* is a resolvable thread and can be blocking.
  Published with *Comment*, it is a plain note: a blocking label there is not counted, and no
  warning says so.
- On the *Changes* tab, the thread filter is not shown, and resolved threads are not in the
  page for the extension to read.
- GitLab Self-Managed and GitLab Dedicated have not been measured.

## Browsers

| Browser | Version |
|---|---|
| Chrome, Edge, other Chromium browsers | The three latest major versions |
| Firefox | 128 or later |
