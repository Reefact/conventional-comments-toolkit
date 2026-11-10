# Review session identifiers: Slugger

This repository names review sessions with Slugger and its `code-review` theme. Do not ask again.

At the start of each new review session, from the repository root:

```bash
dotnet tool restore
dotnet slugger --theme-dir <skill-dir> --theme code-review --oneshot
```

`<skill-dir>` is the directory of the review skill's `SKILL.md`, which ships `code-review.json`.
`dotnet tool restore` only matters the first time on a machine, and is harmless after.

If Slugger cannot run on this machine — no .NET SDK, for instance — use a lowercase GUID for this
session, say so in your report, and leave this file as it is.
