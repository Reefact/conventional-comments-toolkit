---
name: plateforme
description: Protocole de création ou de remise à niveau d'un adaptateur de plateforme (Azure DevOps, GitLab, Bitbucket, une nouvelle génération de GitHub…) — captures de la plateforme SANS l'extension d'abord (de préférence par une session Claude Code locale pilotant Claude in Chrome, qui capture et réduit dans le navigateur), puis sélecteurs mesurés, tests sur pages réelles, gardes et canari. À utiliser dès qu'on parle de créer une plateforme, d'en remettre une à niveau, de corriger ses sélecteurs, ou de recevoir des captures de pages.
---

# Créer ou remettre à niveau une plateforme

L'ordre est la règle : **mesurer, PUIS écrire**. L'adaptateur GitHub a été construit dans
l'autre sens — des sélecteurs écrits de mémoire ou déduits, corrigés au fil des revues — et le
jour où l'on a enfin capturé de vraies pages (2026-10-28, PR #82), tous les candidats bâtis sur
les classes `X-module__y` ne trouvaient plus rien : sur *Files changed*, aucun bouton d'envoi
n'était intercepté, une édition passait pour une composition, le panneau de revue pour un
commentaire de ligne. Aucun garde ne l'avait vu, parce qu'aucun ne regardait une vraie page.

Ce protocole ne s'applique pas à un seul sélecteur cassé sur une plateforme déjà capturée :
là, l'étape 1 se réduit à recapturer l'état concerné, et l'on reprend à l'étape 4.

## Conduite : une étape à la fois

La personne qui capture n'a, en général, jamais suivi ce protocole. **La guider pas à pas** :
chaque message donne UNE action — une commande, un clic, une vérification —, dit à quoi elle
reconnaîtra que c'est réussi, puis attend son retour avant la suivante. Ne pas déverser le
protocole : à la première question, deux ou trois lignes situent le chemin, puis vient la
première étape. Ce fichier s'adresse à l'agent ; il ne se recopie pas à la personne.

Une décision dont l'étape en cours n'a pas besoin — amendement de la spec, composant B,
périmètre d'hôtes — attend l'étape où elle sert. La poser d'avance, c'est le gros bloc.

(Retour du propriétaire, 2026-11-08, premier usage du skill, pour GitLab : la première réponse
avait livré tout le protocole d'un seul bloc.)

**Ce skill s'améliore à l'usage.** Une étape mal décrite, un prérequis oublié, un « à vérifier »
désormais mesuré : corriger ce fichier au fil de l'eau, dans la même branche, sans attendre la
fin du chantier.

## 0. Ce qui ne bouge pas

- **Une PR touche UNE plateforme, ou le code partagé** (`npm run check:pr-scope`). La PR qui
  CRÉE une plateforme peut toucher ses fichiers d'inscription (`REGISTRATION_FILES`,
  `scripts/lib/pr-scope.mjs`) ; aucune autre. Si le contrat partagé manque d'une méthode, c'est
  une PR de contrat à part, AVANT.
- **Les sélecteurs vivent dans un seul fichier par adaptateur** (§9.4) :
  `packages/adapters/<id>/src/selectors.ts`.
- **Rien n'est déduit.** Une affirmation sur la page se lit dans une capture, ou s'écrit « à
  vérifier » (CLAUDE.md, « Écrire sur une plateforme qu'on ne contrôle pas »).

## 1. Demander les captures — avant d'écrire une ligne

Ce que l'adaptateur doit reconnaître est fixé par le contrat (§4.1, §4.3, §9.2.3), pas par la
plateforme. La liste des états suit donc les zones du §4.1, et chaque plateforme la traduit
dans ses propres écrans :

| # | État | Ce qu'il permet de mesurer |
|---|---|---|
| 1 | Nouveau commentaire général ouvert | zone `conversation`, ses boutons d'envoi |
| 2 | Réponse ouverte dans un fil existant | zone `reply`, l'identifiant du fil |
| 3 | Commentaires publiés portant un préfixe, dans leurs FORMES (voir sous le tableau) | corps rendus, badges (§5.5), auteurs, ancres |
| 4 | Commentaire ouvert sur une ligne de code | zone `thread-root`, ses boutons |
| 5 | Réponse ouverte dans un fil sur une ligne | `reply` dans la vue du code |
| 6 | Modification d'un commentaire existant, dans CHAQUE vue qui le permet | `action: 'edit'`, `commentId` |
| 7 | Corps de revue soumise en lot, panneau ouvert — si la plateforme en a un | zone `review-body` |
| 8 | PR fermée ou fusionnée | absence du bouton de complétion (normale, §9.4) |
| 9 | Onglet d'aperçu (*Preview*) d'un commentaire en cours de rédaction | corps d'aperçu (§5.5) |

**Obligatoires avant d'inscrire une plateforme** dans `packages/extension/src/platforms.ts` :
1 à 6, et 7 si la plateforme a un corps de revue. Ce sont les états où l'extension CLASSE un
champ ou INTERCEPTE un envoi : un défaut y change ce qu'elle bloque. 8 et 9 peuvent suivre.
Un état que la plateforme n'a pas s'écrit « sans objet » dans la PR, avec la raison — jamais
omis en silence.

**L'état 3 n'est pas « un commentaire préfixé » : c'est chaque forme que la spec distingue,
rendue par la plateforme.** Des commentaires d'une seule ligne `label: sujet` ne montrent pas
où tombe la ligne de préfixe dans un corps rendu, ni ce que l'adaptateur doit y retrouver pour
placer les badges (§5.5). Publier au moins :
- un commentaire préfixé **sans** discussion, et un commentaire **bloquant avec** discussion
  sur plusieurs blocs — paragraphe, liste (§3.1, et l'avertissement `W-NO-DISCUSSION` du §3.5,
  qui porte sur le cas sans) ;
- un commentaire dont la ligne de préfixe n'est **pas** la première : du code cité AVANT elle
  (§3.1, §3.4.1) ;
- une **réponse publiée** dans un fil, avec un label de réponse (§3.2) — le champ de réponse
  ouvert (état 2) ne montre pas une réponse rendue ;
- si la plateforme en a un, son **bloc de suggestion natif**, accompagné d'une phrase (étage 0,
  §3.5) : la spec n'en donne le marqueur que plateforme par plateforme (annexes), et le rendu
  capturé est la mesure dont un amendement aurait besoin — l'amendement, lui, reste une
  décision du propriétaire.

Les capturer dans chaque vue qui affiche des commentaires. (Premier usage : les trois
commentaires publiés pour l'état 3 tenaient chacun sur une ligne ; la question du propriétaire —
« c'est prévu que tu fasses des tests avec un commentaire conventionnel avec body aussi ? » — a
révélé le manque.)

**Inventorier les commandes de l'éditeur, puis capturer chacune de celles qui changent quelque
chose.** Le tableau ci-dessus dit QUELS champs capturer ; il ne dit pas dans quels MODES ils
s'affichent. Après la première capture, et sur elle — pas de mémoire, ni d'après l'icône d'un
bouton —, lister tous les `button`, `input` et `select` du formulaire qui contient le champ
(happy-dom, depuis le scratchpad), avec leur nom accessible, puis les trier :

- **ce qui n'écrit que du TEXTE dans le champ** (mise en forme, insertion, modèle, pièce
  jointe) : aucune capture ;
- **ce qui change l'ÉLÉMENT de saisie** (bascule texte brut / texte enrichi : une `<textarea>`
  peut devenir un `contenteditable`, et l'extension ne verrait plus le champ), **son CONTENEUR**
  (plein écran, panneau, fenêtre), **ou le CHEMIN D'ENVOI** (bouton scindé ou menu de type
  d'envoi, case qui change la nature du commentaire, bouton d'une autre action placé dans le
  même formulaire, revue en lot) : une capture chacun, sous le numéro de son état, le mode dans
  le nom — `NN-<vue>-<état>-<mode>.html`.

Deux angles morts à couvrir aussi : le bouton d'envoi d'un champ VIDE est souvent désactivé, et
son libellé peut changer champ rempli — d'où une capture champ REMPLI, sans envoi ; l'envoi au
CLAVIER n'a pas d'élément, aucune capture ne le montre, il se teste à la validation finale.
Taper dans un champ n'est pas publier, mais c'est écrire sur la plateforme : accord de la
personne d'abord, un texte qui se dit de test, puis champ vidé et rechargement pour vérifier
qu'aucun brouillon ne reste. Ce que l'utilisateur a CHANGÉ n'est PAS dans la capture : la valeur
d'une `<textarea>`, l'état coché d'une case ou d'un bouton radio sont des propriétés de l'élément
vivant, que le HTML ne sérialise pas. Une telle capture ne montre que ce que la page en a
DÉDUIT (libellés, attributs ARIA, classes) — le noter, et ne pas bâtir de sélecteur sur l'état.
Et « désactivé » se mesure sur l'élément vivant : `aria-disabled` sans attribut `disabled` est
courant, et `:disabled` / `:enabled` ne le voient pas.

Un mode peut être **mémorisé pour le compte** (rechargement, autre vue, autre champ) : le
mesurer, puis remettre le mode d'origine de la personne et vérifier qu'il tient après
rechargement. Un mode mémorisé n'est pas un cas marginal — qui l'a choisi une fois y reste.

Les mesures elles-mêmes — quel bouton, quel élément, quel attribut — appartiennent à
l'adaptateur, pas à ce skill : `packages/adapters/<id>/CAPTURES.md`. (Questions du
propriétaire, premier usage : après les captures 01 à 05, aucune n'avait regardé ces
commandes ; puis « tu t'es assuré que tu as testé toutes les possibilités de l'éditeur ? » —
non, l'inventaire n'avait pas été fait ; enfin, le skill doit rester générique.)

Les captures se prennent **extension Conventional Comments désactivée**, sur des PR de test sans
contenu privé — dans une organisation de test si possible. Deux voies : **A**, la session locale
avec Claude in Chrome, qui couvre aussi les étapes 2 et 3 et ne demande à la personne que ce
qu'elle seule peut faire ; **B**, la copie à la main, en repli.

### Voie A — session locale avec Claude in Chrome (recommandée)

Claude Code pilote l'extension Claude in Chrome dans le navigateur de la personne, avec sa
session connectée (documentation Claude Code, « Use Claude Code with Chrome », lue le
2026-11-08). La même session a le terminal, Git, Node ET le navigateur : elle capture, réduit,
vérifie et commite sans copier-coller.

**Elle exige une session LOCALE où Chrome est ACTIVÉ** — `claude --chrome`, en CLI ou dans VS
Code — lancée dans un clone du dépôt (`npm ci`, `npm run build`). Le drapeau ne suffit pas à le
garantir : au premier usage (2026-11-08, Claude Code 2.1.317, Windows), une session lancée par
`claude --chrome` n'avait pas les outils, et `/chrome` y affichait « Not enabled in this
session ». La cause n'est pas établie — à vérifier ; au lancement suivant, un écran « Claude in
Chrome » attendait « Enter to confirm · Esc to cancel » avant la session. `/chrome` ne rattrape
pas une session où Chrome n'est pas activé : il demande de quitter et de relancer par
`claude --chrome --resume`. Faire confirmer à la session, par ToolSearch, la présence des outils
avant toute autre étape. Une session
dans le cloud n'a pas les outils `mcp__claude-in-chrome__*` : la chercher par ToolSearch, et
s'ils manquent, ne rien improviser — proposer à la personne de relancer en local, ou la voie B.
Prérequis à lui faire vérifier : l'extension Claude in Chrome (1.0.36 ou plus), connectée au
même compte et à la même organisation que Claude Code ; l'extension Conventional Comments
DÉSACTIVÉE dans ce Chrome ; les PR de test créées par elle — ne rien créer ni écrire sur la
plateforme sans son accord.

Les PR de test vivent dans un projet PERSONNEL sans contenu privé — jamais dans l'organisation
d'un employeur, même quand la personne y travaille sur la même plateforme. Il en faut au moins
deux (audit, étape 2), chacune ajoutant un petit fichier de code, pour qu'un commentaire de ligne
soit possible. Si la personne délègue leur création, la session peut les créer depuis l'onglet,
par l'API de la plateforme avec la session du navigateur (`fetch` depuis la page ; un jeton
anti-CSRF éventuel se lit dans la page et s'utilise sans jamais être renvoyé) : le script ne
rend que des statuts et des numéros. Les appels exacts vont dans `CAPTURES.md` de l'adaptateur.
Un projet privé suffit aux captures ; il interdit seulement le canari anonyme (étape 6).

**Si la question arrive dans une session cloud**, c'est elle qui mène la personne jusqu'à la
session locale, une étape par message : (1) le clone, sur la branche qui porte la version du
skill en cours d'amélioration si elle n'est pas fusionnée, puis `npm ci` et `npm run build` ;
(2) l'extension Claude in Chrome installée et connectée, Conventional Comments désactivée ;
(3) la CLI Claude Code présente : `claude --version` doit afficher une version. Ne pas la
supposer installée — un utilisateur de l'application de bureau ou de claude.ai ne l'a pas
forcément (premier usage, 2026-11-08, Windows : « 'claude' n'est pas reconnu »). L'installer
selon la documentation Claude Code, « Advanced setup », dont la commande dépend du terminal
(PowerShell, CMD, macOS/Linux). Si le téléchargement du binaire échoue (même
session, `curl: (56)`, « Failed to download binary »), `winget install Anthropic.ClaudeCode`
se passe de curl (même page de documentation, « Troubleshoot installation »). Puis ouvrir un
NOUVEAU terminal, sans quoi le PATH n'est pas relu ; (4) `claude --chrome` lancé dans le clone, et le skill invoqué. La session locale prend
alors le relais.

Pour chaque état, dans un onglet que la session ouvre elle-même :

1. Ouvrir l'état (naviguer, cliquer). Page de connexion, CAPTCHA, bouton introuvable : demander
   à la personne, qui le fait dans la fenêtre visible, puis reprendre.
2. Générer le script de réduction de l'état :
   `npm run --silent build:page-reducer -- <id> NN-<vue>-<état>.html --out <scratchpad>/NN.js`
   (`--no-selectors` pour une plateforme sans `selectors.ts`, comme à l'étape 2).
3. L'exécuter par `javascript_tool` dans l'onglet de l'état. Il réduit la page affichée, prouve
   la réduction — chaque candidat, mêmes éléments et mêmes valeurs lues avant et après ; point
   fixe ; aucun secret connu ; aucune classe `cct-` sur un élément — par les mêmes fonctions que
   la ligne de commande (`check:page-reducer` les tient pour équivalentes), puis TÉLÉCHARGE la
   seule forme réduite. Il rend un résumé fait de ce qu'il sait déjà ou mesure — nom de fichier,
   tailles, problèmes —, AUCUN texte de la page, pas même son titre : `ok: false` liste les
   problèmes et rien n'est téléchargé — corriger l'état, ou le signaler.
4. Déplacer le fichier téléchargé dans `packages/adapters/<id>/test/fixtures/pages/`, en
   vérifiant son nom (Chrome suffixe « (1) » un doublon).

**Ce qui ne se fait jamais**, parce que la page brute ne doit ni toucher le disque ni entrer dans
la conversation : extraire le HTML ou une valeur d'attribut de la page (`javascript_tool` qui
renvoie `outerHTML`, lecture d'un texte de page pour le recopier), coller une page, téléverser
une capture. Lire la page pour s'y repérer et cliquer, oui ; en extraire, non.

Ensuite, comme toute capture : `reduce:captured-pages -- <id> --check`, l'audit (`node
scripts/check-captured-pages.mjs --audit`, sur au moins deux PR pour une plateforme nouvelle,
rapport trié comme à l'étape 2), `node scripts/check-captured-pages.mjs`, puis l'étape 3.

**Mesuré au premier usage** (2026-11-08, Claude in Chrome 1.0.105, Windows) —
`check:page-reducer` mesure le script par `page.evaluate` dans Chromium, pas par l'extension :
- `javascript_tool` exécute le script (texte du fichier généré passé tel quel) et rend l'objet
  résumé, `ok: true` et les tailles ;
- le téléchargement passe sans demande de confirmation de Chrome, dans `~/Downloads`, au nom
  demandé — mais APRÈS le retour du script, pas avant : le fichier peut manquer à l'instant où
  `ok: true` arrive. Le chercher à nouveau avant de conclure qu'il n'est pas parti ; la taille sur disque dépasse de quelques octets `reducedBytes`, qui compte des
  caractères, pas des octets UTF-8 ;
- Claude in Chrome n'ajoute rien au DOM capturé : les enfants de `<body>` de la page réduite
  appartiennent tous à la plateforme (vérifié sur une seule page — à refaire si l'extension
  change) ;
- les outils de vérification SOUS WINDOWS : avant le correctif `eb8d6c5`, plusieurs passaient
  au vert sans rien regarder (`reduce:captured-pages --check` disait « rien à réduire »). Si un
  garde annonce 0 fichier sur un dossier qui en contient, c'est lui qu'il faut soupçonner.

**Reste à vérifier** : la politique de sécurité d'une plateforme sous Trusted Types — le script
crée sa propre politique (`cct-reduce-capture`) ; une page qui les interdit toutes le fait
échouer explicitement (mesuré dans Chromium), et l'on passe à la voie B. Aucune plateforme
capturée par cette voie ne l'a encore posée.

La validation finale passe par la même session : une fois l'adaptateur écrit (étapes 4-5) et
l'extension construite (`npm run build:extension`), la personne charge `dist-ext/` dans ce
Chrome et l'active ; la session ouvre chaque état sur les PR de test, enregistre des captures
d'écran et les MONTRE à la personne, qui valide. Ces captures montrent une page connectée : elles
ne se commitent pas.

### Voie B — à la main

La consigne à donner à la personne, telle quelle :

> Pour chaque état : ouvre-le dans la page, puis F12 → onglet « Elements » → clic droit sur la
> toute première ligne `<html>` → « Copy » → « Copy outerHTML », et colle le tout dans un
> fichier texte nommé comme indiqué.

Pas « Enregistrer la page sous » : la page est construite après son chargement, et ce que
l'enregistrement conserve n'a pas été vérifié ; la copie depuis F12 prend la page telle qu'elle
est affichée.

**Noms de fichiers** : `NN-<vue>-<état>.html`, `NN` étant le numéro de l'état ci-dessus —
`01-conversation-nouveau-commentaire.html`, `06-files-modification-commentaire.html`. Deux
captures du même état dans deux vues portent le même numéro.

## 2. Réduire AVANT tout envoi — sur la machine de qui a capturé

(La voie A réduit dans le navigateur, page par page, et n'a de cette étape que l'audit et ses
règles. Ce qui suit vaut pour les deux voies, la consigne en ligne de commande pour la B.)

Une page capturée porte la session de qui l'a prise : jetons CSRF, nonces, canaux signés,
identifiant de session du socket. **Aucune capture brute ne quitte cette machine** — ni vers
GitHub, ni dans la conversation. Masquer après coup ne rattrape rien : une branche réécrite ne
garantit pas la disparition d'objets Git déjà reçus (forks, caches, références conservées par
le serveur), et une déconnexion n'invalide pas forcément tous les jetons publiés (revue
Reefact, PR #85). La conversation n'est pas une issue non plus : une page pèse de 0,5 à 3 Mo et
sature le contexte, une capture s'y est perdue.

**Ce qui s'envoie, c'est la page RÉDUITE, jamais la page masquée.** Masquer
(`--redact`) retire ce qu'on SAIT dangereux ; un secret qu'on ne connaît pas encore passe, et
c'est le cas de toute plateforme nouvelle. Réduire (`scripts/reduce-captured-pages.mjs`) prend
le problème à l'envers : une liste blanche — structure, texte, attributs d'interface —, et tout
le reste disparaît, scripts, `<meta>` non listés, valeurs des champs, requêtes des URL. Mesuré
le 2026-11-08 sur les huit captures GitHub : 16 Mo → 7,8 Mo, les 71 tests de l'adaptateur
verts, aucun secret connu restant, et chacun des 99 candidats de `selectors.ts` trouve les
mêmes éléments avant et après.

La réduction se fait sur la machine de qui a capturé, parce que c'est le SEUL moment où la page
brute existe : l'outil y prouve, page par page, que chaque candidat trouve les mêmes éléments
avant et après, et que la page réduite est un point fixe ; une page qui échoue n'est pas
réécrite, et ne part pas. Des sélecteurs introuvables (build oublié) font ÉCHOUER l'outil ; une
plateforme qui n'a pas encore de `selectors.ts` se réduit avec `--no-selectors`, sans
comparaison, et l'outil le dit. Elle demande Node, Git et un Chromium (`playwright-core`). La
consigne à donner, telle quelle :

> ```
> git clone --depth 1 https://github.com/Reefact/conventional-comments-toolkit cct-captures
> cd cct-captures
> npm ci
> npx playwright-core install chromium
> npm run build
> mkdir -p packages/adapters/<id>/test/fixtures/pages
> # y copier les captures, puis :
> node scripts/reduce-captured-pages.mjs <id>
> node scripts/check-captured-pages.mjs --audit
> node scripts/check-captured-pages.mjs
> ```
>
> La réduction doit finir par « page(s) réduite(s) », la dernière commande par « aucun secret
> de session en clair ». Envoie le rapport de `--audit` d'abord, seul ; les fichiers du dossier
> ensuite, quand on te le demande.

Sans Node ni Git sur la machine, il n'y a PAS de voie de repli : on ne reçoit pas la capture.

**Ce que la réduction ne retire pas** : le texte — commentaires, code, noms —, et les attributs
de sa liste blanche (`id`, `class`, `aria-*`, `data-*` courts, chemins d'URL). Un secret qui s'y
logerait passerait. D'où, pour une plateforme NOUVELLE, avant le premier envoi :

1. Capturer des pages d'**au moins deux PR différentes** — une donnée de session est la même
   sur toutes les pages, une donnée de PR change d'une PR à l'autre.
2. Réduire, puis `--audit`, sur les pages RÉDUITES. Le rapport ne contient que des NOMS de
   champs (`link[rel=shared-web-socket] @data-session-id`), jamais de valeur : il se transmet
   sans rien divulguer. Sur les captures GitHub, c'est ce critère — une valeur commune à des PR
   différentes — qui a trouvé `data-session-id`, qu'aucune relecture n'avait vu.
3. Trier le rapport : ce qui authentifie (jeton, identifiant de session, signature) doit être
   retiré par la réduction — règle de `scripts/lib/captured-page-reducer.mjs`, par une PR
   d'outillage livrée AVANT les captures ; les empreintes de version du site (`release`) et les
   données de PR restent.
4. Alors seulement : envoi des pages réduites.

Les captures GitHub sont stockées réduites depuis le 2026-11-08, et la CI le vérifie
(`reduce:captured-pages -- <id> --check`, workflow « Canari navigateur »).

**Si une capture brute a malgré tout été envoyée**, la traiter comme une fuite : révoquer
explicitement la session concernée sur la plateforme — sur github.com, *Settings → Access → Sessions*
liste les sessions web, et *Revoke session* révoque chacune (documentation GitHub, « Viewing
and managing your sessions », lue le 2026-10-28) ; l'équivalent de chaque
autre plateforme est à trouver et à écrire ici le jour où on la traite. Puis retirer la capture
de l'historique (réécriture, avec l'accord de la personne) en sachant que cela n'efface pas ce
qui a déjà été reçu.

`npm run check:captured-pages` tourne dans `checks` et dans la CI : une page qui garde un
secret CONNU fait échouer la PR. C'est un filet, pas la protection — à ce stade, le secret
serait déjà publié.

## 3. Vérifier ce que montre chaque capture

Avant de s'en servir, contrôler sans tout lire (une page ne se charge pas dans le contexte) :
le `<title>` (bonne PR ?), l'absence de toute classe `cct-` (extension bien désactivée ?), et
l'état demandé (le champ est-il là, ouvert, prérempli pour une édition ?). Une capture qui ne
montre pas l'état annoncé se RENOMME d'après ce qu'elle montre — elle sert souvent ailleurs — et
l'état manquant se redemande.

Et qu'elle est bien RÉDUITE : `node scripts/reduce-captured-pages.mjs <id> --check` n'écrit
rien et échoue sur une page que la réduction changerait — la réduction étant un point fixe, une
telle page n'avait pas été réduite. C'est une page brute : à traiter selon l'étape 2.

## 4. Écrire les sélecteurs depuis les captures

- Chaque candidat cite la capture qui le justifie (`// MESURÉ le AAAA-MM-JJ, test/fixtures/pages/05`).
- Préférer les prises qui portent un SENS (`data-*`, rôle, nom de formulaire) aux classes
  générées : un nom de module CSS change avec le code de la plateforme, un `data-testid` ou un
  `data-first-thread-comment` est posé exprès.
- Un nom qui désigne deux choses (`ReviewThreadContainer__…` est un fil ET un commentaire) n'est
  pas une prise.
- Ce qui « distingue » un état se vérifie sur TOUTES les captures où l'élément apparaît, pas sur
  celle où on l'a remarqué : une marque lue sur une page où le champ est seul ne prouve rien
  contre les autres zones. Premier usage : un formulaire pris pour la marque de l'édition portait
  aussi les réponses et les nouveaux fils, et un ancêtre pris pour le commentaire édité entourait
  aussi la réponse à ce commentaire — deux affirmations écrites d'après une seule capture,
  démenties par les suivantes.
- Explorer les captures par un test jetable de `packages/adapters/<id>/test/` (vitest, happy-dom,
  `DOMParser`) qui écrit son résultat dans le scratchpad, et le supprimer ensuite.
- Pour un bouton à intercepter : identifier aussi celui qui ANNULE, et prouver qu'il n'est pas
  pris. Bloquer *Cancel* enfermerait l'auteur d'un commentaire non conforme.
- Les captures sont RÉDUITES : un candidat ne peut chercher que ce que la réduction garde.
  `npm run check:reduced-selectors` refuse celui qui cite un attribut ou un élément retiré
  (`style`, `<link>`, un `<meta>` non listé…) — sur la capture il ne trouverait rien, et une
  assertion négative y passerait à tort. Si la prise est vraiment la bonne, élargir
  `PLATFORM_RULES` (`scripts/lib/captured-page-reducer.mjs`) et RECAPTURER : la page brute,
  seule à porter l'attribut, n'existe plus. Ce garde ne voit pas une valeur retirée parce
  qu'opaque (`data-*` en forme d'empreinte) ; seule la réduction, page brute en main, la voit.

## 5. Figer : les tests sur pages réelles

`packages/adapters/<id>/test/real-pages.test.ts`, sur le modèle de celui de GitHub : chaque
capture est chargée par `DOMParser`, à l'URL où elle a été prise, et l'on affirme, état par
état, les éditeurs observés, leur zone et leur action, leurs identifiants, leurs contrôles
d'envoi, les fils et les corps rendus.

- **Preuve par retrait** : remettre l'ancien `selectors.ts` (ou retirer le candidat) et montrer
  que les tests visés échouent, avec le symptôme visé.
- `npm run check:captured-selectors` : happy-dom doit trouver, sur chaque capture, exactement
  ce que trouve Chromium, candidat par candidat. Mesuré : `:enabled`, `:any-link`,
  `:placeholder-shown` ne trouvent rien dans happy-dom, `:empty` y trouve cent fois trop. Un tel
  candidat ferait passer un test sur un monde qui n'existe pas.
- `npm run check:reduced-selectors` (dans `checks` et la CI) : aucun candidat, aucune lecture
  `getAttribute` de l'adaptateur ne cherche ce que la réduction retire.

## 6. Surveiller la page en ligne

Les captures figent la page d'un jour. Si la plateforme sert des pages **publiques** à un
visiteur anonyme, ajouter ses pages et ses chaînes au canari (`scripts/lib/selector-canary.mjs`,
aujourd'hui propre à GitHub, et un workflow sur le modèle de `github-selectors-canary.yml`) :
des PR FERMÉES, dont l'état ne bouge plus, et seulement les chaînes mesurées comme non nulles
sans session.

Ce qui demande une session — les zones de saisie et leurs boutons — n'est vérifié en ligne
nulle part (#81). Dire, dans la PR, quels états sont surveillés en ligne et lesquels ne le
sont que par les captures.

Pour Azure DevOps, l'issue #50 affirme qu'une PR n'y est pas lisible sans authentification.
C'est À VÉRIFIER avant de conclure qu'aucun canari en ligne n'y est possible : la plateforme
connaît des projets publics, et ce qu'ils montrent à un visiteur n'a pas été mesuré.

## 7. La PR

Une plateforme, et rien d'autre. Elle liste les états capturés, ceux qui sont « sans objet » et
pourquoi, ce que le canari surveille, et ce qui reste non mesuré — un point non mesuré s'écrit,
il ne se comble pas par une supposition.
