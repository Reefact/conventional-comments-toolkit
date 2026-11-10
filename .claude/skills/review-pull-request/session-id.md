# Review session identifiers: Slugger

This repository names review sessions with Slugger and its `code-review` theme. Do not ask again.

At the start of each new review session, from the repository root, when the repository's local
tool manifest lists Slugger:

```bash
dotnet tool restore
dotnet slugger --theme-dir <skill-dir> --theme code-review --oneshot
```

When it does not, and Slugger is installed globally instead:

```bash
slugger --theme-dir <skill-dir> --theme code-review --oneshot
```

`<skill-dir>` is the directory of the review skill's `SKILL.md`, which ships `code-review.json`.
`dotnet tool restore` only matters the first time on a machine, and is harmless after.

If Slugger cannot run on this machine — no .NET SDK, for instance — draw one lowercase GUID
instead, with whatever the machine offers, for example
`node -e "console.log(crypto.randomUUID())"`. Never make up a name in Slugger's style: two agents
that invent one pick the same words. Say so in your report, and leave this file as it is.

Whatever drew it, check that no comment of the pull request already carries the identifier before
using it, and draw again if one does (the review skill, section 9).
