# Setting up Conventional Comments enforcement on GitHub

French twin: [`github-setup-fr.md`](./github-setup-fr.md).

This is the end-to-end setup for objective **O3** — a pull request cannot be merged while a
blocking review thread is unresolved — on github.com, GitHub Enterprise Cloud (including
EMU) and GitHub Enterprise Server.

**There is nothing to host.** The verifier is a GitHub Action that runs inside the
repository it protects, authenticated by the `GITHUB_TOKEN` the runner hands it, and
publishes a check run named `conventional-comments`. No GitHub App to install, no webhook
to register, no secret to store, no database, no server. Setup is one configuration file,
two or three workflow files, and one branch rule.

The browser extension is a separate and optional component. It helps people *write*
conventional comments; it is bypassable by construction and is not what enforces anything.
See [`extension-setup-en.md`](./extension-setup-en.md).

---

## Do these in order

The order is not a style preference. Two of these steps, done in the wrong order, leave you
with either every PR blocked or enforcement silently switched off:

1. **Commit `.conventional-comments.json`** to the default branch, with a `mode` of `warn`
   or `enforce` **and** an `activation.activatedAt` date.
2. **Add both required workflows** — `conventional-comments.yml` (evaluates a PR when an
   event names it) **and** `conventional-comments-sweep.yml` (re-evaluates every open PR on
   a schedule). The sweep is not an extra: thread resolution fires no event, so without it a
   re-opened thread leaves a stale green check with no bound on how long it lasts.
   Then add `conventional-comments-forks.yml` as well if the repository accepts fork or
   Dependabot PRs.
3. **Open one test PR** and confirm the check appears.
4. **Only then, make the check required.**

Why it matters:

- In `off` and `assist` — and `assist` is the **product default** — the verifier publishes
  **no status at all**. A required check that nothing publishes blocks every PR, forever.
- With no `activation.activatedAt` resolved at any level, the verifier publishes `neutral`
  in every mode. GitHub counts `neutral` among the conclusions that **satisfy** a required
  check, so the gate would be green and enforcement would be off without anything saying so.
- The picker that adds a required check suggests names GitHub has recently seen on the
  repository. Having published once makes the name appear there instead of having to be
  typed from memory — and it confirms the workflow runs at all before you gate anything on
  it.

---

## Step 1 — repository configuration

Create `.conventional-comments.json` at the root of the **default branch**. The minimum
that makes enforcement real:

```json
{
  "version": 1,
  "mode": "warn",
  "activation": { "activatedAt": "2026-11-01T00:00:00Z" },
  "resolverOverrideGroup": ["alice,bob,carol"],
  "exemptUsers": ["dependabot[bot]", "github-actions[bot]"],
  "toolCommands": ["/*", "@dependabot", "@copilot", "@renovate"]
}
```

Start in `warn`. In that mode the verifier publishes a status that **never fails**, whose
body lists exactly what would fail under `enforce`. That is the dry run, rendered where the
team already looks, and it is how you calibrate `activatedAt` before you tighten.

Every key, with its defaults and bounds, is in
[`../.conventional-comments.example.json`](../.conventional-comments.example.json) — which
is an example, **not** the product defaults (those live in
`packages/core/src/config/defaults.ts`). The normative reference is §8 of
[`../specifications-fr.md`](../specifications-fr.md).

Four keys deserve a word here because getting them wrong is quiet rather than loud:

| Key | What to know |
|---|---|
| `activation.activatedAt` | A PR is in scope only if it was **created after** this date. Setting it *is* the act of activation. PRs opened before it get a green status reading "PR predates activation" — including for comments written long after. A long-lived release branch therefore stays out of scope until it closes. |
| `resolverOverrideGroup` | On GitHub this is a **list of accounts**: comma-separated logins, `"alice,bob,carol"`. A team slug (`org/tech-leads`) **does not work** — resolving one needs the organization *Members* permission, which `GITHUB_TOKEN` does not have. Leave it empty and both emergency valves are dead at once: no `decision` reply, no PR exemption, and a thread whose author is on holiday blocks the PR with no way out. |
| `toolCommands` | Empty by default. Without `"/*"` and the bot handles, `/rebase` and `@dependabot merge` are ordinary comments — and under `enforce` you can no longer re-trigger a bot. The list in the example file is a **recommendation**, not a default; on Enterprise Server, check that none of those handles is a human account of yours before copying it. |
| `overrideLabel` | Default `cc-override`. Applying it exempts the whole PR. The right to apply it is checked **after the fact** against `resolverOverrideGroup`; GitHub cannot restrict who adds a label. |

### How the file is discovered

The Action reads `GET /repos/{owner}/{repo}/contents/.conventional-comments.json` with no
`ref`, which is the **default branch**. Three outcomes, and they are not the same thing:

- **200** — the file is used.
- **404** — the file is absent. That is legal: the organization configuration and the
  product defaults decide. No failure.
- **anything else** — the file is *unreadable*. That is not absence: the verifier cannot
  evaluate, and the check is published **failing** (§6.4). It never publishes `neutral`
  there, precisely because `neutral` would let the merge through.

There is no cache. The verifier re-reads the configuration on every run; it keeps no state
between runs and has nowhere to put one.

---

## Step 2 — the two workflows

Copy **both** of these into `.github/workflows/` of the repository you want to protect.
They carry their own reasoning in comments; what follows is the part you have to decide on.

| File | What it does |
|---|---|
| [`conventional-comments.yml`](./examples/conventional-comments.yml) | Evaluates one PR whenever an event names it — a push, a review, a comment, a label, the draft toggle. |
| [`conventional-comments-sweep.yml`](./examples/conventional-comments-sweep.yml) | Re-evaluates every open PR on a schedule. **Required, not optional**: thread resolution fires no event, so this is the only thing that catches an un-resolved thread. |

**Why the sweep is a separate file, and must stay one.** Above 256 open PRs its list is
split into slices, and the slice index comes from `GITHUB_RUN_NUMBER` — a counter of runs of
*the workflow that hosts it*. Sharing a file with the event triggers would make that counter
advance on every comment, review and push as well, by a step that is often constant: with
512 open PRs (two slices) and one event-driven run between two sweeps, it advances by 2,
`index % 2` never changes, and the second slice is never evaluated. Merging the two files
would silently reopen the gap the slicing exists to close.

```yaml
- uses: Reefact/conventional-comments-toolkit/packages/action@v1
```

`uses:` reads the Action repository's tree at the ref you name, so there is **no
`actions/checkout` step** — checking out your own repository would not bring the Action,
and the verifier never checks out the PR under review. `v1` is the moving tag posted by the
first release carrying the Action; pin a commit SHA instead for a hardened install.

### Triggers, and the one that does not exist

| Trigger | Why |
|---|---|
| `pull_request_target` (`opened`, `synchronize`, `reopened`, `ready_for_review`, `converted_to_draft`, `labeled`, `unlabeled`) | The only PR-event trigger whose token can publish on a **fork** PR. It is a security trap for any workflow that builds or runs the proposed code; this one does neither, and that must stay true. **Both directions of the draft toggle are listed**: draft state changes the verdict (a draft gets an informative status, never a failing one), so listening only to `ready_for_review` leaves a PR that was failing red while it sits in draft. |
| `pull_request_review`, `pull_request_review_comment` | A review or a review comment changes the verdict. |
| `issue_comment` | The general conversation zone is validated too (§4.1). |
| `schedule` (every 30 min) | **In the sweep file**, not this one. Bounds how stale a status can get; shipped, not offered as an option — see below. |
| `workflow_dispatch` | **In the sweep file** too. Manual replay designates no PR, so it goes through the enumerate-and-dispatch path, not the single-PR job. |

**`pull_request_review_thread` is not in that table, and that is the whole problem.** It
exists as a webhook — and it is the only event that reports a thread being resolved or
unresolved — but it is **not a workflow trigger**. The consequence is asymmetric:

- resolving the last blocking thread does not turn the check green by itself. Annoying,
  never dangerous: the PR stays blocked when it could pass.
- **un-resolving** a thread does not turn it red again. That is the dangerous direction, and
  it has to be closed with your eyes open.

The scheduled run bounds that window to its cron interval. If you want it closed completely,
GitHub's native *Require conversation resolution before merging* does it — at the price of
requiring **every** thread resolved, blocking and non-blocking alike. Simply living with the
gap is not an option under `enforce`: it is giving up the objective.

### Token permissions

Declared in the workflow, not granted anywhere else:

| Permission | What it is for |
|---|---|
| `checks: write` | Publish the check run. |
| `pull-requests: read` | Threads, comments, labels, draft state. |
| `contents: read` | `.conventional-comments.json`. |
| `pull-requests: write` | **Required as soon as the repository uses the exemption label.** The reset has to be able to remove it. This is normal operation, not a fallback. |

### Concurrency

The workflow declares a concurrency group **per PR**, with `cancel-in-progress: true`.
Without it GitHub runs bursts in parallel and the last publication wins rather than the
freshest read.

A concurrency group is **repository-scoped, not workflow-scoped**: two different workflows
declaring the same `group` serialize against each other. That is what makes the
serialization unit the PR whatever the trigger — and it is also what makes it easy to break,
since a group name that drifts by one character reopens the race without a word.

The scheduled path therefore has two stages: a job that **enumerates** open PRs and
publishes nothing, then **one evaluation job per PR** declaring its `concurrency` at job
level — the only place the `matrix` context exists — with exactly the group the
event-driven job uses. The enumeration job keeps a group of its own and does **not**
cancel in progress: what GitHub cancels in that group is the *pending* run in favour of the
newest one, while the running one finishes. The opposite would endlessly re-evaluate the
first PRs of the enumeration and never the last.

---

## Step 3 — fork and Dependabot PRs

**If the repository accepts fork PRs and you intend to make the check required, this step is
not optional.** Copy
[`examples/conventional-comments-forks.yml`](./examples/conventional-comments-forks.yml)
into `.github/workflows/` as well — and note that **a `workflow_run` workflow only fires
from the default branch**.

The reason is a complete bypass, not an inconvenience. On a PR from a fork the
`GITHUB_TOKEN` is **read-only — including on `pull_request_review` and
`pull_request_review_comment`**. The restriction is well known for `pull_request`; it holds
for the review events too. Such a PR does get a status, published by `pull_request_target`
when it opens and on every push, but that status **stops being refreshed the moment a
reviewer writes**. The PR then receives a blocking `issue:`, the review event runs read-only
and cannot replace the green, and the green satisfies the required check.

**Dependabot PRs follow the same rules as fork PRs**, even on a repository that accepts no
forks at all.

A repository setting does lift the token restriction — *Send write tokens to workflows from
pull requests* — but it lifts it for **every** workflow, including the ones that build the
proposed code. It is not a checkbox for installing a verifier.

A repository that does not want the companion workflow must take the other branch of the
alternative and write it down: **those PRs are outside the scope of enforcement.**

---

## Step 4 — make the check required

Publishing a verdict is all the verifier does. What blocks the merge is a branch protection
rule or a ruleset, configured by you.

1. Open a test PR and let the check publish once, so the name is offered by the picker
   rather than typed from memory.
2. **Settings → Rules → Rulesets** (or *Branches → Branch protection rules*), targeting your
   default branch.
3. Enable **Require status checks to pass before merging** and add
   **`conventional-comments`**. If you changed the Action's `check-name` input, add that name
   instead — changing it after the fact leaves branch protection waiting on a name nothing
   publishes any more.
4. Enable **Do not allow bypassing the above settings**. Without it, administrators and
   declared bypass actors merge anyway, and O3 is not satisfied for them.
5. Optionally enable **Require conversation resolution before merging**, which closes the
   un-resolution window described in step 2 at the price of requiring every thread resolved.

Once you have run in `warn` long enough to know the size of the job, flip `mode` to
`enforce` in `.conventional-comments.json`.

### Rolling back

`warn` is the rollback mode, **not** `off`. In `warn` the verifier keeps publishing a status
that never fails, which unblocks every PR immediately **without removing branch protection**.
`assist` and `off` publish nothing: going there from `enforce` requires removing the
protection **first**, otherwise the missing status blocks every PR.

---

## How the check is created and updated

Each run publishes one check run named `conventional-comments` through
`POST /repos/{owner}/{repo}/check-runs`, with `status: completed` and a conclusion:

| Verdict | Conclusion | When |
|---|---|---|
| compliant | `success` | or: draft PR, exempted PR, PR out of activation scope |
| non-compliant | `failure` | `enforce` only, and on any unreadable configuration (§6.4) |
| not evaluated | `neutral` | undated activation, invalid configuration — in any mode |

`neutral` **satisfies** a required check on GitHub. That is why an unreadable read publishes
`failure` and never `neutral`.

The head SHA is re-read **just before** publishing, so the status lands on what the PR is at
the moment it is judged, not at the moment the run started. There is no deduplication: a run
publishes, every time. Re-publishing an identical status costs one API call, which is less
than the memory it would take to avoid it.

The check run's **title** carries a single machine-readable line (§6.3.1) that the browser
extension reads off the page without any API call:

```
cc/1 state=failure draft=0 exempt=0 mode=enforce activated=2026-09-01T00:00:00Z core=1.4.0 cfg=9f3a1c7e t=3 c=7 w=12
```

The **body** carries the human output: one headline with three counts, every unresolved
blocking thread with a permalink, every format diagnostic with its code and suggested fix,
and any notices — an ignored repository key, a refused resolution, a removed exemption
label.

**The re-run button on a check run published by an Action does nothing.** GitHub's
anti-recursion guard means `check_run` `rerequested` triggers no workflow when the check
suite was created by Actions. Re-run the **workflow** instead, from the Actions tab, or use
the `workflow_dispatch` trigger.

The verifier never posts a comment on the PR. Everything is in the check output.

---

## Where the configuration comes from

Three levels, highest priority first, each one bounded by the one above:

1. `.conventional-comments.json` on the repository's default branch.
2. **Organization configuration**, served from a URL.
3. Product defaults.

Above all three sits the **floor** — a document served from a URL the organization controls,
passed to the Action as the `floor-url` input:

```yaml
- uses: Reefact/conventional-comments-toolkit/packages/action@v1
  with:
    floor-url: https://internal.example/cc/floor.json
```

A floor sets a minimum mode and a set of rules no lower level may loosen; a repository may
always go stricter. It also carries `configUrl`, which is **the only place** the organization
configuration URL may come from — a `configUrl` written in the repository file is ignored and
the fact is reported, because otherwise a repository would nominate the very configuration
meant to constrain it.

With no `floor-url`, the floor is `{"minimumMode": "off"}` and imposes nothing. That is the
standard public deployment. A `floor-url` that is set but unreachable fails the check, like
any impossible read.

**What the floor protects, and what it does not.** It puts the configuration the verifier
applies out of the repository's reach. It does not protect the verifier itself: the workflow
is code versioned in the protected repository, and anyone who can push there can replace it
with a workflow that publishes an unconditional success under the same check name. The
guarantee here holds against forgetting, distraction and ordinary circumvention; it does not
hold against someone with push rights who decides to disarm it. That was already true of the
companion server, which read the same versioned configuration — what changes is that the
verifier's code now sits on the modifiable side too.

An organization that wants to close that has *Require workflows to pass before merging*, in
an organization or enterprise ruleset, where the workflow file lives in a repository the
organization controls. It does **not** replace the one described here — it only supports
`pull_request`, `pull_request_target` and `merge_group`, not the review events this verifier
depends on to refresh — and it is a Team / Enterprise feature. Combining the two is the
closest you get today: the organization ruleset on `pull_request_target` for the anchor, the
repository workflow for the review events, knowing the second stays editable.

---

## Plans and hosting

| | github.com | Enterprise Cloud / EMU | Enterprise Server |
|---|---|---|---|
| The Action | `uses: Reefact/conventional-comments-toolkit/packages/action@v1` | same | the Action must be reachable from the instance: enable GitHub Connect for Actions, or mirror this repository internally and point `uses:` at the mirror |
| API base | automatic | automatic | automatic — the Action reads `GITHUB_API_URL`, which the runner sets per instance |
| Actions runners | hosted | hosted | **self-hosted runners must exist and be enabled**; no runners means no verifier |
| Repository rulesets | yes | yes | yes |
| Organization / enterprise rulesets, *Require workflows to pass* | Team and Enterprise only | yes | yes |
| Data residency (`*.ghe.com`) | — | its own host and API endpoints; nothing to configure for the Action, which reads them from the runner | — |

On Enterprise Server, also check that the recommended `toolCommands` entries make sense for
your instance: `@codex` or `@bors` may be an internal human account rather than the cloud
service, in which case copying the recommended list would silently exempt their comments.

---

## Limits, written down rather than discovered

- **Merge queues are out of scope.** A merge queue creates a merge-group SHA and waits for
  the required checks on *that* SHA. The verifier does not trigger there, so the check never
  arrives. **A repository that uses a merge queue must not declare this check required** until
  that case is designed.
- **Above 256 open PRs the sweep slows down rather than covering everything at once.** A
  matrix generates at most 256 jobs per workflow run, so `dispatch` mode bounds its list and
  rotates the slice from one run to the next. Every open PR is then re-evaluated at most
  every `cron interval × ceil(total / 256)` — with the shipped cron, 30 min × that quotient.
  The enumeration job's `total` output says how many open PRs there are, and its log says so
  whenever it truncates. The bound is **approximate** once the list moves between runs:
  opening or closing a PR shifts the slice boundaries, which can make a PR miss a turn,
  never drop out of the cycle. A repository of that size wanting a tighter bound shortens
  the cron, or narrows the sweep by label or base branch.
- **Un-resolving a thread does not turn the check red** until the next scheduled run or the
  next qualifying event. See step 2.
- **Whoever can push to the repository can replace the workflow.** See the floor section.
- **The check-run re-run button does nothing.** Re-run the workflow.
- **Long-lived PRs opened before `activatedAt` stay out of scope** until they close, including
  for comments written well after activation.
- **Reviewers who wrote a non-compliant comment are not notified.** They are named in the
  check output with a permalink; it is on the PR author to ping them.

---

## Minimal end-to-end example

A repository `acme/widgets`, no organization policy, starting from nothing.

**1. Configuration** — commit to the default branch:

```json
{
  "version": 1,
  "mode": "warn",
  "activation": { "activatedAt": "2026-11-01T00:00:00Z" },
  "resolverOverrideGroup": ["alice,bob"],
  "exemptUsers": ["dependabot[bot]", "github-actions[bot]"],
  "toolCommands": ["/*", "@dependabot", "@renovate"]
}
```

**2. Workflows** — copy `docs/examples/conventional-comments.yml` and
`docs/examples/conventional-comments-sweep.yml` into `.github/workflows/` under the same
names. `acme/widgets` accepts Dependabot PRs, so also copy
`docs/examples/conventional-comments-forks.yml`. Commit all three to the default branch.

**3. Check it runs** — open a PR, write a review comment `issue: this allocates in the hot
loop`, and confirm a `conventional-comments` check appears with a green conclusion and a body
listing one unresolved blocking thread. (`warn` never fails.)

**4. Measure** — leave it in `warn` for two to four weeks. The check bodies tell you how much
of the existing review habit is non-compliant, and whether `activatedAt` is set sensibly.

**5. Enforce** — change `"mode": "warn"` to `"mode": "enforce"` and commit. Confirm on a test
PR that an unresolved `issue:` now produces a red check.

**6. Require it** — Settings → Rules → Rulesets → your default branch → *Require status checks
to pass* → add `conventional-comments` → *Do not allow bypassing the above settings*.

Done. Total: three workflow files, one config, one rule, nothing hosted.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No check at all on any PR | `mode` is `assist` (the default) or `off` | Set `mode` to `warn` or `enforce` |
| Every PR blocked, no check running | The check was made required while the mode publishes nothing | Set `mode` to `warn`, or remove the requirement |
| Check is always `neutral` | No `activation.activatedAt` at any level | Add it to `.conventional-comments.json` |
| Check is green but the PR has unresolved blocking threads | PR created before `activatedAt`, or draft, or exempted — the body says which | Expected; read the body |
| `conventional-comments` is not offered by the required-checks picker | GitHub has not seen it on this repository yet | Open a test PR and let it publish once |
| Check went green and stays green after a reviewer wrote on a fork PR | The fork companion workflow is missing, or not on the default branch | Step 3 |
| Check fails with "configuration unreadable" | A `floor-url` or `configUrl` is unreachable, or the Contents API returned something other than 200/404 | Check the URL; a *missing* repository file is not this error |
| Nobody can resolve a thread whose author is away | `resolverOverrideGroup` is empty | Set it — it is a prerequisite for `enforce` |
| A team slug in `resolverOverrideGroup` authorizes nobody | Team slugs do not work on GitHub | Use comma-separated logins |
| Re-running the check from the PR page does nothing | Platform anti-recursion guard | Re-run the workflow from the Actions tab |
| Merge queue never drains | The check is required and never arrives on the merge-group SHA | Do not require this check with a merge queue |
| A PR seems re-evaluated less often than the cron says | More than 256 open PRs: the slice rotates, so a full cycle takes `cron × ceil(total / 256)` | Expected. Shorten the cron, or narrow the sweep (by label, by base branch) |
