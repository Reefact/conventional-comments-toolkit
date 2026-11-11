# Choose how review sessions are named

Follow this file once per installation of the skill. It ends by writing `session-id.md`, and from
then on the skill reads that file instead, without asking again.

Run its steps in order, and run them: each one is a command or a question, never a guess. A GUID
is the outcome of the last step, not a shortcut past the first ones.

## 0. Look for a choice already recorded

The repository under review may already have chosen, for an agent that reads the skill from
another place: look for a `session-id.md` in another installation of this skill in it, such as
`.claude/skills/review-pull-request/session-id.md`. If you find one, follow it and stop here.

## 1. Use Slugger when it already runs

From the repository root, check whether Slugger already runs: `dotnet tool restore` then
`dotnet slugger --version` when the repository has a local tool manifest, or `slugger --version`
for a global install. If either answers, **use Slugger for this session without asking**, with the
command of the Slugger option below that matches the one that answered. Then, if you can reach the person you work for, offer to
record that choice (sections 3 and 4) so that later sessions skip this file; if you cannot, record
nothing.

Otherwise — the commands ran and failed, and you keep their output for your report — go on to the
question.

## 2. Ask

Ask **the person you work for** — never on the pull request — in their language, how review
sessions should be named. Convey this offer, without presenting the example names as fixed:

> Each review session needs an identifier. Instead of a GUID, Slugger can draw a readable one for
> every new session, from code-review vocabulary — names like
> `melancholy-coordinated-value-object` or `tedious-debated-branch`, a different one each time.
> It runs from the .NET 10 SDK where a machine has it, and on Linux x64 without .NET from its
> native build, downloaded and checked against a pinned SHA-256. Name this repository's review
> sessions with Slugger?

If they do not answer, draw a lowercase GUID for this session only, as the Slugger option says when
Slugger cannot run, record nothing, and ask again next time.

## 3. Record the answer

Create `session-id.md` beside the `SKILL.md` your agent loaded as the skill: usually the skill's
own `SKILL.md`; when another `SKILL.md` sent you to it, beside that one. Its content is **exactly**
the text of the chosen option below, between its two markers, markers excluded. Do not reword it.

If the answer is Slugger and the .NET SDK runs on this machine, also add Slugger to the
repository's local tool manifest, from the repository root:

```bash
dotnet new tool-manifest
dotnet tool install Slugger.Cli
```

Skip the first command when the repository already has a manifest. Without the SDK, record the
choice all the same and leave the manifest alone: the option's native command draws the names on
Linux x64, and a machine with the SDK can add the manifest later. Do not install the SDK to get
there.

## 4. Commit

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

When neither runs — no .NET SDK, as in most agent containers — and the machine is Linux x64,
download the pinned native binary. The block retries transient failures and falls back to the
GitHub Releases asset API if the direct download fails. Both routes use the same SHA-256.
Keep the release tag, asset ID and checksum together when updating the pin. Replace
`<skill-dir>` with the directory containing `code-review.json` before running the block.

```bash
(
  set -e
  slugger_dir="$(mktemp -d)"
  trap 'rm -rf "$slugger_dir"' EXIT
  slugger="$slugger_dir/slugger"
  download() {
    curl -fsSL --connect-timeout 15 --max-time 60 --retry 1 -o "$slugger" "$@"
  }
  download https://github.com/Reefact/slugger/releases/download/cli-v1.1.0/slugger-linux-x64 ||
    download -H 'Accept: application/octet-stream' https://api.github.com/repos/Reefact/slugger/releases/assets/735726517
  echo "c31f988bf3e76e51a68e3a087bc4d9663f804362923bb21bba84d443eff37664  $slugger" | sha256sum -c - >&2
  chmod +x "$slugger"
  "$slugger" --theme-dir '<skill-dir>' --theme code-review --oneshot
)
```

`<skill-dir>` is the directory of the review skill's `SKILL.md`, which ships `code-review.json`.
`dotnet tool restore` only matters the first time on a machine, and is harmless after.

If Slugger cannot run on this machine by any of these three ways — no .NET SDK, and a download
that is refused, fails its checksum or is not for this platform — draw one lowercase GUID
instead, with whatever the machine offers, for example
`node -e "console.log(crypto.randomUUID())"`. Never make up a name in Slugger's style: two agents
that invent one pick the same words. Say in your report which way failed and how, and leave this
file as it is.

Whatever drew it, check that no comment of the pull request already carries the identifier before
using it, and draw again if one does (the review skill, section 9).
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

Never type a GUID yourself: draw it. Check that no comment of the pull request already carries it
before using it, and draw again if one does (the review skill, section 9).
<!-- option:guid:end -->
