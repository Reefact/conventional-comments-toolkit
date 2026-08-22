# Spécification — « Conventional Comments Toolkit »

**Cibles :** GitHub (github.com, Enterprise Cloud / EMU, Enterprise Server) et Azure DevOps (Services, Server)
**Statut :** Draft v0.2 — à valider par l'équipe
**Type de document :** spécifications communes (indépendantes de la plateforme) + annexes par plateforme

---

## 1. Contexte et objectif

L'équipe a adopté [Conventional Comments](https://conventionalcomments.org/) pour les commentaires de revue de code, actuellement sans contrainte technique. L'objectif est de passer d'une convention *encouragée* à une convention *outillée*, puis *appliquée*, sur les plateformes de revue de code utilisées en parallèle.

### Objectifs

| # | Objectif | Priorité |
|---|----------|----------|
| O1 | Tout commentaire de revue respecte le format Conventional Comments | Must |
| O2 | L'écriture au format conventionnel est plus rapide que l'écriture libre | Must |
| O3 | Une PR ne peut pas être complétée tant qu'un **fil** bloquant n'est pas résolu | Must |
| O4 | Expérience identique et cohérente entre les plateformes supportées | Must |
| O5 | Adoption progressive, sans blocage brutal du flux de travail existant | Should |
| O6 | Mesure de l'adoption (taux de conformité, répartition des labels) | Could |

### Non-objectifs

- Ne concerne **pas** les messages de commit (voir Conventional Commits, sujet distinct).
- Ne remplace **pas** les linters, analyseurs statiques ou revues automatisées par IA.
- Ne juge **pas** la qualité ou la pertinence du contenu d'un commentaire, uniquement sa **forme**.
- Ne gère pas GitLab, Bitbucket ou Gerrit (extensibilité prévue, implémentation hors périmètre — voir §9.2).

---

## 2. Avertissement d'architecture : périmètre du navigateur

> **Cinq notions employées avant d'être définies, si vous lisez dans l'ordre.** Les quatre **modes de fonctionnement** (`off`, `assist`, `warn`, `enforce`) sont définis au §7 ; le **plancher** de configuration, et les **bornes** et **canaux** qui le portent, au §8.1.1 ; l'**épinglage** de la configuration d'une PR au §8.1.3 ; les **deux critères** du statut de conformité au §6.2.1 ; la notion de commentaire **conforme** au §3.5.2. Tout ce qui suit y renvoie sans les redéfinir.

> **Point structurant.** Une extension navigateur agit **côté client uniquement**. Elle peut empêcher un utilisateur de cliquer sur un bouton, mais elle ne peut pas empêcher la publication d'un commentaire via l'API REST/GraphQL, une CLI, un IDE, un autre navigateur, ou un poste sans l'extension.

La solution complète comporte donc **deux composants**. La présente spécification couvre les deux, avec une répartition explicite des responsabilités.

| Composant | Rôle | Garantie |
|-----------|------|----------|
| **A — Extension navigateur** | Assistance à la rédaction, validation en temps réel, blocage de l'envoi | Confort et prévention. Contournable. |
| **B — Compagnon serveur** | Vérification a posteriori de tous les commentaires, calcul du statut « fils bloquants résolus », publication d'un **statut de conformité** | Vérité de référence. Non contournable. |

**Règle de conception :** un commentaire jugé conforme par l'extension doit toujours être jugé conforme par le serveur, et réciproquement. Les deux composants partagent pour cela **la même bibliothèque de parsing** — dont le contrat est posé au §9.2.2 — et **la même configuration**, résolue des deux côtés à partir des mêmes sources (§8.1.2, §9.2.3). Seules les *bornes* d'entreprise empruntent un canal distinct par composant, pour la raison exposée au §8.1.1 — elles doivent y porter la même valeur.

Cette règle connaît **une exception, bornée dans le temps**, décrite au §8.1.3 : le temps qu'une modification restrictive de configuration se propage, l'extension peut être momentanément *plus stricte* que le serveur — jamais plus permissive. Dans ce cas, elle le signale et **cesse de bloquer l'envoi**, plutôt que de refuser ce que la source de vérité aurait accepté.

Partager le parseur n'y suffit cependant pas — deux composants peuvent appliquer correctement le même code à deux configurations différentes. Six mesures rendent la règle tenable ; elles sont réunies au §8.1.3, une fois le vocabulaire nécessaire posé.

L'exigence O3 (blocage de la complétion de PR) est **techniquement portée par le composant B**. L'extension ne fait qu'en refléter l'état dans l'interface — voir aussi §6.5 et la dépendance à B dans le tableau du §7.

**Le composant A est un seul produit.** Une seule extension embarque un adaptateur par plateforme supportée (voir §9.2) ; chaque adaptateur n'est activé que sur les hôtes explicitement autorisés par l'utilisateur ou par la politique d'entreprise (`optional_host_permissions`, détaillé en annexes A et B). Cela évite de multiplier les extensions à déployer et à maintenir, tout en gardant les permissions minimales par poste.

---

## 3. Format cible

### 3.1 Grammaire

```
<label> [(<decoration>[, <decoration>]*)]: <subject>

[<discussion>]
```

- `label` — obligatoire, un seul, issu de la liste configurée (§3.2).
- `decoration` — optionnelle, entre parenthèses, séparées par des virgules.
- `:` — séparateur obligatoire, suivi d'au moins une espace.
- `subject` — obligatoire, résumé sur une ligne.
- `discussion` — optionnelle, séparée du sujet par une ligne vide, format Markdown libre.

### 3.2 Labels

Liste par défaut (configurable — voir §8). La colonne « Bloquant par défaut » détermine le comportement décrit au §6.

| Label | Description | Bloquant par défaut |
|-------|-------------|:---:|
| `praise` | Souligne un point positif. À utiliser au moins une fois par revue. | Non |
| `nitpick` | Préférence triviale, sans enjeu réel. Toujours non bloquant. | Non |
| `suggestion` | Proposition d'amélioration argumentée. | Non |
| `issue` | Problème identifié. Idéalement accompagné d'une suggestion. | **Oui** |
| `todo` | Changement petit mais nécessaire. | **Oui** |
| `question` | Demande de clarification sur un point incertain. | Non |
| `thought` | Idée surgie pendant la revue, sans demande d'action. | Non |
| `chore` | Tâche annexe à réaliser avant acceptation (relancer un job, MAJ d'un doc...). | **Oui** |
| `note` | Information à porter à connaissance. Toujours non bloquant. | Non |

Labels optionnels activables par configuration : `typo`, `polish`, `quibble`.

### 3.3 Décorations

| Décoration | Effet |
|------------|-------|
| `(blocking)` | Force le caractère bloquant, quel que soit le label. |
| `(non-blocking)` | Force le caractère non bloquant, quel que soit le label. |
| `(if-minor)` | À traiter uniquement si l'effort est faible. Non bloquant. |

Décorations libres additionnelles (ex. `(security)`, `(perf)`, `(a11y)`) : autorisées si `allowFreeDecorations: true`, sans incidence sur le caractère bloquant.

**Précédence pour déterminer si un commentaire est bloquant :**

1. Décoration explicite `(blocking)` ou `(non-blocking)` → l'emporte toujours.
2. Sinon, valeur `blockingByDefault` du label.
3. Les labels marqués `alwaysNonBlocking` (`nitpick`, `note`, `thought`) rejettent la décoration `(blocking)` — erreur de validation `E-CONFLICT`.

### 3.4 Expression régulière de référence

```regex
^(?<emoji>\p{Extended_Pictographic}\uFE0F?\s+)?(?<label>[a-z]+)(?:\s*\((?<decorations>[^)]*)\))?\s*:\s+(?<subject>\S.*)$
```

Appliquée à la **première ligne non vide** du commentaire, en mode Unicode. Le préfixe emoji est toléré en entrée mais ignoré pour l'analyse.

### 3.5 Règles de validation

| Code | Règle | Sévérité |
|------|-------|----------|
| `E-NO-LABEL` | Aucun label reconnu en tête de commentaire | Erreur |
| `E-UNKNOWN-LABEL` | Label absent de la liste configurée | Erreur |
| `E-UNKNOWN-DECORATION` | Décoration inconnue et `allowFreeDecorations: false` | Erreur |
| `E-CONFLICT` | Décoration incompatible avec le label (§3.3) | Erreur |
| `E-EMPTY-SUBJECT` | Sujet vide ou réduit à une ponctuation | Erreur |
| `E-SUBJECT-TOO-SHORT` | Sujet < `minSubjectLength` (défaut : 10 caractères) | Erreur |
| `W-SUBJECT-TOO-LONG` | Sujet > `maxSubjectLength` (défaut : 120 caractères) | Avertissement |
| `W-MISSING-DECORATION` | Label `suggestion` ou `question` sans décoration explicite | Avertissement |
| `W-NO-DISCUSSION` | Label bloquant sans corps de discussion | Avertissement |
| `W-CASE` | Label saisi avec une majuscule (`Issue:`) | Avertissement + correction auto |

Les **avertissements ne bloquent jamais** l'envoi. Seules les erreurs le font, et uniquement en mode `enforce` (§7).

---

## 4. Périmètre d'application

### 4.1 Zones soumises à validation

| Zone | Format validé | Peut porter un état bloquant | Justification |
|------|:---:|:---:|---|
| Commentaire inline sur une ligne de diff | ✅ | ✅ | Cœur de la revue ; porte un état de résolution |
| Commentaire de fil de discussion racine (thread parent) | ✅ | ✅ | Idem |
| Commentaire général sur la PR (hors diff — voir annexes) | ✅ | ❌ | Aucun état de résolution sur les plateformes cibles |
| Corps d'une revue soumise en lot (le cas échéant — voir annexe par plateforme) | ✅ | ❌ | Idem |
| **Réponse dans un fil existant** | ⚙️ configurable, **désactivé par défaut** | ❌ | « Corrigé, merci » ne doit pas exiger un label |
| Réponse portant le label `decision` | ✅ *(toujours)* | ❌ | Porte une décision de revue opposable — §6.1.1 |
| Description de la PR | ❌ | ❌ | Hors périmètre Conventional Comments |
| Commentaires de bots et comptes de service | ❌ | ❌ | Liste d'auteurs exemptés `exemptUsers` (§8.2) |
| Commentaires sur les tickets / éléments de travail liés | ❌ | ❌ | Hors périmètre |

**Règle de la colonne « peut porter un état bloquant ».** Un commentaire situé dans une zone marquée ❌ dans cette colonne est validé **en format uniquement** : même s'il porte un label bloquant (`issue:`, `todo:`, `chore:`), il n'est **jamais** comptabilisé dans le critère 2 du §6.2.

Sans cette règle, un `issue: merci de rebaser` écrit dans la zone de conversation générale — laquelle n'offre aucun bouton de résolution sur les plateformes cibles — rendrait le critère 2 impossible à satisfaire et le check rouge de façon définitive, sans autre issue que la suppression du commentaire. Le §6.1 suppose une correspondance « commentaire validé → fil résolvable » qui n'existe que pour les fils de diff.

**Analyser n'est pas exiger.** Que les réponses de fil ne soient pas *validées* par défaut (ligne ci-dessus) ne dispense pas de les *analyser* : le composant B doit parcourir les réponses de chaque fil bloquant pour y détecter une éventuelle `decision` (§6.1.1). Une réponse sans label reste parfaitement valide — elle n'est simplement porteuse d'aucune décision. La ligne « réponse portant le label `decision` » du tableau ne rend donc pas les réponses obligatoirement labellisées : elle dit qu'une réponse *qui porte ce label* est soumise aux règles de forme, parce qu'elle a un effet.

L'extension (composant A) signale ce cas à la saisie par un avertissement `W-NOT-BLOCKABLE` (§3.5) : *« ce label est bloquant, mais cette zone ne permet pas de résoudre un fil — il ne bloquera pas la complétion »*. C'est un avertissement, jamais une erreur.

### 4.2 Exclusions de contenu

Un commentaire est **exempté** de validation si :

- **son corps est vide ou ne contient que des blancs** — cas le plus fréquent et le plus important : une revue approuvée sans texte (*Approve* sans commentaire) crée une revue au corps vide. Sans cette exemption, le geste le plus courant d'une revue produit `E-NO-LABEL` sur chaque approbation — et, si l'organisation a retenu `formatSeverity: error` (§6.2.1), **rend la PR non mergeable sans qu'aucune correction ne soit possible**, puisqu'on n'édite pas la revue d'un tiers ;
- **il n'a pas été rédigé par une personne dans un éditeur de commentaire** : message généré par la plateforme, entrée de timeline, notification système, événement de mise à jour de branche. Ces contenus ne sont pas des commentaires de revue et ne relèvent pas de la convention. Cette catégorie est structurelle et ne dépend pas de la liste nominative `exemptUsers` ci-dessous — `CA-20` l'exige. Les marqueurs qui l'identifient sont propres à chaque plateforme et **traduits par l'adaptateur** en un booléen, `CommentInfo.isSystemGenerated` (§9.2.1) : `core/` n'a pas à les connaître, et une plateforme nouvelle n'oblige pas à le modifier ;
- il ne contient **aucun contenu propre** : après retrait des blocs de code **délimités**, des citations Markdown (`>`) et des blancs, il ne reste rien. C'est la lecture normative de « sans contenu propre » : sans elle, un bloc de code suivi d'une phrase relèverait de l'interprétation. Un **bloc de suggestion natif fait exception** : il compte comme contenu propre, et un commentaire qui n'en contient qu'un n'est donc pas exempté — c'est une proposition de modification, elle dit quelque chose, et l'étage 0 du §3.5.1 l'attend ;
- il commence par une commande slash propre à la plateforme (voir annexes) ;
- il correspond à une expression de la liste `allowlistPatterns`, **appliquée au corps entier une fois `trim()` appliqué** — jamais à la seule ligne de préfixe, sans quoi `^LGTM$` ne matcherait pas un `LGTM` suivi d'une ligne vide. La précision compte : `CA-06` compare des verdicts au caractère près ;
- son auteur figure dans la liste d'auteurs exemptés `exemptUsers`. La comparaison porte sur **`UserInfo.login`**, insensible à la casse — jamais sur le nom affiché ni sur l'identifiant interne. C'est à l'adaptateur d'y placer une valeur comparable ; les identités données en annexe sont des exemples de valeurs, pas deux conventions différentes. Sans ce point fixe, A et B compareraient deux champs distincts et `CA-06` tomberait.

**Le bloc de suggestion natif n'est pas une exemption, c'est un label.** Un commentaire contenant un bloc de suggestion de la plateforme porte un label `suggestion` **implicite** : il est validé normalement — sous les trois réserves de l'étage 0 du §3.5.1 — et compté comme `suggestion` dans les indicateurs (§12). Un préfixe explicite, s'il est présent, est validé comme d'habitude et l'emporte sur le label implicite — y compris s'il est mal formé, auquel cas le diagnostic correspondant s'applique.

**Contournement connu, assumé.** Écrire tout son commentaire à l'intérieur d'un bloc délimité, ou le préfixer de `> `, produit un corps sans contenu propre : il est exempté, et rien n'est signalé — y compris en mode `enforce`. Le contournement est réel et il coûte trois caractères.

Il est assumé pour une raison précise : **il n'atteint pas ce qui compte.** Le critère qu'il esquive est le critère 1, l'hygiène de forme, dont la sévérité par défaut est un avertissement. Le critère 2 — celui qui porte O3 — est intact : un commentaire entièrement cité n'ouvre aucun fil bloquant, donc n'exempte personne de traiter quoi que ce soit. Et le §2 pose déjà que le composant A est contournable par construction, la contrainte réelle étant côté serveur. Fermer ce cas coûterait un seuil arbitraire — « moins de N caractères » — appliqué au geste parfaitement légitime de citer du code sans commentaire, pour un gain nul sur l'objectif du produit.

Exiger qu'on écrive `suggestion:` devant un bloc de suggestion serait redondant — un tel bloc *est* une proposition de modification — et le refuser au motif que le commentaire contient aussi une phrase (« ça devrait suffire ») produirait un rejet massif et incompris le jour du passage en `enforce`.

### 4.3 Actions couvertes

La validation doit s'appliquer **à chaque point de sortie**, y compris :

- création d'un commentaire ;
- **édition** d'un commentaire existant ;
- soumission d'une revue en lot lorsque la plateforme le permet (plusieurs commentaires validés en une action → chacun doit être conforme, l'erreur doit indiquer lequel) ;
- envoi par raccourci clavier (`Ctrl+Entrée` / `Cmd+Entrée`) ;
- tout contrôle de soumission additionnel propre à une plateforme (voir annexes, ex. un bouton combinant publication et résolution de fil).

---

## 5. Assistance à la rédaction (composant A)

### 5.1 Barre d'outils

Injectée au-dessus ou en dessous de chaque zone de saisie concernée.

- Un bouton par label, avec icône, libellé et couleur distincts.
- Sélecteur de décoration segmenté : *aucune*, puis **un segment par décoration dont `forces` n'est pas `null`** (§8.2) — soit `blocking`, `non-blocking` et `if-minor` par défaut. Il se construit depuis la configuration, sans quoi une décoration porteuse ajoutée par une organisation n'aurait aucune commande. Complété d'un champ libre lorsque `decorations.allowFree` vaut `true`, sans quoi les décorations libres autorisées resteraient inaccessibles à la souris.
- Le clic sur un label **insère ou remplace** le préfixe existant sans détruire le texte déjà saisi. En l'absence de sélection, le curseur est repositionné en fin de préfixe ; avec une sélection active, le texte sélectionné n'est pas remplacé et la sélection est **restaurée, décalée de la longueur du préfixe inséré**.
- Un second clic sur un label déjà actif le retire (toggle).
- Infobulle au survol : définition du label + exemple, dans la langue de l'interface.

### 5.2 Saisie rapide au clavier

- Déclencheur de complétion : `/` ou `:` en début de zone, ouvrant une liste filtrable au fil de la frappe.
- Navigation `↑` `↓`, validation `Entrée` ou `Tab`, annulation `Échap`.
- Abréviations extensibles par `Tab` : `?i` → `issue: `, `?ib` → `issue (blocking): `, `?su` → `suggestion: `, `?ni` → `nitpick: `, `?no` → `note: `… La table complète est configurable par la clé `shortcuts.abbreviations` (§8.2). **Autant de lettres qu'il en faut pour désigner un label sans ambiguïté** : deux suffisent pour `nitpick`/`note`, `todo`/`thought` ou `praise`/`polish` ; il en faut **trois** pour `question`/`quibble`, que deux ne séparent pas (`?que` / `?qui`). Un alphabet à une lettre ne peut pas couvrir dix labels par défaut plus trois optionnels sans collision.

L'expansion étant déclenchée par `Tab` et non au fil de la frappe, `?i` et `?ib` peuvent coexister : ce qui doit être unique, c'est l'abréviation **au moment où `Tab` est pressée**, pas au fil des caractères. La table étant configurable, c'est cette propriété qui est normative, et non une longueur fixe.
- Raccourcis directs configurables (ex. `Alt+I` pour `issue`).

### 5.3 Retour visuel temps réel

- **Pastille de validation** permanente sous la zone de saisie : ✅ conforme / ⚠️ conforme, avec avertissements / ❌ non conforme. Les deux premiers états sont **conformes** au sens du §3.5.2 — la distinction est informative, pas normative.
- Deux situations font que la pastille **ne peut pas affirmer** « conforme », et elle prime alors sur ✅ : l'**état dégradé** au sens du §5.4 — une configuration que l'extension n'a pas pu lire — et l'**écart d'empreinte** du §8.1.3, règle 2. Les deux se signalent distinctement : la première dit qu'on ne connaît pas les règles, la seconde qu'on n'applique pas les mêmes que le serveur : afficher « conforme » sans avoir pu lire les règles serait une affirmation que rien ne soutient.
- En cas d'erreur : message explicite dans la langue résolue au §8.1.2, avec le code (§3.5) et une proposition de correction actionnable en un clic.
- **Quand plusieurs diagnostics s'appliquent** — les contrôles de contenu sont cumulatifs (§3.5.1) : l'indicateur d'état porte la **sévérité la plus élevée**, et le message les énumère **tous**, dans l'ordre de restitution du §3.5.1, chacun avec sa correction quand elle est calculable. N'en afficher qu'un ferait réapparaître le suivant après chaque correction, autant de fois qu'il reste d'écarts — et rendrait le retour de l'extension incomparable à celui du check, qui les liste tous (§6.3.1).
- Bordure de la zone de saisie colorée selon l'état.
- Aucun clignotement ni déplacement de contenu (pas de *layout shift*) pendant la frappe. Validation débattue (*debounce*) à 150 ms.

### 5.4 Blocage de l'envoi (mode `enforce`)

**Quand le blocage s'applique.** Le mode `enforce` ne suffit pas : quatre conditions doivent être réunies, et elles sont énoncées ici parce qu'elles ne le sont nulle part ensemble.

1. le mode effectif est `enforce` (§7) ;
2. la PR est **dans le périmètre d'activation** (§6.2.3) — hors périmètre, l'extension assiste sans jamais bloquer ;
3. les **empreintes de configuration concordent**, ou aucun résultat n'est encore publié sur la PR (§8.1.3, règle 2) ;
4. la configuration effective a été **lue sans repli dégradé** — aucune des lectures du §9.2.3 n'a rendu `{ status: 'unreachable' }`. C'est le sens normatif, et le seul, de l'expression **état dégradé** dans ce document : on ne refuse pas un envoi au nom d'une règle qu'on n'a pas pu lire. Un fichier simplement absent n'est pas une dégradation, et la dégradation de sélecteur du §9.4 est encore autre chose.

Si l'une manque, l'extension se comporte comme en mode `warn` : elle affiche ses diagnostics et laisse publier. Les trois dernières conditions ont la même raison d'être — ne jamais prononcer un rejet que la source de vérité n'aurait pas prononcé.

- Le bouton d'envoi est marqué `aria-disabled="true"` tant que le commentaire est en erreur, et son activation est interceptée. **L'attribut natif `disabled` ne doit pas être utilisé ici** : il retire l'élément de l'ordre de tabulation, si bien qu'une personne naviguant au clavier n'atteint jamais le bouton et n'entend donc jamais le motif du blocage — ce qui viderait `CA-12` (§11) de son sens. `disabled` reste réservé aux contrôles réellement inertes.
- Le motif du blocage est annoncé dans une zone `aria-live="polite"`.
- L'interception doit également couvrir la soumission au clavier.

**Pas de bouton de contournement — décision assumée.** Ce document ne prévoit **aucun** bouton permettant de publier un commentaire non conforme, pour deux raisons.

La première est qu'un tel bouton **ne contrôlerait rien**. Une extension navigateur se désactive en deux clics, et le §2 pose déjà que le composant A est contournable par construction. Il n'ajouterait donc aucune capacité réelle à qui veut passer outre : seulement une cérémonie, un motif à saisir, un journal nominatif à tenir — et l'illusion d'un contrôle là où il n'y en a pas.

La seconde est plus importante : **il ferait sortir la justification hors de la convention.** Or la convention existe précisément pour rendre l'intention de revue explicite et lisible par tous, dans le fil, à l'endroit où la discussion a lieu. « Nous avons choisi de ne pas traiter ce point, pour telle raison » est un acte de revue à part entière, pas une échappatoire technique : sa place est dans un commentaire labellisé (§6.1.1), visible de tous et conservé avec la PR — pas dans un journal externe que personne ne relit.

Le blocage d'envoi du mode `enforce` est donc un **garde-fou, pas un mur** : il empêche l'erreur d'inattention, qui est le cas courant, et n'a jamais prétendu empêcher la personne déterminée. C'est le composant B qui porte la contrainte réelle (§2, §6).

### 5.5 Affichage des commentaires publiés

- Les labels des commentaires déjà publiés sont rendus sous forme de badges colorés (option `badgeStyle`, voir schéma §8.2), sans modifier le contenu stocké côté serveur.
- Un bandeau en tête de PR récapitule : *N **fils** bloquants non résolus*, avec liens d'ancrage vers chacun. Des **fils**, et non des commentaires : c'est ce que compte le critère 2 (§6.2.1) et ce que porte `unresolvedBlockingCount`, et `CA-03` exige que les trois décomptes concordent — en valeur comme en sens. **Sa source est le résumé publié par le composant B** (`readPublishedResult()`, §9.2.3) dès qu'il est présent sur la page : c'est ce qui garantit que le bandeau et le check comptent la même chose (`CA-03`). Le **décompte** vient toujours de ce résumé, qui fait autorité ; les **liens d'ancrage** viennent du DOM de la page, qui porte les fils — un fil dont l'état n'y est pas rendu (`resolution: 'unknown'`) recevant quand même son ancre, puisque rien n'est compté ici.

  **Les deux divergent, et c'est assumé.** Trois règles du document garantissent que l'extension ne peut pas retrouver localement l'ensemble exact des fils que le serveur compte : une **résolution refusée** (§6.1) laisse le fil marqué *Resolved* dans la page ; une **édition affaiblissante** (§6.1) affiche `note:` là où le serveur maintient `issue:` ; et l'**épinglage** (§8.1.3) fait juger le serveur sur une configuration que l'extension n'a plus. Vouloir la concordance exacte imposerait à l'extension de trancher des autorisations, ce que le §10 lui interdit.

  Le bandeau affiche donc **le décompte publié** comme titre, et les ancres qu'il a su apparier. Quand il en apparie moins, il l'indique — « 2 sur 3 localisés » — et renvoie au statut pour le détail. `CA-03` porte sur le décompte affiché, jamais sur le nombre d'ancres. En l'absence de résumé — composant B non déployé, ou première évaluation encore en cours — il se rabat sur les fils lus dans le DOM (`getThreads()`), un fil dont l'état n'y est pas rendu (`resolution: 'unknown'`) étant compté **non résolu**, comme au §B.5 ; il indique alors explicitement qu'il s'agit d'une vue locale et non de l'état de conformité.
- Filtre local par label dans la liste des fils de discussion.

---

## 6. Blocage de la complétion de la PR (O3)

### 6.1 Définitions

Un fil de discussion est **bloquant** si son **commentaire racine** est bloquant au sens du §3.3.

Un fil bloquant est considéré **résolu** selon la plateforme :

| Plateforme | États considérés comme résolus |
|------------|-------------------------------|
| GitHub | Conversation marquée *Resolved* |
| Azure DevOps | Statut de thread `Fixed`, `WontFix`, `Closed` ou `ByDesign` (`Active` et `Pending` = non résolu) |

**Règle de gouvernance :** un fil bloquant ne peut être résolu que par **l'auteur du commentaire** ou par un membre du groupe `resolverOverrideGroup`. L'auteur de la PR ne peut pas clore lui-même un fil bloquant ouvert par un relecteur.
*Note : GitHub autorise nativement l'auteur de la PR à résoudre les conversations. Cette règle est donc vérifiée et signalée par le composant B, non empêchée à la source.*

### 6.2 Mise en œuvre serveur (composant B — source de vérité)

**GitHub Enterprise**
- GitHub App ou Action abonnée aux événements `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`, `pull_request_review_thread`.
- Publie un *commit status* / *check run* nommé `conventional-comments` avec deux critères : (1) tous les commentaires sont conformes, (2) aucun fil bloquant non résolu.
- Ce check est déclaré **required** dans la protection de branche → le bouton *Merge* est désactivé nativement.
- Activer en complément *Require conversation resolution before merging* si l'équipe souhaite l'exigence sur **tous** les fils.

**Azure DevOps**
- Service Hook sur `Pull request created`, `Pull request updated`, `Pull request commented on` → Azure Function.
- La fonction publie un **PR Status** (`POST /pullrequests/{id}/statuses`) `succeeded` / `failed`.
- Ce statut est déclaré comme **policy de branche obligatoire** (*Status checks*) → complétion bloquée nativement.
- Alternative sans code : policy native *Check for comment resolution*, mais elle ne sait pas distinguer bloquant / non bloquant.

### 6.3 Rôle de l'extension

L'extension **reflète** l'état, elle ne le crée pas :

- désactive visuellement le bouton *Complete* / *Merge* et affiche le motif ;
- liste les fils bloquants non résolus avec liens directs ;
- ne doit **jamais** être la seule barrière — si l'extension est absente, la policy serveur s'applique quand même.

---

## 7. Modes de fonctionnement (adoption progressive)

Configurables globalement et surchargeables par dépôt, sous réserve du plancher imposé par une politique d'entreprise (§8.1).

| Mode | Extension : assistance | Extension : diagnostic affiché | Extension : envoi bloqué | Serveur : statut publié | PR bloquée¹ |
|------|:---:|:---:|:---:|---|:---:|
| `off` | ❌ | ❌ | ❌ | aucun | ❌ |
| `assist` *(défaut à l'installation)* | ✅ | ✅ | ❌ | aucun | ❌ |
| `warn` | ✅ | ✅ | ❌ | informatif, **jamais en échec** | ❌ |
| `enforce` | ✅ | ✅ | ✅ | contraignant | ✅¹ |

Les modes `assist` et `warn` sont **identiques côté extension** — dans les deux cas elle assiste et affiche ses diagnostics sans jamais bloquer l'envoi. Ce qui les distingue est **côté serveur** : `assist` ne publie aucun statut, `warn` en publie un qui reste vert et dont le résumé rend la non-conformité visible. C'est ce qui fait de `warn` l'étape de mesure de la trajectoire, et de `assist` une simple mise à disposition de l'outillage.

¹ *La colonne « PR bloquée » suppose le composant B déployé et actif sur le dépôt (§6). Sans lui, le mode `enforce` ne bloque que l'envoi de commentaires non conformes côté extension (composant A) — rien n'empêche la complétion de la PR.*

**Trajectoire recommandée**, à partir du mode `assist` livré par défaut : `assist` (2 semaines) → `warn` (2 à 4 semaines, avec suivi du taux de conformité) → `enforce` sur un dépôt pilote → généralisation.

---

## 8. Configuration

### 8.1 Emplacement et précédence

Par ordre de priorité décroissant :

1. `.conventional-comments.json` à la racine de la branche par défaut du dépôt.
2. Configuration d'organisation, servie par une URL interne (`configUrl`), mise en cache 1 h.
3. Politique d'entreprise poussée par le navigateur (`managed_storage` / `3rdparty`).
4. Préférences locales de l'utilisateur — **limitées** : langue, thème, raccourcis, style de badge. L'utilisateur ne peut ni assouplir le mode ni modifier la liste des labels.

### 8.2 Schéma

```json
{
  "$schema": "https://<interne>/cc-schema-v1.json",
  "version": 1,
  "mode": "warn",
  "labels": [
    { "id": "issue", "blockingByDefault": true,  "icon": "🔨", "aliases": ["bug"] },
    { "id": "nitpick", "blockingByDefault": false, "alwaysNonBlocking": true }
  ],
  "decorations": { "allowFree": true, "known": ["blocking", "non-blocking", "if-minor"] },
  "scope": {
    "validateReplies": false,
    "validateReviewSummary": true,
    "validatePrDescription": false
  },
  "rules": {
    "minSubjectLength": 10,
    "maxSubjectLength": 120,
    "requireDiscussionOnBlocking": "warn"
  },
  "allowBypass": true,
  "exemptUsers": ["azure-pipelines[bot]", "dependabot[bot]"],
  "allowlistPatterns": ["^LGTM$", "^/[a-z]+"],
  "resolverOverrideGroup": "tech-leads",
  "language": "fr",
  "telemetry": { "enabled": false, "endpoint": null }
}
```

Le schéma est **versionné**. Une configuration de version supérieure à celle supportée par l'extension déclenche un repli en mode `assist` accompagné d'un avertissement, jamais un blocage.

---

## 9. Architecture technique

### 9.1 Découpage

```
packages/
├── core/            # Aucune dépendance DOM ni plateforme
│   ├── parser       # Analyse d'un commentaire → AST
│   ├── validator    # AST + config → diagnostics
│   ├── config       # Chargement, fusion, validation du schéma
│   └── i18n         # fr / en
├── adapters/
│   ├── github/      # Sélecteurs DOM, cycle de vie SPA, API GHE
│   └── azdo/        # Idem Azure DevOps
├── extension/       # Manifest V3, content scripts, service worker, options
└── server/          # Composant B — réutilise core/ tel quel
```

`core/` est publié comme paquet interne et consommé à l'identique par l'extension et par le compagnon serveur. **Aucune règle de validation ne doit être dupliquée.**

### 9.2 Interface d'adaptateur

Chaque plateforme implémente le même contrat :

```ts
interface PlatformAdapter {
  matches(url: URL): boolean;
  observeEditors(cb: (editor: EditorHandle) => void): Disposable;
  getSubmitControls(editor: EditorHandle): SubmitControl[];
  readValue(editor: EditorHandle): string;
  writeValue(editor: EditorHandle, text: string, caret?: number): void;
  getThreads(): Promise<ThreadInfo[]>;
  getCompletionControl(): SubmitControl | null;
  getCurrentUser(): Promise<UserInfo>;
}
```

### 9.3 Contraintes d'implémentation connues

| Sujet | GitHub Enterprise | Azure DevOps |
|-------|-------------------|--------------|
| Éditeur | `<textarea>` Markdown | `contenteditable` piloté par un état applicatif |
| Écriture programmatique | Affectation de `value` + `input` event | Manipulation DOM + `beforeinput`/`input` synthétiques ; **risque de désynchronisation de l'état interne — à valider par prototype** |
| Navigation | SPA (Turbo) — écouter les événements de navigation | SPA — `MutationObserver` sur le conteneur racine |
| Domaine | Domaine interne variable → `optional_host_permissions` + saisie du domaine dans les options | `dev.azure.com`, `*.visualstudio.com`, ou domaine on-premise |

**Risque majeur identifié :** l'écriture dans l'éditeur Azure DevOps. Un *spike* technique de validation est requis **avant** l'engagement sur le reste du développement.

### 9.4 Résilience

- Les sélecteurs DOM sont centralisés dans un fichier unique par adaptateur, versionné et documenté.
- En cas d'échec de détection : **dégradation silencieuse** vers le mode `off` pour la zone concernée, avec journalisation. L'extension ne doit **jamais** empêcher l'utilisation normale de la plateforme.
- Test de fumée automatisé (Playwright) sur les deux plateformes, exécuté quotidiennement, pour détecter les ruptures de sélecteurs après une mise à jour éditeur.

---

## 10. Exigences non fonctionnelles

**Performance**
Chaque seuil est donné **au p95**, sur un **poste de référence** défini par l'équipe avant `P2` et sur une **PR de référence de 50 commentaires**, faute de quoi il n'est pas mesurable et donc pas opposable.

- Injection de la barre d'outils **< 100 ms** après l'événement d'apparition de l'éditeur — l'appel du `cb` d'`observeEditors` (§9.2.3), qui est le seul instant observable.
- Validation **< 5 ms** par commentaire, pour une entrée jusqu'à **10 Ko**, parsing pur sans appel réseau.
- **< 50 ms** ajoutés au temps de chargement de la page.
- Côté serveur : **< 60 s** entre l'action d'un utilisateur (résolution d'un fil, publication d'un commentaire) et un statut à jour sur la PR.
- Disponibilité du composant B : cible **99 %** mensuelle, avec le délai de grâce du §6.4 comme comportement dégradé.

**Confidentialité**
- Aucun contenu de commentaire, de code ou de diff ne quitte le navigateur.
- Télémétrie **désactivée par défaut**, opt-in explicite, et limitée à des compteurs agrégés (label utilisé, code d'erreur, mode, dépôt) — jamais de texte libre.
- **Journalisation des exemptions de PR** (§6.3.2) : mécanisme distinct de la télémétrie ci-dessus, nominatif par nature (identifiant de PR, auteur, horodatage). Destination configurable. Cette collecte de données personnelles nécessite une base légale identifiée (ex. intérêt légitime de l'employeur pour la gouvernance du code, avec information préalable des personnes concernées) et une durée de conservation **par défaut de 12 mois**, configurable, alignée sur un cycle d'audit — à confirmer avant activation dans une organisation soumise au RGPD.
- Les décisions de revue (`decision`, §6.1.1) ne font l'objet d'**aucune journalisation externe** : elles vivent dans la PR, sous le compte de leur auteur, comme n'importe quel commentaire de revue. C'est un avantage du mécanisme sur un journal de contournements — il ne crée aucun traitement de données nouveau.

**Sécurité**
- Manifest V3, permissions minimales (`storage`, `scripting`, `activeTab`), pas de `<all_urls>` — les domaines de plateforme sont demandés via `optional_host_permissions`, activés à la demande (§2, annexes A et B). **L'hôte de `configUrl` en fait partie** : il est souvent interne à l'organisation et distinct de tout domaine de plateforme, et sans cette permission `getOrgConfig()` échoue structurellement — l'extension résoudrait alors deux niveaux là où le serveur en résout trois, et son empreinte de configuration ne pourrait jamais coïncider (§8.1.3, règle 2). La politique d'entreprise qui pousse le plancher pré-autorise cet hôte en même temps que les domaines de plateforme.
- Aucun stockage de PAT ni de secret dans l'extension. **Conséquence à assumer :** les API publiques des plateformes n'acceptent pas l'authentification par cookie de session — elles exigent un jeton, que l'extension n'a pas le droit de détenir. Toute donnée que l'extension ne peut pas lire dans le DOM (état de résolution des fils, appartenance à un groupe) doit donc être obtenue **via le composant B**, qui détient les identifiants de service, et non par un appel d'API depuis le navigateur. C'est pourquoi `getThreads()` et `getCurrentUser()` (§9.2.3) ne lisent que le DOM de la page : l'extension s'en sert pour afficher, jamais pour trancher. Toute décision d'autorisation — qui peut résoudre, qui peut exempter — appartient au composant B. Quand celui-ci n'est pas déployé, l'extension **fonctionne sans composant B** : elle assiste et valide la saisie, sans jamais prétendre refléter un état de conformité qui n'est calculé nulle part. Ce n'est pas l'**état dégradé** du §5.4 — qui désigne une configuration que l'extension n'a pas pu lire, et qui seul désarme le blocage d'envoi.

  **Une exception, et une seule : la lecture de la configuration (`getRepoConfig()`, `getOrgConfig()`, §9.2.3).** L'extension lit le fichier `.conventional-comments.json` du dépôt affiché et le document d'organisation désigné par le canal de plancher, par la **route web** de la plateforme — celle que la session de l'utilisateur autorise déjà — et non par son API à jeton. La distinction n'est pas un contournement de la règle ci-dessus, elle en est la lecture exacte : la règle interdit de détenir un secret, de faire sortir du contenu, et de trancher une autorisation. Lire un fichier de configuration versionné, visible de quiconque a accès au dépôt, n'est aucun des trois.
  Sans cette exception, l'extension ignorerait les labels, `activatedAt` et les seuils, et divergerait du serveur sur le cas le plus banal qui soit : un dépôt qui a ajouté un label. Elle doit résoudre **les trois mêmes niveaux** que le composant B (§8.1.2), faute de quoi son empreinte de configuration ne peut jamais coïncider avec la sienne. La route exacte est propre à chaque plateforme (annexes) ; là où il n'y en a pas, ou lorsque l'appel échoue, la méthode renvoie `{ status: 'unreachable' }` et l'extension se rabat sur le niveau inférieur, **en signalant son état dégradé** et sans jamais bloquer un envoi sur une règle qu'elle n'a pas pu lire. Un fichier simplement **absent** est un cas nominal, pas une dégradation : il ne désarme rien.
- Content Security Policy stricte, aucun code distant, aucune dépendance chargée depuis un CDN.
- Code source public, auditable par quiconque (dépôt Apache-2.0).
- Une extension distribuée sur un store public passe en revue par l'éditeur du store, qui porte notamment sur l'usage des permissions d'hôte et la déclaration de toute collecte de données — la conception à permissions minimales et à télémétrie opt-in (ci-dessus) est également ce qui simplifie cette revue.

**Accessibilité**
- Conformité RGAA 4.1.2 (qui transpose WCAG 2.1 AA) : navigation clavier complète, contrastes suffisants, rôles ARIA, messages d'erreur associés au champ (`aria-describedby`).
- L'information ne repose jamais uniquement sur la couleur (icône + texte systématiques).
- Respect des thèmes clair / sombre et des réglages `prefers-reduced-motion`.
- RGAA 5, qui transposera WCAG 2.2, est attendu dans la fenêtre du phasage (§14) : les nouveaux critères sont à intégrer au fil de leur publication plutôt qu'en reprise finale.

**Internationalisation**
- Interface disponible en français et en anglais, dans la langue résolue selon le §8.1.2 : préférence locale de l'utilisateur, puis clé `language` de la configuration effective, puis langue de l'interface de la plateforme.
- Les **identifiants de labels restent en anglais** (`issue`, `suggestion`...) pour garantir l'interopérabilité, la parsabilité côté serveur et la compatibilité avec l'écosystème existant. Seules les descriptions et infobulles sont traduites.

**Compatibilité**
- Chrome et Edge (Chromium ≥ 3 dernières versions majeures), Firefox ESR 128 ou supérieur — `optional_host_permissions`, sur lequel repose l'activation des adaptateurs (§2), n'existe pas avant cette version. Firefox implémente Manifest V3 avec des divergences notables : **event pages** au lieu d'un service worker (celui de Chrome étant lui-même non persistant, c'est le mécanisme et non la persistance qui diffère), et espace de noms `browser.*` que Chrome n'expose pas. Un build ou un chargement conditionnel spécifique est donc à prévoir ; l'état exact de ces divergences est à revérifier contre les versions cibles au moment de l'implémentation.
- Déploiement principal via les stores publics (Chrome Web Store, Firefox Add-ons, Edge Add-ons). Une organisation peut, en complément, forcer l'installation par politique d'entreprise et pointer la configuration vers ses propres emplacements internes (§8.2). Le nom de la politique diffère selon le navigateur : `ExtensionInstallForcelist` sur Chrome et Edge, `ExtensionSettings` avec `"installation_mode": "force_installed"` sur Firefox — ce dernier n'implémente pas `ExtensionInstallForcelist`.
- Mise à jour automatique depuis le store d'origine, ou depuis un dépôt/store privé pour un déploiement entreprise.

---

## 11. Critères d'acceptation

- `CA-01` Un commentaire sans label ne peut pas être publié en mode `enforce`, ni par bouton ni par raccourci clavier — PR dans le périmètre (`CA-15`) et empreintes de configuration concordantes (`CA-32`). Un écart de version de `core/` entre l'extension et le serveur ne lève pas ce blocage.
- `CA-02` **Insertion de préfixe.** Sur `issue (blocking): le nom est ambigu`, cliquer `todo` donne `todo (blocking): le nom est ambigu` — décoration et sujet conservés, curseur en fin de préfixe. Avec une sélection active, le texte sélectionné n'est pas remplacé, et la sélection est restaurée décalée de la longueur du préfixe inséré (§5.1). Vérifié sur les deux plateformes et sur les deux générations de DOM GitHub (§A.5).
- `CA-03` **Décoration non bloquante.** Un `issue (non-blocking):` n'est compté comme bloquant ni par le critère 2 du composant B, ni par le bandeau du §5.5, ni par les indicateurs du §12 — les trois décomptes concordent — celui du bandeau étant le **décompte publié** qu'il affiche, et non le nombre d'ancres qu'il a su apparier (§5.5). Le même `issue (non-blocking):` sans discussion ne produit pas `W-NO-DISCUSSION` (§3.1).
- `CA-04` Un `nitpick (blocking):` produit l'erreur `E-CONFLICT` et **n'ouvre pas** de fil bloquant, `nitpick` n'étant pas bloquant par défaut. Un `issue (blocking, non-blocking):` produit le même code et **ouvre** un fil bloquant, `issue` l'étant (§3.3).
- `CA-05` La complétion d'une PR comportant un fil `issue:` non résolu est refusée **par le serveur**, extension désinstallée.
- `CA-06` **Parité de verdict.** Le corpus de parité est **synthétique et versionné dans `core/`**. Chaque cas y figure sous ses **deux formes de transport** : la valeur d'un champ de saisie telle que l'extension la lit (`LF`, indentation conservée) et le corps stocké tel que le serveur le relit (`CRLF`). Le corpus est injecté **au niveau des adaptateurs** : côté A en sortie de `readValue()` pour le corps, d'`observeEditors()` pour le contexte et de `getRepoConfig()`/`getOrgConfig()` pour la configuration ; côté B en sortie de `fetchThreads()`, de `fetchStandaloneComments()` et de `fetchConfigFile()` (§9.2.3, §9.2.4) — le second sans quoi les zones du §4.1 qui ne portent pas d'état bloquant, donc `W-NOT-BLOCKABLE`, ne seraient pas testées en parité — donc en amont de `core/`, et sans aucun appel d'API.
  Chaque cas est un **triplet** : un corps, un `EditorContext` ou un `ThreadInfo` synthétique, et la configuration effective à lui appliquer. Les trois sont **figés dans le corpus** ; les points d'injection ci-dessous sont la manière de les faire entrer par le chemin nominal, jamais une lecture de l'environnement. Un corps seul ne suffirait pas : `W-NOT-BLOCKABLE` dépend de `canCarryBlockingState`, `E-DECISION-SUBJECT` de la position dans un fil, `E-UNKNOWN-LABEL` et `E-UNKNOWN-DECORATION` de la configuration. Seul le corps est décliné sous les deux formes de transport.
  Le corpus couvre au minimum : fins de ligne `LF` et `CRLF`, indentation de tête, blancs de fin, BOM, blancs Unicode non sécables, emoji simples et composés, préfixes mal formés (§3.5.1), bloc de code en tête, bloc de suggestion, et **chaque code de diagnostic au moins une fois**. Le verdict comparé est la **liste ordonnée des couples (code, sévérité)**, pas un booléen de conformité. Objectif : **100 %**, aucun écart toléré.
  *Ce que ce test attrape, et ce qu'il n'attrape pas.* Il attrape les divergences de **transport** — un prétraitement appliqué d'un seul côté, une normalisation oubliée dans un adaptateur — et les régressions de `core/` sur le corpus. Il n'attrape **pas** une erreur commise *dans* `core/`, puisque les deux chemins y aboutissent : c'est le prix de la parité par construction, et c'est aux tests unitaires de `core/` (`P1`) de la couvrir. Deux écueils qu'il évite en revanche : un corpus de commentaires réels se heurterait à l'engagement du §10 — aucun contenu de commentaire ne quitte le navigateur — et une injection faite **en aval** des adaptateurs comparerait `core/` à lui-même sur une seule forme de transport, laissant passer exactement la classe de défaut que le §3.4.1 existe pour empêcher.
- `CA-07` Une réponse dans un fil existant n'exige pas de label avec la configuration par défaut.
- `CA-08` Les commentaires des bots de pipeline ne déclenchent aucune erreur.
- `CA-09` Le passage en mode `warn` n'empêche aucune publication.
- `CA-10` Une exemption de PR est journalisée avec son auteur et son horodatage.
- `CA-11` **Dégradation silencieuse.** Sélecteurs volontairement invalidés : aucun dialogue, aucune exception remontée à l'utilisateur, tous les contrôles natifs de la plateforme restent fonctionnels, et l'échec de détection est tracé : dans la journalisation locale du §9.4 toujours, et par un événement de télémétrie **si la télémétrie est activée** — elle ne l'est pas par défaut (§10).
- `CA-12` **Parcours clavier.** Script énuméré et rejoué : focus de l'éditeur → ouverture de la complétion → sélection d'un label → choix d'une décoration → envoi → lecture du message d'erreur en cas de rejet. Chaque étape atteignable et annoncée, sans souris.
- `CA-13` Un fil bloquant résolu par un tiers **sans** réponse `decision` valide reste compté comme non résolu, et la sortie du check en donne la cause. Avec une réponse `decision` conforme au §6.1.1, la résolution est acceptée.
- `CA-14` Une configuration de dépôt ne peut pas assouplir le mode en deçà du plancher fixé par une politique d'entreprise (§8.1).
- `CA-15` Une PR créée avant `activatedAt` ne reçoit aucun statut en échec, quels que soient ses commentaires — et l'extension n'y bloque aucun envoi, même en mode `enforce`.
- `CA-16` **Décoration mal formée.** `issue (perf*): x` et `issue (): x` produisent `E-DECORATION-SYNTAX` ; `issue (BLOCKING): x` et `issue( blocking ): x` produisent chacun **un seul** `W-DECORATION-STYLE` — celui de `issue( blocking ): x` énumérant ses deux écarts, espace manquante et espaces de bordure (§3.5.1, multiplicité) — et restent publiables.
- `CA-17` **Diagnostic en étages.** `Attention : le build casse` produit `E-NO-LABEL` avec le format attendu ; `attention: le build casse` produit `E-UNKNOWN-LABEL` avec la liste des labels ; `Issue: x` produit `W-CASE`. Aucun de ces trois messages n'est interchangeable.
- `CA-18` **Parité sur les fins de ligne.** Le même commentaire, lu par l'extension depuis le champ de saisie (`LF`) et par le serveur depuis le corps stocké (`CRLF`), produit un verdict identique. Test étendu à l'indentation de tête et aux blancs de fin.
- `CA-19` **Approbation sans texte.** Une revue approuvée sans commentaire ne produit aucun diagnostic et ne fait pas échouer le check.
- `CA-20` **Message de plateforme.** Un message généré par la plateforme (mise à jour de branche, entrée de timeline) ne produit aucun diagnostic, sans dépendre de `exemptUsers`.
- `CA-21` **Bloquant non résolvable.** Un `issue:` écrit dans une zone qui ne peut pas porter d'état bloquant (§4.1) est validé en format, déclenche `W-NOT-BLOCKABLE` à la saisie, et **ne bloque jamais** la complétion. Un `issue (non-blocking):` dans la même zone ne déclenche pas cet avertissement.
- `CA-22` **Sévérités distinctes.** En mode `enforce` avec `formatSeverity: warn`, un commentaire mal formé n'échoue pas le check ; un fil `issue:` non résolu le fait échouer.
- `CA-23` **Le serveur lit le mode.** Un dépôt en mode `warn` avec composant B déployé et check déclaré obligatoire voit ses PR mergeables : le statut est publié au vert avec un résumé informatif.
- `CA-24` **Plancher hors de portée du dépôt.** Un `{"mode": "off"}` poussé sur la branche par défaut d'un dépôt dont le plancher vaut `enforce` est ignoré pour la clé `mode`, et le fait apparaît dans la sortie du check.
- `CA-25` **Sortie exploitable.** Un check en échec permet d'identifier, **en un clic au plus** (§6.3.1), chaque fil bloquant non résolu (lien, auteur, label) et chaque diagnostic de format (lien, code, sévérité, correction proposée) — un commentaire pouvant en porter plusieurs (§3.5.1). Vérifié sur les deux plateformes : dans le corps du check sur l'une, derrière la `targetUrl` du statut sur l'autre.
- `CA-26` **Exemption de PR.** L'étiquette d'exemption posée par un membre habilité fait passer le statut au vert et journalise l'événement ; posée par une personne non habilitée, elle est refusée. Un nouveau commentaire bloquant **fait disparaître l'étiquette** et repasse le statut en échec.
- `CA-27` **Retour arrière.** Le passage de `enforce` à `warn` au niveau de l'organisation débloque les PR sans exiger de modifier la protection de branche de chaque dépôt.
- `CA-28` **Ordre des événements.** Un événement de création reçu après l'événement d'édition qui le corrige ne réintroduit pas un statut en échec périmé.
- `CA-29` **Opt-in par dépôt.** Un dépôt **jamais évalué** et sans fichier `.conventional-comments.json` sur sa branche par défaut ne reçoit aucun statut, même si l'intégration est installée au niveau de l'organisation. Contre-épreuve : retirer ce fichier d'un dépôt déjà évalué produit un statut neutre portant `config-vanished`, jamais un silence, y compris si le mode résiduel est `assist` (§8.1.5).
- `CA-30` **Épinglage.** Merger sur la branche par défaut une modification de configuration qui retire un label ne fait basculer au rouge le check d'**aucune PR déjà ouverte**. Une PR ouverte après ce merge applique la nouvelle configuration.
- `CA-31` **Plancher en direct.** Durcir le plancher d'entreprise sur `mode` prend effet sur les PR **déjà ouvertes**, malgré l'épinglage de leur configuration. Contre-épreuve : le durcir sur `activation.activatedAt` ne change rien aux PR déjà ouvertes (§8.1.1).
- `CA-32` **Décalage visible.** Extension et serveur placés délibérément sur deux générations de **configuration** : l'extension signale l'écart, **cesse de bloquer l'envoi** tant qu'il dure (§8.1.3, règle 2), et la sortie du check porte l'empreinte appliquée. Aucun désaccord silencieux, aucun rejet que le serveur n'aurait pas prononcé. Contre-épreuve, dans le même test : sur deux versions de `core/` mais une **même** configuration, le blocage d'envoi reste actif.
- `CA-33` **Anti-cache sur rejet.** Un label ajouté à la configuration d'organisation est accepté par le serveur **sans attendre l'expiration de son cache**, dès la première évaluation qui l'aurait rejeté.
- `CA-34` **Rapport à blanc.** Un dépôt non activé peut obtenir la liste de ce qui échouerait, sans qu'aucun statut ne soit publié sur ses PR.
- `CA-35` **Brouillon.** Une PR en brouillon comportant un fil `issue:` non résolu reçoit un statut informatif, jamais en échec ; sortir du brouillon le rend contraignant.
- `CA-36` **Blocage monotone.** Éditer `issue:` en `note:` sur le commentaire racine d'un fil déjà observé comme bloquant ne le rend pas non bloquant ; l'édition est signalée dans la sortie du check, **avec son auteur là où la plateforme l'expose** (§6.1). Contre-épreuve : corriger un `E-CONFLICT` dans les conditions du §6.1 n'est pas signalé comme un affaiblissement.
- `CA-37` **Bloc de suggestion.** Un commentaire contenant un bloc de suggestion natif, suivi d'une phrase libre, est conforme sans label explicite, compte comme `suggestion` dans les indicateurs, et ne produit ni `W-MISSING-DECORATION` ni diagnostic de sujet.
- `CA-38` **Préfixe mal formé.** `issue (blocking: x` produit `E-MALFORMED-PREFIX` désignant la parenthèse non fermée, jamais `E-NO-LABEL` ; `issue : le nom est ambigu` désigne l'espace avant le deux-points ; `Attention : le build casse` produit toujours `E-NO-LABEL` avec le format attendu.

---

## 12. Indicateurs de suivi

À produire par le composant B, sur la base des API des plateformes supportées :

- Taux de conformité des commentaires **au sens du §3.5.2** — aucun diagnostic de sévérité `error` (cible : > 95 % à 3 mois) — et **taux d'avertissement**, suivi séparément : un commentaire qui ne porte que des avertissements est conforme et ne doit pas disparaître de la mesure pour autant.
- Répartition par label — surveiller un ratio `praise` durablement nul, signe d'un déséquilibre de la culture de revue.
- Part des commentaires émis par des **comptes de service** (`UserInfo.isServiceAccount`, §9.2.1), exclue du taux de conformité ci-dessus : un dépôt très automatisé donnerait sinon l'illusion d'une conformité qu'aucun humain n'a produite.
- Nombre de fils bloquants clos par `decision` par semaine, et leur répartition **par label du commentaire racine et par dépôt** — un chiffre élevé indique une règle mal calibrée ou un découpage mal posé, pas une équipe indisciplinée. Les motifs eux-mêmes ne sont **pas extraits** : ils restent dans la PR (§10), lisibles un par un. C'est ce qui distingue cet indicateur d'un compteur de contournements — il ne compte pas des occurrences opaques, il pointe vers des justifications en clair.
- Délai moyen de résolution des fils bloquants.
- Délai total de revue avant / après mise en œuvre.

---

## 13. Points à trancher

**Aucune de ces questions ne bloque le démarrage de `core/`.** Les deux qui le pourraient — l'existence d'un contournement et le périmètre d'activation — sont tranchées dans le corps du document : §5.4 et §6.1.1 pour la première, §6.2.3 pour la seconde.

| # | Question | Pourquoi elle compte | Échéance |
|---|----------|----------------------|----------|
| Q1 | `chore` doit-il rester bloquant par défaut ? | Calibrage : un `chore` bloquant par défaut peut multiplier les fils clos par `decision` (§12). | avant P4 |
| Q2 | Quel niveau l'organisation renseigne-t-elle en pratique — configuration d'organisation, fichiers par dépôt, ou les deux ? | Choix d'exploitation : les trois niveaux du §8.1.2 existent de toute façon, la question est de savoir lequel porte les valeurs. Sans effet sur le code. | avant P5 |
| Q3 | Étend-on la convention aux commentaires de tickets / éléments de travail liés ? | Élargit le périmètre du §4.1 et le contrat d'adaptateur. | après P6 |

*Cinq questions voisines trouvent leur réponse dans le corps du document et ne figurent donc pas au tableau : la validation des réponses de fil (§4.1, désactivée par défaut), la résolution d'un fil par l'auteur de la PR (§6.1, refusée sauf `decision`), le périmètre d'activation (§6.2.3, par PR), le diagnostic des lignes qui ne sont pas des labels (§3.5.1, en étages), et le contournement — **aucun bouton de publication forcée n'est prévu** (§5.4). Une question voisine, souvent confondue avec elle, est un acte différent et a sa propre réponse : clore légitimement un fil bloquant qu'on décide de ne pas traiter passe par le label `decision` (§6.1.1). Deux autres relèvent d'un simple choix de valeur : le style de badge, fixé par `badgeStyle` (§8.2), et le choix extension contre userscript, tranché par le §2 (« une seule extension », Manifest V3) et par le §9.1.*

---

## 14. Phasage proposé

| Phase | Contenu | Dépendance |
|-------|---------|------------|
| **P0** | **Mesure de référence** : délai de revue et taux de conformité actuels, avant tout outillage | — |
| **P1** | `core/` (parser, validator, config) + tests unitaires | — |
| **P1'** *(parallèle à P1)* | Spike technique : écriture programmatique dans les éditeurs — vues React de GitHub **et** Azure DevOps (dont l'établissement du type d'éditeur) | — |
| **P2** | Extension mode `assist` sur la première plateforme (GitHub) | P1 ; **volet GitHub de P1'** pour la seule insertion de préfixe |
| **P3** | Adaptateur Azure DevOps | P1', P2 |
| **P4** | Mode `warn` + restitution des indicateurs du §12 | P2, **P5** |
| **P5** | Composant serveur + status checks | P1 |
| **P6** | Mode `enforce` sur dépôt pilote, puis généralisation | P4, P5 |

**Trois prérequis au passage en `enforce`**, dispersés dans le corps du document et rassemblés ici parce qu'ils conditionnent `P6` :

1. **`resolverOverrideGroup` est désigné** (§8.2). Sans groupe habilité, les deux soupapes du §6.3 sont inertes en même temps — ni `decision`, ni exemption de PR — et un fil dont l'auteur est indisponible bloque la PR sans recours.
2. **La procédure de retour arrière est écrite et son exécutant désigné** (§6.3.3), y compris l'ordre des opérations.
3. **Le check est déclaré obligatoire, et l'option interdisant le contournement des règles est activée** (§6.2.2, annexes) — sans quoi O3 n'est pas satisfait pour les administrateurs.

`P4` ne dépend pas de `P3` : la trajectoire du §7 fait de `assist → warn` la première étape d'adoption, et attendre la seconde plateforme pour l'entamer sur la première n'aurait pas de sens. `P3` élargit le périmètre de `P4`, il ne le conditionne pas.

**Trois travaux ne figurent pas dans le tableau et conditionnent pourtant le calendrier :**

- **`P0` est irrattrapable.** Le §12 veut le « délai total de revue avant / après ». Le « avant » ne peut être collecté qu'avant l'arrivée de l'outil : non fait à temps, l'indicateur est perdu définitivement. C'est la seule phase sans dépendance *et* sans rattrapage possible.
- **La revue des stores est un délai subi.** Toute livraison du composant A y passe (§10), avec un résultat incertain sur les permissions d'hôte. Une soumission « coquille » doit être amorcée dès `P2` pour découvrir le processus sur un enjeu faible.
- **Déclarer le check obligatoire est une tâche d'administration d'organisation**, pas de développement : elle se coordonne avec les propriétaires des dépôts et se planifie avec `P6`.

Le spike (`P1'`) est mené en parallèle du développement de `core/`, et non comme préalable bloquant. Il couvre les **deux** plateformes : les vues React de GitHub absorbent l'affectation directe de `value` au même titre qu'un éditeur piloté par un état applicatif (§9.3). Son volet Azure DevOps conditionne `P3` ; son volet GitHub conditionne la partie « insertion de préfixe » de `P2` (`CA-02`) et doit donc aboutir tôt.

---

## Annexe A — GitHub

Couvre github.com, GitHub Enterprise Cloud (y compris EMU) et GitHub Enterprise Server.

### A.1 Matrice cloud / auto-hébergé

| | Cloud | Auto-hébergé |
|---|---|---|
| **Offre** | github.com, GitHub Enterprise Cloud (EMU) | GitHub Enterprise Server |
| **Domaine** | `github.com`, seul domaine pré-déclarable ; sous-domaine dédié de `ghe.com` pour la résidence de données, qui relève du même mécanisme runtime que l'auto-hébergé (voir A.4) | Domaine interne, variable par instance |
| **Rythme de mise à jour du produit** | Continu | Par release, plusieurs versions supportées en parallèle |
| **Version minimale supportée** | — | *à définir avant P2 (génération de DOM à cibler) et avant P5 (webhooks disponibles, notamment `pull_request_review_thread`, nécessaire au §6)* |

### A.2 Éditeur et écriture programmatique

- Éditeur : `<textarea>` Markdown — dans les deux générations d'interface (héritée et React), le composeur encapsule bien un `<textarea>`.
- Écriture programmatique : **l'affectation directe de `value` suivie d'un événement `input` ne suffit pas** sur les vues React, désormais servies par défaut sur la page *Files changed*. React mémorise la valeur du nœud et absorbe l'événement synthétique : le champ paraît modifié, mais l'état applicatif — donc le contenu réellement soumis — ne l'est pas. C'est le même risque de désynchronisation que celui décrit en annexe B, et il impose la stratégie commune du §9.3.

### A.3 Navigation

SPA (Turbo) — l'adaptateur écoute les événements de navigation Turbo pour ré-attacher la barre d'outils sans rechargement de page.

**Turbo seul ne suffit pas.** Les vues réécrites en React changent le DOM sans nécessairement émettre d'événement Turbo. L'adaptateur combine donc l'écoute Turbo avec un `MutationObserver` sur le conteneur racine — comme sur Azure DevOps (§B.3) — sous peine de manquer l'apparition d'un éditeur sur les pages migrées.

### A.4 Domaines et lecture de la configuration

**Lecture du fichier de configuration par l'extension** (`getRepoConfig()`, §9.2.3, §10) : la route web `https://{hôte}/{owner}/{repo}/raw/{branche-par-défaut}/.conventional-comments.json`, servie sur la session de l'utilisateur, sans jeton. Elle fonctionne sur les dépôts privés auxquels la personne a accès, ce que `raw.githubusercontent.com` ne permettrait pas.

Seul `github.com` est pré-déclarable. GitHub Enterprise Server (domaine interne) **et** GitHub Enterprise Cloud with data residency — qui attribue à chaque client un sous-domaine dédié de `ghe.com`, inconnu à la compilation, avec ses propres points d'accès d'API — relèvent tous deux du même mécanisme : `optional_host_permissions` avec saisie du domaine dans les options d'installation, ou pré-autorisation par politique d'entreprise.

### A.5 Gestion du DOM multi-générations

Contrainte propre à GitHub, absente sur Azure DevOps : **github.com évolue en continu** alors que **GHE Server est figé par release**, avec plusieurs versions en support simultané. Un même adaptateur doit donc reconnaître plusieurs générations de DOM à un instant donné. Conséquences pour l'implémentation :

- Sélecteurs organisés en **chaînes avec repli** (tenter la génération la plus récente, puis les précédentes) plutôt qu'un sélecteur unique par élément.
- **Détection de génération** au chargement, par sondage de traits du DOM ou lecture de la version de l'instance lorsqu'elle est exposée.
- Le smoke test quotidien (§9.4) doit être exécuté contre **plusieurs versions de GHE Server représentatives des versions supportées**, en plus de github.com — sans quoi les régressions spécifiques à une version GHES ne sont détectées que par remontée utilisateur.
- Quand aucune génération connue ne matche, la dégradation silencieuse du §9.4 s'applique zone par zone.

### A.6 Résolution de fil

État considéré comme résolu : conversation marquée *Resolved*.

**Auteur de la résolution :** GitHub expose `PullRequestReviewThread.resolvedBy` en GraphQL. La règle de gouvernance du §6.1 s'y applique donc **intégralement**, sans le repli qu'elle prévoit pour les plateformes qui n'exposent pas ce champ.

**Point d'implémentation :** l'état de résolution d'un fil (`isResolved`) n'est correctement exposé que via l'**API GraphQL** (`PullRequestReviewThread.isResolved`) ; l'API REST ne le fournit pas de façon fiable. Le composant B doit donc consommer GraphQL pour cette partie, même si le reste de l'intégration passe par REST/webhooks.

GitHub autorise nativement l'auteur de la PR à résoudre les conversations — la règle de gouvernance du §6.1 — auteur du commentaire, ou membre de `resolverOverrideGroup` **avec** une réponse `decision` valide — est donc **vérifiée et signalée après coup** par le composant B, pas empêchée à la source par la plateforme.

### A.7 Actions couvertes spécifiques

- Soumission d'une revue en lot (plusieurs commentaires *pending* validés en une action) — chacun doit être conforme, l'erreur doit indiquer lequel. C'est la plateforme qui porte le concept de corps de revue global, d'où `scope.validateReviewSummary` (§8.2) ; il est sans objet sur Azure DevOps.
- Un commentaire commençant par une commande slash reconnue par une GitHub App/Action installée est exempté (§4.2) — par exemple `/rebase`, ou les *comment triggers* d'Azure Pipelines tels que `/azp run`, qui sont une fonctionnalité **GitHub uniquement** et n'existent pas sur Azure Repos.
- **`resolverOverrideGroup`** : un slug d'équipe de l'organisation, sous la forme `org/team-slug`. L'adaptateur serveur le résout via l'API des équipes ; l'appartenance est transitive pour les équipes imbriquées.
- **Bloc de suggestion** (§4.2, étage 0 du §3.5.1) : un bloc de code délimité dont l'*info string* est `suggestion` — ` ```suggestion ` —, inséré par le bouton dédié de l'éditeur de commentaire de diff. C'est ce marqueur, et lui seul, qui déclenche le label implicite.
- **Comptes de service.** `dependabot[bot]`, `github-actions[bot]` et `azure-pipelines[bot]` — cette dernière identité étant le login de l'application GitHub d'Azure Pipelines, et non un compte Azure DevOps — figurent typiquement dans `exemptUsers` (§8.2).

### A.8 Mise en œuvre serveur (composant B)

- GitHub App ou Action, abonnée aux événements `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`, `pull_request_review_thread`.
- Publie un *commit status* / *check run* nommé `conventional-comments`, calculé selon les deux critères du §6.2, en s'appuyant sur GraphQL pour l'état des fils (§A.6).
- **Restitution lisible par l'extension** (§6.3.1) : la ligne `cc/1` est publiée dans le **titre** du *check run*, que GitHub rend sur la page de la PR. Le **corps** Markdown, lui, porte la sortie humaine du §6.3.1 — fils, auteurs, liens permanents — et n'a pas à être reparsé : l'extension tient ses ancres du DOM de la page.
- **Où va quoi.** La ligne machine `cc/1` (§6.3.1) occupe l'`output.title` du *check run* — c'est ce que GitHub rend sur la page de la PR, donc le seul emplacement que `readPublishedResult()` puisse lire. Le **résumé humain** (`ComplianceResult.headline`) ouvre le corps Markdown, suivi du détail par fil et par diagnostic. Les deux ne se disputent pas le même champ.
- **Correspondance des états** (§9.2.1) : `state: 'success'` → conclusion `success`, `'failure'` → `failure`, `'neutral'` → `neutral`. GitHub compte `neutral` parmi les conclusions qui **satisfont** une vérification obligatoire, au même titre que `success` et `skipped` : c'est ce qui rend effectif le délai de grâce du §6.4.
- Ce check est déclaré **required** dans la protection de branche → le bouton *Merge* est désactivé nativement.
- Activer en complément *Require conversation resolution before merging* si l'équipe souhaite l'exigence sur **tous** les fils, pas seulement les bloquants.

---

## Annexe B — Azure DevOps

Couvre Azure DevOps Services et Azure DevOps Server.

### B.1 Matrice cloud / auto-hébergé

| | Cloud | Auto-hébergé |
|---|---|---|
| **Offre** | Azure DevOps Services | Azure DevOps Server |
| **Domaine** | `dev.azure.com`, ou `*.visualstudio.com` pour les organisations historiques | Domaine on-premise, variable par instance |
| **Rythme de mise à jour du produit** | Continu | Par release |
| **Version minimale supportée** | — | *à définir avec la même méthode qu'en A.1* |

### B.2 Éditeur et écriture programmatique

- Éditeur : **à établir par le spike** (§14, `P1'`). L'hypothèse de travail est un éditeur riche piloté par un état applicatif interne plutôt qu'un simple `<textarea>`, mais elle n'est pas vérifiée — et la documentation Microsoft présente l'éditeur de commentaires de PR comme un éditeur Markdown aligné sur le reste du produit, ce qui n'est pas concluant dans un sens ou dans l'autre. **La première tâche du spike est de déterminer le type d'élément**, pas seulement la méthode d'écriture.
- Écriture programmatique : dès lors que l'éditeur est piloté par un état applicatif, l'affectation directe de `value` ne suffit pas — voir la stratégie commune décrite en §9.3, qui s'applique aux deux plateformes.

**Risque à lever :** si l'éditeur est bien piloté par un état applicatif interne, l'écriture programmatique présente un **risque de désynchronisation entre le DOM et cet état** — l'affichage peut sembler correct alors que le contenu soumis à la plateforme diverge.

### B.3 Navigation

SPA — pas d'équivalent de Turbo : l'adaptateur observe le conteneur racine via `MutationObserver` pour détecter l'apparition/disparition des éditeurs.

### B.4 Domaines et lecture de la configuration

`dev.azure.com`, `*.visualstudio.com`, ou domaine on-premise pour Azure DevOps Server → `optional_host_permissions` avec saisie du domaine dans les options pour la variante auto-hébergée.

**Lecture du fichier de configuration par l'extension** (`getRepoConfig()`, §9.2.3, §10) : Azure DevOps n'expose pas de route de fichier brut équivalente à celle de GitHub ; l'accès au contenu d'un fichier passe par un point d'API. Qu'il soit atteignable depuis la page sur la seule session de l'utilisateur est **à établir par le spike `P1'`** (§14), au même titre que le type de l'éditeur (§B.2). S'il ne l'est pas, `getRepoConfig()` y renvoie `{ status: 'unreachable' }` et l'extension y est en **état dégradé** au sens du §5.4 — elle assiste sans bloquer (§10) — le composant B restant, comme partout, la source de vérité.

### B.5 Résolution de fil

L'énumération `CommentThreadStatus` est sérialisée en JSON en **camelCase à initiale minuscule** — c'est cette forme qu'une comparaison de chaîne doit utiliser, et non la casse de l'énumération .NET que l'on rencontre dans certaines documentations :

| Considérés comme résolus | Considérés comme non résolus |
|---|---|
| `fixed`, `wontFix`, `closed`, `byDesign` | `active`, `pending`, `unknown` |

`unknown` est la valeur par défaut lorsqu'aucun statut n'a été posé sur le fil : elle est classée **non résolue**, afin qu'un fil bloquant sans statut explicite ne puisse pas être compté comme traité.

**Gouvernance de la résolution (§6.1).** Azure DevOps ne restreint pas nativement qui peut changer le statut d'un fil : comme sur GitHub, la règle du §6.1 — auteur du commentaire, ou membre de `resolverOverrideGroup` **avec** une réponse `decision` valide — est **vérifiée et signalée après coup** par le composant B, pas empêchée à la source.

**Auteur de la résolution : capacité à établir.** `GitPullRequestCommentThread` porte un `status` et une collection `identities`, mais aucun champ documenté ne donne **qui** a changé ce statut — c'est une demande ouverte de longue date auprès de l'éditeur. Le point est à trancher par le spike `P1'` (§14), au même titre que le type de l'éditeur (§B.2), car il décide de l'applicabilité d'une règle et non d'un détail.

S'il s'avère que la plateforme ne l'expose pas, le cas prévu au §6.1 pour les plateformes n'exposant pas l'auteur d'une résolution s'applique : la résolution est acceptée, un `notice` de type `resolution-unattributed` est émis **à chaque évaluation**, et la règle de gouvernance n'est pas appliquée sur cette plateforme — fait qui doit être connu de l'organisation avant qu'elle n'y passe en `enforce`, et non découvert après. `CA-13` ne s'y teste alors pas.

### B.6 Actions couvertes spécifiques

- Boutons « Comment » **et** « Comment & resolve » — les deux doivent passer par la validation.
- **Pas d'équivalent de revue soumise en lot** : Azure DevOps ne propose pas de corps de revue global comparable à celui de GitHub. La clé `scope.validateReviewSummary` (§8.2) est donc **sans objet** sur cette plateforme et y est ignorée.
- **Pas de commande slash native.** Les *comment triggers* du type `/azp run` sont une fonctionnalité d'Azure Pipelines réservée aux dépôts **GitHub** ; Azure Repos passe par les policies de branche. L'exemption de commande slash du §4.2 n'a donc pas d'illustration native ici — elle reste disponible pour les commandes d'outils tiers éventuellement installés.
- **`resolverOverrideGroup`** : le nom d'un groupe de sécurité Azure DevOps, à l'échelle de l'organisation ou du projet, sous la forme `[Scope]\Nom du groupe`. L'appartenance est transitive pour les groupes imbriqués.
- **Bloc de suggestion** (§4.2, étage 0 du §3.5.1) : Azure DevOps offre la même fonctionnalité — icône d'ampoule sous la zone de commentaire d'une ligne de diff, bouton *Apply changes* côté auteur — et la rend elle aussi sous forme de **bloc de code délimité**. L'*info string* exact n'est pas documenté et reste **à établir par le spike `P1'`** (§14), qui ouvre déjà cet éditeur (§B.2) : c'est une lecture, pas un développement. Tant qu'il ne l'est pas, l'adaptateur Azure DevOps ne reconnaît aucun bloc de suggestion et ces commentaires relèvent du cas général — un `suggestion:` explicite y reste toujours accepté.
- **Comptes de service.** Les commentaires de pipeline sont postés par `Project Collection Build Service ({Org})` ou `{Project} Build Service ({Org})` selon la configuration — ce sont ces identités qui figurent dans `exemptUsers` (§8.2). L'identité `azure-pipelines[bot]` n'existe **pas** sur Azure DevOps : c'est le login de l'application GitHub du même produit, et elle relève de l'annexe A.
- **Versions à couvrir en test** (§9.4) : Azure DevOps Services (continu) et les versions d'Azure DevOps Server encore supportées — liste à arrêter avec la même méthode qu'en A.1.

### B.7 Mise en œuvre serveur (composant B)

- Service Hook sur `Pull request created`, `Pull request updated`, `Pull request commented on` → déclenche une Azure Function.
- **Résolutions de fil et étiquettes.** Aucun de ces trois hooks ne notifie un changement de statut de fil ni la pose d'une étiquette. Aucune dérivation n'est nécessaire pour autant : `Pull request updated` **déclenche une réévaluation complète**, et l'étape 6 du §6.4 relit de toute façon l'état courant plutôt que le contenu de l'événement. Les valeurs `thread.resolved`, `label.added` et leurs symétriques (§9.2.1) restent donc sans producteur sur cette plateforme, ce qui est sans conséquence : elles ne sont consommées par rien.
- **Réserve de latence.** Un changement de statut de fil qui ne s'accompagne d'aucune mise à jour de PR n'est vu qu'à la réconciliation périodique, dont l'intervalle par défaut — 900 s — **excède la NFR de 60 s du §10**. Sur cette plateforme, `server.reconcileIntervalSeconds` doit être abaissé en conséquence.
- **`targetUrl` obligatoire** (§6.3.1) : le statut ne portant pas de corps, c'est elle qui donne accès à la sortie complète. Elle pointe vers une page servie par le composant B.
- La fonction publie un **PR Status** via
  `POST https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/statuses?api-version=7.1`
  avec, dans sa **description**, la ligne de résumé du §6.3.1 — `state`, `isDraft`, `exempted`, `mode`, `activatedAt`, `coreVersion`, `configFingerprint`, trois compteurs — et un état pris dans `GitStatusState` : `succeeded`, `failed`, et `notApplicable` pour le `state: 'neutral'` du §9.2.1 — celui du délai de grâce (§6.4) et de la configuration disparue (§8.1.5). L'ensemble complet de l'énumération est `notSet`, `pending`, `succeeded`, `failed`, `error`, `notApplicable`. Le `state` est calculé par `core/` selon les critères du §6.2.1 ; l'adaptateur ne fait que le traduire. Le paramètre `api-version` est **obligatoire**.
- **Point structurant :** le statut doit porter un `context: { genre, name }`, et c'est le couple **`genre/name`** — et non un nom nu — qui lie le statut publié à la policy de branche. Sans lui, la policy ne trouvera jamais le statut et O3 ne sera pas satisfait.
- **Restitution lisible par l'extension** (§6.3.1) : un PR Status ne porte ni corps ni Markdown — un état, une **description d'une ligne**, une `targetUrl` et le `context`. C'est la ligne `cc/1` qui y loge, avec tous ses champs ; la sortie humaine est derrière la `targetUrl`. `readPublishedResult()` y restitue le **même** `PublishedSummary` que sur GitHub, et le bandeau du §5.5 tire ses ancres du DOM, comme partout. `CA-03` et `CA-32` sont donc passables ici comme là ; c'est précisément pour cela que le résumé est une ligne de texte et non un document.
- Ce statut est déclaré comme **policy de branche obligatoire** (*Status checks*), en le référençant par ce même couple `genre/name` → complétion bloquée nativement.
- Alternative sans code : policy native *Check for comment resolution*, mais elle ne sait pas distinguer bloquant / non bloquant — insuffisante pour satisfaire O3 telle quelle.
