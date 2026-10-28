---
name: plateforme
description: Protocole de création ou de remise à niveau d'un adaptateur de plateforme (Azure DevOps, GitLab, Bitbucket, une nouvelle génération de GitHub…) — captures de la plateforme SANS l'extension d'abord, puis sélecteurs mesurés, tests sur pages réelles, gardes et canari. À utiliser dès qu'on parle de créer une plateforme, d'en remettre une à niveau, de corriger ses sélecteurs, ou de recevoir des captures de pages.
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
| 3 | Commentaires publiés portant un préfixe (`issue:`, `suggestion (non-blocking):`…) | corps rendus, badges (§5.5), auteurs, ancres |
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

Les captures se prennent **extension désactivée**, sur une PR de test sans contenu privé. La
consigne à donner à la personne, telle quelle :

> Pour chaque état : ouvre-le dans la page, puis F12 → onglet « Elements » → clic droit sur la
> toute première ligne `<html>` → « Copy » → « Copy outerHTML », et colle le tout dans un
> fichier texte nommé comme indiqué.

Pas « Enregistrer la page sous » : la page est construite après son chargement, et ce que
l'enregistrement conserve n'a pas été vérifié ; la copie depuis F12 prend la page telle qu'elle
est affichée.

**Noms de fichiers** : `NN-<vue>-<état>.html`, `NN` étant le numéro de l'état ci-dessus —
`01-conversation-nouveau-commentaire.html`, `06-files-modification-commentaire.html`. Deux
captures du même état dans deux vues portent le même numéro.

## 2. Désensibiliser AVANT tout envoi — sur la machine de qui a capturé

Une page capturée porte la session de qui l'a prise : jetons CSRF, nonces, canaux signés,
identifiant de session du socket. **Aucune capture brute ne quitte cette machine** — ni vers
GitHub, ni dans la conversation. Masquer après coup ne rattrape rien : une branche réécrite ne
garantit pas la disparition d'objets Git déjà reçus (forks, caches, références conservées par
le serveur), et une déconnexion n'invalide pas forcément tous les jetons publiés (revue
Reefact, PR #85). La conversation n'est pas une issue non plus : une page pèse de 0,5 à 3 Mo et
sature le contexte, une capture s'y est perdue.

**L'outil tourne en local, sans installation.** `scripts/check-captured-pages.mjs` et sa
bibliothèque n'importent que des modules de Node : un clone superficiel suffit, sans
`npm install`. La consigne à donner, telle quelle :

> ```
> git clone --depth 1 https://github.com/Reefact/conventional-comments-toolkit cct-captures
> cd cct-captures
> mkdir -p packages/adapters/<id>/test/fixtures/pages
> # y copier les captures, puis :
> node scripts/check-captured-pages.mjs --redact
> ```
>
> La dernière ligne doit dire « aucun secret de session en clair ». Ce sont les fichiers de ce
> dossier, et eux seuls, qui s'envoient ensuite.

Sans Node ni Git sur la machine, il n'y a PAS de voie de repli : on ne reçoit pas la capture.

**Une plateforme NOUVELLE a ses propres secrets**, que la liste de
`scripts/lib/captured-page-secrets.mjs` ne connaît pas encore : `--redact` les laisserait
passer. Avant le premier envoi, donc :

1. Capturer des pages d'**au moins deux PR différentes** — une donnée de session est la même
   sur toutes les pages, une donnée de PR change d'une PR à l'autre.
2. En local : `node scripts/check-captured-pages.mjs --audit`. Le rapport ne contient que des
   NOMS de champs (`link[rel=shared-web-socket] @data-session-id`), jamais de valeur : il se
   transmet sans rien divulguer. Sur les captures GitHub, c'est ce critère — une valeur commune
   à des PR différentes — qui a trouvé `data-session-id`, qu'aucune relecture n'avait vu.
3. Trier le rapport : ce qui authentifie (jeton, identifiant de session, signature) entre dans
   la liste, par une PR d'outillage livrée AVANT les captures ; les empreintes de version du
   site (`x-pjax-*-version`, `release`) et les données de PR restent.
4. Alors seulement : `--redact` en local, puis envoi.

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

## 4. Écrire les sélecteurs depuis les captures

- Chaque candidat cite la capture qui le justifie (`// MESURÉ le AAAA-MM-JJ, test/fixtures/pages/05`).
- Préférer les prises qui portent un SENS (`data-*`, rôle, nom de formulaire) aux classes
  générées : un nom de module CSS change avec le code de la plateforme, un `data-testid` ou un
  `data-first-thread-comment` est posé exprès.
- Un nom qui désigne deux choses (`ReviewThreadContainer__…` est un fil ET un commentaire) n'est
  pas une prise.
- Explorer les captures par un test jetable de `packages/adapters/<id>/test/` (vitest, happy-dom,
  `DOMParser`) qui écrit son résultat dans le scratchpad, et le supprimer ensuite.
- Pour un bouton à intercepter : identifier aussi celui qui ANNULE, et prouver qu'il n'est pas
  pris. Bloquer *Cancel* enfermerait l'auteur d'un commentaire non conforme.

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
