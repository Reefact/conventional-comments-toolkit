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

### `activeTab`

**⚠️ Statut à trancher avant soumission — voir la note de bas de section.**
Cette permission figure dans le manifeste (§10 de la spécification liste
`storage`, `scripting`, `activeTab` comme le jeu minimal), mais **aucun
code actuel ne la consomme** : `background.ts` n'utilise l'action de la
barre d'outils que pour `chrome.runtime.openOptionsPage()`, qui ne
requiert pas `activeTab`, et aucun appel à `chrome.tabs` ou
`chrome.scripting.executeScript` n'existe dans l'extension. La déclarer
sans usage réel est exactement le type d'écart qu'un reviewer Google
rejette.

**Deux issues, pas une justification à inventer :**
1. Retirer `activeTab` de `manifest.json` si aucun usage n'est prévu à
   court terme.
2. Implémenter l'usage réel que la spec sous-entend (diagnostics
   contextuels sur l'onglet actif) avant de la justifier ainsi.

Ce choix n'est pas pris dans ce document : il touche au manifeste et,
pour l'option 1, s'écarte du jeu de permissions énuméré par
`specifications-fr.md`, qui reste la référence normative de ce dépôt.

### `host_permissions`: `https://github.com/*`

**⚠️ Statut à trancher avant soumission — même famille de problème que
`activeTab` ci-dessus.** Vérifié dans le code : cette permission statique
n'est probablement **pas ce qui active** l'injection sur GitHub.
- L'injection de la barre d'outils est déjà couverte par
  `content_scripts.matches: ["https://github.com/*"]` du manifeste, qui
  suffit à lui seul en MV3 — sans avoir besoin d'une entrée
  correspondante dans `host_permissions`.
- La lecture de `.conventional-comments.json`
  (`getRepoConfig()`/`getOrgConfig()`) est une requête **same-origin**
  (le script de contenu tourne déjà sur `github.com` et interroge
  `github.com`) : elle ne franchit aucune frontière CORS et ne dépend
  donc pas de `host_permissions`.
- `registerContentScriptForOrigin()` (`background.ts`) **exclut
  explicitement** `https://github.com/*` de son mécanisme d'activation
  dynamique — cette permission statique n'est le déclencheur d'aucun
  chemin de code identifié.

**Ce qui reste à trancher :** soit un usage réel existe et manque
d'être documenté ici, soit cette entrée est un legs redondant avec
`content_scripts.matches` qu'un reviewer Google est en droit de
questionner. Vérifier avant de soumettre, plutôt que de reconduire la
justification précédente ("lire et modifier le DOM… injecter la barre
d'outils") qui décrit un besoin déjà couvert ailleurs.

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

**⚠️ Deux écarts d'implémentation confirmés dans le code actuel, à régler
avant de s'appuyer sur cette permission en soumission :**
1. **Le domaine accordé ne suffit pas à activer l'adaptateur.** Le
   script de contenu est bien injecté sur l'hôte autorisé
   (`background.ts`, `registerContentScriptForOrigin`), mais
   `bootstrap()` (`content-internal.ts`) instancie
   `GithubClientAdapter`/`AzdoClientAdapter` sans leur passer les hôtes
   accordés (`extraHosts`, que les deux adaptateurs acceptent déjà) : sur
   un GitHub Enterprise Server ou un Azure DevOps Server auto-hébergé,
   `matchesHost()` échoue et **aucune interface n'apparaît**, malgré la
   permission accordée.
2. **`configUrl` sur un domaine tiers ne se lit pas depuis un script de
   contenu.** `getRepoConfig()`/`getOrgConfig()` des deux adaptateurs
   appellent `fetch` directement dans le contexte du script de contenu ;
   ces requêtes restent soumises à la politique CORS de la page hôte. Le
   message `cct-fetch-config` que `background.ts` sait traiter existe
   déjà pour ce cas précis, mais rien dans les adaptateurs ne l'envoie —
   la lecture d'un `configUrl` distinct du domaine de plateforme échoue
   donc en pratique et bascule l'extension en état dégradé.

Tant que ces deux points ne sont pas corrigés, ne pas décrire dans le
formulaire de soumission un support Azure DevOps Server / GitHub
Enterprise Server pleinement fonctionnel : cette permission optionnelle
reste correctement scoping-justifiée, mais la fonctionnalité qu'elle
promet n'est pas encore livrée de bout en bout.

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
