# Politique de confidentialité — Conventional Comments Toolkit

_Dernière mise à jour : 2026-08-24._

Cette page sert de politique de confidentialité publique pour l'extension
navigateur **Conventional Comments Toolkit**, distribuée sur le Chrome Web
Store et les stores équivalents (Firefox Add-ons, Edge Add-ons). Elle est
volontairement hébergée sur ce dépôt public : l'URL de cette page (vue
GitHub de ce fichier) est l'URL à renseigner dans les formulaires de
soumission des stores.

Résumé en une phrase : **l'extension ne collecte, ne stocke sur un serveur
distant, ni ne transmet aucun contenu de code, de commentaire ou de diff
que vous consultez ou rédigez.**

## Ce que l'extension fait

Conventional Comments Toolkit assiste la rédaction de commentaires de
revue de code conformes à la convention Conventional Comments, sur GitHub
et, en option, Azure DevOps : barre d'outils d'insertion de labels,
validation du format à la saisie, retour visuel dans l'éditeur natif de la
plateforme.

## Données traitées

| Donnée | Où elle vit | Sort-elle du navigateur ? |
|---|---|---|
| Langue d'interface et raccourcis clavier directs | `chrome.storage.sync` | **Se synchronise entre les appareils de votre compte Chrome si la synchronisation est activée** — c'est le mécanisme natif de Chrome, pas un serveur propre à l'extension. Contenu limité à ces deux préférences, jamais de contenu de commentaire ou de code. |
| État dégradé courant (diagnostic) | `chrome.storage.local`, sur votre appareil | Non |
| Domaines optionnels activés (Azure DevOps, GitHub Enterprise, etc.) | `chrome.permissions`, géré par Chrome | Non — c'est Chrome, pas l'extension, qui tient cette liste |
| Configuration `.conventional-comments.json` du dépôt affiché | lue depuis la page déjà chargée par votre session, mise en cache en mémoire (perdue à chaque redémarrage du navigateur) | Non — lecture seule, via la route web que votre session autorise déjà, jamais par un jeton détenu par l'extension |
| Contenu des commentaires, du code et des diffs que vous consultez ou rédigez | reste dans la page et dans l'éditeur natif de la plateforme | **Jamais transmis nulle part par l'extension** |
| Télémétrie d'usage | — | **Aucune actuellement : cette version ne collecte ni n'émet de télémétrie.** |
| Journal d'exemption de PR (identifiant de PR, action — accordée/refusée/révoquée —, auteur de la demande, horodatage, et **un motif en texte libre si la personne en saisit un**) — mécanisme de gouvernance distinct de la télémétrie ci-dessus, propre au composant serveur de l'organisation, pas à cette extension. **Le motif en texte libre peut contenir des informations personnelles ou sensibles**, saisies par la personne qui accorde, refuse ou révoque l'exemption. | serveur de l'organisation, si le mécanisme est déployé et activé | Uniquement si l'organisation a déployé et configuré ce mécanisme ; destination et durée de conservation sont sous son contrôle |

L'extension ne stocke **aucun jeton d'authentification ni secret**. Elle
ne s'authentifie auprès d'aucune API à jeton : les seules données qu'elle
lit hors du DOM de la page sont celles accessibles par la route web déjà
autorisée par votre session de navigation.

## Permissions et pourquoi

Le détail permission par permission (`storage`, `scripting`, `activeTab`,
`host_permissions`, `optional_host_permissions`) est documenté dans
[`docs/store-permissions-justification-fr.md`](docs/store-permissions-justification-fr.md).
En résumé : aucune permission `<all_urls>` statique, les domaines hors
GitHub (Azure DevOps, configuration d'entreprise) sont demandés à la
demande et avec votre confirmation explicite.

## Ce que l'extension ne fait pas

- Elle n'envoie aucun contenu de commentaire, de code ou de diff à un
  service tiers ou à ses éditeurs.
- Elle ne fait tourner aucun code distant : `content_security_policy`
  interdit tout script non empaqueté dans l'extension, aucune dépendance
  chargée depuis un CDN.
- Elle ne vend ni ne partage aucune donnée avec des tiers à des fins
  publicitaires.
- Elle ne suit pas votre activité de navigation en dehors des pages de
  revue de code des plateformes prises en charge.

## Code source

Le code de l'extension est public et auditable, sous licence Apache-2.0 :
<https://github.com/reefact/conventional-comments-toolkit>.

## Contact

Pour toute question sur cette politique de confidentialité, ouvrez une
[issue sur ce dépôt](https://github.com/reefact/conventional-comments-toolkit/issues).

---

# Privacy Policy — Conventional Comments Toolkit

_Last updated: 2026-08-24._

This page is the public privacy policy for the **Conventional Comments
Toolkit** browser extension, distributed on the Chrome Web Store and
equivalent stores (Firefox Add-ons, Edge Add-ons). It is intentionally
hosted on this public repository: this file's GitHub view URL is the URL
to enter in store submission forms.

One-sentence summary: **the extension does not collect, store on a remote
server, or transmit any code, comment, or diff content you view or
write.**

## What the extension does

Conventional Comments Toolkit assists writing code review comments that
follow the Conventional Comments convention, on GitHub and, optionally,
Azure DevOps: a toolbar for inserting labels, input validation, and
visual feedback inside the platform's native comment editor.

## Data processed

| Data | Where it lives | Does it leave the browser? |
|---|---|---|
| Interface language and direct keyboard shortcuts | `chrome.storage.sync` | **Syncs across your Chrome account's devices if sync is enabled** — that's Chrome's own native mechanism, not a server run by the extension. Limited to these two preferences, never comment or code content. |
| Current degraded state (diagnostics) | `chrome.storage.local`, on your device | No |
| Enabled optional domains (Azure DevOps, GitHub Enterprise, etc.) | `chrome.permissions`, managed by Chrome | No — Chrome holds this list, not the extension |
| The displayed repository's `.conventional-comments.json` configuration | read from the page already loaded by your session, cached in memory (lost on every browser restart) | No — read-only, via the web route your session already authorizes, never via a token held by the extension |
| Comment, code, and diff content you view or write | stays in the page and the platform's native editor | **Never transmitted anywhere by the extension** |
| Usage telemetry | — | **None currently: this version collects and emits no telemetry.** |
| PR exemption log (PR id, action — granted/refused/revoked —, requester, timestamp, and **a free-text reason if one was entered**) — a governance mechanism distinct from the telemetry above, owned by the organization's server component, not by this extension. **The free-text reason may contain personal or sensitive information**, entered by whoever grants, refuses, or revokes the exemption. | your organization's server, if that mechanism is deployed and enabled | Only if the organization has deployed and configured that mechanism; destination and retention are under its control |

The extension stores **no authentication token or secret**. It does not
authenticate against any token-based API: the only data it reads outside
the page DOM is what is reachable via the web route your browsing session
already authorizes.

## Permissions and why

A permission-by-permission breakdown (`storage`, `scripting`,
`activeTab`, `host_permissions`, `optional_host_permissions`) is
documented in
[`docs/store-permissions-justification-fr.md`](docs/store-permissions-justification-fr.md).
In short: no static `<all_urls>` permission; domains beyond GitHub (Azure
DevOps, enterprise configuration hosts) are requested on demand, with
your explicit confirmation.

## What the extension does not do

- It does not send any comment, code, or diff content to a third-party
  service or to its authors.
- It runs no remote code: `content_security_policy` forbids any script
  not bundled with the extension, no CDN-loaded dependency.
- It does not sell or share any data with third parties for advertising
  purposes.
- It does not track your browsing activity outside the code review pages
  of the supported platforms.

## Source code

The extension's source code is public and auditable, under the
Apache-2.0 license: <https://github.com/reefact/conventional-comments-toolkit>.

## Contact

For any question about this privacy policy, open an
[issue on this repository](https://github.com/reefact/conventional-comments-toolkit/issues).
