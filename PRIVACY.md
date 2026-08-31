# Politique de confidentialité — Conventional Comments Toolkit

_Dernière mise à jour : 2026-08-24._

Cette page sert de politique de confidentialité publique pour l'extension
navigateur **Conventional Comments Toolkit**, distribuée sur le Chrome Web
Store et les stores équivalents (Firefox Add-ons, Edge Add-ons). Elle est
volontairement hébergée sur ce dépôt public : l'URL de cette page (vue
GitHub de ce fichier) est l'URL à renseigner dans les formulaires de
soumission des stores.

Résumé en une phrase : **l'extension elle-même ne collecte, ne stocke sur
un serveur distant, ni ne transmet aucun contenu de code, de commentaire
ou de diff que vous consultez ou rédigez.**

**Périmètre de ce document.** Le tableau ci-dessous couvre exclusivement
l'**extension navigateur** — c'est elle qui est distribuée sur les stores
et pour laquelle ce document sert de politique de confidentialité
publique. Le produit inclut aussi un **composant serveur optionnel**,
auto-hébergé et exploité par chaque organisation qui choisit de le
déployer (§10, §14 de la spécification) : voir la section dédiée plus bas
plutôt que le tableau, qui ne l'engloble pas champ par champ — c'est un
composant à la surface de persistance propre, sous le contrôle de
l'organisation qui l'exploite, pas de l'éditeur de l'extension.

## Ce que l'extension fait

Conventional Comments Toolkit assiste la rédaction de commentaires de
revue de code conformes à la convention Conventional Comments, sur GitHub
et, en option, Azure DevOps : barre d'outils d'insertion de labels,
validation du format à la saisie, retour visuel dans l'éditeur natif de la
plateforme.

## Données traitées par l'extension navigateur

| Donnée | Où elle vit | Sort-elle du navigateur ? |
|---|---|---|
| Langue d'interface et raccourcis clavier directs | `chrome.storage.sync` | **Se synchronise entre les appareils de votre compte Chrome si la synchronisation est activée** — c'est le mécanisme natif de Chrome, pas un serveur propre à l'extension. Contenu limité à ces deux préférences, jamais de contenu de commentaire ou de code. |
| État dégradé courant (diagnostic) | `chrome.storage.local`, sur votre appareil | Non |
| Domaines optionnels activés (Azure DevOps, GitHub Enterprise, etc.) | `chrome.permissions`, géré par Chrome | Non — c'est Chrome, pas l'extension, qui tient cette liste |
| Configuration `.conventional-comments.json` du dépôt affiché | l'extension fait une requête réseau dédiée vers la route `raw` du fichier (avec vos cookies de session, jamais un jeton propre à l'extension), mise en cache en mémoire par onglet — la navigation interne du site (d'une PR à l'autre sans rechargement) la conserve ; seul un rechargement complet ou la fermeture de l'onglet la détruit | Non — c'est une lecture, sur une route web que votre session autorise déjà de la même façon que si vous l'ouvriez vous-même dans un onglet |
| Contenu des commentaires, du code et des diffs que vous consultez ou rédigez | reste dans la page et dans l'éditeur natif de la plateforme | **Jamais transmis nulle part par l'extension** |
| Plancher de politique d'entreprise (`configUrl`, `exemptUsers`, motifs d'allowlist…), si votre organisation en déploie un | lu depuis `chrome.storage.managed`, alimenté par la politique navigateur de votre organisation ; l'extension ne fait que le lire | Non |
| **Données traitées en mémoire uniquement, jamais écrites ni transmises** — notamment votre identifiant de compte sur la plateforme et ceux des auteurs des commentaires affichés, lus dans le DOM de la page pour la validation et l'affichage des fils | mémoire vive de l'onglet, le temps de la page | Non — ni écrites dans `chrome.storage`, ni envoyées nulle part ; elles disparaissent à la fermeture de l'onglet |
| Télémétrie d'usage | **Rien n'est émis** tant que les trois conditions suivantes ne sont pas réunies : votre organisation a activé `telemetry.enabled` **et** désigné un point de collecte `https:` dans la configuration, **et** vous avez coché la case dédiée dans la page d'options de l'extension. Le point de collecte y est affiché à côté de la case, avant que vous ne cochiez. | **Seulement si vous l'avez explicitement autorisée**, et alors uniquement vers le point de collecte de votre organisation. Ce qui part est un **agrégat périodique** : le dépôt affiché (`hôte/portée`), le mode de la configuration, et des compteurs d'identifiants — labels employés, codes de diagnostic, chaînes de sélecteurs dégradées. **Jamais de texte libre** : une valeur qui n'est pas un identifiant de forme attendue est abandonnée plutôt qu'envoyée. Aucun cookie n'est joint à cet envoi. |

L'extension ne stocke **aucun jeton d'authentification ni secret**. Elle
ne s'authentifie auprès d'aucune API à jeton : les seules données qu'elle
lit hors du DOM de la page sont celles accessibles par la route web déjà
autorisée par votre session de navigation.

## Composant serveur optionnel (auto-hébergé par votre organisation)

**Non requis pour utiliser l'extension.** Une organisation peut déployer
ce composant pour faire respecter la convention comme condition de
fusion des pull requests, avec un mécanisme d'exemption gouverné. S'il
est déployé, il persiste — sur l'infrastructure de l'organisation, pas
sur un service tiers de l'éditeur de l'extension — des catégories de
données propres à son fonctionnement, entre autres :
- le journal et l'état actif des exemptions de PR (identifiant de PR,
  action, personne à l'origine, horodatage, et **un motif en texte libre
  si la personne en saisit un** — susceptible de contenir des
  informations personnelles ou sensibles) ;
- des enregistrements d'évaluation de conformité par PR, qui incluent un
  **court extrait** (jusqu'à ~80 caractères) du commentaire racine de
  chaque fil bloquant non résolu, avec l'identifiant de son auteur ;
- des compteurs d'usage agrégés par dépôt et par PR (répartition des
  labels, nombre de fils non résolus, etc.), **indépendants du réglage
  `telemetry.enabled`** de l'extension — ce sont deux mécanismes
  distincts ;
- un état opérationnel courant (configuration en cache, séquencement des
  publications, alias de chemin de PR) nécessaire au fonctionnement du
  composant.

**Cette liste illustre les catégories, elle n'est pas exhaustive et n'a
pas vocation à l'être** : le code de ce composant évolue, et une
organisation qui le déploie en est l'opérateur au sens du RGPD (ou du
cadre équivalent) — c'est à elle, pas à ce document, de fournir la
politique de confidentialité applicable à ses utilisateurs pour cette
instance, avec sa propre destination et durée de conservation.

## Permissions et pourquoi

Le détail permission par permission (`storage`, `scripting`,
`optional_host_permissions`) est documenté dans
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

One-sentence summary: **the extension itself does not collect, store on
a remote server, or transmit any code, comment, or diff content you view
or write.**

**Scope of this document.** The table below covers the **browser
extension** only — that's what's distributed on the stores and what this
document serves as the public privacy policy for. The product also
includes an **optional server component**, self-hosted and operated by
each organization that chooses to deploy it (§10, §14 of the functional
spec): see the dedicated section below instead of the table, which
doesn't try to enumerate it field by field — it's a component with its
own persistence surface, under the control of the organization running
it, not of the extension's publisher.

## What the extension does

Conventional Comments Toolkit assists writing code review comments that
follow the Conventional Comments convention, on GitHub and, optionally,
Azure DevOps: a toolbar for inserting labels, input validation, and
visual feedback inside the platform's native comment editor.

## Data processed by the browser extension

| Data | Where it lives | Does it leave the browser? |
|---|---|---|
| Interface language and direct keyboard shortcuts | `chrome.storage.sync` | **Syncs across your Chrome account's devices if sync is enabled** — that's Chrome's own native mechanism, not a server run by the extension. Limited to these two preferences, never comment or code content. |
| Current degraded state (diagnostics) | `chrome.storage.local`, on your device | No |
| Enabled optional domains (Azure DevOps, GitHub Enterprise, etc.) | `chrome.permissions`, managed by Chrome | No — Chrome holds this list, not the extension |
| The displayed repository's `.conventional-comments.json` configuration | the extension makes a dedicated network request to the file's `raw` route (using your session cookies, never a token of its own), cached in memory per tab — in-site navigation (moving between PRs without a reload) keeps it; only a full page reload or closing the tab destroys it | No — it's a read, on a web route your session already authorizes, the same way it would if you opened it yourself in a tab |
| Comment, code, and diff content you view or write | stays in the page and the platform's native editor | **Never transmitted anywhere by the extension** |
| Enterprise policy floor (`configUrl`, `exemptUsers`, allowlist patterns…), if your organization deploys one | read from `chrome.storage.managed`, populated by your organization's browser policy; the extension only reads it | No |
| **Data processed in memory only, never written or transmitted** — notably your platform account identifier and those of the authors of displayed comments, read from the page DOM for validation and thread display | the tab's memory, for the lifetime of the page | No — neither written to `chrome.storage` nor sent anywhere; gone when the tab closes |
| Usage telemetry | **Nothing is emitted** unless all three of the following hold: your organization has set `telemetry.enabled` **and** an `https:` collection endpoint in the configuration, **and** you have ticked the dedicated checkbox on the extension's options page. That page shows the endpoint next to the checkbox, before you tick it. | **Only if you have explicitly allowed it**, and then only to your organization's endpoint. What leaves is a **periodic aggregate**: the displayed repository (`host/scope`), the configuration's mode, and counters of identifiers — labels used, diagnostic codes, degraded selector chains. **Never free text**: a value that is not a well-formed identifier is dropped rather than sent. No cookies are attached to that request. |

The extension stores **no authentication token or secret**. It does not
authenticate against any token-based API: the only data it reads outside
the page DOM is what is reachable via the web route your browsing session
already authorizes.

## Optional server component (self-hosted by your organization)

**Not required to use the extension.** An organization may deploy this
component to enforce the convention as a merge requirement for pull
requests, with a governed exemption mechanism. If deployed, it persists
— on the organization's own infrastructure, not a third-party service run
by the extension's publisher — categories of data specific to its
operation, including but not limited to:
- the PR exemption log and active-exemption state (PR id, action, actor,
  timestamp, and **a free-text reason if one was entered** — potentially
  containing personal or sensitive information);
- compliance-evaluation records per PR, which include a **short excerpt**
  (up to ~80 characters) of the root comment of each unresolved blocking
  thread, along with its author's identifier;
- aggregated usage counters per repository and PR (label distribution,
  unresolved-thread counts, etc.), **independent of the extension's
  `telemetry.enabled` setting** — these are two distinct mechanisms;
- operational state (cached configuration, publication sequencing, PR
  path aliases) needed for the component to function.

**This list illustrates categories; it is not exhaustive and isn't meant
to be** — the code of this component evolves, and an organization that
deploys it is the operator, under GDPR or an equivalent framework: it is
that organization's responsibility, not this document's, to provide the
applicable privacy policy to its own users for that deployment, with its
own destination and retention terms.

## Permissions and why

A permission-by-permission breakdown (`storage`, `scripting`,
`optional_host_permissions`) is
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
