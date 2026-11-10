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

If Slugger cannot run on this machine — no .NET SDK, for instance — make up a readable identifier
for this session in the same style: lowercase kebab-case, two or three adjectives before a
code-review noun, such as `patient-stubborn-null-check`. Use a lowercase GUID only if you cannot
make one up. Say so in your report, and leave this file as it is.
