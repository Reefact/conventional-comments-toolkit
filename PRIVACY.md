# Politique de confidentialité — Conventional Comments Toolkit

_Dernière mise à jour : 2026-11-12._

Cette page sert de politique de confidentialité publique pour l'extension
navigateur **Conventional Comments Toolkit**, distribuée sur le Chrome Web
Store et les stores équivalents (Firefox Add-ons, Edge Add-ons). Elle est
volontairement hébergée sur ce dépôt public : l'URL de cette page (vue
GitHub de ce fichier) est l'URL à renseigner dans les formulaires de
soumission des stores.

Résumé en une phrase : **l'extension elle-même ne collecte, ne stocke sur
un serveur distant, ni ne transmet aucun contenu de code, de commentaire
ou de diff que vous consultez ou rédigez.**

**Périmètre de ce document.** Le produit est l'extension navigateur, et
elle seule : il ne comporte aucun composant serveur. Une rédaction
antérieure de cette page décrivait un composant serveur optionnel,
auto-hébergé par chaque organisation ; il a été retiré du produit
([DEC0010](docs/idr/DEC0010-the-extension-is-the-whole-product-fr.md)),
et la section qui le décrivait avec lui.

## Ce que l'extension fait

Conventional Comments Toolkit assiste la rédaction de commentaires de
revue de code conformes à la convention Conventional Comments, sur GitHub,
Azure DevOps et GitLab : barre d'outils d'insertion de labels,
validation du format à la saisie, retour visuel dans l'éditeur natif de la
plateforme.

## Données traitées par l'extension navigateur

| Donnée | Où elle vit | Sort-elle du navigateur ? |
|---|---|---|
| Langue d'interface, raccourcis clavier directs et ordre des boutons de label | `chrome.storage.sync` | **Se synchronise entre les appareils de votre compte Chrome si la synchronisation est activée** — c'est le mécanisme natif de Chrome, pas un serveur propre à l'extension. Contenu limité à ces trois préférences, jamais de contenu de commentaire ou de code. |
| État dégradé courant (diagnostic) | `chrome.storage.local`, sur votre appareil | Non |
| Avis de la dernière lecture de configuration (affichés dans la page d'options) : l'hôte et le chemin du dépôt lu (par exemple `github.com/organisation/depot`), et pour chaque avis sa sorte, son code, son texte en anglais et ce qu'il cite — clé ou valeur de configuration, numéro et extrait borné (40 caractères) d'un motif d'allowlist, version, niveau en cause —, plus, en référence, la **valeur rejetée elle-même, en entier** : motif d'allowlist ou commande d'outil, tels qu'écrits dans la configuration. Remplacés à chaque lecture, sans historique | `chrome.storage.local`, sur votre appareil | Non |
| Domaines optionnels activés (Azure DevOps, GitHub Enterprise, etc.) | `chrome.permissions`, géré par Chrome | Non — c'est Chrome, pas l'extension, qui tient cette liste |
| Configuration `.conventional-comments.json` du dépôt affiché | l'extension fait une requête réseau dédiée vers la route `raw` du fichier (avec vos cookies de session, jamais un jeton propre à l'extension), mise en cache en mémoire par onglet — la navigation interne du site (d'une PR à l'autre sans rechargement) la conserve ; seul un rechargement complet ou la fermeture de l'onglet la détruit | Non — c'est une lecture, sur une route web que votre session autorise déjà de la même façon que si vous l'ouvriez vous-même dans un onglet |
| Contenu des commentaires, du code et des diffs que vous consultez ou rédigez | reste dans la page et dans l'éditeur natif de la plateforme | **Jamais transmis nulle part par l'extension** |
| Plancher de politique d'entreprise (`configUrl`, `exemptUsers`, motifs d'allowlist…), si votre organisation en déploie un | lu depuis `chrome.storage.managed`, alimenté par la politique navigateur de votre organisation ; l'extension ne fait que le lire | Non |
| **Données traitées en mémoire uniquement, jamais écrites ni transmises** — notamment votre identifiant de compte sur la plateforme et ceux des auteurs des commentaires affichés, lus dans le DOM de la page pour la validation et l'affichage des fils | mémoire vive de l'onglet, le temps de la page | Non — ni écrites dans `chrome.storage`, ni envoyées nulle part ; elles disparaissent à la fermeture de l'onglet |
| Télémétrie d'usage | **Rien n'est émis** tant que les trois conditions suivantes ne sont pas réunies : la **politique d'entreprise** de votre organisation — poussée par votre navigateur, hors de portée de tout dépôt — déclare `telemetry.enabled` **et** un point de collecte `https:`, **et** vous avez coché la case dédiée dans la page d'options. Cette case affiche l'adresse, et **votre accord ne vaut que pour celle-là**. Le consentement est stocké **sur cet appareil** (`chrome.storage.local`) et **ne se synchronise pas** ; le décocher désarme immédiatement les onglets déjà ouverts, et reste possible même si la politique a cessé de déclarer un point de collecte. | **Seulement si vous l'avez explicitement autorisée**, et alors uniquement vers le point de collecte de votre organisation. Ce qui part est un **agrégat périodique** : le dépôt affiché (`hôte/portée`), le mode de la configuration, et des compteurs d'identifiants — labels employés, avec leur type (`remark`, `status` ou `reply`), codes de diagnostic, chaînes de sélecteurs dégradées. **Jamais de texte libre** : une valeur qui n'est pas un identifiant de forme attendue est abandonnée plutôt qu'envoyée. La requête ne joint **ni cookie ni référent** — l'adresse de la page de revue ne part donc pas avec elle, ce que `npm run check:beacon` mesure dans un vrai navigateur à chaque exécution. |
| Journal local (dégradations d'interface et exceptions) | `chrome.storage.local`, sur votre appareil : **une ligne par règle de sélection**, cinquante au plus, et chacune ne garde que le **dernier** relevé de sa règle — son nom, l'horodatage, **l'adresse de la page** telle qu'elle était à cet instant, paramètres de requête et fragment compris, les sélecteurs que la règle a essayés, la plateforme, la date du premier relevé et leur nombre, les **cinq dernières adresses** distinctes où la règle a échoué, et, si la règle a fini par trouver plus tard dans la même visite, combien de fois et après combien de millisecondes. S'y ajoute un **relevé de l'interface** au dernier échec : jusqu'où chaque sélecteur a trouvé quelque chose, et l'**empreinte** de quelques éléments voisins — leur balise, une liste fermée d'attributs d'interface (`id` et `name` aux chiffres masqués, `class`, `role`, `type`, `aria-label`, `placeholder`, `data-testid`, `data-component`, `data-variant`, `data-status`, `disabled`, `aria-disabled`, `hidden`, le chemin de l'`action` d'un formulaire), **sans aucun texte de la page** — ni nœud de texte, pas même à l'intérieur d'un bouton, ni valeur de champ ; les valeurs de ces attributs sont en revanche conservées, `aria-label` et `placeholder` compris, jusqu'à 80 caractères —, l'état de la PR et la version du site lus sur la page, et le délai depuis l'ouverture de la page. Jamais la valeur d'un champ, ni le texte d'un commentaire ou du code. Un libellé d'interface peut toutefois nommer ce que la page affiche, un compte par exemple. Une ligne de sélecteur désigne aussi un **squelette de la page**, pris à l'instant de l'échec et stocké à part, compressé : un élément par ligne, avec la même liste fermée d'attributs et leurs valeurs, sans aucun texte de la page, jamais la valeur d'un champ ni le texte d'un commentaire ou du code. Les squelettes occupent **1 Mo au plus**, les plus anciens effacés d'abord, et aucun n'est écrit quand l'espace de stockage de l'extension manque de marge. Le bouton « Télécharger le diagnostic » les réunit avec le journal dans une archive `.zip`, qui ne quitte votre appareil que si vous la partagez ; « Effacer le journal » les efface avec lui. L'archive contient aussi le **journal d'inscription du script de contenu** : à chaque fois que l'extension inscrit, met à jour ou retire son script, la date, l'événement qui l'a déclenché (démarrage de l'extension, permission ou étiquette d'hôte modifiée), les **motifs d'adresse des hôtes servis** (`https://github.com/*` par exemple), l'état de l'inscription avant et après, l'erreur éventuelle renvoyée par le navigateur et le nombre d'onglets ouverts où le script a été injecté — quarante passes au plus, aucune adresse de page ; « Effacer le journal » l'efface aussi. Le même journal garde les **exceptions que l'extension laisse échapper** (celles du code de l'extension, pas celles du site) : une ligne par message, avec ce message et sa pile **tronqués**, la page et la plateforme. Le message d'une exception peut citer ce que le code manipulait, d'où la troncature ; rien de plus n'est relevé. Sur un serveur d'entreprise, ce chemin nomme un dépôt et un numéro de revue : c'est le prix du diagnostic, et la page d'options **efface ce journal d'un clic**. Écrit **toujours**, y compris sans télémétrie — c'est l'outil de diagnostic du §9.4. | Non — il ne quitte votre appareil que si vous avez autorisé la télémétrie ci-dessus, et ce qui part alors ne porte que le **nom de la règle**, jamais l'adresse. Les exceptions ne partent **jamais**. |

L'extension ne stocke **aucun jeton d'authentification ni secret**. Elle
ne s'authentifie auprès d'aucune API à jeton : les seules données qu'elle
lit hors du DOM de la page sont celles accessibles par la route web déjà
autorisée par votre session de navigation.

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

_Last updated: 2026-11-12._

This page is the public privacy policy for the **Conventional Comments
Toolkit** browser extension, distributed on the Chrome Web Store and
equivalent stores (Firefox Add-ons, Edge Add-ons). It is intentionally
hosted on this public repository: this file's GitHub view URL is the URL
to enter in store submission forms.

One-sentence summary: **the extension itself does not collect, store on
a remote server, or transmit any code, comment, or diff content you view
or write.**

**Scope of this document.** The product is the browser extension, and
only the extension: it has no server component. An earlier version of
this page described an optional server component, self-hosted by each
organization; it was removed from the product
([DEC0010](docs/idr/DEC0010-the-extension-is-the-whole-product-en.md)),
and the section describing it went with it.

## What the extension does

Conventional Comments Toolkit assists writing code review comments that
follow the Conventional Comments convention, on GitHub, Azure DevOps
and GitLab: a toolbar for inserting labels, input validation, and
visual feedback inside the platform's native comment editor.

## Data processed by the browser extension

| Data | Where it lives | Does it leave the browser? |
|---|---|---|
| Interface language, direct keyboard shortcuts and label button order | `chrome.storage.sync` | **Syncs across your Chrome account's devices if sync is enabled** — that's Chrome's own native mechanism, not a server run by the extension. Limited to these two preferences, never comment or code content. |
| Current degraded state (diagnostics) | `chrome.storage.local`, on your device | No |
| Notices from the last configuration read (shown in the options page): the host and path of the repository read (for example `github.com/organization/repository`), and for each notice its kind, its code, its English text and what it cites — a configuration key or value, the index and a bounded excerpt (40 characters) of an allowlist pattern, a version, the level at fault —, plus, as a reference, **the rejected value itself, in full**: an allowlist pattern or a tool command, as written in the configuration. Replaced at each read, with no history | `chrome.storage.local`, on your device | No |
| Enabled optional domains (Azure DevOps, GitHub Enterprise, etc.) | `chrome.permissions`, managed by Chrome | No — Chrome holds this list, not the extension |
| The displayed repository's `.conventional-comments.json` configuration | the extension makes a dedicated network request to the file's `raw` route (using your session cookies, never a token of its own), cached in memory per tab — in-site navigation (moving between PRs without a reload) keeps it; only a full page reload or closing the tab destroys it | No — it's a read, on a web route your session already authorizes, the same way it would if you opened it yourself in a tab |
| Comment, code, and diff content you view or write | stays in the page and the platform's native editor | **Never transmitted anywhere by the extension** |
| Enterprise policy floor (`configUrl`, `exemptUsers`, allowlist patterns…), if your organization deploys one | read from `chrome.storage.managed`, populated by your organization's browser policy; the extension only reads it | No |
| **Data processed in memory only, never written or transmitted** — notably your platform account identifier and those of the authors of displayed comments, read from the page DOM for validation and thread display | the tab's memory, for the lifetime of the page | No — neither written to `chrome.storage` nor sent anywhere; gone when the tab closes |
| Usage telemetry | **Nothing is emitted** unless all three of the following hold: your organization's **enterprise policy** — pushed by your browser, out of reach of any repository — declares `telemetry.enabled` **and** an `https:` collection endpoint, **and** you have ticked the dedicated checkbox on the extension's options page. That checkbox shows the address, and **your consent applies to that one only**. Consent is stored **on this device** (`chrome.storage.local`) and **does not sync**; unticking it disarms already-open tabs immediately, and stays possible even if the policy has stopped declaring an endpoint. | **Only if you have explicitly allowed it**, and then only to your organization's endpoint. What leaves is a **periodic aggregate**: the displayed repository (`host/scope`), the configuration's mode, and counters of identifiers — labels used, with their kind (`remark`, `status` or `reply`), diagnostic codes, degraded selector chains. **Never free text**: a value that is not a well-formed identifier is dropped rather than sent. The request carries **neither cookies nor a referrer** — the review page's address does not travel with it, which `npm run check:beacon` measures in a real browser on every run. |
| Local journal (interface degradations and exceptions) | `chrome.storage.local`, on your device: **one line per selector rule**, fifty at most, each keeping only that rule's **most recent** observation — its name, a timestamp, **the page's address** as it stood at that moment, query parameters and fragment included, the selectors the rule tried, the platform, the date of its first observation and how many there were, the **last five distinct addresses** where the rule failed, and, when the rule did find its element later in the same visit, how many times and after how many milliseconds. Added to it is a **record of the interface** at the last failure: how far each selector found something, and the **fingerprint** of a few nearby elements — their tag, a closed list of interface attributes (`id` and `name` with their digits masked, `class`, `role`, `type`, `aria-label`, `placeholder`, `data-testid`, `data-component`, `data-variant`, `data-status`, `disabled`, `aria-disabled`, `hidden`, the path of a form's `action`), **with none of the page's text** — no text node, not even inside a button, and no field value; the values of those attributes are kept, though, `aria-label` and `placeholder` included, up to 80 characters —, the state of the PR and the site version read on the page, and the delay since the page was opened. Never the value of a field, nor the text of a comment or of code. An interface label can still name what the page shows, an account for instance. A selector line also points to a **skeleton of the page**, taken at the moment of the failure and stored separately, compressed: one element per line, with the same closed list of attributes and their values, none of the page's text, never the value of a field nor the text of a comment or of code. Skeletons take **at most 1 MB**, the oldest deleted first, and none is written when the extension's storage is short of room. The "Download the diagnostic" button bundles them with the journal into a `.zip` archive, which leaves your device only if you share it; "Clear the log" deletes them with it. The archive also holds the **content script's registration log**: each time the extension registers, updates or removes its script, the date, the event that triggered it (extension start, host permission or host tag changed), the **address patterns of the served hosts** (`https://github.com/*` for instance), the state of the registration before and after, any error the browser returned, and the number of open tabs the script was injected into — forty passes at most, no page address; "Clear the log" deletes it too. The same journal keeps the **exceptions the extension lets escape** (those of the extension's own code, not the site's): one line per message, with that message and its stack **truncated**, the page and the platform. An exception's message can quote what the code was handling, hence the truncation; nothing more is recorded. On an enterprise server that path names a repository and a review number: this is the privacy trade-off diagnostics require, and the options page **clears this journal in one click**. Written **always**, telemetry or not — it is the §9.4 diagnostic tool. | No — it leaves your device only if you allowed telemetry above, and what leaves then carries only the **rule's name**, never the address. Exceptions **never** leave. |

The extension stores **no authentication token or secret**. It does not
authenticate against any token-based API: the only data it reads outside
the page DOM is what is reachable via the web route your browsing session
already authorizes.

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
