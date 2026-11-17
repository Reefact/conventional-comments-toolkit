# Publishing on Azure DevOps (`az`)

Companion of `SKILL.md`, section 9 (Mechanics). The PR of the skill is a pull request here. Use the authenticated Azure CLI with the `azure-devops` extension (`az extension add --name azure-devops`, then `az login`, or a PAT in `AZURE_DEVOPS_EXT_PAT`) or, when the session provides them, Azure DevOps tools with the same effect. `<orgurl>` is `https://dev.azure.com/<org>`, `<project>` the project name, `<repo>` the repository name or id, `<n>` the pull request number. Pass every body by file (`--in-file`), never inside the command line.

Azure DevOps has no batch: each comment goes live at once, as its own thread. Publish one at a time (section 9, Mechanics).

REST calls go through `az devops invoke`. Below, `<ado>` stands for `az devops invoke --area git --api-version 7.1 --org <orgurl>` and `<route>` for `project=<project> repositoryId=<repo> pullRequestId=<n>`.

## Never use

- `az repos pr set-vote`, whatever the vote (`wait-for-author` is the request-changes equivalent, `approve` the approval).
- `az repos pr update` (complete, abandon, auto-complete, title or description), `az repos pr create`.
- Careless markdown: `#<number>` links a work item and `@name` mentions and notifies. Write them only on purpose.

## Read, at the start of every pass

```text
az repos pr show --id <n> --org <orgurl>
az repos pr work-item list --id <n> --org <orgurl>
<ado> --resource pullRequestIterations --route-parameters <route> --http-method get
<ado> --resource pullRequestIterationChanges --route-parameters <route> iterationId=<iter> --http-method get
<ado> --resource pullRequestThreads --route-parameters <route> --http-method get
```

- The first gives `title`, `description` and `targetRefName` (the base).
- The iterations are the successive states of the PR, one per push. At the start of the pass, take the last one: `<iter>` is its `id`, and its `sourceRefCommit` and `commonRefCommit` are the head commit and the merge base you analyse. Note all three.
- The changes of iteration `<iter>` give each file's `changeTrackingId`, which an inline thread needs (see Publish).
- The second lists the linked work items, which play the part of closing keywords: read them (`az boards work-item show --id <id>`).
- The last lists the threads: `id`, `status` (`active`, `fixed`, `closed`, `wontFix`, `byDesign`, `pending`), `threadContext` (file and lines, absent for a general thread) and `comments[]` (`id`, `content`, `author`, `commentType`, `isDeleted`). Ignore the `system` comments.
- No endpoint returns a unified diff: in a clone, fetch both commits and run `git diff <commonRefCommit> <sourceRefCommit>`, those of iteration `<iter>`.

## Publish, one comment at a time

Inline comments first, then the recap, and `reviewed:` last. Create a thread for each comment:

```text
<ado> --resource pullRequestThreads --route-parameters <route> --http-method post --in-file thread.json
```

```json
{
  "comments": [
    { "parentCommentId": 0, "commentType": "text",
      "content": "issue (blocking): …\n\n[session:…]" }
  ],
  "status": "active",
  "threadContext": {
    "filePath": "/src/foo.ts",
    "rightFileStart": { "line": 42, "offset": 1 },
    "rightFileEnd": { "line": 42, "offset": 2 }
  },
  "pullRequestThreadContext": {
    "iterationContext": { "firstComparingIteration": 3, "secondComparingIteration": 3 },
    "changeTrackingId": 12
  }
}
```

- Keep the `id` of each thread the call returns.
- `pullRequestThreadContext` pins the thread to the state you analysed: `iterationContext` carries `<iter>` twice (3 in the example), and `changeTrackingId` is the file's in that iteration (12 in the example). Without it, the thread is placed against whichever iteration is current when it is created, and a push during the pass shifts it.
- Leave `threadContext` and `pullRequestThreadContext` out for a general comment (language defects in the title or description, cross-cutting findings, the recap, `reviewed:`).
- `status`: `active` for a finding. A PR policy may require every thread to be resolved before completion, so give `closed` to what needs no answer: `praise`, `note`, `thought`, `summary`, `reviewed`.
- `rightFileStart` and `rightFileEnd` locate a line of the new version (added or unchanged); `leftFileStart` and `leftFileEnd` locate a removed line of the old one. The path starts with `/`. A line outside the diff is refused or ends up unanchored: put that point in a general comment naming `path:line`.
- After publishing, re-read the threads: each inline thread must show `<iter>` in its `pullRequestThreadContext.iterationContext`. A thread anchored elsewhere cannot be moved: edit its comment to name `path:line` and the commit analysed, and say so in your report.

## Other operations

```text
<ado> --resource pullRequestThreadComments --route-parameters <route> threadId=<thread_id> --http-method post --in-file reply.json
<ado> --resource pullRequestThreadComments --route-parameters <route> threadId=<thread_id> commentId=<comment_id> --http-method patch --in-file new.json
<ado> --resource pullRequestThreads --route-parameters <route> threadId=<thread_id> --http-method patch --in-file resolve.json
```

- Reply: `{"parentCommentId": <id of the comment answered>, "commentType": "text", "content": "…"}`.
- Edit your own comment: `{"content": "…"}`.
- Resolve a thread: `{"status": "fixed"}`, for your own findings only (sections 6 and 8).
