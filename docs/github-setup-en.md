# Setting up Conventional Comments enforcement on GitHub

This guide takes a repository from nothing to *a pull request cannot be merged while a
blocking review thread is unresolved*.

**There is no server to deploy.** The check runs as a GitHub Action inside the repository
it protects, authenticated by the token the runner already hands it. Nothing to host,
nothing to expose on the internet, no secret to store, no database.

If you were expecting to deploy a companion service: that path still exists, but only for
Azure DevOps, which has no free equivalent of "review trigger plus write token". On GitHub
it is not needed and is no longer offered.

---

## 1. The five-minute version

1. Copy [`examples/conventional-comments.yml`](./examples/conventional-comments.yml) to
   `.github/workflows/conventional-comments.yml` and merge it **into your default branch**.
2. Add `.conventional-comments.json` to the repository root:

   ```json
   {
     "$schema": "https://conventional-comments-toolkit.dev/schema/v1.json",
     "version": 1,
     "mode": "warn",
     "activation": { "activatedAt": "2026-09-07T00:00:00Z" }
   }
   ```

   A fuller, commented example lives in
   [`.conventional-comments.example.json`](../.conventional-comments.example.json).

3. Open a pull request, write a review comment, and watch the **conventional-comments**
   check appear on it.
4. When the team is ready, switch `"mode"` to `"enforce"` and make the check **required**
   (§6 below).

Everything after this point is the detail behind those four steps, and the handful of
GitHub behaviours that will otherwise surprise you.

---

## 2. What you are installing

| Piece | Where it lives | What it does |
|---|---|---|
| The workflow | `.github/workflows/conventional-comments.yml` in your repository | says *when* to evaluate |
| The action | `Reefact/conventional-comments-toolkit@v1`, fetched by the runner | reads the pull request, evaluates it, publishes the check |
| The configuration | `.conventional-comments.json` at your repository root | says *what* the rules are |
| The required check | a repository ruleset or branch protection rule | is what actually blocks the merge |

The last row is the one people forget. **The action publishes a verdict; it does not block
anything.** Blocking is GitHub's job, and it only happens once you have told GitHub that
the `conventional-comments` check is required.

---

## 3. Token permissions

The workflow declares them; you do not create a GitHub App, and you do not mint a personal
access token.

```yaml
permissions:
  checks: write        # publish the check run
  pull-requests: read  # review threads, comments, labels, draft state
  contents: read       # read .conventional-comments.json
```

Add `pull-requests: write` **only** if your repository uses the pull-request exemption
label (`cc-override` by default). Without it the action can still evaluate and publish; it
just logs a warning if it ever needs to remove a label. If you do add it, it *replaces*
the `pull-requests: read` line.

If your organization or repository sets the default workflow permissions to read-only, the
`permissions:` block in the workflow overrides that for this workflow — no organization
setting change is required.

---

## 4. Which events wake it up

| Trigger | Covers |
|---|---|
| `pull_request_target` | opened, reopened, pushed to, draft toggled, labelled, edited |
| `pull_request_review` | a review is submitted, edited or dismissed |
| `pull_request_review_comment` | a diff comment is created, edited or deleted |
| `issue_comment` | a conversation comment is created, edited or deleted |
| `workflow_dispatch` | you re-run it by hand, for one pull request or all of them |
| `schedule` *(optional)* | periodic reconciliation — see §7 |

Two notes worth reading before you edit that list.

**`pull_request_target`, not `pull_request`.** On a pull request opened from a fork,
`pull_request` gives the workflow a read-only token, which cannot publish a check.
`pull_request_target` runs in the base repository's context and can. That trigger is a
well-known security trap **when a workflow builds or runs the proposed code**, because it
hands that code a write token and your secrets. This one never checks the pull request
out and never executes anything from it — it reads API data and writes a check run. Keep
it that way: do not add `actions/checkout` to this workflow.

**The workflow file must be on your default branch.** Every trigger above reads the
workflow from the default branch, not from the pull request. The pull request that *adds*
the workflow is therefore not checked by it. The next one is.

---

## 5. How the check is created and updated

Each run reads the current state of the pull request — review threads and their
resolved/unresolved state via GraphQL, comments, labels, draft flag, head SHA, and your
configuration file — evaluates it through `@cct/core`, and publishes a check run named
`conventional-comments` on the head commit.

The check run carries three things:

- **its conclusion** — `success`, `failure`, or `neutral`. `neutral` satisfies a required
  check, which is how a "could not evaluate" state avoids blocking anyone permanently;
- **a one-line title**, the `cc/1` machine line, which the browser extension reads straight
  off the pull request page;
- **a Markdown body** listing every unresolved blocking thread and every format diagnostic,
  each one a link.

It also carries, in a hidden HTML comment, the small amount of state that cannot be
recomputed from GitHub: which threads have already been seen as blocking, the verdict at
first sight of each blocking root, and the configuration pinned to this pull request. The
next run reads it back from the check run it published. **This tool stores nothing of its
own, anywhere.**

Why that state has to exist at all: without it, a reviewer's `issue:` could be neutralised
by editing it to `note:`, and the thread would stop blocking without anyone resolving it.
The rule that closes this needs to remember what the comment used to say, and no GitHub API
returns a comment's previous body.

---

## 6. Making the check required

This is the step that turns a verdict into a merge block.

**With a repository ruleset** (recommended — rulesets can be defined once at the
organization level and applied to many repositories):

1. *Settings → Rules → Rulesets → New branch ruleset*.
2. Target the branches you protect (`main`, or a `release/*` pattern).
3. Enable **Require status checks to pass**.
4. Add `conventional-comments` to the list. If it does not appear in the picker, run the
   workflow once on any pull request first — GitHub only offers checks it has already seen.
5. Consider enabling **Do not allow bypassing the above settings**, without which
   repository administrators are not covered.

**With a classic branch protection rule**: *Settings → Branches → Add rule → Require status
checks to pass before merging*, then the same check name.

Optionally, also enable **Require conversation resolution before merging**. It is native,
free, and demands that *every* thread be resolved rather than only the blocking ones — a
blunter rule than this tool's, but it closes the gap described in §7 completely.

---

## 7. The one GitHub limitation you must decide about

**Resolving a review thread fires no workflow event.** The `pull_request_review_thread`
event (`resolved` / `unresolved`) exists as a webhook, but it is not among the events that
can trigger a workflow — and it is the only event that reports a resolution.

The consequence is asymmetric, which is what makes it liveable:

- **Resolving** the last blocking thread does not turn the check green on its own. It stays
  **red** until the next trigger — any comment, any push, or a manual re-run. Annoying;
  never dangerous. The pull request stays blocked when it could pass.
- **Un-resolving** a blocking thread does not turn the check red again. It stays **green**
  until the next trigger. This is a real window, and it is the only place where this setup
  is less strict than a webhook-driven service.

Pick one of three answers, deliberately:

1. **Do nothing.** Reasonable if your threat model does not include "a reviewer un-resolves
   a thread without writing anything, and someone merges before the next trigger".
2. **Turn on the scheduled reconciliation** — uncomment the `schedule:` block in the
   workflow. It bounds the window to whatever interval you choose. Note that GitHub
   disables scheduled workflows in a *public* repository after 60 days without activity.
3. **Enable "Require conversation resolution before merging"** (§6). Closes the window
   completely, at the price of requiring every thread to be resolved, not just blocking ones.

There are two smaller limitations, listed here so they do not surprise you later:

- **The check run's own re-run button does nothing.** GitHub does not deliver
  `check_run: rerequested` for check suites created by GitHub Actions — that is its
  anti-recursion guard. Re-run the **workflow** instead, from the Actions tab or from the
  job's line in the pull request; or use *Run workflow* with a pull request number.
- **Fork pull requests get a status, but not a refresh on review comments.** See below.

---

## 8. Repositories that accept pull requests from forks

On a pull request from a fork, GitHub gives the `GITHUB_TOKEN` read-only permissions. This
is well known for `pull_request`; it is also documented for `pull_request_review` and
`pull_request_review_comment`, which is the part that surprises people.

So on those pull requests:

- a status **is** published — `pull_request_target` handles opening, every push, label
  changes and draft transitions, and those runs do have a write token;
- what is missing is the **refresh on review activity**: a blocking `issue:` posted by a
  reviewer after the last push will not turn the check red.

If your repository accepts fork pull requests and you want the block to apply to them, add
[`examples/conventional-comments-forks.yml`](./examples/conventional-comments-forks.yml)
next to the main workflow. It uses `workflow_run`, which runs in the base repository's
context with a write token, and reconciles the open pull requests.

If every pull request comes from a branch in the repository itself — the common case
inside a company — you do not need that file.

---

## 9. Where the configuration comes from

Three levels, merged in this order, each one able to *restrict* what the previous allows:

1. **Product defaults** — what you get with no file at all.
2. **Organization document** — an optional JSON document at a URL your organization
   controls, named by `configUrl` in the floor document (below).
3. **Repository file** — `.conventional-comments.json` at the root of the default branch,
   read through the repository contents API with the workflow's own token. A private
   repository needs no extra permission: `contents: read` covers it.

A missing repository file is a normal situation, not an error: the defaults apply, and the
default mode (`assist`) publishes no status at all.

**The floor** (`floor-url`) is the enterprise guarantee: a document that sets a minimum
that repositories cannot go below. It must be served from somewhere the repository cannot
edit. **A workflow file living in the repository it protects is not a floor channel** — a
repository that can edit its workflow can edit the floor that workflow points at, which
makes it a default, not a floor. Use an organization-level ruleset that requires a workflow
defined in an administration repository, or a URL your organization controls, or both.

The most useful keys to start with:

| Key | What it does |
|---|---|
| `mode` | `off`, `assist`, `warn`, `enforce` — see the adoption path below |
| `activation.activatedAt` | pull requests created before this date are out of scope and always pass |
| `formatSeverity` | `warn` (default) or `error` — whether malformed comments fail the check |
| `resolverOverrideGroup` | `["org/team-slug"]`, who may close a blocking thread on the author's behalf |
| `overrideLabel` | the pull-request exemption label, `cc-override` by default |

`server.*` keys describe a hosted service and are **ignored** here, except
`server.reconcileIntervalSeconds` if you enable the scheduled reconciliation.

---

## 10. The adoption path

Do not start at `enforce`. The modes exist to be climbed:

| Mode | What the check does |
|---|---|
| `off` | publishes nothing |
| `assist` | publishes nothing — the browser extension still helps people write comments |
| `warn` | publishes a status that is **never red**, listing what would fail |
| `enforce` | publishes green or red per the rules |

`warn` is also the way **back**. If `enforce` turns out to be too much, switch to `warn`
rather than to `off` or `assist`: those publish nothing, and a required check that never
arrives blocks every pull request. For the same reason, **disabling the workflow is not a
rollback** — it is the fastest way to block your whole repository. Switch to `warn` first;
remove the required check before you remove the workflow.

Before switching to `enforce`, settle these:

- **`resolverOverrideGroup` is set.** Without a named group, neither escape hatch works —
  no `decision:` replies, no pull-request exemptions — and a blocking thread whose author is
  on holiday blocks the pull request with no way out.
- **Someone owns the rollback**, and knows it is "switch to `warn`", not "disable the workflow".
- **You have chosen your answer to §7**, including "do nothing".
- **The fork companion is in place**, if you accept fork pull requests.

---

## 11. GitHub plans and hosting

| | Works | Notes |
|---|---|---|
| **github.com**, public repository | yes | Actions minutes are free; scheduled workflows are disabled after 60 days of inactivity |
| **github.com**, private repository | yes | uses your Actions minutes |
| **GitHub Enterprise Cloud**, incl. EMU | yes | rulesets are available at the organization level, which is the easiest way to roll this out widely |
| **GitHub Enterprise Server** | see note | GHES runs Actions and exposes the same APIs, and the action reads its instance from `GITHUB_API_URL`, so no extra configuration is needed. Whether *your* GHES version supports every trigger used here — `pull_request_target` in particular — **must be checked on your instance before you rely on it**. This document does not assert a minimum version, because that depends on what you have installed. |

Self-hosted runners work; the action needs Node 20 and outbound access to your GitHub
instance's API, nothing else.

---

## 12. Minimal end-to-end example

Starting from a repository with nothing.

**Step 1 — the workflow.** On a branch, create
`.github/workflows/conventional-comments.yml` with the contents of
[`examples/conventional-comments.yml`](./examples/conventional-comments.yml). Merge it to
your default branch. (It cannot check its own pull request; that is expected.)

**Step 2 — the configuration.** Create `.conventional-comments.json` at the repository root:

```json
{
  "$schema": "https://conventional-comments-toolkit.dev/schema/v1.json",
  "version": 1,
  "mode": "warn",
  "activation": { "activatedAt": "2026-09-07T00:00:00Z" },
  "resolverOverrideGroup": ["acme/reviewers"]
}
```

Set `activatedAt` to now: pull requests opened before it stay out of scope and always pass,
so turning the tool on does not light up the ones already in flight.

**Step 3 — see it work.** Open a pull request. On a changed line, leave a review comment:

```
issue: this name does not say what the function does

`process` could be anything. `normalizeAddress` would.
```

Within a minute the **conventional-comments** check appears, still green (`warn` never
fails), with a body naming your thread as an unresolved blocking thread.

**Step 4 — see it block.** Change `"mode"` to `"enforce"` and merge that change. Push any
commit to your pull request to trigger a fresh evaluation. The check goes red, and the
merge button is disabled once you have made it required (§6).

**Step 5 — see it clear.** Resolve the thread — as the person who wrote it. The check does
not move on its own (§7): push a commit, add a comment, or run *Actions → Conventional
Comments → Run workflow* with your pull request number. It goes green.

**Step 6 — try the escape hatch.** Open a blocking thread and, instead of resolving it,
reply in the thread:

```
decision: out of scope for this pull request, tracked as PROJ-142

The point is real, the author is away, and the fix has to ship today.
```

A member of `resolverOverrideGroup` can now resolve the thread, and the check accepts it —
with the reason recorded in the pull request, where the next reader will find it.

---

## 13. When it does not work

| Symptom | Cause |
|---|---|
| No check appears at all | mode is `off` or `assist` (they publish nothing by design); or the workflow is not on the default branch yet |
| No check on pull requests from forks | expected on review events — see §8 |
| The check is red but the thread it names is resolved | the resolution fired no event — see §7; re-run the workflow |
| `conventional-comments` is not in the required-checks picker | run the workflow once; GitHub only lists checks it has seen |
| The run fails with an HTTP 403 on the check run | `checks: write` is missing from the workflow's `permissions:` |
| Every pull request is blocked and no check ever arrives | a required check is set but the workflow is disabled or failing — this is the trap described in §10 |
| The check is `neutral` with "config" in the summary | your `.conventional-comments.json` is invalid or vanished; the body names the offending line |

The run log names what it read and what it published, one line per pull request.

---

## See also

- [`github-setup-fr.md`](./github-setup-fr.md) — the same guide, in French.
- [`extension-setup-en.md`](./extension-setup-en.md) — the browser extension, which helps
  people write conforming comments in the first place. It is independent: this check works
  whether or not anyone has the extension installed, which is exactly the point.
- `specifications-fr.md` §6.4.1 and Annexe A.8 — the normative rules behind this document.
