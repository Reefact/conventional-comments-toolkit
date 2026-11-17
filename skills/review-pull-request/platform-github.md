# Publishing on GitHub (`gh`)

Companion of `SKILL.md`, section 9 (Mechanics). Use the authenticated `gh` CLI or, when the session provides them, GitHub tools with the same effect. `<owner>`, `<repo>` and `<n>` stand for the repository and the pull request number; outside a clone of the repository, add `--repo <owner>/<repo>` to the `gh pr` commands. Pass every comment body by file (`--input`, `--body-file`, `-F body=@file`), never inside the command line.

## Read, at the start of every pass

```text
gh pr view <n> --json title,body,baseRefName,headRefOid,closingIssuesReferences,comments,reviews
gh pr diff <n>
gh api repos/<owner>/<repo>/pulls/<n>/comments --paginate
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved comments(first:50){nodes{databaseId body author{login}}}}}}}}' -f o=<owner> -f r=<repo> -F n=<n>
```

The first gives the title, description, base branch, head commit SHA (`headRefOid`), the issues the PR closes, the general comments and the review bodies. The last gives each thread's `id` (needed to resolve it), its state and its comments (`databaseId` is the id used to reply or edit); page with `pageInfo` if a PR exceeds those limits.

## Publish a pass as one review

A review is atomic (all of it or nothing) and sends the author one notification, so it is used here, unlike on the other platforms:

```text
gh api -X POST repos/<owner>/<repo>/pulls/<n>/reviews --input review.json
```

```json
{
  "commit_id": "<headRefOid read at the start of the pass>",
  "event": "COMMENT",
  "body": "summary: …\n\n[session:…]",
  "comments": [
    { "path": "src/foo.ts", "line": 42, "side": "RIGHT", "body": "issue (blocking): …\n\n[session:…]" }
  ]
}
```

- `event` is always `COMMENT`: never `APPROVE` or `REQUEST_CHANGES`, and never omitted (the review would stay `PENDING`, invisible to everyone else). The `body`, required with `COMMENT`, is the recap of the pass (`summary`, see section 9, Reporting).
- `line` is a line of the file as of `commit_id`; `side` is `RIGHT` for the new version (added or unchanged lines) and `LEFT` for removed lines; a range adds `start_line` and `start_side`. A line outside the diff makes the call fail (HTTP 422) and nothing is published: put that point in a general comment naming `path:line`, and send the review again.

## Other operations

```text
gh pr comment <n> --body-file comment.md
gh api -X POST repos/<owner>/<repo>/pulls/<n>/comments/<comment_id>/replies -F body=@reply.md
gh api -X PATCH repos/<owner>/<repo>/pulls/comments/<comment_id> -F body=@new.md
gh api -X PATCH repos/<owner>/<repo>/issues/comments/<comment_id> -F body=@new.md
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<thread_id>
```

- `gh pr comment`: a general comment (language defects in the title or description, cross-cutting findings, and the final `reviewed:`, posted after the recap, never inside a review body).
- Replies: `<comment_id>` is the id of the thread's first comment.
- Edits: the first `PATCH` is for inline comments, the second for general comments; a review body is edited with `PUT repos/<owner>/<repo>/pulls/<n>/reviews/<review_id>`.
- Resolving: `<thread_id>` comes from the GraphQL read above.

## Never use

`gh pr review --approve`, `gh pr review --request-changes`, `gh pr merge`, `gh pr close`, `gh pr edit`.
