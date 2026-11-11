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
download the command compiled natively instead. It needs nothing installed, only `curl` and
access to `github.com` and `release-assets.githubusercontent.com`. Run the lines as they are: the
version and the SHA-256 are pinned together, and a download that does not match is never run.

```bash
slugger="$(mktemp -d)/slugger"
curl -fsSL -o "$slugger" https://github.com/Reefact/slugger/releases/download/cli-v1.1.0/slugger-linux-x64
echo "c31f988bf3e76e51a68e3a087bc4d9663f804362923bb21bba84d443eff37664  $slugger" | sha256sum -c -
chmod +x "$slugger"
"$slugger" --theme-dir <skill-dir> --theme code-review --oneshot
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
