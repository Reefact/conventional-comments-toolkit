# Justification des permissions — soumission Chrome Web Store

Ce document est le brouillon à copier/coller dans le formulaire de soumission
du Chrome Web Store (section *Permission justification* de la fiche de
l'extension). Il couvre les permissions déclarées dans
`packages/extension/src/manifest.json` et s'appuie sur les garanties du
§10 de `specifications-fr.md` ("Sécurité", "Confidentialité").

À tenir à jour si `manifest.json` change ; sinon la revue Google et ce
document divergent silencieusement.

## Single purpose (description de la finalité unique)

> Conventional Comments Toolkit aide les personnes qui font des revues de
> code sur GitHub (et, en option, Azure DevOps) à rédiger des commentaires
> conformes à la convention Conventional Comments : barre d'outils
> d'insertion des labels, validation du format à la saisie, retour visuel
> dans l'éditeur de commentaire natif de la plateforme. L'extension
> n'effectue aucune autre fonction.

## Permissions déclarées

### `storage`

**Usage réel (vérifié contre le code, `packages/extension/src/options/options.ts`
et `content-internal.ts`) :**
- `chrome.storage.sync` : langue d'interface (`language`) et raccourcis
  clavier directs (`directShortcuts`) — ces deux préférences **se
  synchronisent entre les appareils du compte Chrome de l'utilisateur**
  si la synchronisation est activée (voir la note ci-dessous).
- `chrome.storage.local` : état dégradé courant (`degradedState`),
  purement diagnostique.
- `chrome.storage.managed` : lecture du plancher de politique d'entreprise
  (§8.1.1), pas d'écriture côté extension.

**Correction (revue Codex, second passage) :** `selectorFailures` n'est
que **lu** depuis `chrome.storage.local` par la page d'options
(`options.ts:85`) — rien dans le code de production ne l'y **écrit**.
`SelectorLog` ne garde ses échecs qu'en mémoire (tableau interne). Le
journal affiché dans les réglages est donc toujours vide en l'état
actuel ; ne pas le décrire comme une donnée réellement persistée tant que
cette écriture n'existe pas.

Il n'y a **pas** de liste de « dépôts autorisés » persistée, et le cache
de lecture de `.conventional-comments.json` (`ClientConfigResolver`) est
un `Map` en mémoire — **du script de contenu, pas du service worker**
(`bootstrap()` l'instancie dans `content-internal.ts:118`) — pas une
entrée `chrome.storage`. Sa portée est donc **par onglet** : il est
perdu à chaque déchargement de ce contexte (navigation, rechargement de
la page), pas seulement au redémarrage du navigateur.

**Justification :** ces préférences doivent survivre à la fermeture de
l'onglet ; c'est la seule permission qui le permet en MV3. Aucune donnée
n'est envoyée à un serveur de l'extension — le seul canal de sortie de
`chrome.storage.sync` est l'infrastructure de synchronisation du compte
Google de l'utilisateur lui-même, pas un service tiers à l'extension.

### `scripting`

**Usage réel (vérifié) :** **enregistrer et retirer dynamiquement le
script de contenu sur les hôtes optionnels** que l'utilisateur a
lui-même autorisés (Azure DevOps, GitHub Enterprise Server, domaine
interne) — via `chrome.scripting.registerContentScripts()` et
`unregisterContentScripts()` dans `background.ts`, seuls appels à cette
API dans tout le code.

Ce n'est **pas** ce qui injecte l'extension sur github.com : cet hôte est
couvert par l'entrée statique `content_scripts.matches` du manifeste, et
`registerContentScriptForOrigin()` l'**exclut explicitement** de son
mécanisme dynamique.

**Justification :** l'entrée `content_scripts` du manifeste est statique
et ne peut pas énumérer à l'avance les domaines d'entreprise
auto-hébergés. Sans `scripting`, accorder la permission d'hôte sur
`dev.azure.com` ou un GHES depuis la page d'options n'injecterait le
script **nulle part** — la permission serait accordée sans effet. Cette
API n'est appelée que pour un origin que l'utilisateur vient d'autoriser,
jamais de façon globale.

### `activeTab` — retirée du manifeste

Cette permission était déclarée mais consommée par aucun code (aucun
appel à `chrome.tabs` ni `chrome.scripting.executeScript` ; l'action de
la barre d'outils n'appelle que `chrome.runtime.openOptionsPage()`, qui
n'en a pas besoin). Une permission déclarée sans usage réel est
exactement le type d'écart qu'un reviewer Google questionne — elle a été
retirée du manifeste (voir `packages/extension/src/manifest.json`).

**Écart assumé avec `specifications-fr.md`.** Le §10 de la spécification
liste `storage`, `scripting`, `activeTab` comme le jeu minimal — ce texte
n'est **pas** modifié pour coller à ce retrait, conformément à la règle
de ce dépôt qui fait de la spec la référence normative, jamais réécrite
pour suivre l'implémentation. La divergence est donc connue et délibérée,
pas une réconciliation silencieuse : si un usage réel de `activeTab`
apparaît plus tard (diagnostics contextuels sur l'onglet actif, par
exemple), la permission sera réintroduite avec sa justification.

### `host_permissions` — l'entrée statique `https://github.com/*` a été retirée

Vérifié dans le code : cette permission statique n'était le déclencheur
d'aucun chemin identifié.
- L'injection de la barre d'outils est couverte par
  `content_scripts.matches: ["https://github.com/*"]` du manifeste, qui
  suffit à lui seul en MV3 — sans entrée correspondante dans
  `host_permissions`.
- La lecture de `.conventional-comments.json`
  (`getRepoConfig()`/`getOrgConfig()`) est une requête **same-origin**
  (le script de contenu tourne déjà sur `github.com` et interroge
  `github.com`) : elle ne franchit aucune frontière CORS.
- `registerContentScriptForOrigin()` (`background.ts`) **exclut
  explicitement** `https://github.com/*` de son mécanisme d'activation
  dynamique.

`specifications-fr.md` (§2, ligne 1780) cadre github.com comme le seul
hôte « pré-déclarable » par opposition aux hôtes optionnels — l'esprit de
ce texte est respecté : l'accès à github.com reste statique, via
`content_scripts.matches`, sans passer par `optional_host_permissions`.
Retirer l'entrée `host_permissions` redondante ne contredit donc pas la
spec, contrairement au retrait de `activeTab` ci-dessus.

### `optional_host_permissions`: `https://*/*`

**Usage :** cette permission n'est **jamais active par défaut**. Elle est
demandée à l'exécution, domaine par domaine et avec confirmation explicite
de l'utilisateur, dans deux cas précis :

1. l'organisation utilise Azure DevOps (`dev.azure.com`,
   `*.visualstudio.com`, ou un domaine Azure DevOps Server auto-hébergé) ;
2. l'organisation référence un fichier de configuration
   (`configUrl`, §8.1.3 de la spécification) hébergé sur un domaine
   interne distinct des domaines de plateforme ci-dessus.

**Justification :** l'univers des domaines Azure DevOps Server
auto-hébergés et des domaines internes d'entreprise n'est pas énumérable
à l'avance — c'est le cas d'usage documenté d'`optional_host_permissions`
dans la documentation Chrome pour une extension qui doit rester utilisable
en environnement d'entreprise sans publier une version par domaine
d'organisation. Sans cette permission optionnelle, l'extension serait
soit inutilisable sur Azure DevOps auto-hébergé, soit contrainte de
demander `<all_urls>` en permission statique — un scope strictement plus
large que celui demandé ici. L'utilisateur reste maître de l'octroi :
aucun domaine n'est activé sans son geste explicite dans les options de
l'extension.

**✅ Le domaine accordé active désormais l'adaptateur.** Corrigé : le
script de contenu était bien injecté sur l'hôte autorisé
(`background.ts`, `registerContentScriptForOrigin`), mais `bootstrap()`
(`content-internal.ts`) instanciait `GithubClientAdapter`/
`AzdoClientAdapter` sans leur passer les hôtes accordés. La page
d'options associe maintenant chaque hôte à une plateforme
(`hostPlatforms`, `chrome.storage.local`) — un hôte accordé mais non
associé n'active toujours aucun adaptateur plutôt que d'être deviné —
et `bootstrap()` transmet la liste correspondante en `extraHosts` au
bon constructeur. Testé (`packages/extension/test/extra-hosts.test.ts`).

**⚠️ Un écart reste confirmé dans le code actuel, à régler avant de
s'appuyer sur cette permission en soumission :**
**`configUrl` sur un domaine tiers ne se lit pas depuis un script de
contenu.** `getRepoConfig()`/`getOrgConfig()` des deux adaptateurs
appellent `fetch` directement dans le contexte du script de contenu ;
ces requêtes restent soumises à la politique CORS de la page hôte. Le
message `cct-fetch-config` que `background.ts` sait traiter existe
déjà pour ce cas précis, mais rien dans les adaptateurs ne l'envoie —
la lecture d'un `configUrl` distinct du domaine de plateforme échoue
donc en pratique et bascule l'extension en état dégradé.

Tant que ce point n'est pas corrigé, ne pas décrire dans le formulaire
de soumission une résolution complète de la configuration
d'organisation sur un domaine distinct de la plateforme : cette
permission optionnelle reste correctement scoping-justifiée, et
l'activation de l'interface sur un domaine auto-hébergé fonctionne
désormais de bout en bout, mais la lecture du `configUrl` d'entreprise
ne l'est pas encore.

## Ce que l'extension ne fait pas (à rappeler en cas de question du reviewer)

- Aucun contenu de commentaire, de code ou de diff ne quitte le
  navigateur (§10, "Confidentialité").
- **Télémétrie : pas encore câblée dans le code livré.** `telemetry.enabled`
  et `telemetry.endpoint` existent dans le schéma de configuration
  (`packages/core`), mais aucun code de l'extension ne les lit ni
  n'émet quoi que ce soit — `SelectorLog` (le seul journal candidat) est
  toujours construit sans callback de télémétrie. **Pour cette
  soumission : répondre qu'aucune télémétrie n'est collectée**, plutôt
  que de décrire un mécanisme opt-in configurable qui n'existe pas
  encore côté extension.
- Aucun jeton d'authentification (PAT) ni secret n'est stocké par
  l'extension, et elle ne s'authentifie à aucune API à jeton. **Elle
  émet en revanche des requêtes réseau**, et il faut le dire tel quel :
  la lecture de `.conventional-comments.json` par la route `raw` du
  dépôt affiché, et, si un plancher d'entreprise désigne un `configUrl`,
  celle du document d'organisation. Ces requêtes portent les cookies de
  session de l'utilisateur (`credentials: 'include'`) — la même
  autorisation que s'il ouvrait ces URL dans un onglet — et ne
  transportent aucun contenu vers l'extérieur : ce sont des lectures.
- Aucun code distant : `content_security_policy` interdit tout script qui
  ne soit pas empaqueté dans l'extension, aucune dépendance CDN.
- Code source public et auditable (dépôt Apache-2.0).
