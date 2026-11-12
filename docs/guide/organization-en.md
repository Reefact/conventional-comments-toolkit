# Deploying for an organisation

**Languages:** English (this file) | [Français](organization-fr.md)

What an administrator can set for every workstation: a configuration shared by all
repositories, a floor of minimum rules that no repository can go below, the hosts the
extension serves, and telemetry. Everything on this page is optional; a team can use the
extension with a repository file alone, or with nothing.

## The channel: the browser's enterprise policy

The extension reads a managed policy through the browser (`chrome.storage.managed`, the
`3rdparty` policy node on Chromium browsers). Its scope is the workstation. The policy has
three top-level keys:

```json
{
  "floor": {
    "floorVersion": 1,
    "configUrl": "https://intranet.example/cc/organisation.json",
    "minimumMode": "assist"
  },
  "allowedHosts": [
    { "host": "ghes.example.corp", "platform": "github" },
    { "host": "intranet.example", "platform": "config" }
  ],
  "telemetry": { "enabled": false, "endpoint": "https://metrics.example/cc" }
}
```

Without a policy, nothing is imposed: repositories and product defaults decide alone.

## The organisation's configuration

`floor.configUrl` is the address of a JSON document with the
[same keys as a repository file](configuration-en.md#keys). It sits between the repository
file and the product defaults: it sets the default for every repository that does not write
the key itself.

- The address **only** comes from the policy. A `configUrl` written in a repository file is
  ignored and reported.
- The extension needs access to the host that serves it. Declare that host in `allowedHosts`
  with `"platform": "config"` when it is not a platform domain.
- A repository file wins over this document. To impose a value, use the floor.

## The floor

The floor limits what the organisation's configuration and repository files may set. It is not
a configuration: it sets no default, and a key left out of it is not limited.

```json
{
  "floor": {
    "floorVersion": 1,
    "configUrl": "https://intranet.example/cc/organisation.json",
    "minimumMode": "enforce",
    "severities": { "E-NO-LABEL": "error", "E-UNKNOWN-LABEL": "error" },
    "labels": { "minimum": ["issue", "todo"] },
    "rules": { "minDecisionSubjectLength": 20 },
    "exemptUsers": { "minimum": ["build-service"], "closed": false },
    "allowlistPatterns": { "minimum": [], "closed": true },
    "toolCommands": { "minimum": [], "closed": false },
    "configCacheTtlSeconds": 3600
  }
}
```

| Key | What a level below can no longer do |
|---|---|
| `minimumMode` | Set a mode below it. The scale is `off` < `assist` < `enforce`. |
| `severities` | Lower the severity of the listed codes. |
| `labels.minimum` | Disable these labels, make them non-blocking by default, or forbid `(blocking)` on them. |
| `rules.minDecisionSubjectLength` | Accept a shorter reason for a `decision`. |
| `exemptUsers`, `allowlistPatterns`, `toolCommands` | Remove an entry of `minimum`. With `closed: true`, also add any entry not in `minimum`. |
| `configCacheTtlSeconds` | Keep a configuration in cache **longer** than this. |

Tightening is always allowed below the floor; relaxing is not. A repository that writes
`{"mode": "off"}` under a floor at `enforce` keeps `enforce`, and everyone sees a notice
saying the key was ignored.

`labels.minimum` matters more than it seems: without it, a repository can disable `issue`,
`todo` and `chore`, after which no thread is blocking any more.

A floor whose `floorVersion` is newer than the extension supports is never dropped
silently: the extension falls back to `assist`, or to the floor it knew before if that one was
stricter, and reports it.

## The hosts

`allowedHosts` tells the extension which platform serves each host of yours, so that nobody
has to classify it by hand in the settings page:

| `platform` | For |
|---|---|
| `"github"` | GitHub Enterprise Server, a `ghe.com` subdomain |
| `"azdo"` | Azure DevOps Server |
| `"gitlab"` | GitLab Self-Managed |
| `"config"` | A host that only serves the organisation's configuration |

Each entry must name its platform; an entry without one activates nothing. A subdomain
wildcard is accepted in `host` (`*.ghe.com`).

Site access itself (the permission each person otherwise grants from the settings page) is
set through your browser's extension-management policy, not through this one. A host the
policy classifies is shown as such in the settings page, marked *enterprise policy*.

## Telemetry

Off by default. It turns on only when **both** hold: the policy declares
`"enabled": true` with an `https:` `endpoint`, **and** the person ticks the box in their
settings page. A repository can neither enable it nor choose the destination.

It sends aggregate counters: a label inserted through the extension and its kind (remark,
reply or status), a diagnostic code shown, a selector that found nothing, with the mode and
the repository. Never the text of a comment, of code or of a diff, nor the address of the page.

These counters do not yet allow a compliance rate to be computed: no event counts comments
written or sent. The full list of what is collected is in the
[privacy policy](../../PRIVACY.md).

## Installing the extension on every workstation

Browsers can force the installation of an extension by policy: `ExtensionInstallForcelist` on
Chrome and Edge, `ExtensionSettings` with `"installation_mode": "force_installed"` on
Firefox. Both install from a store or from an update server of your own, which is also what
gives automatic updates. The archives of the
[releases page](https://github.com/reefact/conventional-comments-toolkit/releases) are meant
for trying the extension: loaded by hand, they never update.
