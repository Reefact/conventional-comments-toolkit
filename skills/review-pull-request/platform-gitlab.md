# Publishing on GitLab (`glab`)

Companion of `SKILL.md`, section 9 (Mechanics). The PR of the skill is a merge request (MR) here. Use the authenticated `glab` CLI or, when the session provides them, GitLab tools with the same effect. `<iid>` is the MR's number in its URL; `<project>` is the project id or its URL-encoded path (`group%2Fproject`) and `<repo>` the same project written `group/project` (or its full URL), the forms `--repo` takes; inside a clone, `glab api` also replaces `:fullpath` with the current project's path. Send every body as a JSON file, for every write:

```text
glab api -X <METHOD> <endpoint> --input body.json --header "Content-Type: application/json"
```

Never put a comment body inside the command line.

## Never use

- `glab mr approve`, `glab mr merge`, `glab mr close`, `glab mr update`, and any "request changes" review state.
- **Quick actions.** GitLab runs a comment line that begins with `/` as a command (`/approve`, `/merge`, `/close`, `/assign`, …). Never begin a line of a comment with `/`: open it with another character (a backtick before a path, for example). Check this in every body before publishing, the discussion included.

## Read, at the start of every pass

```text
glab api projects/<project>/merge_requests/<iid>
glab mr diff <iid> --repo <repo>
glab api projects/<project>/merge_requests/<iid>/closes_issues
glab api --paginate projects/<project>/merge_requests/<iid>/discussions
```

- The first gives `title`, `description`, `target_branch` (the base) and `diff_refs`: `base_sha`, `start_sha` and `head_sha` (the head commit). Keep the three, inline comments need them.
- The diff is read in a second call: without `--repo`, `glab mr diff` reads the merge request with that IID in the clone's own project, which may not be the one you review, and it can fail to find a project outside a clone. A push may land between the two reads: before you publish, read the merge request again and check that `diff_refs.head_sha` is still the one you kept (`SKILL.md`, section 9, on anchoring).
- The last lists the threads. Each discussion has an `id` (the thread id) and `notes[]`: `id`, `body`, `author`, `resolvable`, `resolved`, and `position` for an inline note. A thread is resolved when all its resolvable notes are.

## Publish, one comment at a time

GitLab drafts (`draft_notes`) belong to their author account: on a shared account they would mix with another session's drafts, so they are not used. Publish each inline comment as its own discussion, then the recap, and `reviewed:` last:

```text
glab api -X POST projects/<project>/merge_requests/<iid>/discussions --input discussion.json --header "Content-Type: application/json"
```

```json
{
  "body": "issue (blocking): …\n\n[session:…]",
  "position": {
    "position_type": "text",
    "base_sha": "<diff_refs.base_sha>",
    "start_sha": "<diff_refs.start_sha>",
    "head_sha": "<diff_refs.head_sha>",
    "old_path": "src/foo.ts",
    "new_path": "src/foo.ts",
    "new_line": 42
  }
}
```

- Keep the `id` of each discussion the call returns.
- `new_line` for an added line, `old_line` for a removed line, **both** `old_line` and `new_line` for an unchanged line shown in the diff. A line outside the diff is refused (HTTP 400): put that point in a general comment naming `path:line`.

## Other operations

```text
glab api -X POST projects/<project>/merge_requests/<iid>/notes --input note.json ...
glab api -X POST projects/<project>/merge_requests/<iid>/discussions/<discussion_id>/notes --input reply.json ...
glab api -X PUT projects/<project>/merge_requests/<iid>/discussions/<discussion_id>/notes/<note_id> --input new.json ...
glab api -X PUT projects/<project>/merge_requests/<iid>/notes/<note_id> --input new.json ...
glab api -X PUT projects/<project>/merge_requests/<iid>/discussions/<discussion_id> --input resolve.json ...
```

(`...` stands for `--header "Content-Type: application/json"`.)

- General comment (language defects in the title or description, cross-cutting findings, the recap, and the final `reviewed:`): body `{"body": "…"}`.
- Reply in a thread and edit: body `{"body": "…"}`. The first `PUT` edits a note inside a thread (inline or reply), the second a general comment.
- Resolve a thread: body `{"resolved": true}`; `<discussion_id>` comes from the read above.
