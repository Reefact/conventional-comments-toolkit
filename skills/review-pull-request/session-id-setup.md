# Choose how review sessions are named

Follow this file once per installation of the skill. It ends by writing `session-id.md`, and from
then on the skill reads that file instead, without asking again.

## 1. Ask

Ask **the person you work for** — never on the pull request — in their language, how review
sessions should be named. Convey this offer, without presenting the example names as fixed:

> Each review session needs an identifier. Instead of a GUID, Slugger can draw a readable one for
> every new session, from code-review vocabulary — names like
> `melancholy-coordinated-value-object` or `tedious-debated-branch`, a different one each time.
> It is a .NET tool, which needs the .NET 10 SDK on the machines that run the review. Add Slugger
> to this repository's .NET tools?

If they do not answer, use a GUID for this session only, record nothing, and ask again next time.

## 2. Record the answer

Create `session-id.md` beside the `SKILL.md` your agent loaded as the skill: usually the skill's
own `SKILL.md`; when another `SKILL.md` sent you to it, beside that one. Its content is **exactly**
the text of the chosen option below, between its two markers, markers excluded. Do not reword it.

If the answer is Slugger, also add it to the repository's local tool manifest, from the
repository root:

```bash
dotnet new tool-manifest
dotnet tool install Slugger.Cli
```

Skip the first command when the repository already has a manifest.

## 3. Commit

The choice is part of the repository: commit `session-id.md`, and the manifest if you changed it,
**in a commit of their own**, never in the pull request under review. Ask the person which branch
it goes on, and say in the message what was chosen, for example
`chore: name review sessions with Slugger`.

When the skill's directory is not under version control — an installation in the user's home
directory — the file alone records the choice; say so to the person.

Then draw this session's identifier as the file you wrote says.

## Option: Slugger

<!-- option:slugger:start -->
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
<!-- option:slugger:end -->

## Option: GUID

<!-- option:guid:start -->
# Review session identifiers: GUID

This repository names review sessions with a GUID; Slugger was declined. Do not offer it again.

At the start of each new review session, draw one lowercase GUID with whatever the machine
offers, for example:

```bash
node -e "console.log(crypto.randomUUID())"
```
<!-- option:guid:end -->
