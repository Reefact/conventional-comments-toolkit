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
[<emoji> ]<label> [(<decoration>[, <decoration>]*)]: <subject>

[<discussion>]
```

- `emoji` — optionnel, toléré en entrée et ignoré pour l'analyse (§3.4.2).
- `label` — obligatoire, un seul, issu de la liste configurée (§3.2) ou l'un de ses alias (§8.2).
- `decoration` — optionnelle, entre parenthèses, séparées par des virgules. Chaque décoration est un identifiant `[A-Za-z][A-Za-z0-9-]*` (§3.3), dont la forme canonique est en minuscules : un écart de casse est normalisé par un avertissement, jamais rejeté. Une espace sépare le label de la parenthèse ouvrante ; l'intérieur des parenthèses ne comporte pas d'espace superflue.
- `:` — séparateur obligatoire, **collé au label ou à la parenthèse fermante**, et suivi d'au moins une espace **ou de la fin de ligne** — auquel cas le sujet est absent et `E-EMPTY-SUBJECT` (§3.5.2) s'applique.
- `subject` — obligatoire, résumé sur une ligne. Seules sa **présence** et sa **longueur** sont contrôlées (§3.5.2) ; sa forme rédactionnelle — casse, ponctuation, nombre de phrases — relève du contenu, que le §1 place hors champ.
- `discussion` — optionnelle : **tout contenu du corps situé en dehors de la ligne de préfixe** (§3.4.1) — après elle dans le cas courant, mais aussi avant, un extrait de code cité en tête étant de la discussion. La présence d'une ligne vide de séparation n'entre pas en compte. Format Markdown libre.

*Précision volontaire.* La ligne vide entre le sujet et la discussion est un usage de présentation — elle rend le Markdown plus lisible — et **non une exigence structurelle**. Exiger sa présence, et pénaliser son absence, relèverait de la mise en forme rédactionnelle que le §1 place hors périmètre. `W-NO-DISCUSSION` (§3.5.2) se déclenche donc lorsqu'un commentaire **bloquant au sens du §3.3** — label et décorations résolus, et non le seul label — ne comporte **aucun contenu non blanc en dehors de sa ligne de préfixe** (§3.4.1), et jamais sur un défaut de séparation. C'est le sens de « discussion » posé ci-dessus : les lignes écartées à l'étape 2 du prétraitement en font partie, sans quoi la forme même que cette étape existe pour sauver — citer du code, puis écrire `issue: …` en dessous — recevrait systématiquement cet avertissement. Un `issue (non-blocking): …` sans discussion ne le déclenche pas : c'est le caractère bloquant effectif qui rend la justification nécessaire, pas le mot employé.

**Plus strict que l'amont, sur un point précis.** [conventionalcomments.org](https://conventionalcomments.org/) ne pose comme normatif que la forme générale et le fait que les décorations sont « entre parenthèses et séparées par des virgules ». Il ne dit rien de la casse, des espaces ni des caractères autorisés, et invite explicitement à diverger de sa liste de labels.

Nous durcissons donc **la forme du préfixe** — casse du label, position du deux-points, syntaxe des décorations (§3.3) — parce que c'est ce qui rend le commentaire analysable par une machine des deux côtés de l'architecture. En revanche nous ne touchons **pas au sujet** : sa rédaction relève du contenu, que le §1 place explicitement hors périmètre.

Deux tolérances assumées : l'amont écrit ses décorations sans espace après la virgule (`(ux,non-blocking)`), nous acceptons les deux formes ; et les écarts de **style** sur les décorations — casse, espaces de bordure, doublon — sont des avertissements corrigeables en un clic. Les défauts de **syntaxe**, eux, restent des erreurs : la frontière exacte est posée au §3.3.

### 3.2 Labels

Liste par défaut (configurable — voir §8). La colonne « Bloquant par défaut » détermine le comportement décrit au §6.

| Label | Description | Bloquant par défaut | Toujours non bloquant |
|-------|-------------|:---:|:---:|
| `praise` | Souligne un point positif. | Non | Non |
| `nitpick` | Préférence triviale, sans enjeu réel. | Non | **Oui** |
| `suggestion` | Proposition d'amélioration argumentée. | Non | Non |
| `issue` | Problème identifié. Idéalement accompagné d'une suggestion. | **Oui** | Non |
| `todo` | Changement petit mais nécessaire. | **Oui** | Non |
| `question` | Demande de clarification sur un point incertain. | Non | Non |
| `thought` | Idée surgie pendant la revue, sans demande d'action. | Non | **Oui** |
| `chore` | Tâche annexe à réaliser avant acceptation (relancer un job, MAJ d'un doc...). | **Oui** | Non |
| `note` | Information à porter à connaissance. | Non | **Oui** |
| `decision` | Acte le choix de **ne pas** traiter un point soulevé, en énonçant pourquoi. Employé en réponse dans un fil bloquant — voir §6.1.1. | Non | **Oui** |

Labels optionnels activables par configuration : `typo`, `polish`, `quibble`.

*Nota — `praise` :* la recommandation « à utiliser au moins une fois par revue » relève d'une bonne pratique culturelle, non d'une règle de validation outillée. Elle n'a pas de code d'erreur associé et n'affecte jamais la conformité d'un commentaire.

### 3.3 Décorations

| Décoration | Effet sur le caractère bloquant | Porteuse |
|------------|--------------------------------|:---:|
| `(blocking)` | Force le caractère **bloquant**, quel que soit le label. | Oui |
| `(non-blocking)` | Force le caractère **non bloquant**, quel que soit le label. | Oui |
| `(if-minor)` | Force le caractère **non bloquant** — le point n'est à traiter que si l'effort est faible. | Oui |
| Décoration libre (`(security)`, `(perf)`, `(a11y)`…) | Aucun — purement descriptive. Autorisée si `decorations.allowFree` vaut `true`. | Non |

**Précédence pour déterminer si un commentaire est bloquant.** Les règles sont évaluées dans l'ordre ; la première qui s'applique l'emporte.

1. **Conflit avec un label toujours non bloquant.** Un label marqué `alwaysNonBlocking` (`nitpick`, `note`, `thought`, `decision`) portant la décoration `(blocking)` produit `E-CONFLICT`. Le commentaire est en erreur ; la question du caractère bloquant ne se pose pas.
2. **Décorations contradictoires.** La présence simultanée de plusieurs décorations **porteuses** aux effets opposés — `(blocking)` avec `(non-blocking)`, ou `(blocking)` avec `(if-minor)` — produit également `E-CONFLICT`. Aucune règle de « la première gagne » n'est définie, précisément parce qu'un tel commentaire traduit une intention ambiguë qu'il vaut mieux faire corriger.
3. **`(blocking)` seul** → bloquant.
4. **`(non-blocking)` ou `(if-minor)`** → non bloquant.
5. **Aucune décoration porteuse** → valeur `blockingByDefault` du label (§3.2).

Cette liste doit rester exhaustive : le tableau ci-dessus seul ne suffit pas. `(if-minor)` y est déclaré non bloquant, mais une liste de précédence qui ne le mentionnerait pas rendrait `issue (if-minor):` **bloquant** par le jeu de la règle 5 — en contradiction directe avec le tableau.

**Un commentaire en `E-CONFLICT` reste évaluable comme racine de fil.** Les règles 1 et 2 disent que la question du caractère bloquant « ne se pose pas » **du point de vue de la personne qui écrit** : cette personne doit corriger, aucune interprétation ne lui sera prêtée. La question se pose en revanche pour le composant B, à qui le §6.1 demande une réponse booléenne sur chaque racine de fil. La règle est donc : **une racine en `E-CONFLICT` est bloquante si son label l'est par `blockingByDefault`** (§3.2), les décorations contradictoires étant ignorées. C'est un **départage**, et il vaut partout où le caractère bloquant est en jeu : décompte du critère 2, bandeau du §5.5, `W-NO-DISCUSSION`, `W-NOT-BLOCKABLE`. Une notion qui n'aurait de valeur que « pour ce calcul-ci » laisserait les autres sans réponse.

Sans elle, rendre son propre commentaire indécidable serait un chemin d'évasion à un caractère près : sous `formatSeverity: warn`, qui est le défaut, `issue (blocking, non-blocking): …` sortirait du décompte des fils bloquants au prix d'un simple avertissement de forme. La règle place l'ambiguïté du côté sûr — `issue` reste bloquant, `nitpick (blocking)` ne le devient pas.

**Forme d'une décoration.** Chaque élément, une fois les espaces de bordure retirés, doit être un identifiant : une lettre suivie de lettres, de chiffres ou de traits d'union — `[A-Za-z][A-Za-z0-9-]*`. Cette contrainte est **structurelle et toujours appliquée** ; elle est indépendante de `decorations.allowFree`, qui gouverne l'appartenance à la liste connue, pas la forme. Sont donc rejetés par `E-DECORATION-SYNTAX` :

- un caractère hors identifiant — `(perf*)`, `($$$)`, un emoji ;
- une espace interne — `(non blocking)`, coquille probable pour `(non-blocking)` ;
- un élément vide — `(blocking,,)` ;
- des parenthèses vides — `()`.

**Casse, espaces et doublons.** La comparaison à la liste connue ignore la casse et les espaces de bordure, mais l'écart est **signalé** par `W-DECORATION-STYLE`, avertissement corrigeable en un clic :

- une casse non canonique — `(BLOCKING)` ;
- des espaces de bordure — `( blocking )` ;
- une espace manquante avant la parenthèse — `issue(blocking):` ;
- un doublon exact — `(blocking, blocking)`.

Dans tous ces cas le commentaire reste valide ; seule sa forme est normalisée.

### 3.4 Expression régulière de référence

#### 3.4.1 Prétraitement (normatif)

**Cette étape est obligatoire et fait partie de la règle.** Elle répond à une question — *quelle ligne porte le préfixe ?* — distincte de celle du §4.2 — *ce commentaire dit-il quelque chose ?*. Les deux écartent des blocs de code, mais n'en tirent pas la même conclusion : un commentaire réduit à un bloc de suggestion n'a pas de ligne de préfixe **et** n'est pas exempté.

 L'extension lit un champ de saisie vivant, où les fins de ligne sont des `LF` ; le composant serveur relit le corps stocké, où la spécification HTML impose la normalisation des fins de ligne d'un `<textarea>` en `CRLF` à la soumission. Sans prétraitement identique des deux côtés, **le même commentaire reçoit deux verdicts opposés** — ce que la règle de conception du §2 interdit.

L'algorithme, appliqué à l'identique par les composants A et B, est :

```
1. Découper le corps sur /\r?\n/          (jamais sur '\n' seul : un '\r' résiduel casse le match)
2. Écarter les lignes de bloc de code délimité et de citation Markdown ('>')
3. Prendre la première ligne restante dont le trim() est non vide  → « ligne de préfixe »
4. Retirer en tête et en queue tout \p{White_Space} ainsi que U+FEFF      (voir ci-dessous)
5. Remplacer tout \p{White_Space} restant, hors ' ' et '\t', par une espace ordinaire
6. Supprimer tout U+FEFF restant                       (supprimé, jamais remplacé — voir ci-dessous)
7. Appliquer la regex de référence au résultat
```

La ligne retenue à l'étape 3 est appelée **ligne de préfixe** dans tout le document ; la **discussion** (§3.1) est tout ce qui l'entoure dans le corps d'origine — ce qui la suit comme ce qui la précède.

**Pourquoi l'étape 2.** Citer trois lignes de code puis écrire `issue: …` en dessous est une forme courante en revue. Sans ce retrait, la ligne analysée serait une accolade et le commentaire recevrait `E-NO-LABEL` alors qu'il porte un préfixe correct. Le retrait ne porte que sur les blocs **délimités** (``` ou ~~~) et les citations : l'indentation de tête reste tolérée par l'étape 4, sans quoi `CA-18` — qui l'exige — serait contradictoire avec la présente étape.

**Pourquoi les jeux de caractères sont énoncés en toutes lettres.** « Appliquer `trim()` » n'est pas une règle : le `trim()` de JavaScript retire U+FEFF, celui de Python ne le retire pas. Deux implémentations conformes, deux verdicts — sur un BOM, que `CA-06` teste explicitement. Les deux jeux sont donc clos et identiques des deux côtés : `\p{White_Space}` ∪ {U+FEFF} pour l'étape 4 ; `\p{White_Space}` privé de l'espace et de la tabulation pour l'étape 5 ; U+FEFF seul pour l'étape 6.

**Pourquoi U+FEFF est supprimé et non remplacé.** Il **n'a pas** la propriété `White_Space` — c'est une marque d'ordre d'octets, pas un blanc —, il doit donc être traité à part. Et le traiter comme un blanc produirait un message faux dans l'autre sens : `issue` suivi d'un BOM puis du deux-points deviendrait `issue : x`, qui reçoit le motif 4, « espace avant le deux-points », en désignant une espace que personne n'a tapée. Supprimé, le cas retombe sur `issue: x`, qui est conforme — ce qui est exact, un BOM invisible n'étant pas une faute de forme. Placé *après* le deux-points, il disparaît de même et laisse `issue:sujet`, qui reçoit le motif 5, « espace manquante après le deux-points » : exact également, puisque aucune espace n'a été saisie. Un caractère de largeur nulle n'est pas un blanc — le remplacer par une espace inventerait une saisie que personne n'a faite. Le point est de la même nature que le `CRLF` traité plus haut : une commodité de bibliothèque qui diverge silencieusement d'un langage à l'autre.

**Pourquoi l'étape 5.** Une espace insécable est invisible à l'écran et fréquente en français, où claviers et traitements de texte l'insèrent d'eux-mêmes devant un deux-points. La regex n'accepte que `[ \t]` : sans normalisation, `issue:` suivi d'une insécable puis du sujet échouerait à l'étage 1a du §3.5.1, puis serait diagnostiqué par le motif 6 — « caractère inattendu » — dont le message serait faux. Cette substitution ne produit **aucun diagnostic** : on ne signale pas à quelqu'un un caractère qu'il ne voit pas. Elle rend en revanche exact le diagnostic **suivant** : une insécable placée *avant* le deux-points donne, après normalisation, `issue : x`, qui reçoit le motif 4 — « espace avant le deux-points » — qui est le bon message.

Un corps vide, constitué uniquement de blancs, ou dont il ne reste rien après l'étape 2, ne produit **aucune** ligne de préfixe : ce cas relève de l'exemption du §4.2 (contenu non rédigé), pas d'une erreur de format.

#### 3.4.2 Expression régulière de référence

```regex
^(?:(?:\p{RI}\p{RI}|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*)[ \t]*)?(?<label>[A-Za-z]+)(?:[ \t]*\((?<decorations>[^)\r\n]*)\))?:(?:[ \t]+(?<subject>.*?)[ \t]*)?$
```

**Drapeau `u` obligatoire, drapeau `v` interdit.** Ce point doit être vérifié par un test : sans drapeau, la regex **compile malgré tout** et `\p{...}` dégénère en séquence littérale — elle matche alors le texte `p{Extended_Pictographic}` sans jamais lever d'exception, et le défaut passe inaperçu. Le drapeau `v` (« Unicode sets »), lui, lève une `SyntaxError` sur `[^)\r\n]`.

Notes de conception :

- **Classes de blancs explicites.** `[ \t]` partout plutôt que `\s`. Le prétraitement du §3.4.1 garantit déjà qu'une seule ligne est soumise à la regex ; ce choix est une défense en profondeur, qui garde le motif correct même si un outil tiers l'applique à un corps entier — avec `\s`, `issue:\n\nsujet` matcherait en capturant un sujet situé en troisième ligne.
- **Casse du label.** `[A-Za-z]+` (plutôt que `[a-z]+`) capture un label saisi avec une casse différente (`Issue:`) afin de déclencher `W-CASE` (§3.5) au lieu d'un `E-NO-LABEL` inexploitable. La comparaison à la liste des labels connus (§3.2) est ensuite insensible à la casse.
- **Sujet optionnel.** La branche `(?:[ \t]+(?<subject>…))?` rend `subject` **absent** pour `issue:`, ce qui rend `E-EMPTY-SUBJECT` (§3.5) **atteignable** — un sujet obligatoire dans la regex renverrait ce cas sur `E-NO-LABEL`, dont le message ne correspond pas au défaut réel. `issue: ` — avec une espace de fin — arrive ici sous la forme `issue:`, l'étape 4 du prétraitement ayant retiré les blancs de queue : les deux saisies produisent le même diagnostic, par le même chemin.
- **Aucune espace avant le deux-points, une espace au moins après.** Les deux contraintes sont normatives. L'espace exigée *après* écarte `http://example.com` et les URL en général. L'absence d'espace *avant* est ce qui distingue un préfixe technique d'une phrase en typographie française (`Attention : le build casse`), et c'est le premier étage du diagnostic décrit au §3.5.1.
- **Emoji.** Le préfixe couvre les emoji réels : drapeaux (paires de Regional Indicators), modificateurs de teint, et séquences ZWJ. Il est toléré en entrée et ignoré pour l'analyse.
- **Décorations vides.** Le groupe `decorations` présent mais vide (`issue (): sujet`) est capturé par la regex, puis **rejeté par le validateur** avec `E-DECORATION-SYNTAX` (§3.3) : des parenthèses ouvertes et refermées à vide sont une coquille, pas une absence de décoration. La regex reconnaît, le validateur tranche.
- **Complexité linéaire, vérifiée.** Les blancs restent *à l'intérieur* du groupe optionnel de préfixe ; les sortir rend le motif quadratique. Mesuré : ~0,0005 ms sur un commentaire nominal — soit quatre ordres de grandeur sous le seuil de 5 ms du §10 — et ≤ 1,2 ms au pire, sur des formes pathologiques de 300 000 caractères (blancs répétés, parenthèse jamais fermée, emoji consécutifs) qu'aucun commentaire réel n'atteint.

**Faux positif connu, assumé.** Une phrase ordinaire dont le premier mot est un label existant suivi immédiatement d'un deux-points (`note: le build casse`) est reconnue comme conforme. C'est inhérent à la convention, dont c'est exactement la syntaxe ; aucun traitement n'est prévu, et la personne obtient de toute façon un commentaire correctement labellisé.

### 3.5 Règles de validation

#### 3.5.1 Déroulement de la validation

La validation d'un commentaire se fait en **deux temps** :

1. **La reconnaissance du préfixe** — décrite ci-dessous. Elle est *séquentielle et exclusive* : elle produit **au plus un diagnostic**, et s'arrête au premier étage qui échoue, parce qu'un préfixe qu'on n'a pas su lire ne permet pas de dire autre chose d'utile.
2. **Les contrôles de contenu** — décorations (§3.3), sujet, discussion. Ils ne sont atteints que si le préfixe est reconnu, et ils sont *cumulatifs* : un même commentaire peut en produire plusieurs.

Cette distinction est structurante. Sans elle, on ne saurait ni si `issue:` sans sujet doit ressortir conforme, ni combien de diagnostics comparer dans le test de parité `CA-06`.

**Temps 1 — reconnaissance du préfixe.** Une même ligne peut échouer pour des raisons de nature très différente, et un message unique serait faux dans la majorité des cas.

| Étage | Question | Si **oui** | Si **non** |
|:---:|---|---|---|
| **−2** | La **zone** est-elle exclue par configuration — une réponse de fil alors que `scope.validateReplies` vaut `false`, ou un corps de revue alors que `scope.validateReviewSummary` vaut `false` (§4.1) ? | Analyser le préfixe malgré tout, puis : s'il s'agit d'une **réponse de fil** dont le label résolu est `decision`, reprendre à l'étage **−1** et poursuivre normalement (§4.1, « Analyser n'est pas exiger ») ; dans tous les autres cas **aucun diagnostic**, validation terminée | passer à l'étage **−1** |
| **−1** | Le commentaire est-il **exempté** au sens du §4.2 — corps vide, aucun contenu propre, auteur exempté, message de plateforme, commande slash, motif de `allowlistPatterns` ? | **Aucun diagnostic**, validation terminée | passer à l'étage **0** |
| **0** | Le **corps brut** contient-il un **bloc de suggestion natif** de la plateforme (§4.2, marqueur en annexe) ? | voir les trois cas énoncés sous le tableau | passer à l'étage **1a** |
| **1a** | La ligne a-t-elle la **forme** `label: sujet` (§3.4.2) ? | passer à l'étage **2** | passer à l'étage **1b** |
| **1b** | Le premier mot de la ligne est-il un **label connu** ou l'un de ses alias — autrement dit, s'agissait-il d'une tentative ? | **`E-MALFORMED-PREFIX`** : énoncer le motif exact (tableau ci-dessous) et proposer la correction | **`E-NO-LABEL`** : énoncer le format attendu et proposer l'insertion d'un label. Ne **jamais** parler de label inconnu — la personne n'a pas tenté d'en écrire un |
| **2** | Le label capturé figure-t-il dans la liste configurée (§3.2) ou ses alias (§8.2) ? | passer à l'étage **3** | **`E-UNKNOWN-LABEL`** : lister les labels disponibles et proposer le plus proche (`isue:` → `issue:`) |
| **3** | Est-il dans la **bonne casse** ? | préfixe reconnu → **temps 2** | **`W-CASE`** : avertissement, correction en un clic, puis **temps 2** |

**L'étage −2 est le seul qui analyse sans valider.** Une réponse de fil n'est pas validée par défaut, mais une réponse `decision` l'est **toujours** (§4.1) : il faut donc lire le préfixe pour savoir s'il faut le juger. La reprise se fait à l'étage **−1**, et non plus loin : une `decision` écrite par un compte exempté reste exemptée, et `W-CASE` sur `Decision:` reste évalué à l'étage 3. L'analyse du préfixe faite ici sert à décider, pas à consommer un étage. L'exception ne vaut que pour les **réponses de fil** : une `decision` écrite dans un corps de revue n'a aucun effet — le §6.1.1 exige qu'elle se trouve dans le fil qu'elle clôt, jamais ailleurs —, et la valider reviendrait à imposer un seuil de 20 caractères sur une zone que la configuration vient d'éteindre. L'ordre compte, et il est contre-intuitif — d'où ce barreau explicite. Corollaire : une réponse dont le préfixe est **mal formé** ne porte aucun label, donc pas le label `decision`, donc n'est pas validée. Elle ne vaut pas non plus décision au sens du §6.1.1, ce qui est le comportement recherché : une décision illisible n'en est pas une.

**L'étage −1 rend le §3.5 lisible seul.** Sans lui, une approbation sans texte ou un message de plateforme n'a aucune branche : le tableau demande « la ligne a-t-elle la forme… » alors qu'il n'y a pas de ligne. C'est aussi ce qui rattache `CA-19` et `CA-20` à une règle du validateur, et non à la seule prose du §4.2.

**Les trois cas de l'étage 0.** Un bloc de suggestion natif est présent ; reste à savoir si le commentaire porte *aussi* un préfixe. La ligne de préfixe (§3.4.1) est calculée, puis :

1. **Aucune ligne de préfixe ne subsiste**, ou son premier mot **n'est ni un label connu ni un alias** — c'est une phrase libre, ou rien : label `suggestion` **implicite**, préfixe reconnu, passer au temps 2.
2. **Son premier mot est un label connu ou un alias, et la ligne a la forme `label: sujet`** : ce préfixe explicite l'emporte, passer à l'étage **2**.
3. **Son premier mot est un label connu ou un alias, mais la forme est mauvaise** : c'est une tentative ratée, passer à l'étage **1b**, qui produira `E-MALFORMED-PREFIX`.

Le discriminant est donc celui de l'étage **1b** — « s'agissait-il d'une tentative ? » — et non celui de l'étage 1a. Discriminer par la forme ferait passer `issue (blocking: x` écrit au-dessus d'un bloc de suggestion pour une phrase libre : le commentaire ressortirait conforme sous label implicite, alors que le §4.2 et `CA-38` exigent `E-MALFORMED-PREFIX`. Un préfixe mal formé échoue toujours à l'étage 1a — c'est sa définition —, et l'étage 1a ne peut donc pas servir à décider s'il y en avait un.

L'étage 1b n'est atteint **que si la forme a échoué**, l'étage 2 **que si elle a réussi** : c'est ce qui explique que deux étages posent une question voisine pour deux codes différents. En 1b, il n'y a pas de capture — le « premier mot » s'entend au sens de `[A-Za-z]+` en tête de la ligne de préfixe (§3.4.1).

`W-CASE` est le seul étage dont l'échec n'interrompt pas la suite : c'est un avertissement, le préfixe reste lisible, et les contrôles de contenu s'appliquent normalement.

La détection de l'étage 0 porte sur le **corps brut**, parce que l'étape 2 du prétraitement écarte les blocs de code — celui-ci compris. C'est ce qui évite qu'un bloc de suggestion ne tombe en `E-NO-LABEL` et ne soit rejeté en mode `enforce`. Sous label implicite, **trois contrôles de contenu ne s'appliquent pas** : ceux du sujet, celui de la discussion, et `W-MISSING-DECORATION`. Le bloc *est* le contenu du commentaire — il n'a ni sujet ni discussion au sens du §3.1 — et `suggestion` étant justement l'un des deux déclencheurs de `W-MISSING-DECORATION`, l'y soumettre reviendrait à avertir sur **tous** les blocs de suggestion.

Le **marqueur** qui identifie un bloc de suggestion est propre à chaque plateforme et donné en annexe (§A.7, §B.6). Une plateforme dont le marqueur n'est pas établi n'a pas d'étage 0 : ses commentaires relèvent du cas général.

**Temps 2 — contrôles de contenu.** Ils sont **tous évalués**, et chacun peut produire son diagnostic :

| Objet | Contrôles |
|---|---|
| Décorations | `E-DECORATION-SYNTAX`, `E-UNKNOWN-DECORATION`, `E-CONFLICT`, `W-DECORATION-STYLE` (§3.3) |
| Sujet | `E-EMPTY-SUBJECT`, `W-SUBJECT-TOO-SHORT`, `W-SUBJECT-TOO-LONG`, `E-DECISION-SUBJECT` (§6.1.1) |
| Discussion | `W-NO-DISCUSSION` |
| Contexte | `W-MISSING-DECORATION`, `W-NOT-BLOCKABLE` (§4.1) |

**Multiplicité.** Un contrôle produit **au plus un diagnostic par code**, quel que soit le nombre d'occurrences fautives : `issue (foo, bar): x` produit **un seul** `E-UNKNOWN-DECORATION`, dont le message énumère `foo` et `bar`. Le même commentaire peut en revanche porter plusieurs codes **différents** — c'est le sens de « cumulatifs ». Sans cette règle, la liste comparée par `CA-06` aurait une longueur dépendante de l'implémentation, et deux implémentations également correctes échoueraient au test de parité.

**Exclusion.** Trois contrôles s'effacent devant un autre, faute de quoi un même défaut compterait deux fois et la liste de `CA-06` dépendrait de l'implémentation :

- `W-SUBJECT-TOO-SHORT` et `W-SUBJECT-TOO-LONG` ne sont évalués **que si un sujet est présent** : sur `issue:`, `E-EMPTY-SUBJECT` les remplace. Un sujet vide n'est pas un sujet court.
- `E-DECISION-SUBJECT` remplace `W-SUBJECT-TOO-SHORT` sur une réponse `decision` : le seuil de `minDecisionSubjectLength` est le seul qui s'y applique. Sur une réponse `decision` **sans aucun sujet**, c'est `E-EMPTY-SUBJECT` qui l'emporte à son tour : les deux codes diraient la même chose, et le §6.1.1 fait de la présence du sujet une condition distincte de sa longueur.
- Un code dont `severities` fixe la sévérité à `off` **est retiré de la liste restituée** : il n'apparaît ni dans `formatDiagnostics`, ni dans les compteurs du résumé humain du check (§6.3.1), ni dans le verdict comparé par `CA-06`. Désactiver une règle, c'est ne plus l'évaluer, pas l'évaluer en silence.

**Ordre de restitution des diagnostics.** `CA-06` compare une **liste ordonnée** de couples (code, sévérité) : cet ordre doit donc être déterministe. Il est celui du **tableau du §3.5.2, de haut en bas** — dont les lignes sont pour cette raison groupées par temps, le préfixe en tête. Deux implémentations qui appliquent les mêmes règles produisent ainsi la même liste, caractère pour caractère.

L'exemple qui motive ce découpage : `Attention : le build casse` échoue à l'étage 1a, puis à l'étage 1b — `Attention` n'est pas un label, l'espace avant le deux-points prouve qu'il s'agit d'une phrase et non d'un préfixe. La personne reçoit le format attendu. Si elle réessaie avec `attention: le build casse`, la forme est bonne : elle passe l'étage 1a, n'est donc jamais soumise à 1b, et reçoit à l'étage 2 la liste des labels. Chaque message répond exactement à ce qui vient d'être fait.

Ce découpage est ce qui rend l'exigence du §5.3 — « une proposition de correction actionnable en un clic » — réellement applicable : à chaque étage correspond une correction unique et calculable, ce qu'un code de diagnostic unique ne permettrait pas.

**Cas de `E-MALFORMED-PREFIX`**, évalués dans cet ordre et s'arrêtant au premier qui s'applique :

| # | Condition sur la ligne | Motif |
|:---:|---|---|
| 1 | `(` présent, `)` absent | parenthèse non fermée — `issue (blocking: x` |
| 2 | `)` présent, `(` absent | parenthèse non ouverte — `issue blocking): x` |
| 3 | aucun `:` | deux-points manquant — `issue (blocking) x` |
| 4 | une espace précède le `:` | espace avant le deux-points — `issue : le nom est ambigu` |
| 5 | le `:` n'est suivi ni d'une espace ni de la fin de ligne | espace manquante après le deux-points — `issue:pas-d-espace` |
| 6 | aucun des motifs ci-dessus | caractère inattendu entre le label et le deux-points — `issue2: x`, `issue (ux) (perf): x`. Énoncer le format attendu |

Le motif 4 est celui qui justifie le discriminant de l'étage 1b : `issue : le nom est ambigu` et `Attention : le build casse` ont **exactement la même forme**, et seul le fait que `issue` soit un label permet de dire à l'une « collez le deux-points » et à l'autre « voici le format attendu ».

**Point structurant : cette passe ne durcit pas la regex de référence.** Elle ajoute, en cas d'échec de celle-ci, une **seconde analyse purement textuelle** de la ligne — décrite par le tableau des motifs ci-dessus, et non par une seconde expression régulière. Durcir la regex pour qu'elle rejette ces saisies les ferait au contraire retomber en `E-NO-LABEL` — et y entraînerait aussi les cas aujourd'hui bien diagnostiqués, comme `issue (blocking,,): x` ou `issue (): x`, que la regex capture volontairement pour que le validateur puisse les qualifier précisément (§3.3). La regex reconnaît largement ; le validateur tranche.

#### 3.5.2 Codes de diagnostic

| Code | Règle | Sévérité |
|------|-------|----------|
| **Préfixe** — temps 1, au plus un seul (§3.5.1) | | |
| `E-NO-LABEL` | La ligne de préfixe (§3.4.1) n'a pas la forme `label: sujet` (étage 1b) | Erreur |
| `E-MALFORMED-PREFIX` | Tentative de commentaire conventionnel dont le préfixe est mal formé — le motif exact figure dans le message (étage 1b) | Erreur |
| `E-UNKNOWN-LABEL` | Forme correcte, mais le label est absent de la liste configurée (étage 2) | Erreur |
| `W-CASE` | Label saisi avec une casse différente (`Issue:`) — n'interrompt pas la suite (étage 3) | Avertissement + correction auto |
| **Décorations** — temps 2, cumulatifs (§3.3) | | |
| `E-DECORATION-SYNTAX` | Décoration mal formée : caractère hors identifiant, espace interne, élément vide, parenthèses vides | Erreur |
| `E-UNKNOWN-DECORATION` | Décoration inconnue et `decorations.allowFree` à `false` | Erreur |
| `E-CONFLICT` | Décoration incompatible avec le label, ou décorations porteuses contradictoires entre elles (§3.3, règles 1 et 2) | Erreur |
| `W-DECORATION-STYLE` | Décoration en majuscules, espaces superflus, doublon, ou espace manquante avant la parenthèse | Avertissement + correction auto |
| **Sujet** — temps 2, cumulatifs | | |
| `E-EMPTY-SUBJECT` | Aucun sujet après le deux-points | Erreur |
| `E-DECISION-SUBJECT` | Réponse `decision` dont le motif est plus court que `rules.minDecisionSubjectLength` (§6.1.1) | Erreur |
| `W-SUBJECT-TOO-SHORT` | Sujet < `minSubjectLength` (défaut : 5 caractères) | Avertissement |
| `W-SUBJECT-TOO-LONG` | Sujet > `maxSubjectLength` (défaut : 120 caractères) | Avertissement |
| **Discussion et contexte** — temps 2, cumulatifs | | |
| `W-NO-DISCUSSION` | Commentaire **bloquant au sens du §3.3** sans aucun contenu non blanc en dehors de sa ligne de préfixe (§3.1) | Avertissement |
| `W-MISSING-DECORATION` | Label `suggestion` ou `question` sans décoration **porteuse** (§3.3) — une décoration purement descriptive comme `(perf)` ne l'éteint pas | Avertissement |
| `W-NOT-BLOCKABLE` | Commentaire **bloquant au sens du §3.3** — label et décorations résolus — dans une zone qui ne peut pas porter d'état bloquant (§4.1) | Avertissement |

Les **avertissements ne bloquent jamais** l'envoi. Seules les erreurs le font, et uniquement en mode `enforce` (§7).

**Définition de « conforme ».** Un commentaire est **conforme** s'il ne produit, après application de `severities` (§8.2), **aucun diagnostic de sévérité `error`**. Un commentaire qui ne porte que des avertissements est donc conforme : c'est ce qui rend simultanément vraies la phrase ci-dessus et la promesse du §3.1. Les avertissements sont comptés **séparément** — ils apparaissent dans le résumé humain du check (§6.3.1) et dans les indicateurs du §12, jamais comme cause d'échec. C'est ce sens, et lui seul, qu'emploient le §2, le critère 1 du §6.2.1 et `CA-37`.

*Calibrage :* `W-SUBJECT-TOO-SHORT` est délibérément un avertissement, et non une erreur, avec un seuil bas de 5 caractères. Un sujet trop court n'est pas un défaut de forme grave — le pénaliser en erreur bloquante pousse à contourner la règle plutôt qu'à l'appliquer (voir la lecture des indicateurs en §12).

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

Un fil bloquant est considéré **résolu** selon des états propres à chaque plateforme — voir annexes A et B pour le détail des statuts pris en compte.

**Règle de gouvernance.** Une résolution n'est retenue que dans **deux cas, et deux seulement** :

1. elle est le fait de **l'auteur du commentaire racine** — c'est lui qui juge si son point a été traité ;
2. elle est le fait d'un membre de `resolverOverrideGroup` **et** le fil contient une réponse `decision` valide au sens du §6.1.1.

Dans tout autre cas, la résolution est refusée : le fil reste compté comme non résolu au titre du critère 2 (§6.2.1), et la sortie du check en donne la cause (§6.3.1).

Le refus n'est pas un cul-de-sac. Le chemin de retour est celui que la règle décrit : rouvrir le fil et le faire résoudre par l'auteur du commentaire racine, ou y poster une réponse `decision` valide et le faire résoudre par un membre habilité. Rien n'est perdu, et aucune PR ne reste rouge sans recours — c'est la propriété que tout le §6.3 cherche à préserver.

**Quand la plateforme n'expose pas l'auteur d'une résolution.** Cette règle de gouvernance repose entièrement sur `ThreadInfo.resolvedBy` (§9.2.1). Sa disponibilité est une **capacité de plateforme, à déclarer en annexe** — elle l'est sur GitHub (§A.6), elle reste à établir sur Azure DevOps (§B.5).

Là où elle manque, la résolution est **acceptée** et un `notice` de type `resolution-unattributed` est émis **à chaque évaluation**. Refuser serait pire : tous les fils bloquants d'une plateforme entière deviendraient non résolvables, sans recours et sans que personne ait rien fait de mal, ce que le §6.3 existe précisément pour éviter. Mais l'acceptation ne doit pas être silencieuse : la règle de gouvernance **n'est alors pas appliquée sur cette plateforme**, et l'organisation doit le lire dans le statut plutôt que le découvrir. `CA-13` ne se teste que là où la capacité existe.

Il en découle que **l'auteur de la PR ne peut pas clore lui-même un fil ouvert par un relecteur** — et que s'il appartient par ailleurs à `resolverOverrideGroup`, il ne le peut qu'en passant par le cas 2, c'est-à-dire en écrivant une `decision` motivée qui restera visible dans le fil. Le groupe donne un pouvoir de déblocage, jamais un pouvoir de contournement silencieux.

*Note : certaines plateformes autorisent nativement l'auteur de la PR à résoudre les conversations. Cette règle est donc vérifiée et signalée par le composant B, non empêchée à la source — voir les annexes pour le détail par plateforme.*

**Le caractère bloquant d'un fil est monotone.** Une fois qu'un fil a été observé comme bloquant par le composant B, l'**édition de son commentaire racine ne peut plus le rendre non bloquant** : seule la résolution (§6.1.1) l'éteint. Une édition qui renforce le caractère bloquant (`note:` → `issue:`) prend effet normalement ; une édition qui l'affaiblit (`issue:` → `note:`) est enregistrée mais sans effet sur le décompte, et signalée dans la sortie du check avec son auteur.

Sans cette règle, toute la règle de gouvernance ci-dessus se contourne par un chemin plus direct qu'elle : l'auteur de la PR, s'il dispose des droits d'écriture, édite le commentaire du relecteur, remplace `issue:` par `note:` — qui est `alwaysNonBlocking` — et le fil cesse d'être bloquant sans que personne ne l'ait résolu. On verrouille la porte en laissant la fenêtre ouverte.

C'est le même principe qu'au §8.1.1 : **durcir est toujours permis, assouplir passe par la gouvernance.**

**Un verdict imposé ne dérive aucun fait.** Lorsque `forceState` est armé (§9.2.2), `evaluate()` ne produit **ni `weakening-edit` ni `root-deleted`** : les listes vides qu'on lui passe alors traduisent une lecture impossible, pas une disparition. Sans cette réserve, l'expiration du délai de grâce signalerait la suppression de **toutes** les racines bloquantes de la PR — un faux signalement, dans la situation précise où l'équipe cherche à comprendre ce qui se passe.

**Signaler « avec son auteur » suppose que la plateforme le dise.** L'auteur d'une édition se lit dans `CommentInfo.lastEditedBy` (§9.2.1), celui d'une suppression n'est lisible nulle part une fois le commentaire disparu. Quand l'information manque — champ non exposé, ou fait découvert par la réconciliation périodique plutôt que par un événement —, le `notice` est émis **sans acteur**, et jamais avec l'auteur du dernier événement reçu : le §6.4 exige de relire l'état courant plutôt que de se fier au contenu de l'événement, et attribuer une édition à qui a déclenché un recalcul serait une accusation fausse. `CA-36` se teste sur une plateforme qui expose l'auteur de l'édition.

**Une correction n'est pas un affaiblissement — sous deux conditions.** Éditer une racine pour **lever un `E-CONFLICT`** — remplacer `issue (blocking, non-blocking):` par `issue (non-blocking):` — n'est pas une édition affaiblissante, alors même qu'elle retire le caractère bloquant que le départage du §3.3 avait attribué. Mais l'exception ne vaut que si :

1. la racine portait **déjà `E-CONFLICT` lors de sa première observation** par le composant B ;
2. l'édition est le fait de **l'auteur du commentaire racine**.

Sans ces deux conditions, l'exception rouvrirait en deux gestes la porte que toute cette règle ferme : sur une racine `issue: x` observée bloquante, l'auteur de la PR l'édite en `issue (blocking, non-blocking): x` — le départage la garde bloquante, donc aucun affaiblissement signalé — puis en `issue (non-blocking): x`, qui « lève un `E-CONFLICT` », donc pas davantage. Le fil cesserait d'être bloquant sans que personne l'ait résolu, et sous le défaut `formatSeverity: warn` l'étape intermédiaire ne coûterait même pas un check rouge.

Ainsi bornée, l'exception fait ce pour quoi elle existe et rien de plus : elle évite de punir la personne qui corrige l'erreur qu'on lui a demandé de corriger. La monotonie protège d'un contournement, pas d'une mise en conformité.

**Comment l'ensemble des fils bloquants s'accumule.** Le composant B persiste, à chaque tour, `déjà observés ∪ blockingThreadIds` **moins** `correctedThreadIds` (§9.2.1). Les deux membres sont nécessaires : une union pure rendrait l'exception de correction inopérante — le fil resterait dans l'ensemble et la monotonie le re-bloquerait au tour suivant —, tandis qu'un simple remplacement par le tour courant supprimerait la monotonie elle-même, une racine affaiblie sortant de l'ensemble et cessant d'être bloquante. Le retrait est définitif ; si une édition ultérieure rend la racine à nouveau bloquante, le fil rentre par le premier membre. Lorsque `lastEditedBy` est absent, la seconde condition de l'exception n'est pas vérifiable et l'exception ne s'applique pas.

**Suppression du commentaire racine.** La monotonie porte sur l'édition, pas sur la suppression : un commentaire supprimé n'existe plus, et le fil qu'il portait cesse d'être compté. C'est assumé — maintenir un fil bloquant dont la racine a disparu laisserait un check rouge que plus personne ne peut résoudre (§6.4). La suppression est en revanche **signalée** dans la sortie du check : c'est le seul chemin restant pour éteindre un fil sans le résoudre, et il doit rester visible. Elle l'est **sans auteur**, contrairement à l'édition affaiblissante : une fois le commentaire disparu, aucune plateforme n'expose qui l'a supprimé, et `evaluate()` ne le déduit que par différence entre les fils déjà observés et ceux qui subsistent (§9.2.2). Le document préfère un signalement anonyme à une attribution fausse.

#### 6.1.1 Clore un fil bloquant sans faire le changement demandé

Un fil bloquant se referme normalement parce que le point soulevé a été traité, et c'est son auteur qui en juge. Reste le cas où l'équipe décide **délibérément de ne pas le traiter** : le point est hors périmètre, la dette est assumée, l'arbitrage a été rendu ailleurs, ou un correctif urgent doit partir maintenant et son auteur est indisponible.

Ce cas ne relève pas d'un contournement de l'outil : c'est une **décision de revue**, et elle se prend dans la convention.

**Règle.** Un membre de `resolverOverrideGroup` peut résoudre un fil bloquant à la place de l'auteur du commentaire, à la condition que le fil contienne une réponse portant le label `decision`, qui énonce le motif du choix :

```
decision: hors périmètre de cette PR, dette suivie en PROJ-142

L'auteur du commentaire est en congé et le correctif doit partir
aujourd'hui. Le point est réel, il sera traité dans la PR de suivi.
```

Conditions de validité, toutes vérifiées par le composant B :

- la réponse `decision` est postée par un membre de `resolverOverrideGroup` ;
- son sujet est renseigné et d'au moins 20 caractères (`rules.minDecisionSubjectLength`) — un motif tel que « ok » ne documente rien et rendrait la règle décorative. En deçà, `E-DECISION-SUBJECT` (§3.5.2) : la réponse est refusée et ne vaut pas décision ;
- elle se trouve **dans le fil** qu'elle clôt, jamais ailleurs.

C'est le cas 2 de la règle de gouvernance du §6.1. Une résolution qui n'entre dans aucun des deux cas est refusée, et la cause figure dans la sortie du check.

**Pourquoi ce mécanisme plutôt qu'un bouton de contournement.** Il produit exactement ce qu'un contournement détruit : une trace **lisible par des humains**, **à l'endroit de la discussion**, **conservée avec la PR**, et **attribuée**. Une personne qui relit la PR six mois plus tard voit la décision et son motif ; un journal externe, elle ne l'ouvrira jamais. `decision` est par ailleurs `alwaysNonBlocking` (§3.2) : une décision ne peut pas elle-même bloquer une PR.

**Ce que ce n'est pas.** `decision` ne dispense pas du format, ne s'applique pas aux commentaires non conformes, et ne débloque pas une PR entière — pour ce dernier cas, l'exemption au niveau PR du §6.3.2 reste le mécanisme prévu.

### 6.2 Mise en œuvre serveur (composant B — source de vérité)

Principe commun aux deux plateformes : le composant B s'abonne aux événements de revue de code (création/édition/suppression de commentaire, résolution de fil, mise à jour de PR), recalcule la conformité via `core/` (§9.1), et publie un **statut de conformité** sur la PR.

#### 6.2.1 Deux critères, deux sévérités distinctes

| # | Critère | Sévérité par défaut | Configurable |
|---|---------|---------------------|:---:|
| 1 | Tous les commentaires **soumis à validation** — zones du §4.1, hors exclusions du §4.2, sur une PR dans le périmètre d'activation du §6.2.3 — sont conformes au format | **Avertissement** — n'échoue pas le check, listé dans le résumé | `formatSeverity: warn \| error` |
| 2 | Aucun fil bloquant n'est non résolu (§4.1, colonne « peut porter un état bloquant ») | **Échec** — fait échouer le check | non |

**Une troisième cause d'échec existe, hors critères.** Une configuration **syntaxiquement invalide, ou portant une valeur hors du domaine d'une clé connue** — la troisième ligne du tableau du §8.1.5 — fait échouer le check sous `enforce`. Une configuration simplement **illisible** relève, elle, de l'incapacité à évaluer et du délai de grâce : c'est une autre ligne du même tableau, au comportement inverse. Elle ne figure pas au tableau parce qu'elle ne porte sur aucun commentaire : ce n'est pas un critère de conformité, c'est l'aveu qu'aucun critère n'a pu être évalué. Elle emprunte le canal `forceState` du §9.2.2, et non `formatSeverity`.

Cette séparation est délibérée. Confondre les deux revient à faire échouer un merge pour un `nitpik:` mal orthographié aussi sûrement que pour un `issue:` non traité — ce qui n'est défendable pour personne et n'est pas ce que demande O3. Le critère 2 seul porte l'objectif O3 ; le critère 1 relève de l'hygiène de forme et alimente les indicateurs du §12.

Une organisation qui veut la conformité de forme stricte peut passer `formatSeverity` à `error`, sous réserve du plancher défini au §8.1.

#### 6.2.2 Le composant B lit le mode

**Le composant B lit la même configuration `mode` que l'extension** (§7, §8.1) et adapte son comportement :

| Mode | Comportement du composant B |
|------|------------------------------|
| `off` | Ne publie aucun statut — **sauf les deux incidents du §8.1.5 sur un dépôt déjà évalué** : fichier disparu (`config-vanished`) et configuration invalide (`invalid-config`), publiés en neutre quel que soit le mode. **Attention** : si le check est déclaré obligatoire dans la protection de branche, son absence bloque toutes les PR — le retrait de la protection doit accompagner le passage en `off` (voir la procédure du §6.3.3). |
| `assist` | Ne publie aucun statut. Mêmes réserve et mêmes deux exceptions. |
| `warn` | Publie un statut **jamais en échec** — au vert dans le cas courant, neutre dans les trois cas où l'évaluation n'a pas pu se faire (délai de grâce du §6.4, configuration disparue et configuration invalide du §8.1.5). Le résumé liste les non-conformités et les fils bloquants non résolus à titre informatif. Ne bloque jamais. |
| `enforce` | Publie un statut au vert ou en échec selon les critères du §6.2.1. |

Sans cette règle, un dépôt en mode `warn` avec le composant B déployé verrait ses PR bloquées, en contradiction directe avec le tableau du §7.

En mode `enforce`, ce statut est déclaré comme vérification **obligatoire** dans les règles de protection de la branche cible, ce qui bloque la complétion/le merge tant qu'il n'est pas au vert. Réserve à connaître : sur les deux plateformes, les administrateurs et les acteurs de bypass déclarés peuvent malgré tout compléter la PR tant que l'option interdisant le contournement des règles n'est pas activée — O3 étant classé *Must*, cette option fait partie de la configuration requise (voir annexes).

Les mécanismes concrets (nature de l'intégration serveur, API de publication de statut, option de protection à activer) sont détaillés dans les annexes A (GitHub) et B (Azure DevOps).

#### 6.2.3 Périmètre d'activation

Le jour de l'activation du composant B sur un dépôt, les PR déjà ouvertes contiennent un historique de commentaires écrits avant que la convention ne soit outillée. Sans règle de périmètre, **tous les résumés de statut se rempliraient simultanément de diagnostics** portant sur des commentaires que plus personne ne peut corriger — et passeraient au rouge sous `formatSeverity: error`. C'est le meilleur moyen de tuer l'adoption d'un outil le jour de son arrivée.

**Règle retenue : le périmètre se décide par PR.** Une PR est dans le périmètre si sa date de création est postérieure à `activatedAt` (fixée par dépôt au moment de l'activation, §8.2). **En l'absence de cette date** — fichier, configuration d'organisation et point d'entrée d'administration tous muets —, **aucune PR n'est dans le périmètre** : l'outil assiste et ne contraint pas. Poser la date *est* l'acte d'activation, et le défaut penche du côté qui ne surprend personne. Une PR est donc **entièrement dedans ou entièrement dehors** : les deux critères du §6.2.1 s'appliquent d'un bloc, ou pas du tout.

**Ce que le composant B publie sur une PR hors périmètre.** Sous `warn` et `enforce`, un statut **au vert**, dont le résumé porte « PR antérieure à l'activation », ou « activation non datée » lorsque aucune date n'a été posée (§6.2.3) — sous `assist` et `off`, le silence du §6.2.2 continue de s'appliquer, le mode restant maître de ce qui est publié. Là où il publie, il ne se tait pas : sur un dépôt en `enforce` où le check est déclaré obligatoire, un statut absent bloque la PR définitivement (§6.2.2) — et le présent paragraphe assume qu'une branche de release puisse rester hors périmètre plusieurs mois. Un statut absent est par ailleurs indistinguable d'une panne. `CA-15` exige qu'aucun statut **en échec** n'apparaisse ; il n'autorise pas le silence.

Ce choix privilégie une règle **transitoire** sur une règle permanente. Les PR ouvertes au moment de la bascule finissent par se fermer : au bout de quelques semaines, toutes les PR sont postérieures à l'activation et le filtre ne discrimine plus rien. La règle se liquide d'elle-même.

L'alternative — comparer la date de **chaque commentaire** — offrirait une couverture immédiate et complète. Elle coûte trois règles permanentes, à spécifier et à maintenir pour la durée de vie du produit :

- comparer **la date de création, et jamais celle de dernière modification** — sans quoi corriger une faute d'orthographe dans un vieux commentaire fait basculer un statut vert ;
- **étendre explicitement le filtre au critère 2** — sans quoi un fil bloquant antérieur à la bascule bloque la PR ;
- **propager la date jusqu'à l'extension** — sans quoi celle-ci refuse en mode `enforce` l'édition d'un commentaire dont le serveur se désintéresse, divergence A/B visible dans un cas fréquent.

Trois règles permanentes contre une règle transitoire : c'est ce rapport qui a décidé.

**Limite assumée.** Une PR de longue durée ouverte avant la bascule — typiquement une branche de release vivante plusieurs mois — reste hors périmètre jusqu'à sa fermeture, y compris pour les commentaires qui y seront écrits bien après l'activation. Le coût est accepté parce qu'il est borné dans le temps et visible de tous. Si l'expérience montre que ces PR concentrent trop d'enjeu, la parade sera une étiquette d'inclusion symétrique du `cc-override` du §6.3.2, réutilisant la même machinerie ; elle n'est pas prévue à ce stade.

**Conséquence pour le composant A.** La date de création de la PR étant lisible dans la page, l'extension applique le même périmètre que le serveur : sur une PR hors périmètre, elle se comporte comme en mode `assist` (barre d'outils, complétion, retour visuel) et ne bloque jamais l'envoi, quel que soit le mode configuré — **sauf si ce mode est `off`, auquel cas elle reste inactive**. Le périmètre d'activation soustrait à la contrainte ; il n'ajoute jamais d'assistance là où le mode l'a éteinte (§7). C'est ce qui garantit que A et B répondent la même chose sur ce point.

#### 6.2.4 Rapport à blanc, PR en brouillon, et silence du serveur

**Rapport à blanc.** Le composant B expose un point d'entrée d'administration — commande d'exploitation ou appel authentifié, au choix de l'implémentation — qui prend un dépôt et une date de bascule hypothétique, **restitue** la liste de ce qui échouerait si l'outil était activé : commentaires non conformes et fils bloquants non résolus, avec leurs liens permanents. Il **ne publie aucun statut** et n'écrit rien sur les PR. L'accès est réservé aux personnes habilitées à activer l'outil sur le dépôt. C'est le prérequis raisonnable à toute activation : une équipe ne devrait jamais découvrir l'ampleur du chantier le jour où le check devient obligatoire. Le rapport à blanc est aussi le bon outil pour calibrer la date `activatedAt` (§6.2.3) — et le même point d'entrée permet de **la poser** pour un dépôt dont le fichier de configuration ne la porte pas (§6.4, stockage).

**PR en brouillon.** Sur une PR marquée comme brouillon, le composant B évalue mais publie un statut **toujours informatif**, jamais en échec. Une PR en brouillon est un travail en cours : y faire clignoter du rouge pendant des jours n'apporte rien et entraîne à ignorer le signal. Le statut redevient contraignant à la sortie du brouillon.

**Le composant B ne poste jamais de commentaire.** Toute l'information passe par la sortie du check (§6.3.1), qui nomme les auteurs concernés avec un lien permanent vers chaque commentaire. Deux raisons : un robot qui commente une PR à chaque évaluation devient un bruit que l'on apprend à filtrer — et il serait lui-même soumis à la convention qu'il fait respecter, ce qui n'a aucun sens.

La conséquence est assumée : **le relecteur qui a écrit un commentaire non conforme n'est pas notifié activement** ; il est nommé dans la sortie du check, à charge de l'auteur de la PR de le solliciter. Une notification active relève des mécanismes propres à chaque plateforme ; elle n'est portée par aucun objectif du §1 et reste hors périmètre de cette version.

### 6.3 Sortie du check et soupapes d'urgence

Un check qui bloque un merge sans dire pourquoi, et sans moyen de passer outre, produit un incident au premier trimestre — et le réflexe qu'il déclenche (« un administrateur retire la protection de branche ») détruit durablement la crédibilité de l'outil. Le §6.1.1 traite le cas d'un fil précis qu'on décide de ne pas traiter ; les deux mécanismes ci-dessous traitent le cas où c'est la PR entière qui est en urgence.

#### 6.3.1 Format normatif de la sortie

Le composant B produit, pour chaque évaluation, une sortie structurée (`ComplianceResult`, §9.2) contenant obligatoirement :

- un **résumé humain** d'une ligne (`headline`) indiquant trois nombres, dont deux ne comptent pas la même chose : le nombre de **fils** bloquants non résolus, le nombre de **commentaires** non conformes au sens du §3.5.2 — un commentaire portant trois erreurs compte pour un —, et le nombre total de **diagnostics** de sévérité `warn`, qui se comptent un par un. Le §12 en tire un taux de conformité, qui n'a de sens que par commentaire ;
- pour **chaque fil bloquant non résolu** (`unresolvedBlockingThreads`) : lien permanent vers le commentaire, auteur, label, et première ligne du sujet ;
- pour **chaque diagnostic de format, quelle que soit sa sévérité** (`formatDiagnostics`) : lien permanent, code (§3.5), sévérité, et correction proposée quand elle est calculable. Toutes sévérités, et pas seulement les erreurs : un commentaire qui ne porte que des avertissements est **conforme** (§3.5.2) et sortirait donc de la liste, alors que le résumé humain ci-dessus doit les compter et que le §12 les suit séparément ;
- **deux empreintes distinctes**, et non une seule : la **version de `core/`** (`coreVersion`) et l'**empreinte de la configuration** (`configFingerprint`) telle qu'elle a **effectivement servi à juger cette PR** — partie épinglée, modifications élargissantes ultérieures et bornes d'entreprise comprises (§8.1.3). Les séparer est nécessaire : la règle 5 du §8.1.3 pose qu'un écart de version entre l'extension et le serveur est **le cas normal**, et une empreinte unique confondrait cet écart permanent avec un désaccord de configuration, qui est l'anomalie ;
- un lien vers la documentation de la convention (`docUrl`) ;
- les **faits signalés** (`notices`) — tout ce que les règles du document exigent de rendre visible sans que ce soit un diagnostic de format : édition affaiblissante et suppression d'une racine bloquante, avec leur auteur (§6.1) ; résolution refusée, avec sa cause, ou **acceptée sans auteur connu** sur une plateforme qui n'expose pas le résolveur (§6.1) ; clé de dépôt ignorée au titre du plancher (§8.1.2) ; configuration invalide, avec sa ligne fautive, ou **fichier de configuration disparu** d'un dépôt déjà évalué (§8.1.5) ; **avertissement de configuration** — clé inconnue ignorée, `configUrl` posée au mauvais niveau, expression d'allowlist écartée (§8.1.5, §8.2) ; version de **schéma, de plancher** ou de `core/` non supportée (§8.1.5, §8.1.3) ; délai de grâce dépassé (§6.4) ; retrait de l'étiquette d'exemption (§6.3.2). Chacun porte son type, son message, et l'auteur et l'horodatage lorsqu'ils existent.

Ces six éléments sont **obligatoires au sens strict pour `ComplianceResult`** : chacun a un champ dédié (§9.2.1), et une implémentation qui n'en remplirait pas un serait détectable par le type. Ce que la **plateforme en publie**, en revanche, dépend de ce qu'elle sait rendre — voir ci-dessous. La distinction est nécessaire : le §9.2.4 interdit à l'adaptateur de juger, il ne lui promet pas un corps de statut qui n'existe pas partout.

**Ce que l'extension peut en relire.** `ComplianceResult` est l'objet interne du composant B ; ce qui traverse jusqu'à la page est un sous-ensemble, `PublishedSummary` (§9.2.1), que `readPublishedResult()` reconstitue. La distinction n'est pas cosmétique : les deux plateformes ne rendent pas la même chose.

| | Ce que porte le statut | Où vit la ligne `cc/1` |
|---|---|---|
| **GitHub** | un *check run* avec un titre et un corps Markdown (§A.8) | le **titre** du check run, rendu sur la page de la PR |
| **Azure DevOps** | un *PR Status* : un état, une **description d'une ligne**, une URL, un `context` (§B.7) | la **description**, rendue sur la page de la PR |

La ligne est publiée **là où la plateforme la rend sur la page de la PR**, et nulle part ailleurs : c'est la seule condition pour que `readPublishedResult()` puisse la lire sans appel d'API (§10). Le corps du check run, sur GitHub, n'est pas rendu sur cette page — il porte la sortie humaine du §6.3.1, pas la ligne machine.

Le composant B **encode donc le résumé dans une ligne de texte** — `state`, `isDraft`, `exempted`, `mode`, `activatedAt`, `coreVersion`, `configFingerprint` et les trois compteurs — publié là où le tableau ci-dessus le prescrit — `output.title` du check run sur GitHub, description du statut sur Azure DevOps. **Le format est donné ici, une fois**, parce que c'est la seule couture entre les deux composants et que `readPublishedResult()` (§9.2.3) doit le relire caractère pour caractère :

```
cc/1 state=failure draft=0 exempt=0 mode=enforce activated=2026-09-01T00:00:00Z core=1.4.0 cfg=9f3a1c7e t=3 c=7 w=12
```

Une ligne, un préfixe de version `cc/1`, puis des couples `clé=valeur` séparés par une espace, dans cet ordre : `state`, `draft`, `exempt`, `mode`, `activated` (ou `-` si nulle), `core`, `cfg` (l'empreinte, en hexadécimal), puis les trois compteurs `t` (fils bloquants non résolus), `c` (commentaires non conformes) et `w` (diagnostics d'avertissement). Règles de robustesse, normatives : les **espaces multiples** entre couples sont tolérés ; un **préfixe de version inconnu** fait ignorer la ligne, l'extension se comportant comme si aucun résultat n'était publié ; un **champ obligatoire manquant**, **présent en double**, ou dont la valeur ne respecte pas son domaine — `t=abc`, `draft=2` — produit le même effet. En revanche l'**ordre des couples n'est pas contraignant à la lecture** : il est normatif à l'écriture, pour qu'un seul encodage existe, et le décodeur lit par clé. Les booléens s'écrivent `0` ou `1`, jamais autrement. Mesurée sur des cas types, la ligne fait de **91 à 116 caractères** — très en deçà de ce qu'une description de statut accepte sur l'une ou l'autre plateforme, ce qui est la raison pour laquelle tous les champs y sont bornés : énumérations, semver, hexadécimal, ISO 8601, entiers. `state` porte le verdict, et lui seul : le §6.5 interdit de le recalculer depuis les compteurs. Les autres champs ne sont pas là pour le déduire, mais pour être **affichés** : `isDraft` et `exempted` expliquent au lecteur pourquoi une PR passe au vert malgré des compteurs non nuls, `activatedAt` permet à l'extension de calculer `inScope` (§6.2.3), `mode` et `coreVersion` disent **sous quelles conditions le serveur a jugé cette PR** : l'extension les affiche dans son panneau de diagnostic — « jugée en `enforce` par `core/` 1.4.0 » — et rien de plus. En particulier, un écart de `coreVersion` ne déclenche **rien** : la règle 2 du §8.1.3 le pose explicitement, et `CA-32` le teste. Aucun de ces champs ne sert au verdict ; deux ne servent qu'à l'affichage, et le document préfère le dire que le laisser deviner. C'est ce qui rend `CA-32` passable sur les deux plateformes.

La langue de cette sortie suit la règle de résolution du §8.1. **Un statut en échec doit permettre d'identifier la cause en un clic au plus** : dans le corps du statut là où la plateforme en rend un, et sinon par la `targetUrl` du statut, qui pointe vers une page servie par le composant B portant la même sortie. Cette `targetUrl` est **obligatoire** sur toute plateforme sans corps de statut (§B.7) — sans elle, un check rouge y serait un mur sans explication.

#### 6.3.2 Exemption au niveau d'une PR

Une PR peut être sortie du périmètre de blocage par apposition d'une étiquette dédiée (`cc-override` par défaut, configurable). Effet : le critère 2 n'est plus évalué, le statut passe au vert, et le résumé indique explicitement que la PR a été exemptée, par qui et quand.

- **Cette vérification suppose que la plateforme dise qui a posé l'étiquette, et quand.** C'est une **capacité de plateforme, à déclarer en annexe**, au même titre que l'auteur d'une résolution (§6.1). Là où elle manque, le **repli** est le suivant : l'étiquette seule **n'accorde jamais l'exemption**, qui passe par le point d'entrée d'administration du §6.2.4, qui enregistre lui-même l'acteur et l'horodatage, et le composant B pose ensuite l'étiquette comme simple marqueur visuel. Le mécanisme ne disparaît donc pas ; c'est son point d'entrée qui change, et `CA-26` se teste sur le chemin que la plateforme permet.
- Le droit d'apposer cette étiquette est restreint aux membres de `resolverOverrideGroup` (§8.2) ; sur les plateformes qui ne permettent pas de restreindre nativement la pose d'une étiquette, le composant B **vérifie a posteriori** et refuse l'exemption posée par une personne non habilitée. Le refus est signalé (`exemption-refused`, §9.2.1) **avec la personne qui l'a posée**, et l'étiquette est **laissée en place** : la retirer serait indistinguable de la remise à zéro ci-dessous, et priverait l'équipe de la trace du geste. Une étiquette présente sans effet, et dite telle dans la sortie du check, se comprend ; une étiquette qui disparaît sans explication, non.
- Chaque exemption est journalisée (§10) : identifiant de PR, auteur, horodatage, et motif si la plateforme permet d'en attacher un à l'étiquette.
- L'exemption est **remise à zéro** à chaque **fil bloquant dont l'identifiant n'était pas dans l'ensemble des fils déjà observés au tour précédent** (§6.1) et dont la zone peut porter un état bloquant (§4.1) : le composant B **retire l'étiquette** et émet un `notice`. Cette formulation est celle qui se calcule — « un nouveau commentaire bloquant » se lirait de trois façons, qui divergent dès que le service a été indisponible. Elle ne devient ainsi pas un blanc-seing permanent sur une PR de longue durée — et le geste est visible. L'ignorer silencieusement laisserait `cc-override` affichée sur une PR redevenue bloquée, ce que tout le monde lirait comme un défaut. C'est le seul droit en **écriture** du composant B en dehors du statut, et il figure à ce titre dans les permissions du §6.4.

#### 6.3.3 Interrupteur général et retour arrière

Le passage de `enforce` à un mode inférieur doit être réalisable **en quelques minutes sur l'ensemble des dépôts**, sans intervention par dépôt :

- la configuration d'organisation (§8.1) est le point de bascule : un assouplissement du `mode` est une modification élargissante, donc appliquée aux PR déjà ouvertes sans attendre leur fermeture (§8.1.3, règle 1) ;
- **un assouplissement du `mode` invalide immédiatement le cache de configuration**, au lieu d'attendre son expiration. Sans cette invalidation, « quelques minutes » deviendrait « jusqu'à `configCacheTtlSeconds` », une heure par défaut — et le retour arrière cesserait d'être une soupape. C'est la seconde situation de contournement du cache, à côté de celle de la règle 3 du §8.1.3 ;
- en mode `warn`, et en `warn` **uniquement**, le composant B continue de publier un statut **jamais en échec** (§6.2.2), ce qui débloque immédiatement les PR **sans exiger le retrait de la protection de branche** — c'est la propriété qui rend le retour arrière sûr. Les modes `assist` et `off` ne publient aucun statut : y revenir depuis `enforce` exige de retirer d'abord la protection de branche, sans quoi l'absence de statut bloque toutes les PR. **`warn` est donc le mode de repli, pas `off`** ;
- la procédure de retour arrière, incluant l'ordre des opérations et la personne habilitée, est documentée avant tout passage en `enforce` sur un dépôt pilote (§14, P6).

### 6.4 Architecture d'exécution du composant B

Le §9.1 décrit le découpage en modules du composant B ; la présente section décrit son exécution.

**La séquence, en un coup d'œil.** C'est le seul *déroulement* de ce document — tout le reste en est des règles — et les règles qui le composent sont dispersées sur sept sections. Les voici dans l'ordre, chacune renvoyant à l'endroit où elle est justifiée. Cet encadré n'ajoute aucune règle ; il dit dans quel ordre les appliquer.

```
 1. Déclenchement : webhook, réconciliation périodique, ou ré-exécution manuelle    §6.4
 2. Sur webhook seulement : matchesWebhook → verifySignature → parseEvent           §9.2.4
 3. Attribuer une séquence : compteur monotone par PR, quelle que soit la source    §6.4
 4. Coalescer par PR sur server.coalesceWindowSeconds ; l'évaluation coalescée
    porte la PLUS HAUTE des séquences regroupées                                    §6.4
 5. Relire l'état courant : threads, commentaires hors fil, étiquettes, brouillon,
    fichier de dépôt, document d'organisation — jamais le contenu de l'événement    §6.4
 6. Si une lecture est impossible : armer degradedSince, puis
    – dans le délai de grâce : abandonner sans rien publier
    – au-delà, et sur un dépôt déjà évalué seulement : listes vides + dernière
      configuration connue + forceState neutral                                     §6.4, §8.1.5
 7. resolveConfig(floor, org, repo, pinned, previouslyEvaluated) → {config, notices} §8.1.2
 8. **Périmètre d'installation** : dépôt jamais évalué ET fichier de dépôt absent ?
    s'arrêter ici — rien n'est évalué, rien n'est persisté, rien n'est publié       §6.4
 9. Lire les notices : config-vanished ou configuration invalide → armer forceState  §8.1.5
10. Pré-résoudre isInGroup() pour tout auteur apparaissant sur la PR                §9.2.2
11. evaluate(...) → ComplianceResult                                                §6.2.1
12. Si le résultat porte E-UNKNOWN-LABEL ou E-UNKNOWN-DECORATION : seconde passe
    avec fetchConfigFile(bypassCache) ET fetchOrgConfig(bypassCache) ;
    seul ce second verdict compte, et c'est lui qu'on épingle                       §8.1.3 r.3
13. Persister l'**état de calcul** : configuration épinglée (première évaluation
    seulement), verdicts de première observation, fils bloquants observés moins les
    corrigés, séquence, dernière configuration effective résolue                    §6.4
14. Quatre portes, dans cet ordre :
    a. séquence périmée ?                                                           §6.4
    b. le mode n'autorise pas la publication, hors exceptions du §8.1.5 ?           §6.2.2
    c. relire le SHA de tête et le poser sur le résultat                            §6.4
    d. résultat identique au dernier publié, SHA compris ?                          §6.4
15. publishStatus(pr, result) — l'adaptateur y appelle encodeSummary() pour la
    ligne cc/1, et rend la sortie humaine à partir de headline et des listes        §6.3.1
16. Une fois la publication **réussie**, persister le résultat publié et poser le
    drapeau « déjà évalué » ; puis exécuter result.actions.removeLabel              §6.4, §6.3.2
```

 Ces éléments conditionnent la phase P5 et ne peuvent pas être laissés à l'implémentation : plusieurs d'entre eux (ordre des événements, comportement en panne) déterminent si une PR peut rester bloquée sans recours.

**Déclenchement.** Trois sources, toutes trois nécessaires :
1. les événements de plateforme (webhooks / service hooks) — voie nominale ;
2. une **réconciliation périodique** des PR ouvertes, toutes les `server.reconcileIntervalSeconds` (§8.2) — filet de sécurité contre les événements perdus, non reçus pendant une indisponibilité, ou jamais émis. C'est aussi le repli de toute détection qu'une plateforme n'assure pas par événement (§B.7) ;
3. un **déclenchement manuel** — le composant B expose un mécanisme de réévaluation d'une PR, et **utilise l'action intégrée à l'interface de la plateforme là où elle existe**. Le contrat s'arrête là, délibérément : sur Azure DevOps, un statut publié par l'API ne porte aucune action de réexécution, et en ajouter une au menu d'un PR Status exige de développer une *extension Azure DevOps Services* via le modèle de contribution. Exiger « le bouton natif des deux plateformes » ajouterait discrètement un troisième produit à livrer.

**Coalescence et idempotence.** Une revue soumise en lot génère autant d'événements que de commentaires : le recalcul doit être **coalescé par PR** avec une fenêtre de regroupement (`server.coalesceWindowSeconds`, §8.2, lue dans la dernière configuration connue du dépôt — la fenêtre s'ouvre avant qu'on ait relu le fichier), et non exécuté une fois par événement. Chaque évaluation est idempotente et porte une clé `(dépôt, PR, SHA)` ; une évaluation dont le résultat est identique au précédent ne republie pas de statut. **Deux résultats sont identiques** lorsque `headSha`, `state`, les trois compteurs, `configFingerprint`, l'**ensemble des `kind`** de `notices` et les **identifiants des fils et commentaires listés** coïncident. Seuls les **horodatages** restent hors comparaison : un `notice` réémis à chaque évaluation — `resolution-unattributed` par exemple — rendrait sinon la règle inopérante.

`headSha` doit y figurer, contrairement à ce que sa nature de donnée de publication pourrait suggérer : il change à chaque **push**, et un push qui ne touche aucun commentaire laisse tout le reste identique. L'en exclure interdirait de republier, aucun statut n'existerait sur le nouveau SHA, et la PR resterait bloquée — le cas que le paragraphe suivant nomme. Les identifiants listés doivent y figurer pour une raison voisine : un fil résolu pendant qu'un autre devient bloquant laisse les compteurs inchangés, et le corps du check continuerait de nommer le mauvais.

**Ordre des événements.** Les webhooks ne garantissent pas l'ordre de livraison. Un recalcul déclenché par un événement ancien ne doit jamais écraser le résultat d'un recalcul plus récent : chaque évaluation porte un numéro de séquence **attribué par le composant B** — un compteur monotone par PR, incrémenté à la réception de **tout** déclenchement, quelle qu'en soit la source. Il ne vient pas de la plateforme : ni GitHub ni Azure DevOps n'émettent de compteur par PR, et le déduire d'un horodatage serait un jugement dans un adaptateur à qui le §9.2.4 l'interdit. C'est aussi ce qui donne une séquence à la réconciliation périodique et à la réexécution manuelle, qui ne produisent aucun événement. `ReviewEvent.sequence` porte cette valeur une fois attribuée. Une évaluation **coalescée porte la plus haute** des séquences des déclenchements qu'elle regroupe — prendre la plus basse ferait rejeter la publication par la règle qui suit. **Règle de consommation** : une évaluation ne publie que si sa séquence est supérieure à celle de la dernière publication pour cette PR, persistée (§6.4, stockage) ; sinon elle est abandonnée sans rien écrire.

Ce compteur ne détecte pas à lui seul un désordre de livraison — il est monotone dans l'ordre de *réception*, pas d'émission. Ce qu'il garantit, c'est qu'une évaluation lente ne peut pas écraser le résultat d'une évaluation plus récente déjà publiée. C'est l'autre garde de la même phrase qui traite le désordre lui-même : chaque évaluation **relit l'état courant depuis l'API avant de publier** plutôt que de se fier au contenu de l'événement. Sans cette garde, un `comment.created` non conforme arrivé après le `comment.edited` qui le corrige laisse la PR rouge sans événement futur pour la rattraper.

**Suppression.** L'événement de suppression de commentaire fait partie du périmètre souscrit. Sans lui, la suppression du commentaire racine du dernier fil bloquant laisse le check rouge indéfiniment.

**SHA de publication.** Le statut est publié sur le SHA de tête de la PR **au moment de la publication**, relu juste avant l'appel. Un statut publié sur un SHA devenu obsolète laisse la PR bloquée.

**Indisponibilité.** Le check étant obligatoire en mode `enforce`, l'absence de statut bloque tous les merges. Deux situations très différentes se cachent derrière le mot « panne », et elles n'ont pas le même recours.

**Le composant B est vivant mais ne peut pas évaluer** — API de plateforme injoignable, limite d'appels atteinte. Il reste capable de publier. La règle est : **tant que `maintenant − degradedSince ≤ gracePeriodSeconds`, l'évaluation est abandonnée sans rien publier** — le statut précédent reste en place et la PR n'est pas dérangée par une panne passagère. **Au-delà**, `evaluate()` est appelée avec des listes vides, `forceState: { state: 'neutral', because: 'grace-expired' }` (§9.2.2), et **la dernière configuration effective connue pour ce dépôt** — à défaut, les valeurs par défaut du produit dans les bornes du plancher. La dégradation peut en effet venir de l'impossibilité de lire la configuration elle-même : exiger une configuration fraîche à ce moment serait exiger ce qui manque. `evaluate()` rend alors un statut `neutral`, accompagné d'un message orientant vers le §6.3.3. `degradedSince` est remis à zéro dès la première évaluation qui aboutit. Ce statut **laisse passer le merge sur les deux plateformes**, et c'est vérifiable : GitHub compte `neutral` parmi les conclusions qui satisfont une vérification obligatoire, au même titre que `success` et `skipped` ; Azure DevOps traite `notApplicable` comme retirant l'exigence de policy pour cette PR (§A.8, §B.7). Le comportement est donc **fermé pendant le délai de grâce, puis ouvert** — et non « fail-closed », qui nommerait l'inverse de ce qui se passe après le délai.

**Le composant B est lui-même indisponible.** Il ne publie rien, par définition, et aucune règle interne ne peut y remédier : la PR reste bloquée. Le seul recours est la procédure du §6.3.3, dont le délai d'exécution est la disponibilité réellement engagée. C'est ce que mesure la NFR du §10, et c'est pourquoi cette procédure doit être écrite et son exécutant désigné **avant** tout passage en `enforce` (§14, P6).

**Stockage.** Le composant B a besoin d'un état persistant pour douze objets :

- le **journal des exemptions de PR** (§10) ;
- la **configuration épinglée de chaque PR ouverte** (§8.1.3) ;
- le **verdict de la première observation de chaque racine bloquante** — au minimum son caractère bloquant et la présence d'un `E-CONFLICT` —, **écrit une fois et jamais réécrit**. Sans lui, l'exception de correction du §6.1 est indécidable : après édition, le corps précédent n'existe plus. Et s'il suivait la *dernière* évaluation au lieu de la première, l'exception se retournerait en chemin d'évasion : il suffirait d'introduire volontairement un `E-CONFLICT`, de laisser une évaluation l'enregistrer, puis de le « corriger » en `non-blocking` pour éteindre le fil. C'est la première observation qui dit si le conflit était là dès l'origine, donc si l'édition est une mise en conformité ;
- le **dernier plancher valide connu**, sur lequel se replie le §8.1.1 quand `floorVersion` dépasse la version supportée ;
- la **dernière configuration effective résolue**, par dépôt — ce n'est ni le cache du §8.1.2, qui expire, ni la configuration épinglée du §8.1.3, qui est par PR et jamais réécrite. C'est elle que lisent la fenêtre de coalescence, avant qu'aucun fichier n'ait été relu, et l'appel de fin de délai de grâce, quand plus rien n'est lisible ;
- le **début de l'incapacité à évaluer** (`degradedSince`), par dépôt — un début d'incident ne se déduit d'aucun état courant, et sans lui le délai de grâce ci-dessus n'a pas d'origine ;
- le **dernier résultat publié** par PR, sans lequel la règle d'idempotence ci-dessus — « une évaluation dont le résultat est identique au précédent ne republie pas de statut » — n'a rien à comparer ;
- l'ensemble des **fils déjà observés comme bloquants**, par PR (§6.1) — de ces douze objets, celui qui ne se déduit d'**aucun état courant de la PR** : la monotonie du caractère bloquant porte sur l'historique des éditions d'un commentaire, que les permissions énumérées plus bas ne couvrent pas et que les API ne rendent pas. Sans cette persistance, `CA-36` est intestable et la règle du §6.1 inapplicable ;
- la **date de bascule `activatedAt`** par dépôt, uniquement lorsqu'elle n'est pas portée par le fichier de configuration — le point d'entrée d'administration du §6.2.4 la pose alors, en même temps qu'il restitue le rapport à blanc qui a servi à la calibrer. Elle est dans ce cas **republiée dans `PublishedSummary`** (§9.2.1), faute de quoi l'extension ne pourrait pas calculer le périmètre que le §6.2.3 lui demande d'appliquer. Tant qu'aucun statut n'est publié sur un tel dépôt, l'extension ne sait pas trancher `inScope` : elle traite la PR comme **hors périmètre**, ce qui relève de la condition 2 du §5.4 et n'ajoute aucune condition nouvelle ;
- le **fait qu'un dépôt ait déjà été évalué** — c'est-à-dire qu'un statut y a été publié au moins une fois —, avec la date de cette dernière publication. Sans lui, la distinction du §8.1.5 entre un dépôt jamais activé et un fichier de configuration disparu est indécidable. Sur un dépôt **jamais évalué et sans fichier de configuration**, l'étape 8 arrête le cycle : aucun check n'apparaît sur un dépôt qui n'a rien demandé, et aucun état n'est écrit pour une PR d'un dépôt qui n'est pas activé — épingler une configuration issue d'un fichier absent n'aurait aucun sens.

  **Ce drapeau se pose après la publication, jamais avant.** Il dit qu'un statut a été publié au moins une fois ; le poser à l'étape 13, avec l'état de calcul, le rendrait vrai avant même que l'étape 8 ne teste s'il est faux — l'opt-in par dépôt de `CA-29` s'annulerait de lui-même dès la première évaluation. C'est pourquoi l'étape 13 persiste l'**état de calcul** et l'étape 16 le **fait d'avoir publié**, et pourquoi les deux ne peuvent pas être fusionnées. Le mode, lui, est jugé à la porte 14.b et non plus tôt — il n'est connu qu'à l'étape 7, et les deux exceptions du §8.1.5 doivent pouvoir le franchir ;
- les **compteurs** du §12 ;
- les **numéros de séquence** d'évaluation, garde contre le désordre des événements.

Le choix de la technologie est libre ; l'existence de ce stockage ne l'est pas.

**Sécurité d'ingestion.** Vérification de la signature de chaque événement entrant, protection contre le rejeu, et rejet des charges non signées. Aucun secret n'est stocké côté extension (§10) : la totalité des identifiants de service vit côté B.

**Permissions.** Les autorisations demandées par l'intégration serveur sont énumérées par plateforme dans les annexes, et limitées à : lecture du fichier de configuration ; lecture des commentaires — y compris ceux qui ne relèvent d'aucun fil (§4.1) —, de l'état des fils, des étiquettes de PR et de l'identité de qui les a posées (§6.3.2), de l'état brouillon et de la date de création d'une PR (§6.2.3, §6.2.4) ; écriture du statut ; **retrait de l'étiquette d'exemption** (§6.3.2), seul droit en écriture en dehors du statut ; lecture de l'appartenance aux groupes de `resolverOverrideGroup`.

**Périmètre d'installation.** Une intégration installée au niveau d'une organisation reçoit les événements de tous ses dépôts. L'activation est **explicite et par dépôt** : en l'absence de fichier `.conventional-comments.json` sur la branche par défaut **et tant que le dépôt n'a jamais été évalué**, le composant B ne publie aucun statut. Sur un dépôt déjà évalué, la disparition du fichier est un incident et non une désactivation, et le composant B le signale quel que soit le mode résiduel (§8.1.5). Sans cette règle, l'installation seule ferait apparaître un check sur des centaines de dépôts qui n'ont rien demandé.

**Budget d'appels.** Le recalcul complet d'une PR à plusieurs centaines de commentaires implique une pagination ; le composant respecte les limites d'appel primaires et secondaires de chaque plateforme, avec temporisation exponentielle et reprise.

### 6.5 Rôle de l'extension

L'extension **reflète** l'état, elle ne le crée pas :

- **grise le bouton de complétion/merge si et seulement si `PublishedSummary.state` vaut `'failure'`** (§9.2.1), et **renvoie vers le statut publié, qui porte la cause** — elle ne l'a pas elle-même, `PublishedSummary` ne portant que des scalaires. Jamais à partir des compteurs : sur une PR en brouillon ou exemptée, le serveur publie du vert avec des compteurs non nuls (§6.2.4, §6.3.2), et une extension qui en déduirait « bloqué » mentirait sur une PR que la source de vérité laisse passer ;
- ce grisage est **visuel et n'intercepte pas le clic** : le blocage réel est celui de la protection de branche, et l'extension n'a pas à s'interposer devant une décision que le serveur a déjà prise. C'est la différence avec le contrôle d'envoi du §5.4, qui intercepte, lui, parce qu'il n'existe aucune barrière en aval au moment où l'on publie un commentaire. Ici, elle signale ; elle n'arbitre pas (§10) ;
- liste les fils bloquants non résolus avec liens directs, le décompte venant du résumé publié et les ancres du DOM (§5.5) ;
- ne doit **jamais** être la seule barrière — si l'extension est absente, la vérification serveur s'applique quand même.

**Dépendance à retenir** : cette section (comme la colonne « PR bloquée » du tableau §7) ne s'applique que si le composant B est déployé sur le dépôt. Une extension installée sans composant B associé peut assister et valider la saisie (composant A), mais ne peut **pas** garantir le blocage de la complétion de PR — voir la note du §7.

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

La configuration se résout en **deux temps**.

#### 8.1.1 Bornes (plancher)

Un **plancher** fixe un mode minimum (`minimumMode`) et une liste de règles non désactivables. Aucune configuration de niveau inférieur ne peut assouplir le mode en deçà de ce plancher ni désactiver une règle qu'il impose ; un dépôt peut en revanche durcir davantage.

**Point structurant : le plancher a deux canaux distincts, un par composant.**

| Composant | Canal | Portée |
|-----------|-------|--------|
| **A — Extension** | Politique d'entreprise poussée par le navigateur (clé de manifeste `storage.managed_schema`, API `chrome.storage.managed`, nœud de politique `3rdparty`) | Le poste de travail |
| **B — Serveur** | Configuration d'installation du service : variable d'environnement, secret de déploiement, ou fichier de configuration dans un dépôt d'administration protégé | Le service, donc l'organisation entière |

Un canal de navigateur est **structurellement illisible par le composant B**, qui n'a pas de navigateur. Faire porter le plancher au seul `managed_storage` reviendrait à ne le faire appliquer que par le composant explicitement décrit comme contournable (§2) — c'est-à-dire à ne pas l'appliquer du tout. Les deux canaux doivent donc porter **la même valeur de plancher**, et le composant B publie l'empreinte de la configuration qu'il applique (`configFingerprint`, §6.3.1), ce qui rend tout désaccord visible.

**Forme du plancher.** Les deux canaux portent le **même document**, dont voici le schéma. Il ne reprend que les clés plancher-ables : un plancher n'est pas une configuration et ne fixe aucune valeur par défaut.

```json
{
  "floorVersion": 1,
  "configUrl": "https://interne.example/cc/organisation.json",
  "minimumMode": "warn",
  "formatSeverity": "warn",
  "severities": { "E-NO-LABEL": "error", "E-UNKNOWN-LABEL": "error" },
  "labels":      { "minimum": ["issue", "todo"] },
  "rules": { "minDecisionSubjectLength": 20 },
  "activation": { "activatedAt": "2026-09-01T00:00:00Z" },
  "exemptUsers":       { "minimum": ["<compte-de-service>"], "closed": false },
  "allowlistPatterns": { "minimum": [], "closed": true },
  "resolverOverrideGroup": ["org/security-champions"],
  "configCacheTtlSeconds": 3600
}
```

**Deux natures de clés dans ce document.** `minimumMode` et les suivantes sont des **bornes** : elles contraignent ce qu'un niveau inférieur peut écrire. `floorVersion` et `configUrl` sont des **clés de canal** : elles ne bornent rien, elles disent au composant qui lit le plancher comment lire le reste. `configUrl` y figure parce qu'elle n'a pas d'autre emplacement possible — la porter dans le fichier de dépôt reviendrait à laisser un dépôt désigner lui-même la configuration d'organisation qui est censée le contraindre (§8.1.2).

**`configUrl` doit être portée par les deux canaux**, exactement comme les bornes, et pour la même raison : le composant A n'a pas d'autre chemin vers le niveau 2. Si un seul canal la porte, A et B ne résolvent pas la même configuration, leurs `configFingerprint` diffèrent en permanence, et la règle 2 du §8.1.3 désarme le blocage d'envoi en permanence — le mode de défaillance que cette même règle existe pour éviter. Le désaccord reste visible, mais il ne doit pas être l'état nominal.

`floorVersion` suit la même règle que la version du schéma de configuration : un plancher dont la version dépasse celle supportée par le composant qui le lit déclenche le repli du §8.1.5 — mode `assist`, ou le plancher **précédemment connu** s'il est plus strict — et le fait est signalé (`unsupported-version`, §9.2.1). Un plancher qu'on ne sait pas lire ne s'efface jamais en silence.

Toute clé absente n'est **pas** planchée. **En l'absence de politique d'entreprise — canal muet des deux côtés — le plancher vaut `{"minimumMode": "off"}` et n'impose aucune règle** : c'est le cas du déploiement public standard, où la configuration de dépôt et celle d'organisation décident seules. C'est aussi ce que désigne « le plancher en vigueur » partout où le document emploie l'expression.

`minimumMode` porte le plancher de la clé `mode`. Le nom diffère volontairement pour qu'un plancher ne puisse être ni confondu avec une configuration, ni collé tel quel dans l'un des fichiers du §8.2.

**Clés soumises au plancher** (« plancher-ables ») : `mode` (via `minimumMode`), `formatSeverity`, `severities`, `labels[].enabled` et `labels[].blockingByDefault` (via `minimum`), `activation.activatedAt`, `rules.minDecisionSubjectLength`, `exemptUsers`, `allowlistPatterns`, `resolverOverrideGroup` et `configCacheTtlSeconds`. Ce sont celles qui, laissées libres, permettraient soit de se soustraire à la contrainte, soit de faire diverger les deux composants. Les clés purement cosmétiques ou ergonomiques — libellés, icônes, langue, style de badge, seuils de longueur du sujet — restent librement surchargeables.

**Ce que « plancher » signifie, clé par clé.** « Plancher » veut dire *le niveau inférieur ne peut pas assouplir* — mais assouplir ne se traduit pas par la même opération arithmétique selon la clé. Le tableau est donc normatif ; il ne se déduit pas d'une règle générale.

| Clé | Contrainte imposée au niveau inférieur |
|---|---|
| `mode` | **Minimum** sur l'échelle des modes : `enforce` > `warn` > `assist` > `off`. Durcir est permis. |
| `formatSeverity` | **Minimum** sur sa propre échelle, à deux valeurs : `error` > `warn`. |
| `rules.minDecisionSubjectLength` | **Minimum** numérique : on peut exiger un motif plus long, jamais plus court. |
| `severities` | Ensemble de codes dont la sévérité **ne peut pas être abaissée**. |
| `activation.activatedAt` | Valeur effective : **`min(plancher, niveau inférieur)`** — et non `max`, comme sur les autres clés numériques. Une date plus ancienne élargit le périmètre, donc durcit ; repousser la bascule dans le futur est l'assouplissement à interdire. **Seule exception à la règle des bornes en direct** (§8.1.3) : un durcissement de cette clé ne s'applique pas aux PR déjà ouvertes, il est épinglé comme un changement restrictif ordinaire — sans quoi avancer la date ferait entrer d'un coup, sur toutes les PR ouvertes de l'organisation, l'historique que le §6.2.3 a construit une règle entière pour tenir dehors. |
| `configCacheTtlSeconds` | **Valeur imposée**, ni minimum ni maximum : la règle 4 du §8.1.3 exige la **même** valeur des deux côtés, un écart rouvrant mécaniquement la fenêtre de divergence. |
| `exemptUsers`, `allowlistPatterns` | Deux contraintes distinctes. `minimum` est le **sous-ensemble** qu'aucun niveau inférieur ne peut retirer. `closed` gouverne l'autre sens : à `true`, **aucun ajout** n'est admis en dessous du plancher. |
| `labels` | `minimum` : ensemble d'`id` dont ni `enabled` ni `blockingByDefault` ne peuvent passer à `false` en dessous du plancher. Voir la justification ci-dessous — c'est la clé dont l'absence viderait le critère 2. |
| `resolverOverrideGroup` | Le groupe désigné par le plancher ne peut pas être remplacé par un autre. Un niveau inférieur peut **restreindre** l'habilitation en désignant d'autres groupes : l'habilitation effective est l'**intersection** de toutes les listes en présence — être membre de chacun des groupes cités. Formulée en intersection, la contrainte se vérifie par autant d'appels `isInGroup` (§9.2.4) ; formulée en « sous-groupe », elle exigerait d'inspecter la structure des groupes, ce qu'aucun contrat n'expose. |

Le drapeau `closed` mérite sa justification, car il fait exception à la fusion par union du §8.1.4. Sur `exemptUsers`, la seule contrainte d'un sous-ensemble minimal borne l'opération qui **durcit** — retirer une exemption — et laisse entière celle qui **assouplit** : un dépôt s'ajoute lui-même à la liste et sort de la contrainte, immédiatement et jusque sur ses PR déjà ouvertes, la fusion par union étant élargissante (§8.1.3). Ce serait l'inverse exact du principe posé au §6.1, « durcir est toujours permis, assouplir passe par la gouvernance ». C'est donc `closed` qui rend ces deux clés réellement plancher-ables ; `minimum` seul ne suffit pas.

`overrideLabel` **n'est pas plancher-able** : le nom de l'étiquette d'exemption est libre, et ce qui doit être encadré — le droit de la poser — l'est par `resolverOverrideGroup` (§6.3.2).

**Pourquoi `labels` est plancher-able, alors qu'elle a l'air d'un simple réglage.** C'est la clé par laquelle un dépôt éteint la contrainte le plus complètement, et sans rien désactiver en apparence. Il suffit de pousser sur la branche par défaut :

```json
{ "labels": [ { "id": "issue", "enabled": false },
              { "id": "todo",  "enabled": false },
              { "id": "chore", "enabled": false } ] }
```

Plus aucun label n'est `blockingByDefault`. Tout `issue:` ressort en `E-UNKNOWN-LABEL` à l'étage 2, n'atteint donc jamais le temps 2, et **aucun fil n'est plus bloquant** : le critère 2 est vide, et sous le défaut `formatSeverity: warn` le check reste **au vert**. Le plancher `enforce`, la gouvernance du §6.1, la monotonie et le départage `E-CONFLICT` deviennent tous inopérants, par un commit qu'une seule personne peut pousser. C'est exactement le test que la phrase ci-dessus énonce — « se soustraire à la contrainte » — et `labels` y échoue plus complètement que `mode`, qui est protégé.

Une erreur d'implémentation typique consisterait à appliquer `max(plancher, dépôt)` à toutes les clés scalaires : sur `activatedAt`, cela produit exactement l'inverse de l'effet recherché.

#### 8.1.2 Valeur effective

Par ordre de priorité décroissante, **au sein des bornes ci-dessus** :

1. `.conventional-comments.json` à la racine de la branche par défaut du dépôt, **mis en cache pour `configCacheTtlSeconds` comme le niveau 2, et des deux côtés**. Un cache asymétrique sur ce niveau ferait diverger les empreintes après chaque modification du fichier, et désarmerait le blocage d'envoi sur tout le dépôt pendant la durée du cache (§8.1.3, règle 2) — l'état nominal deviendrait la panne.
2. Configuration d'organisation, servie par une URL, mise en cache pour `configCacheTtlSeconds` (3600 s par défaut).
3. Valeurs par défaut du produit.

**D'où vient cette URL.** `configUrl` provient **exclusivement** du canal de plancher (§8.1.1). Une valeur de déploiement propre au composant B serait invisible de l'extension, qui résoudrait alors deux niveaux là où le serveur en résout trois : c'est admissible comme repli d'exploitation, mais il faut alors savoir que l'extension est en **état dégradé permanent** et que le blocage d'envoi y reste désarmé (§8.1.3, règle 2). Le canal de plancher est le seul emplacement qui n'a pas cette conséquence. Un `configUrl` posé dans le fichier de dépôt est **ignoré**, et le fait signalé (`config-warning`, §9.2.1). Sans cette règle, un dépôt détournerait le niveau 2 vers un document qu'il contrôle et se donnerait à lui-même la configuration d'organisation — ce que toute cette section existe pour empêcher. La résolution serait par ailleurs circulaire : il faudrait lire la configuration pour savoir où aller la chercher.

Le fichier de dépôt étant modifiable par les personnes mêmes que la convention encadre, il ne peut jamais assouplir une clé plancher-able : un `{"mode": "off"}` poussé sur la branche par défaut d'un dépôt dont le plancher d'organisation vaut `enforce` est **ignoré pour la clé `mode`**, et le fait est signalé dans la sortie du check.

Les préférences locales de l'utilisateur restent, dans tous les cas, **limitées** : langue, thème, raccourcis, style de badge. L'utilisateur ne peut ni assouplir le mode ni modifier la liste des labels, quel que soit le niveau de configuration en vigueur.

**Résolution de la langue**, par ordre de priorité décroissante : préférence locale de l'utilisateur, puis clé `language` de la configuration effective, puis langue de l'interface de la plateforme. La sortie du check (§6.3.1), produite hors navigateur, utilise la clé `language` de la configuration effective.

#### 8.1.3 Épinglage et parité A/B

Le §2 pose que « un commentaire jugé conforme par l'extension doit toujours être jugé conforme par le serveur ». Partager `core/` n'y suffit pas : les divergences réalistes ne viennent pas du parseur, mais de la **configuration** — deux composants qui appliquent correctement le même code à deux configurations différentes. Cette section ferme chacune de ces sources.

**1. L'épinglage est monotone.** Une modification de configuration qui pourrait rendre **non conforme un commentaire qui l'était** ne s'applique pas aux PR déjà ouvertes ; une modification qui ne peut qu'**élargir ce qui est accepté** s'applique immédiatement, partout.

| Sens de la modification | Exemples | Effet sur une PR déjà ouverte |
|---|---|---|
| **Restrictif** — épinglé | retrait d'un label ou d'une décoration, durcissement d'une sévérité, allongement de `minSubjectLength` | Aucun. La PR reste jugée sur la configuration en vigueur à son ouverture. |
| **Élargissant** — en direct | ajout d'un label ou d'une décoration, assouplissement du `mode`, ajout d'un compte à `exemptUsers` lorsque le plancher ne ferme pas la liste (§8.1.1) | Immédiat. |
| **Bornes d'entreprise** (§8.1.1) — en direct **dans les deux sens** | durcissement ou assouplissement du plancher, **hors `activation.activatedAt`** | Immédiat, y compris restrictif. |
| **Plancher sur `activation.activatedAt`** | avancer la date de bascule | Épinglé, comme un changement restrictif ordinaire (§8.1.1) — sans quoi la borne ferait entrer d'un coup l'historique que le §6.2.3 tient dehors. |

En une phrase : **une modification de configuration ne peut jamais dégrader le jugement porté sur une PR déjà ouverte ; elle peut toujours l'améliorer immédiatement.** C'est le même principe que le blocage monotone du §6.1, appliqué à la configuration au lieu du caractère bloquant d'un fil.

**Comment classer une modification.** Le sens se lit sur le **résultat**, jamais sur le nom de la clé : est **restrictive** toute modification qui pourrait ajouter un diagnostic, rendre un fil bloquant, ou faire échouer un critère qui passait ; est **élargissante** toute modification dont c'est impossible. Le classement est **normatif clé par clé**, comme celui du plancher, et pour la même raison : deux implémentations raisonnables classeraient autrement.

| Clé | Restrictif (épinglé) | Élargissant (en direct) |
|---|---|---|
| `mode`, `formatSeverity` | durcissement | assouplissement |
| `severities[c]` | sévérité plus haute | sévérité plus basse |
| `labels[]`, `decorations.known[]` | retrait d'une entrée, ou `enabled: false` | ajout d'une entrée, ou `enabled: true` |
| `labels[].blockingByDefault` | `false → true` | `true → false` |
| `labels[].alwaysNonBlocking` | `true → false` | `false → true` |
| `labels[].aliases` | retrait d'un alias | ajout d'un alias |
| `decorations.known[].forces` | `null → "blocking"` | `"blocking" → null` ou `"non-blocking"` |
| `decorations.allowFree` | `true → false` | `false → true` |
| `exemptUsers`, `allowlistPatterns` | retrait d'une entrée | ajout d'une entrée |
| `rules.minSubjectLength`, `rules.minDecisionSubjectLength` | augmentation | diminution |
| `rules.maxSubjectLength` | diminution | augmentation |
| `scope.validateReplies`, `scope.validateReviewSummary` | passage à `true` | passage à `false` |
| `activation.activatedAt` | date plus **ancienne** — elle élargit le périmètre, donc durcit (§8.1.1) | date plus **récente** |
| `resolverOverrideGroup` | restriction de l'habilitation | élargissement |

**Clause de fermeture.** Est traitée comme **restrictive** toute clé qui entre dans le domaine de `fingerprint()` (§9.2.2) sans figurer ci-dessus, **et toute clé nouvelle du §8.2 tant qu'elle n'a pas été classée explicitement dans ce tableau**. Les clés que ce tableau **mentionne** suivent la colonne qui les classe — un assouplissement du `mode` s'applique donc en direct, comme la règle 1 l'exige. **Parmi celles qu'il ne mentionne pas**, s'appliquent en direct : celles dont le §9.2.2 établit qu'elles ne gouvernent aucun verdict (`telemetry.*`, `language`, `badgeStyle`, `labels[].color`) et celles qui sont purement opérationnelles ou décrivent la façon dont la configuration a été obtenue (`server.*`, `exemptionLog.*`, `configUrl`, `configCacheTtlSeconds`, `coreMinVersion`, `docUrl`, `shortcuts.*`) — les épingler figerait un réglage d'exploitation sur les PR ouvertes sans rien protéger. Toutes les autres sont épinglées.

Le second membre n'est pas redondant : le §9.2.2 exclut une clé nouvelle de l'empreinte par défaut — « l'inscrire est un geste délibéré » —, si bien qu'un renvoi au seul domaine de `fingerprint()` la rendrait *élargissante*, donc rétroactive, ce qui est l'inverse du filet recherché. Et « ne gouverne aucun verdict » ne se déduit pas de l'exclusion : `resolverOverrideGroup` gouverne le critère 2 et n'est hors de l'empreinte que parce que l'extension ne le résout pas. L'erreur sûre est de retarder un assouplissement, jamais d'infliger un durcissement.

**À quelle granularité.** Le classement porte sur **une clé à la fois**, et sur **une entrée à la fois** pour les clés de liste (`labels`, `decorations.known`, `exemptUsers`, `allowlistPatterns`). Un même commit peut retirer un label et en ajouter un autre : il n'est ni restrictif ni élargissant dans son ensemble, et vouloir le classer d'un bloc n'a pas de réponse. Entrée par entrée, si : le retrait est épinglé, l'ajout s'applique en direct, dans le même commit et sans qu'aucune règle particulière soit nécessaire.

Sans la partie épinglée, merger une modification qui retire un label à 14 h rendrait rétroactivement non conformes tous les `chore:` écrits le matin sur douze autres PR — douze résumés de check qui se remplissent de diagnostics sans qu'aucun commentaire n'ait bougé, et un basculement au rouge si l'organisation a retenu `formatSeverity: error`.

Sans la partie en direct, l'interrupteur général du §6.3.3 ne fonctionnerait pas : ramener l'organisation de `enforce` à `warn` ne débloquerait aucune des PR déjà ouvertes, alors que c'est précisément la propriété de sûreté attendue d'un retour arrière. Les bornes d'entreprise font exception dans les deux sens parce qu'elles sont un garde-fou de gouvernance, pas une règle de jugement : une organisation qui durcit son plancher doit en voir l'effet tout de suite. La seule exception est `activation.activatedAt`, pour la raison donnée au §8.1.1 : y appliquer la règle générale annulerait le périmètre d'activation du §6.2.3 sur toutes les PR ouvertes à la fois.

**Quand elle est écrite.** La configuration épinglée d'une PR est posée à sa **première évaluation** par le composant B, et **jamais réécrite** ensuite — même règle, et même raison, que le verdict de première observation du §6.1 : une valeur réécrite à chaque tour suivrait les durcissements successifs et n'épinglerait plus rien. Une PR ouverte avant le déploiement du composant B est donc épinglée sur la configuration en vigueur au jour de sa première évaluation, et non à sa création : c'est la seule date que le service puisse connaître.

L'épinglage reprend la granularité déjà retenue pour le périmètre d'activation (§6.2.3) — une résolution par PR, jamais par commentaire — et hérite de la même propriété : l'écart introduit par un changement restrictif se résorbe de lui-même à mesure que les PR ouvertes se ferment.

**2. Une seule autorité de résolution.** L'épinglage est un mécanisme du composant B seul : **le composant A n'épingle pas**. Il n'a pas d'état persistant par PR, et le §10 lui interdit l'appel d'API par lequel il obtiendrait la configuration épinglée. Sur une PR ouverte avant un changement restrictif, il juge donc avec la configuration **courante** pendant que le serveur juge avec la configuration **épinglée**.

C'est exactement la suspension annoncée au §2. Elle est dans le sens supportable : le sens **direct** de la règle — ce que A accepte, B l'accepte — reste vrai, puisqu'un B plus permissif accepte a fortiori. C'est le sens **réciproque** qui tombe : A refuserait un envoi que la source de vérité aurait accepté. La règle ferme ce cas :

Le composant B publie dans la sortie du check l'**empreinte de la configuration appliquée** (`configFingerprint`, §6.3.1). L'extension la lit sur la page — elle y est rendue, aucun appel d'API n'est nécessaire (§10) — et la compare à la sienne. En cas d'écart, elle **signale** que sa vue est décalée **et cesse de bloquer l'envoi** : elle se comporte comme en mode `warn` jusqu'à ce que les deux empreintes coïncident. Le désaccord devient visible au lieu d'être subi, et il ne se paie jamais d'un rejet que la source de vérité n'aurait pas prononcé.

**La comparaison porte sur la configuration, et sur elle seule.** Un écart de version de `core/` ne déclenche **pas** cette désescalade : la règle 5 ci-dessous le déclare normal et lui donne son propre traitement. Confondre les deux éteindrait le mode `enforce` côté extension en permanence, puisque la condition serait vraie en permanence — le blocage d'envoi du §5.4 et `CA-01` deviendraient inopérants dans le cas courant, ce qui est l'inverse du but poursuivi.

Quand aucun résultat n'est encore publié sur la PR — première évaluation en cours, ou composant B non déployé —, il n'y a pas d'empreinte à comparer : l'extension applique le mode configuré, comme partout ailleurs.

**Une configuration dégradée ne produit pas un désaccord.** Si l'une des lectures de configuration de l'extension a rendu `{ status: 'unreachable' }` (§9.2.3), l'extension **ne compare pas les empreintes du tout** — la marque vit à côté de l'empreinte, jamais dedans, `fingerprint()` n'ayant pour entrée que la configuration effective (§9.2.2). Le cas est traité comme l'absence d'empreinte ci-dessus, et c'est la condition 4 du §5.4 — configuration lue sans repli — qui décide alors du blocage. Confondre les deux ferait passer une lecture manquée pour un désaccord de configuration, et signalerait un décalage là où il n'y en a pas.

**3. Contournement du cache.** Le cache de configuration (§8.1.2) est contourné dans **deux situations, et deux seulement** : lors d'un assouplissement du `mode` (§6.3.3), et avant un rejet qui dépend de la configuration. La seconde est décrite ici.

Avant d'émettre un rejet qui dépend de la configuration — `E-UNKNOWN-LABEL`, `E-UNKNOWN-DECORATION` — le composant B rafraîchit **les deux niveaux** de configuration en contournant leur cache : un label peut avoir été ajouté au fichier du dépôt aussi bien qu'au document d'organisation.

Concrètement, l'évaluation se fait **en deux passes, et seulement quand il le faut** : une première passe avec la configuration en cache ; si elle produit un `E-UNKNOWN-LABEL` ou un `E-UNKNOWN-DECORATION`, une seconde après `fetchOrgConfig(url, { bypassCache: true })` (§9.2.4). Seul le verdict de la seconde est publié. Les fonctions de `core/` étant pures, c'est l'orchestrateur serveur qui porte cette boucle — elle ne peut pas vivre dans `validate()`.

C'est une application directe de la règle 1 : l'ajout d'un label est une modification élargissante, donc évaluée en direct, y compris sur les PR déjà ouvertes. Sans ce rafraîchissement, la règle serait vraie sur le papier et fausse en pratique pendant toute la durée du cache.

Elle vise une asymétrie précise. Si l'extension est en avance sur le serveur — l'organisation vient d'ajouter un label, l'extension l'a déjà, le serveur pas encore — l'utilisateur écrit un commentaire que l'outil vient de l'aider à composer et le check le signale comme non conforme : c'est le sens de divergence qui dégrade une PR. Dans l'autre sens — extension en retard — elle bloque une saisie que le serveur accepterait, ce qui est agaçant mais se résout en rechargeant la page. On ne paie donc le coût du rafraîchissement que sur le sens gênant, et seulement au moment d'un rejet, c'est-à-dire rarement.

**4. Même durée de cache des deux côtés.** `configCacheTtlSeconds` est plancher-able (§8.1.1) et doit porter la même valeur pour les deux composants. Un TTL asymétrique élargit mécaniquement la fenêtre de divergence.

**5. Compatibilité de `core/`.** L'extension se met à jour automatiquement depuis un store ; le serveur est redéployé au rythme de l'organisation. Un écart de plusieurs semaines est le cas normal, pas l'exception. Le fichier de configuration porte donc `coreMinVersion` : une configuration produite pour une version majeure supérieure à celle du composant qui la lit déclenche **le repli que le §8.1.5 définit pour une version de schéma non supportée — mode `assist`, ou le plancher en vigueur s'il est plus strict** — et l'écart est reporté dans la sortie du check. Les deux cas partagent le même repli parce qu'ils posent le même problème : un document qu'on sait lire mais qu'on ne sait pas appliquer entièrement.

**6. Normalisation d'entrée.** Traitée au §3.4.1, qui est normatif précisément parce que c'est la seule divergence qui se manifestait sur *tous* les commentaires et non sur une fenêtre de temps.

#### 8.1.4 Sémantique de fusion

Sans règle explicite, un dépôt qui ne déclare que deux labels laisse indéterminé s'il en a désormais deux ou dix — et deux implémentations raisonnables produiraient deux produits différents. La règle est donc fixée **par clé** :

| Clé | Fusion |
|-----|--------|
| `labels` | **Fusion par `id`.** Un niveau inférieur surcharge les propriétés d'un label existant et peut en ajouter de nouveaux ; il ne supprime jamais un label. Pour retirer un label, lui donner `"enabled": false`. |
| `decorations.known` | Fusion par `id`, même règle. |
| `shortcuts.abbreviations` | **Fusion par abréviation**, même règle que `severities` : un niveau inférieur en ajoute ou en redéfinit une sans effacer les autres. |
| `severities` | **Fusion par code.** Un niveau inférieur surcharge la sévérité d'un code sans effacer celles que le niveau supérieur a posées pour d'autres codes. Les codes absents de tous les niveaux gardent la sévérité du tableau §3.5.2. |
| `exemptUsers`, `allowlistPatterns` | **Concaténation** (union), sans suppression possible depuis un niveau inférieur — **sauf `closed: true` au plancher** (§8.1.1), qui interdit alors tout ajout depuis un niveau inférieur. |
| `resolverOverrideGroup` | **Intersection**, jamais remplacement : un niveau inférieur ne peut que restreindre l'habilitation posée au-dessus (§8.1.1). |
| `rules`, `scope`, et les autres clés scalaires | **Remplacement** de la valeur, clé par clé. |

Les labels optionnels `typo`, `polish` et `quibble` (§3.2) sont livrés désactivés (`"enabled": false`, `blockingByDefault: false`) ; les activer consiste à passer leur `enabled` à `true`.

#### 8.1.5 Configuration absente, illisible ou invalide

Ces cas ne sont pas théoriques : casser le fichier de configuration serait, à défaut de règle, le moyen le plus simple de désactiver le contrôle.

| Situation | Composant A | Composant B |
|-----------|-------------|-------------|
| Fichier absent, **jamais évalué auparavant** | Repli sur le niveau inférieur — organisation, puis défauts du produit — dans les bornes du plancher | **Ne publie aucun statut** — le dépôt n'a pas activé l'outil (§6.4, périmètre d'installation) |
| Fichier absent, **dépôt déjà évalué** | Idem | Publie un statut **neutre** portant `config-vanished`, **quel que soit le mode effectif** — l'une des deux exceptions à la règle du §6.2.2, avec la ligne suivante. La disparition du fichier est un incident, pas une désactivation : sans cette distinction, `git rm .conventional-comments.json` désactiverait le contrôle sur un dépôt en `enforce` — ou, si le check est obligatoire, bloquerait toutes ses PR sans recours |
| JSON syntaxiquement invalide, ou **valeur inconnue pour une clé connue** (`"mode": "banana"`) | Repli sur le **dernier niveau valide** (organisation, puis défauts), avertissement visible dans les options | Signale « configuration invalide » avec la ligne fautive. Sur un dépôt **déjà évalué**, il publie **quel que soit le mode effectif** — en échec sous `enforce`, neutre portant `invalid-config` sous tout mode inférieur — pour la même raison que la ligne précédente. Sur un dépôt jamais évalué, le mode reste maître |
| **Lecture impossible** — API injoignable, limite d'appels atteinte (`{ status: 'unreachable' }`, §9.2.2) | Repli sur le niveau inférieur, **en état dégradé** au sens du §5.4 : l'extension assiste et ne bloque plus | Ce n'est ni une absence ni une invalidité, mais une **incapacité à évaluer** au sens du §6.4. Sur un dépôt **déjà évalué** et dans le statut que le mode autorise à publier (§6.2.2) : `degradedSince` s'arme, rien n'est publié pendant le délai de grâce, puis un statut neutre `grace-expired`. Sur un dépôt jamais évalué, le silence de la première ligne continue de s'appliquer — sans quoi une panne d'API ferait apparaître un check sur tous les dépôts non activés d'une organisation |
| Version de schéma supérieure à celle supportée, ou `coreMinVersion` non satisfaite (§8.1.3) | Repli en mode `assist`, **ou au plancher en vigueur s'il est plus strict** (§8.1.1), avec avertissement | **Le même repli, mot pour mot** : mode `assist`, ou le plancher en vigueur s'il est plus strict. Le motif « version non supportée » est porté dans le statut que ce mode l'autorise à publier. Jamais de blocage implicite |

**Une clé inconnue, elle, est simplement ignorée**, avec un avertissement, et ne déclenche aucun repli. C'est ce qui permet à une configuration écrite pour une version ultérieure d'être lue par une version antérieure sans faire disparaître la contrainte. Le repli est réservé à ce qu'on ne sait pas interpréter : un document illisible, ou une valeur hors du domaine d'une clé connue — dont on ne peut rien conclure, alors qu'une clé inconnue se laisse écarter sans risque.

Un fichier invalide ne fait donc **jamais** disparaître la contrainte : il la signale aussi bruyamment que le mode en vigueur le permet. **Le mode reste maître de ce que le composant B publie** — une configuration cassée ne peut pas faire échouer un check là où un mode inférieur l'interdit, sans quoi une faute de virgule bloquerait un dépôt en repli. Le repli est borné par le plancher, faute de quoi une simple montée de version du schéma permettrait de descendre sous un plancher `enforce`. Il est **identique pour les deux composants** : écrire « repli en `assist` » d'un côté et « applique le plancher » de l'autre les ferait diverger sur un déploiement public, où le plancher vaut `{"minimumMode": "off"}` — A assisterait, B se tairait, sur la même entrée.

**Fichier absent contre `mode: off`.** Ces deux situations n'ont volontairement pas le même effet. Un fichier absent sur un dépôt **jamais évalué** signifie « ce dépôt n'a pas activé l'outil » (§6.4) et le composant B se tait ; sur un dépôt déjà évalué, il publie un neutre **quel que soit le mode effectif**. C'est, avec la configuration **invalide** sur un dépôt déjà évalué, la seule exception à « le mode reste maître », et elle est nécessaire : le fichier ayant disparu, le mode effectif est celui que donnent l'organisation puis les défauts, soit `assist` dans un déploiement courant — donc le silence. Or sur un dépôt où le check est déclaré obligatoire, ce silence bloque **toutes** les PR, sans statut et sans explication. Le mode qui commanderait le silence est ici une conséquence de l'incident, pas une décision : lui obéir reviendrait à laisser un `git rm` provoquer un blocage général muet. Le neutre laisse passer et dit pourquoi.

Le raisonnement vaut mot pour mot pour un fichier **cassé** plutôt que supprimé : le repli sur le niveau inférieur produit le même mode résiduel, donc le même silence, donc le même blocage général. Le §8.1.5 ouvre en observant que « casser le fichier de configuration serait, à défaut de règle, le moyen le plus simple de désactiver le contrôle » — sans exception, la règle écrite transformerait « désactiver » en « bloquer silencieusement », ce qui est pire. Les deux incidents sont donc traités de la même façon. Un `{"mode": "off"}` explicite est une **demande de désactivation**, qui reste soumise au plancher et peut donc être ignorée. Une organisation qui veut rendre l'activation obligatoire ne peut pas s'appuyer sur le seul plancher : elle doit imposer la présence du fichier, par exemple via un dépôt de modèles ou un contrôle d'organisation, hors périmètre de cet outil.

### 8.2 Schéma

Le bloc ci-dessous est un **exemple de configuration de dépôt**, destiné à montrer la forme de chaque clé. Ce ne sont **pas** les valeurs par défaut du produit : il n'énumère que quatre labels sur les treize du §3.2, et sa clé `severities` éteint volontairement un avertissement pour illustrer la surcharge.

**Les valeurs par défaut du produit** sont ailleurs, et par construction : les dix labels par défaut et les trois optionnels du §3.2, les décorations du §3.3, les sévérités du tableau §3.5.2, `mode: "assist"`, `formatSeverity: "warn"`, `severities: {}`, `decorations.allowFree: true`, `docUrl: "https://conventionalcomments.org/"`, `resolverOverrideGroup: []`, `scope: { validateReplies: false, validateReviewSummary: true }`, et les seuils du `rules` ci-dessous. Une implémentation qui construirait ses défauts en recopiant ce bloc livrerait un produit à quatre labels dont `W-MISSING-DECORATION` est éteint — c'est la confusion que ce paragraphe existe pour empêcher.

**`resolverOverrideGroup` vaut la liste vide en dernier recours, et n'habilite alors personne.** C'est un **repli terminal** — la valeur retenue quand *aucun* niveau ne déclare la clé — et non un participant à l'intersection du §8.1.4 : celle-ci ne porte que sur les listes effectivement déclarées, faute de quoi un défaut produit vide annulerait le groupe posé par le plancher lui-même, en contradiction avec « le groupe désigné par le plancher ne peut pas être remplacé » (§8.1.1).

Là où cette valeur s'applique, le cas 2 du §6.1 est sans effet et seule la résolution par l'auteur du commentaire racine est retenue ; l'exemption de PR du §6.3.2 n'est posable par personne. Une liste vide se lirait autrement comme « aucune condition, donc tout le monde » : ce n'est pas la lecture retenue, et le sens sûr est le seul cohérent avec « assouplir passe par la gouvernance ».

**Conséquence, et prérequis au passage en `enforce`.** Sans groupe habilité, les **deux** soupapes du §6.3 sont inertes simultanément : ni `decision` ni exemption de PR. Le seul recours devient l'auteur du commentaire racine — c'est-à-dire qu'un dépôt en `enforce` dont le relecteur est indisponible reste bloqué, le scénario même que le §6.1.1 existe pour traiter. **Désigner `resolverOverrideGroup` est donc un prérequis au passage en `enforce`** (§14, P6), et le composant B émet un `config-warning` (§9.2.1) à chaque évaluation d'un dépôt en `enforce` dont le groupe résolu est vide.

```json
{
  "$schema": "https://conventional-comments-toolkit.dev/schema/v1.json",
  "version": 1,
  "mode": "assist",
  "labels": [
    { "id": "issue", "enabled": true, "blockingByDefault": true, "alwaysNonBlocking": false,
      "icon": "🔨", "color": "#B3261E", "aliases": ["bug"] },
    { "id": "nitpick", "enabled": true, "blockingByDefault": false, "alwaysNonBlocking": true },
    { "id": "decision", "enabled": true, "blockingByDefault": false, "alwaysNonBlocking": true },
    { "id": "typo", "enabled": false, "blockingByDefault": false }
  ],
  "decorations": {
    "allowFree": true,
    "known": [
      { "id": "blocking",     "forces": "blocking" },
      { "id": "non-blocking", "forces": "non-blocking" },
      { "id": "if-minor",     "forces": "non-blocking" },
      { "id": "security",     "forces": null }
    ]
  },
  "severities": { "W-MISSING-DECORATION": "off" },
  "scope": {
    "validateReplies": false,
    "validateReviewSummary": true
  },
  "rules": {
    "minSubjectLength": 5,
    "maxSubjectLength": 120,
    "minDecisionSubjectLength": 20
  },
  "formatSeverity": "warn",
  "exemptUsers": ["<compte-de-service>"],
  "allowlistPatterns": ["^LGTM$"],
  "resolverOverrideGroup": ["acme/tech-leads"],
  "overrideLabel": "cc-override",
  "activation": { "activatedAt": "2026-09-01T00:00:00Z" },
  "configUrl": null,
  "coreMinVersion": "1.0.0",
  "configCacheTtlSeconds": 3600,
  "badgeStyle": "pill",
  "shortcuts": { "abbreviations": { "?i": "issue: ", "?ib": "issue (blocking): " } },
  "docUrl": "https://conventionalcomments.org/",
  "server": { "coalesceWindowSeconds": 10, "gracePeriodSeconds": 900, "reconcileIntervalSeconds": 900,
              "statusTargetUrl": null },
  "exemptionLog": { "endpoint": null },
  "language": "fr",
  "telemetry": { "enabled": false, "endpoint": null }
}
```

Clés introduites par le §6 et le §8.1 :

| Clé | Rôle |
|-----|------|
| `formatSeverity` | Sévérité du critère 1 du §6.2.1 — `warn` (défaut) ou `error`. Plancher-able. |
| `overrideLabel` | Étiquette d'exemption d'une PR (§6.3.2). **Non plancher-able** : son nom est libre. Ce qui est encadré, c'est le droit de la poser, via `resolverOverrideGroup` (§8.1.1). |
| `activation.activatedAt` | Date de bascule du dépôt (§6.2.3). Une PR est dans le périmètre si sa date de création lui est postérieure. Plancher-able : c'est une clé qui, laissée libre, permettrait de se soustraire à la contrainte en la datant dans le futur. |
| `configUrl` | **Ignorée si elle est posée ici.** L'URL de la configuration d'organisation provient exclusivement du canal de plancher (§8.1.1, §8.1.2) : la laisser au fichier de dépôt permettrait à un dépôt de désigner lui-même la configuration censée le contraindre. La clé reste dans le schéma pour que sa présence soit diagnosticable (`config-warning`), pas pour être renseignée. |
| `configCacheTtlSeconds` | Durée du cache de configuration (§8.1.2). Plancher-able, et doit porter la même valeur des deux côtés (§8.1.3, règle 4). |
| `coreMinVersion` | Version majeure minimale de `core/` requise pour appliquer cette configuration (§8.1.3). En deçà, le repli du §8.1.5 s'applique : mode `assist`, ou le plancher en vigueur s'il est plus strict. |
| `scope.validateReplies` | Validation des réponses de fil (§4.1). `false` par défaut. |
| `scope.validateReviewSummary` | Validation du corps d'une revue soumise en lot (§4.1). Sans objet sur les plateformes qui n'ont pas ce concept — voir annexes. |
| `resolverOverrideGroup` | Groupe ou **liste de groupes** habilités à résoudre un fil bloquant à la place de l'auteur du commentaire (§6.1.1) et à poser l'étiquette d'exemption (§6.3.2). Une liste s'entend en **intersection** : être membre de tous. C'est ce qui rend exprimable la restriction du §8.1.1 — un champ scalaire unique ne le pouvait pas. **La forme de chaque identifiant dépend de la plateforme** et est donnée en annexe (`org/team-slug` sur GitHub, `[Scope]\Nom` sur Azure DevOps) ; l'adaptateur serveur les résout par autant d'appels à `isInGroup` (§9.2.4). Plancher-able. |
| `rules.minDecisionSubjectLength` | Longueur minimale du motif d'une réponse `decision` (§6.1.1). Défaut : 20. Plancher-able. |
| `server.coalesceWindowSeconds` | Fenêtre de regroupement des événements d'une même PR (§6.4). Défaut : 10 s. Sans objet côté extension. |
| `docUrl` | Lien vers la documentation de la convention, porté par la sortie du check (§6.3.1). Une organisation qui documente sa propre déclinaison y pointe la sienne. |
| `server.statusTargetUrl` | URL **de base** de la page servie par le composant B ; il y ajoute le chemin de la PR évaluée pour former la `targetUrl` du statut (§6.3.1) — une URL unique ne pourrait pas désigner une PR. **Obligatoire sur toute plateforme qui ne rend pas de corps de statut** (§B.7), sans quoi un check rouge y serait un mur sans explication ; absente dans ce cas, un `config-warning` le signale (§8.1.5). |
| `server.reconcileIntervalSeconds` | Période de la réconciliation des PR ouvertes (§6.4). Défaut : 900 s. C'est le délai maximal de détection de tout ce qu'une plateforme ne notifie pas par événement. |
| `server.gracePeriodSeconds` | Délai au-delà duquel une incapacité à évaluer fait publier un statut neutre (§6.4). Défaut : 900 s. C'est le réglage qui décide combien de temps une PR peut rester bloquée par une panne : il appartient au schéma, pas à l'implémentation. |
| `exemptionLog.endpoint` | Destination du journal des exemptions de PR (§6.3.2) — distincte de `telemetry.endpoint`. À `null`, le journal est **local au composant B** et conservé selon le §10 ; la journalisation n'est jamais désactivée, seule sa destination externe l'est. C'est ce qui rend `CA-10` testable sur un déploiement par défaut. |
| `labels[].enabled` | Active ou désactive un label sans le retirer de la liste (§8.1.4). Les labels optionnels `typo`, `polish`, `quibble` sont livrés à `false`. |
| `shortcuts.abbreviations` | Table des abréviations extensibles par `Tab` (§5.2) : abréviation → **texte inséré, deux-points et espace compris** (`"?i": "issue: "`). Les raccourcis clavier directs relèvent, eux, des préférences locales de l'utilisateur (§8.1.2). |
| `labels[].color` | Couleur du bouton et du badge (§5.1, §5.5). Doit satisfaire les contrastes du §10. |
| `labels[].aliases` | Orthographes acceptées en entrée pour ce label — voir ci-dessous. |
| `decorations.known[].forces` | `"blocking"`, `"non-blocking"` ou `null` (descriptive). C'est cette clé qui exprime la précédence du §3.3, qu'une simple liste de chaînes ne pouvait pas porter. |
| `severities` | Sévérité par code de diagnostic (§3.5) : `off`, `warn` ou `error`. Plancher-able — voir la règle ci-dessous. **Cette clé est une surcharge** : les valeurs absentes gardent la sévérité du tableau §3.5.2, qui reste la référence, et sa valeur par défaut est l'objet vide. L'exemple ci-dessus désactive `W-MISSING-DECORATION` à titre d'illustration. |

**Limite basse de sévérité.** Un code `E-` ne peut jamais voir sa sévérité descendre sous `warn`, quel que soit le niveau de configuration. C'est ce qui rend exprimable la liste de règles non désactivables du §8.1.1 : elle se déclare comme un ensemble de codes dont la sévérité ne peut pas être abaissée.

**Alias de label.** Un alias est une orthographe alternative acceptée **en entrée** : `bug: fuite mémoire` est reconnu comme le label `issue` et en hérite intégralement (caractère bloquant, décorations admises, sévérités). L'alias n'est pas un label distinct — il n'apparaît ni dans la barre d'outils, ni dans les indicateurs du §12, où il est comptabilisé sous son label canonique. Un alias ne produit **aucun diagnostic** — c'est une orthographe admise, pas un écart. L'extension propose la réécriture vers la forme canonique comme une commodité d'édition, jamais comme une correction de `Diagnostic.fix` (§9.2.1), et sans l'imposer. `Bug:` cumule deux choses distinctes : la casse est comparée à la forme canonique de l'**alias reconnu**, donc `Bug:` produit `W-CASE` avec la correction `bug:` ; la réécriture vers `issue:` reste une proposition à part, que rien n'exige d'accepter. La comparaison est insensible à la casse.

Le champ `exemptUsers` de l'exemple est un espace réservé : les identités de comptes de service diffèrent d'une plateforme à l'autre et sont données dans les annexes. Aucun motif exemptant un préfixe de commande (`^/…`) ne figure dans les valeurs par défaut : il permettrait de se soustraire à la contrainte en tapant `/x` devant sa phrase. Les commandes slash légitimes relèvent de l'exemption structurelle du §4.2, pas d'un motif configurable.

**Contrainte sur `allowlistPatterns`.** Ces motifs sont fournis par le dépôt et exécutés dans le navigateur du relecteur comme dans le service mutualisé : un motif tel que `^(a+)+$` gèlerait l'un et l'autre. Trois bornes, toutes **statiques**, c'est-à-dire vérifiables avant exécution : **au plus 50 motifs**, **256 caractères** par motif, et **aucun quantificateur imbriqué** — un quantificateur portant sur un groupe qui en contient déjà un, forme dont relève l'essentiel des ReDoS connus. Un motif qui dépasse ces bornes est **ignoré et signalé** (`config-warning`, §9.2.1).

Un délai maximal d'exécution serait le contrôle évident, et il n'est pas retenu : une expression régulière JavaScript s'exécute sur le fil principal et ne s'interrompt pas. La seule façon de la borner dans le temps serait de l'exécuter dans un *worker* que l'on termine — coût disproportionné pour un motif dont on peut refuser la forme à la lecture.

Le schéma est **versionné**. Une configuration dont la version dépasse celle supportée par le composant qui la lit déclenche le repli décrit au §8.1.5 — mode `assist`, ou le plancher en vigueur s'il est plus strict — accompagné d'un avertissement, jamais un blocage silencieux.

Les emplacements par défaut ci-dessus sont ceux d'un déploiement public standard ; une organisation qui déploie via politique d'entreprise peut pointer `$schema` vers ses propres emplacements internes, et y déclarer son `configUrl` — dans le **canal de plancher**, jamais ici (§8.1.1). Voir §10, Compatibilité.

---

## 9. Architecture technique

### 9.1 Découpage

```
packages/
├── core/            # Aucune dépendance DOM ni plateforme — partagé par A et B
│   ├── parser       # Analyse d'un commentaire → AST
│   ├── validator    # AST + config → diagnostics
│   ├── config       # Chargement, fusion, validation du schéma, résolution des bornes (§8.1)
│   └── i18n         # fr / en
├── adapters/        # Composant A — un adaptateur par plateforme
│   ├── github/      # Sélecteurs DOM, cycle de vie SPA — aucun appel d'API à jeton (§10)
│   └── azdo/        # Idem Azure DevOps
├── extension/       # Manifest V3, content scripts, service worker, options — une seule extension
└── server/          # Composant B
    ├── compliance/  # Logique commune : calcul de conformité, statut, journalisation — réutilise packages/core tel quel
    └── adapters/    # Un adaptateur serveur par plateforme (réception d'événements, publication de statut)
        ├── github/
        └── azdo/
```

`packages/core/` est publié comme paquet et consommé à l'identique par l'extension et par le compagnon serveur. **Aucune règle de validation ne doit être dupliquée.**

### 9.2 Interfaces d'adaptateur

#### 9.2.1 Types partagés

Ces types vivent dans `core/` et ne dépendent d'aucune plateforme. Ils sont la **frontière réelle** : sans eux, les contrats ci-dessous sont des signatures sans contenu, et l'affirmation « implémenter les deux contrats suffit » est fausse.

```ts
type ResolutionState = 'unresolved' | 'resolved' | 'unknown';

interface PrRef {
  platform: string;                   // identifiant d'adaptateur — jamais une union fermée, sans quoi
                                      // ajouter une plateforme obligerait à éditer `core/` (§9.2.2)
  createdAt: string;                   // ISO 8601 — c'est cette date, et elle seule, qui décide du périmètre (§6.2.3)
  host: string;                        // github.com, ghe interne, dev.azure.com…
  scope: string[];                     // owner/repo, ou org/project/repo
  number: number | string;
}

interface UserInfo {
  id: string;                          // identifiant stable de plateforme, jamais le nom affiché
  login: string;
  displayName?: string;
  isServiceAccount: boolean;           // §12 — répartition des indicateurs ; **n'entre dans aucune règle
                                       // de validation** : l'exemption structurelle du §4.2 passe par
                                       // `CommentInfo.isSystemGenerated`, et les bots par `exemptUsers`
}

interface CommentInfo {
  id: string;
  author: UserInfo;
  body: string;                        // corps stocké brut — la normalisation est faite par core/ (§3.4.1)
  createdAt: string;                   // ISO 8601
  updatedAt?: string;
  lastEditedBy?: UserInfo;             // §6.1 — exigé pour signaler une édition affaiblissante « avec son auteur » ;
                                       // absent si la plateforme ne l'expose pas (voir §6.1)
  permalink: string;                   // requis par la sortie du check (§6.3.1)
  isSystemGenerated: boolean;          // §4.2 — l'adaptateur le pose depuis les marqueurs de sa plateforme
  canCarryBlockingState: boolean;      // §4.1 — pilote `W-NOT-BLOCKABLE`. Porté ici, et non par le seul
                                       // `ThreadInfo`, parce que les commentaires hors fil y sont soumis aussi
}

interface ThreadInfo {
  id: string;
  pr: PrRef;
  root: CommentInfo;
  replies: CommentInfo[];              // parcourues pour y trouver une `decision` (§6.1.1)
  resolution: ResolutionState;         // normalisé ici ; le mapping des états bruts est dans l'adaptateur
  resolvedBy?: UserInfo;               // absent si la plateforme ne l'expose pas — voir ci-dessous
  resolvedAt?: string;
  canCarryBlockingState: boolean;      // hérité de `root` (§4.1) ; présent ici pour la lisibilité des règles
}
```

*`resolvedBy` conditionne toute la gouvernance du §6.1, et il est optionnel : il faut donc dire ce qu'on fait sans lui.* Lorsque la plateforme n'expose pas l'auteur d'une résolution, celle-ci est **acceptée**, et un `notice` de type `resolution-unattributed` est émis. On ne bloque jamais une PR sur une information que l'API ne rend pas — le contraire produirait un fil rouge sans recours, exactement ce que le §6.3 existe pour éviter.

```ts
interface Diagnostic {
  code: string;                        // §3.5.2
  severity: 'warn' | 'error';          // après application de `severities` (§8.2) ; `off` n'apparaît jamais,
                                       // ces diagnostics étant retirés de la liste (§3.5.1, exclusion)
  message: string;
  comment?: CommentInfo;               // absent lors d'une validation de saisie : le commentaire n'existe pas
                                       // encore, il n'a ni identifiant ni lien permanent
  fix?: { replacement: string };       // §5.3 — **la ligne de préfixe (§3.4.1) entièrement réécrite**,
                                       // telle qu'elle doit remplacer la ligne d'origine dans le corps.
                                       // Une plage de caractères ne suffirait pas : `CA-16` exige qu'un
                                       // seul `W-DECORATION-STYLE` corrige deux écarts d'une même ligne.
                                       // Aucune correction ne porte jamais sur la discussion
}

type NoticeKind =
  | 'weakening-edit'        // §6.1 — édition affaiblissante de la racine d'un fil bloquant
  | 'root-deleted'          // §6.1 — suppression de cette racine
  | 'resolution-refused'    // §6.1 — résolution hors des deux cas admis
  | 'resolution-unattributed'  // §9.2.1 — plateforme n'exposant pas l'auteur de la résolution
  | 'floor-override'        // §8.1.2 — clé de dépôt ignorée au titre du plancher
  | 'invalid-config'        // §8.1.5 — JSON invalide ou valeur hors domaine
  | 'config-warning'        // §8.1.5 — clé inconnue ignorée ; §8.2 — expression d'allowlist écartée
  | 'config-vanished'       // §8.1.5 — fichier de configuration disparu d'un dépôt déjà évalué
  | 'exemption-reset'       // §6.3.2 — étiquette d'exemption retirée après un nouveau commentaire bloquant
  | 'exemption-refused'     // §6.3.2 — étiquette posée par une personne non habilitée
  | 'grace-expired'         // §6.4 — délai de grâce dépassé, évaluation impossible
  | 'unsupported-version';  // §8.1.5, §8.1.3 — schéma, plancher ou core/ trop récent

interface Notice {
  kind: NoticeKind;
  message: string;
  actor?: UserInfo;                    // renseigné dès que le fait a un auteur
  at?: string;                         // ISO 8601
  ref?: string;                        // lien permanent, clé de configuration, ou numéro de ligne selon `kind`
}

interface ComplianceResult {
  pr: PrRef;                           // §9.2.1 — identité de la PR jugée
  headSha?: string;                    // §6.4 — renseigné par le composant B **après** l'évaluation, relu
                                       // juste avant la publication ; `core/` ne le produit pas
  mode: 'off' | 'assist' | 'warn' | 'enforce';
  state: 'success' | 'failure' | 'neutral';  // calculé par core/ ; l'adaptateur ne fait que le traduire
  isDraft: boolean;                    // §6.2.4 — entre dans le calcul de `state`, jamais en échec sur un brouillon
  activatedAt: string | null;          // §6.2.3 — recopié de `EvaluationContext`, donc toujours la date
                                       // effective ; sans lui, `encodeSummary()` ne peut pas émettre
                                       // le champ `activated=`
  headline: string;                    // résumé humain d'une ligne (§6.3.1) — distinct de la ligne `cc/1`,
                                       // qui est machine et produite par `encodeSummary()`
  configFingerprint: string;           // configuration appliquée — seule empreinte comparée par A (§8.1.3, r. 2)
  coreVersion: string;
  formatDiagnostics: (Diagnostic & { comment: CommentInfo })[];   // critère 1 (§6.2.1) — toutes sévérités.
                                       // `comment` y est requis : le §6.3.1 exige un lien permanent par
                                       // diagnostic, et le `headline` regroupe les diagnostics par commentaire
  unresolvedBlockingThreads: ThreadInfo[];  // critère 2
  notices: Notice[];                   // tout ce que le §6.3.1 exige de rendre visible sans en faire un diagnostic
  docUrl: string;                      // documentation de la convention (§6.3.1)
  targetUrl?: string;                  // §6.3.1 — page servie par B portant la sortie complète ; requis
                                       // dès que la plateforme ne rend pas de corps de statut (§B.7)
  counts: { unresolvedThreads: number;         // §6.3.1 — les trois compteurs de la ligne `cc/1`, comme
            nonCompliantComments: number;      // champs et non enfouis dans `headline`, sans quoi l'encodeur
            warnings: number };                // devrait reparser une phrase en langue naturelle
  actions: { removeLabel?: string };   // §6.3.2 — ce que l'orchestrateur doit **faire** en plus de publier.
                                       // `evaluate()` est pure : elle demande le retrait de l'étiquette,
                                       // elle ne l'exécute pas (`removeLabel()`, §9.2.4)
  blockingThreadIds: string[];         // §6.1 — les fils bloquants observés **à ce tour**, résolus compris.
                                       // `unresolvedBlockingThreads` ne suffirait pas, un fil bloquant
                                       // résolu n'y figurant pas. Voir §6.1 pour la règle d'accumulation
  correctedThreadIds: string[];        // §6.1 — fils dont la racine remplit les deux conditions de
                                       // l'exception de correction : à **retirer** de l'ensemble persisté
  newFirstVerdicts: Record<string, { blocking: boolean; hadConflict: boolean }>;  // §6.1 — à persister pour
                                       // les racines observées pour la **première** fois, jamais réécrit
  exemption?: { by: UserInfo; at: string }; // §6.3.2
}

interface PublishedSummary {
  state: 'success' | 'failure' | 'neutral';  // le verdict, pas ses ingrédients — voir ci-dessous
  isDraft: boolean;
  exempted: boolean;                   // §6.3.2
  mode: 'off' | 'assist' | 'warn' | 'enforce';
  coreVersion: string;
  configFingerprint: string;
  activatedAt: string | null;          // §6.2.3 — permet à A de calculer `inScope` quand la date est posée
                                       // par le point d'entrée d'administration et non par le fichier
  unresolvedBlockingCount: number;     // des fils
  nonCompliantCommentCount: number;    // des commentaires, pas des diagnostics (§6.3.1)
  warningCount: number;                // des diagnostics (§6.3.1)
}
```

*`PublishedSummary` ne porte **aucune liste de fils**, délibérément.* Une liste aurait demandé un second format machine à publier, à reparser et à tenir synchronisé, sur une seule des deux plateformes — pour une information que l'extension a déjà sous les yeux : les fils sont dans le DOM de la page qu'elle décore. Le **décompte** vient donc du résumé publié, qui fait autorité, et les **ancres** du DOM local, qui les porte.

*`PublishedSummary` porte `state` pour la même raison que `ComplianceResult` : le §6.5 dit que l'extension « **reflète** l'état, elle ne le crée pas ». Sans ce champ, elle devrait le recalculer à partir du mode et des compteurs — donc juger — et elle se tromperait : sur une PR en brouillon ou exemptée, le serveur publie du vert avec des compteurs non nuls (§6.2.4, §6.3.2), et une extension qui déduirait « bloqué » griserait le bouton de merge d'une PR que la source de vérité laisse passer.*

```ts
// Seuls `pr` et `sequence` sont consommés : le §6.4 impose de relire l'état courant plutôt que de se
// fier au contenu de l'événement, et les trois sources de déclenchement produisent le même recalcul
// complet. `kind`, `actor` et `occurredAt` sont conservés pour la journalisation et le diagnostic
// d'exploitation, jamais pour un verdict — attribuer une édition à qui a déclenché un recalcul serait
// une accusation fausse (§6.1).
interface ReviewEvent {
  kind: 'comment.created' | 'comment.edited' | 'comment.deleted'
      | 'thread.resolved' | 'thread.unresolved' | 'pr.updated'
      | 'label.added' | 'label.removed'    // §6.3.2 — sans eux, l'exemption de PR n'est pas détectable
      | 'pr.readyForReview';               // §6.2.4 — sortie du brouillon
  pr: PrRef;
  actor: UserInfo;
  occurredAt: string;
  sequence: number;                    // attribué par le composant B, non par la plateforme (§6.4)
}

interface Disposable { dispose(): void; }
```

**Pourquoi `state` figure dans le résultat.** Sans lui, l'adaptateur devrait recalculer le verdict à partir du mode, des deux listes et de l'exemption — donc **juger**, ce que le §9.2.4 lui interdit — et il ne le pourrait pas de toute façon, la règle du brouillon (§6.2.4) dépendant d'un appel séparé. `core/` produit les trois états, `neutral` couvrant le délai de grâce du §6.4 ; l'adaptateur les traduit vers `GitStatusState` ou vers la conclusion d'un *check run*.

#### 9.2.2 Contrat de `core/`

Les deux contrats d'adaptateur des §9.2.3 et §9.2.4 sont typés à la virgule près. La fonction sur laquelle repose toute la thèse de parité du §2 ne l'était pas : `core/` n'apparaissait que comme « AST + config → diagnostics » dans l'arborescence du §9.1. Or c'est **la seule interface que les deux composants appellent**, et donc la seule dont un désaccord de signature produirait la divergence que ce document existe pour empêcher.

```ts
// La configuration du §8.2 une fois résolue et bornée, et le document de plancher du §8.1.1.
// Leur forme est celle de ces deux sections ; ils sont nommés ici parce que les signatures
// ci-dessous les prennent, et qu'une fonction dont l'entrée n'a pas de forme n'a pas de contrat.
type EffectiveConfig = /* §8.2, toutes clés résolues, dans les bornes du §8.1.1 */ object;
type Floor           = /* §8.1.1, document de plancher */ object;

// Ce que `core/` ne peut pas lire lui-même, et que le composant B lui passe (§6.4, stockage).
// Trois résultats, et non deux : un fichier **absent** est le cas nominal du §8.1.5 et n'a rien de dégradé ;
// une lecture **impossible** l'est, et c'est elle — et elle seule — qui désarme la condition 4 du §5.4.
// Les confondre ferait qu'un dépôt sans fichier de configuration éteindrait `enforce` côté extension.
type ConfigRead =
  | { status: 'found'; text: string }
  | { status: 'absent' }
  | { status: 'unreachable'; reason: string };

// Tout ce qu'une évaluation prend en entrée. Rassemblé en un objet parce que le §6 en ajoute
// régulièrement, et qu'une liste de paramètres positionnels aurait fini par diverger de lui.
interface EvaluationInput {
  pr: PrRef;
  platform: PlatformProfile;           // §3.5.1 étages −1 et 0 ; sans lui, aucun bloc de suggestion
                                       // ni commande slash n'est reconnu côté serveur, et `CA-06` échoue
  threads: ThreadInfo[];
  loose: { comment: CommentInfo; zone: Zone }[];   // §4.1 — la zone décide de `scope.validateReviewSummary`,
                                       // `CommentInfo` seul ne la porte pas
  config: EffectiveConfig;
  configNotices: Notice[];             // remontées par `resolveConfig()` : elles sont **transportées** vers
                                       // `ComplianceResult.notices`, que le §6.3.1 déclare obligatoire.
                                       // Elles ne commandent aucun verdict — c'est le rôle de `forceState`,
                                       // que l'orchestrateur arme après les avoir lues
  forceState?: { state: 'neutral' | 'failure'; because: NoticeKind };  // le verdict est imposé, quoi que
                                       // disent les listes : `neutral` pour le délai de grâce (§6.4), la
                                       // configuration disparue et la configuration invalide sous un mode
                                       // inférieur à `enforce` ; `failure` pour une configuration invalide
                                       // **sous `enforce`** (§8.1.5). C'est **l'orchestrateur** qui
                                       // l'arme, en inspectant les `notices` rendues par `resolveConfig()`
  ctx: EvaluationContext;
}

// Ce que `core/` ne peut pas lire lui-même, et que le composant B lui passe (§6.4, stockage).
interface EvaluationContext {
  activatedAt: string | null;          // §6.2.3 — la date **effective**, résolue par l'orchestrateur :
                                       // celle de la configuration effective si elle en porte une, sinon
                                       // celle du stockage (§6.4), sinon `null`
  isDraft: boolean;                    // §6.2.4
  exemption?: { by: UserInfo; at: string };   // §6.3.2 — telle que **posée**, pas telle qu'admise :
                                       // c'est `evaluate()` qui vérifie l'habilitation et peut la refuser
  isOverrideMember: (u: UserInfo) => boolean;   // §6.1, §6.1.1, §6.3.2 — appartenance à
                                       // `resolverOverrideGroup`, **résolue en amont** par l'orchestrateur
                                       // via `isInGroup()` (§9.2.4) pour **tout auteur apparaissant sur la
                                       // PR** — restreindre aux résolveurs et poseurs d'étiquette omettrait
                                       // les auteurs de réponses `decision`, et les refuserait toutes.
                                       // La décision reste dans `core/` ; seule la lecture en sort
  knownBlockingThreadIds: string[];    // §6.1 — monotonie du caractère bloquant
  firstVerdicts: Record<string, { blocking: boolean; hadConflict: boolean }>;  // §6.1, par racine
}

// Tout ce qui est propre à une plateforme entre par ici, et `core/` n'en connaît rien d'autre.
// Sans cet objet, les étages −1 et 0 du §3.5.1 obligeraient `core/` à embarquer des marqueurs de
// plateforme, ce que le §9.1 lui interdit — et l'affirmation « implémenter les deux contrats suffit »
// (§9.2.4) serait fausse : ajouter une plateforme demanderait d'éditer `core/`.
interface PlatformProfile {
  id: string;                          // 'github', 'azdo', ou toute autre — jamais une union fermée
  suggestionInfoString: string | null; // §3.5.1 étage 0 ; `null` = la plateforme n'a pas d'étage 0
  slashPrefixes: string[];             // §4.2 — commandes reconnues par la plateforme
}

interface ValidationInput {
  body: string;                        // corps brut, avant le prétraitement du §3.4.1
  platform: PlatformProfile;           // §3.5.1 étages −1 et 0
  isSystemGenerated: boolean;          // §4.2 — message de plateforme, entrée de timeline ; l'adaptateur
                                       // le traduit depuis les marqueurs de sa plateforme, il ne juge pas
  zone: Zone;                          // §4.1, défini au §9.2.3 — pilote `scope.validateReplies`
                                       // (`zone === 'reply'`) et `scope.validateReviewSummary` ; `'conversation'` couvre le commentaire
                                       // général hors diff, `'review-body'` le corps d'une revue en lot
  canCarryBlockingState: boolean;      // §4.1
  author?: UserInfo;                   // côté serveur, l'auteur du commentaire ; côté saisie, l'utilisateur
                                       // courant (`getCurrentUser()`), sans quoi un compte de `exemptUsers`
                                       // recevrait à la frappe des diagnostics que le serveur n'émettra pas
  comment?: CommentInfo;               // idem — renseigné côté serveur, jamais côté saisie
}

// Les fonctions que A et B appellent à l'identique. Aucune ne fait d'entrée-sortie :
// l'épinglage et la lecture du stockage restent en dehors (§9.2.4).
function validate(input: ValidationInput, config: EffectiveConfig): Diagnostic[];   // §3.5
function isBlocking(input: ValidationInput, config: EffectiveConfig): boolean;      // §3.3
function resolveConfig(floor: Floor, org: ConfigRead, repo: ConfigRead,
                       pinned: EffectiveConfig | null, previouslyEvaluated: boolean
                      ): { config: EffectiveConfig; notices: Notice[] };            // §8.1.2, §8.1.3 r. 1
function fingerprint(config: EffectiveConfig): string;                              // §8.1.3, r. 2
function evaluate(input: EvaluationInput): ComplianceResult;                        // §6.2.1, §6.3.1
function encodeSummary(result: ComplianceResult): string;                           // §6.3.1, ligne `cc/1`
function decodeSummary(line: string): PublishedSummary | null;                      // §9.2.3
```

**Ce qui est épinglé, et quand.** Sur une **première** évaluation, l'appelant passe `pinned: null` et la configuration rendue **est** celle à épingler : le composant B la persiste telle quelle et ne la réécrit jamais (§8.1.3). Sur les suivantes, la valeur rendue est déjà le mélange de l'épinglée et du vivant — l'épingler à son tour écraserait l'original et viderait la règle de son sens. Lorsque la règle 3 du §8.1.3 impose une seconde passe sans cache, c'est le résultat de la **seconde** qui est épinglé.

`previouslyEvaluated` est ce qui départage les deux lignes « fichier absent » du §8.1.5 : sans lui, `resolveConfig()` ne peut pas produire `config-vanished`, et la contre-épreuve de `CA-29` n'a aucun chemin d'implémentation.

`encodeSummary()` et `decodeSummary()` sont **dans `core/`, et pas dans les adaptateurs**, pour la raison que le §6.3.1 donne : un seul format, écrit et testé une seule fois. Les mettre côté adaptateur en donnerait deux, et la seule couture entre les deux composants serait la première à diverger.

`resolveConfig()` rend **aussi des `notices`**, et non la seule configuration : `floor-override`, `invalid-config` avec sa ligne fautive, `config-warning`, `config-vanished` et `unsupported-version` naissent tous de la résolution, et d'elle seule. Sans ce second membre, cinq `NoticeKind` du §9.2.1 n'auraient aucun producteur, alors que le §6.3.1 les déclare obligatoires dans la sortie.

`evaluate()` est la fonction qui produit le verdict — `state` compris, que le §9.2.1 et le §B.7 attribuent tous deux à `core/`. Sans elle, ce verdict n'aurait aucun producteur déclaré, et l'adaptateur serait ramené à le recalculer, ce que le §9.2.4 lui interdit. Son `EvaluationContext` porte ce que `core/` ne peut pas lire lui-même : l'état brouillon, l'exemption de PR, les fils déjà observés comme bloquants et les verdicts de première observation (§6.4).

**L'épinglage n'est pas dans `core/`, il l'alimente.** `resolveConfig()` prend la configuration épinglée en **paramètre** : c'est le composant B qui la lit dans son stockage (§6.4) et la lui passe, parce qu'aucune de ces fonctions ne fait d'entrée-sortie. `core/` porte la **règle** de mélange — quelle valeur l'emporte, clé par clé (§8.1.3) —, pas l'accès à l'état. Le composant A passe `null` pour `pinned` et `false` pour `previouslyEvaluated` : il n'épingle pas (§8.1.3, règle 2), et la distinction entre les deux cas de fichier absent n'a d'effet que sur le statut publié, dont il n'est pas l'auteur.

`fingerprint()` mérite d'être ici plutôt que dans chaque composant : c'est la fonction qui décide si A et B « se voient » d'accord (§8.1.3, règle 2). Deux implémentations qui sérialiseraient la configuration différemment — ordre des clés, valeurs par défaut incluses ou non — produiraient un désaccord permanent sur des configurations identiques. Elle est **normativement dans `core/`**, et son entrée est la configuration effective, jamais le texte des fichiers dont elle est issue.

**Son domaine est clos, et il exclut ce que l'extension ne peut pas connaître.** Partager la fonction ne suffit pas si les deux composants ne lui donnent pas le même objet. N'entrent dans l'empreinte que les clés qui **gouvernent le verdict** et que **les deux composants résolvent** :

`mode`, `formatSeverity`, `severities`, `labels` (`id`, `enabled`, `blockingByDefault`, `alwaysNonBlocking`, `aliases`), `decorations`, `rules`, `scope`, `exemptUsers`, `allowlistPatterns`, `activation.activatedAt`.

En sont **exclues** : `server.*` et `exemptionLog.*`, qui n'existent que côté serveur ; `telemetry.*`, `language`, `badgeStyle` et `labels[].color`, qui ne changent aucun verdict ; `configUrl`, `configCacheTtlSeconds` et `coreMinVersion`, qui décrivent la manière dont la configuration a été obtenue et non ce qu'elle dit. **Toute clé du §8.2 absente de la première liste est exclue, sans exception** — y compris `resolverOverrideGroup`, `overrideLabel`, `docUrl` et `labels[].icon`, et y compris une clé ajoutée au schéma plus tard : l'inscrire dans l'empreinte est un geste délibéré, jamais un effet de bord. `resolverOverrideGroup` mérite un mot, car il gouverne bien le critère 2 : il en est exclu parce que la règle est une **conjonction** — gouverner le verdict *et* être résolu par les deux composants —, et que l'extension ne résout pas l'appartenance à un groupe (§10). Une clé hors de la liste ne doit jamais faire diverger l'empreinte, sans quoi la règle 2 du §8.1.3 signalerait un désaccord là où il n'y en a pas et désarmerait le blocage d'envoi en permanence.

`validate()` prend le **corps brut** et non une ligne prétraitée : le prétraitement du §3.4.1 est à l'intérieur, c'est ce qui garantit qu'aucun appelant ne puisse l'oublier ou le faire à sa façon. C'est la contrepartie de `CA-06`, dont le corpus est injecté **en amont** de ces fonctions, au niveau des adaptateurs.

#### 9.2.3 Contrat client (composant A)

```ts
// `Zone` dit *où vit* le commentaire : les quatre emplacements que le tableau du §4.1 distingue et qui
// peuvent porter un commentaire soumis à validation.
// Elle est employée par `core/` comme par les deux adaptateurs. Ce que *fait* l'utilisateur est une notion d'interface, portée
// séparément par `action` : le composant serveur ne la produit jamais, et une édition n'en reste
// pas moins située dans une zone.
type Zone = 'thread-root' | 'reply' | 'review-body' | 'conversation';

interface EditorContext {
  zone: Zone;                          // sans elle, le défaut « réponses non validées » (§4.1) est inapplicable
  action: 'compose' | 'edit';          // §4.3 — l'édition est un point de sortie au même titre que la
                                       // création. Aucune règle de validation n'en dépend : les deux
                                       // produisent le même `ValidationInput`. Le champ existe pour que
                                       // l'extension sache quel contrôle intercepter (§5.4)
  pr: PrRef;
  threadId?: string;                   // renseigné pour `zone: 'reply'` et pour toute `action: 'edit'`
  commentId?: string;                  // renseigné pour 'edit'
  canCarryBlockingState: boolean;      // §4.1 — pilote `W-NOT-BLOCKABLE`
  inScope: boolean;                    // périmètre d'activation de la PR (§6.2.3)
}

interface EditorHandle {
  id: string;
  element: Element;
  context: EditorContext;
}

interface SubmitControl {
  element: Element;
  kind: 'submit' | 'submit-and-resolve' | 'complete-pr';
}

interface PlatformAdapter {
  matches(url: URL): boolean;          // §2 — activation par domaine, `optional_host_permissions` (§A.4, §B.4)
  platformProfile(): PlatformProfile;  // §9.2.2 — marqueurs propres à la plateforme, passés à `validate()`
  getRepoConfig(pr: PrRef): Promise<ConfigRead>;      // §8.1.2 niveau 1 — fichier du dépôt, lu sur la session
  getOrgConfig(url: string | null): Promise<ConfigRead>;  // §8.1.2 niveau 2 — URL issue du canal de plancher
  observeEditors(cb: (editor: EditorHandle) => void): Disposable;  // §4.1 — zones ; l'appel du cb est l'instant
                                                                   // mesuré par la NFR d'injection (§10)
  getSubmitControls(editor: EditorHandle): SubmitControl[];  // §4.3 — tous les points de sortie, §5.4 — interception
  readValue(editor: EditorHandle): string;
  writeValue(editor: EditorHandle, text: string, caret?: number): void;  // §5.1, §5.2 — insertion de préfixe ;
                                                                          // stratégie d'écriture imposée par le §9.3
  getThreads(): Promise<ThreadInfo[]>;      // depuis le DOM de la page uniquement (§10) ; `resolution` vaut
                                           // 'unknown' si l'état n'y est pas rendu. Jamais d'appel d'API.
  getCompletionControl(): SubmitControl | null;   // §6.5 — désactivation visuelle du bouton de complétion.
                                       // `getSubmitControls()` ne renvoie **jamais** de contrôle de kind
                                       // 'complete-pr' : lui seul l'expose, et il n'est jamais intercepté
  getCurrentUser(): Promise<UserInfo>;      // depuis le DOM ; sert au rendu et à l'exemption d'auteur de
                                            // l'étage −1 (§3.5.1), jamais à une décision d'autorisation
  readPublishedResult(): PublishedSummary | null;   // lu dans le DOM, jamais par appel d'API (§8.1.3, §10)
}
```

**Ces deux méthodes sont les seules requêtes réseau de l'extension, et elles demandent leur justification.** Sans elles, l'extension ne connaît ni les labels, ni `activatedAt`, ni les seuils : elle valide contre les défauts produit et diverge du serveur sur le cas le plus banal — un dépôt qui a ajouté un label. Le §8.1.5 lui prescrit d'ailleurs trois comportements de repli sur le fichier de dépôt, ce qui suppose qu'elle le lise.

Il en faut **deux**, et pas seulement la première : le composant B résout trois niveaux (§8.1.2), et une extension qui n'en résoudrait que deux calculerait un `configFingerprint` qui ne peut **jamais** coïncider avec celui du serveur dès qu'une organisation renseigne le niveau 2. La règle 2 du §8.1.3 désarmerait alors le blocage d'envoi en permanence — le mode de défaillance exact que cette règle existe pour prévenir. Résoudre la même configuration des deux côtés n'est pas un confort, c'est la condition pour que l'empreinte veuille dire quelque chose.

Les deux lectures sont **mises en cache pour `configCacheTtlSeconds`** — valeur de la **configuration effective précédemment résolue**, ou 3600 s tant qu'aucune ne l'a été, la clé vivant dans le document qu'elle sert à mettre en cache. Lorsque le plancher impose la clé, il la fixe des deux côtés et la règle 4 est satisfaite par construction ; sinon, les deux composants convergent sur la même valeur dès la première résolution — comme côté serveur (§8.1.3, règle 4), et faites **hors du chemin critique du chargement de page** : la NFR de 50 ms du §10 porte sur ce chemin, et l'extension assiste avec la configuration précédemment mise en cache en attendant la réponse.

Elle est compatible avec le §10, qui interdit trois choses précises : détenir un jeton ou un secret, faire sortir du contenu de commentaire, de code ou de diff, et prendre une décision d'autorisation. Lire un fichier de configuration versionné, sur la **session déjà authentifiée** de la personne qui regarde la page, n'est aucune des trois : rien ne sort, rien n'est décidé, et le fichier est visible de quiconque a accès au dépôt.

Quand une lecture est **impossible** — route inaccessible, dépôt privé derrière une API à jeton, politique réseau —, la méthode renvoie `{ status: 'unreachable' }` et l'extension **se rabat sur le niveau inférieur, en signalant son état dégradé** dans les options et dans son indicateur. Elle ne bloque jamais l'envoi sur une règle qu'elle n'a pas pu lire : le composant B reste la source de vérité, et c'est lui qui tranchera.

Le champ `context` est indispensable : sans lui, l'extension ne peut pas distinguer une racine de fil d'une réponse, ni une rédaction d'une édition — donc ne peut pas appliquer le tableau du §4.1, dont c'est pourtant le cœur, à commencer par son défaut « les réponses ne sont pas validées ».

#### 9.2.4 Contrat serveur (composant B)

```ts
interface ServerPlatformAdapter {
  platformProfile(): PlatformProfile;                // §9.2.2 — même profil que côté client, même source
  listOpenPrs(repo: { host: string; scope: string[] }): Promise<PrRef[]>;  // §6.4 source 2 et §6.2.4 :
                                       // sans elle, la réconciliation périodique et le rapport à blanc —
                                       // tous deux normatifs — n'ont aucun point d'entrée, `parseEvent()`
                                       // étant le seul autre producteur de `PrRef`
  matchesWebhook(payload: unknown): boolean;         // §6.4 — déclenchement, voie nominale
  verifySignature(payload: unknown, headers: Record<string, string>): boolean;  // §6.4
  parseEvent(payload: unknown): Omit<ReviewEvent, 'sequence'>;  // §6.4 — la séquence est attribuée par B,
                                                                // jamais déduite de la charge utile
  fetchThreads(pr: PrRef): Promise<ThreadInfo[]>;
  fetchStandaloneComments(pr: PrRef): Promise<{ comment: CommentInfo; zone: Zone }[]>;  // §4.1 — zones
                                        // `'conversation'` et `'review-body'` : soumises au critère 1, hors de tout fil
  fetchConfigFile(pr: PrRef,
                  opts?: { bypassCache: boolean }): Promise<ConfigRead>;   // §8.1.2 niveau 1 — branche
                                                             // par défaut ; caché comme le niveau 2
  fetchOrgConfig(url: string | null,
                 opts?: { bypassCache: boolean }): Promise<ConfigRead>;  // §8.1.2 niveau 2 ; `bypassCache`
                                                             // est ce que la règle 3 du §8.1.3 exige
  fetchLabels(pr: PrRef): Promise<{ name: string; by?: UserInfo; at?: string }[]>;  // §6.3.2 — `by` et `at`
                                       // sont absents là où la plateforme n'expose pas la provenance
                                       // d'une étiquette ; voir §6.3.2 et les annexes
  fetchHeadSha(pr: PrRef): Promise<string>;          // §6.4 — relu juste avant publication
  isDraft(pr: PrRef): Promise<boolean>;              // §6.2.4
  publishStatus(pr: PrRef, result: ComplianceResult): Promise<void>;  // §6.3.1 — format. Appelée seulement
                                       // quand le mode autorise une publication : c'est l'orchestrateur
                                       // qui en décide (§6.2.2), jamais l'adaptateur
  removeLabel(pr: PrRef, name: string): Promise<void>;   // §6.3.2 — remise à zéro de l'exemption ; seule écriture
                                                         // du contrat en dehors du statut
  isInGroup(user: UserInfo, group: string): Promise<boolean>;  // resolverOverrideGroup (§6.1.1)
}
```

*Aucune méthode ne demande à la plateforme qui a le droit de résoudre un fil.* Les deux plateformes du périmètre l'autorisent à tout le monde (§A.6, §B.5), et la règle du §6.1 est de toute façon vérifiée **après coup** par `core/` sur `ThreadInfo.resolvedBy`. Une telle méthode n'aurait donc aucun appelant.

**Ce qui reste hors des adaptateurs, donc dans `core/` :** le calcul de conformité, la résolution de la configuration et la **règle** de mélange de sa partie épinglée — l'accès au stockage restant en dehors (§9.2.2) —, la normalisation d'entrée, et la décision de **retenir ou non** une résolution au sens du §6.1. Un adaptateur traduit et transporte ; il ne juge jamais.

La frontière passe exactement là : **traduire `fixed` ou `wontFix` en `ResolutionState.resolved` est une traduction**, et elle appartient donc à l'adaptateur — les tables des §A.6 et §B.5 sont sa spécification. **Décider qu'une résolution est retenue** parce que son auteur est celui du commentaire racine est un jugement, et il appartient à `core/`. C'est pourquoi `ThreadInfo.resolution` est déjà typé `ResolutionState` à la frontière : ce que l'adaptateur livre est normalisé, pas arbitré.

Ce découpage définit également le point d'extension pour une plateforme non prévue au périmètre initial (§1, non-objectifs) : implémenter les deux contrats et les types ci-dessus suffit à intégrer une nouvelle plateforme sans toucher au reste de `core/`. C'est une affirmation opposable — toute règle du corps du document qui exigerait une donnée qu'aucune méthode ne rend serait un défaut de cette section, pas une liberté d'implémentation.

### 9.3 Contraintes d'implémentation connues

Les contraintes concrètes d'implémentation par plateforme (type d'éditeur, écriture programmatique, navigation SPA, gestion des domaines) sont documentées dans les annexes A et B, qui suivent la même trame — quatre rubriques communes en tête de chacune, complétées par ce qui est propre à la plateforme.

**Stratégie d'écriture programmatique — commune aux deux plateformes.** Les éditeurs pilotés par un état applicatif absorbent l'affectation directe de `value` : le champ paraît modifié, mais le contenu soumis ne l'est pas. C'est vrai des vues React de GitHub (§A.2) comme, probablement, de l'éditeur Azure DevOps (§B.2). Les adaptateurs emploient donc **la même méthode partout** — passer par le setter natif de la propriété puis émettre un événement `input` qui remonte, ou recourir à une commande d'insertion de texte du navigateur — et **jamais** `element.value = …`.

**Risque à lever :** un *spike* technique valide cette stratégie sur les deux plateformes, en commençant par établir le type réel de l'éditeur Azure DevOps. Il est mené **en parallèle** du développement de `core/` (§14). Son volet GitHub conditionne la seule **insertion de préfixe** de `P2` (`CA-02`) et doit donc aboutir tôt ; le reste de `P2` — validation, retour visuel, diagnostics — n'en dépend pas et démarre sans l'attendre. La barre d'outils (§5.1) et la saisie rapide (§5.2) en relèvent en revanche pleinement : l'une comme l'autre écrivent dans l'éditeur, et sans le spike il n'en reste que des boutons inertes. Ce risque n'est **pas** spécifique à Azure DevOps, et le dimensionnement de `P2` doit en tenir compte.

### 9.4 Résilience

- Les sélecteurs DOM sont centralisés dans un fichier unique par adaptateur, versionné et documenté.
- En cas d'échec de détection : **dégradation de sélecteur** — désactivation locale de la zone concernée, sans rapport ni avec le mode `off` de la configuration (§7) ni avec l'**état dégradé** du §5.4, qui désigne une configuration non lue — avec journalisation locale et remontée télémétrique agrégée si activée (§10). L'extension ne doit **jamais** empêcher l'utilisation normale de la plateforme.
- Test de fumée automatisé (Playwright), exécuté quotidiennement, pour détecter les ruptures de sélecteurs après une mise à jour d'éditeur. Le détail des cibles à couvrir (versions de plateforme à tester) est précisé dans les annexes A et B.

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

**Les prérequis au passage en `enforce`**, dispersés dans le corps du document et rassemblés ici parce qu'ils conditionnent `P6`. Les trois premiers valent partout :

1. **`resolverOverrideGroup` est désigné** (§8.2). Sans groupe habilité, les deux soupapes du §6.3 sont inertes en même temps — ni `decision`, ni exemption de PR — et un fil dont l'auteur est indisponible bloque la PR sans recours.
2. **La procédure de retour arrière est écrite et son exécutant désigné** (§6.3.3), y compris l'ordre des opérations.
3. **Le check est déclaré obligatoire, et l'option interdisant le contournement des règles est activée** (§6.2.2, annexes) — sans quoi O3 n'est pas satisfait pour les administrateurs.

Sur **Azure DevOps**, deux prérequis s'ajoutent, tous deux tranchés par le spike `P1'` :

4. **La provenance des étiquettes est établie, ou le repli du §6.3.2 est en place** (§B.6) — sans l'un ou l'autre, l'exemption de PR n'a pas de chemin vérifiable, et c'est une des deux soupapes du §6.3.
5. **La latence de détection respecte la NFR de 60 s** (§B.7) — voie événementielle établie, ou `server.reconcileIntervalSeconds` ≤ 60.

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
- **Provenance d'une étiquette** (§6.3.2) : exposée. L'API de timeline d'une *issue* rend les événements `labeled` avec leur acteur et leur horodatage, ce qui permet de vérifier l'habilitation du poseur et de journaliser l'exemption. Le mécanisme d'exemption par étiquette s'applique donc ici tel qu'il est décrit.
- **`resolverOverrideGroup`** : un slug d'équipe de l'organisation, sous la forme `org/team-slug`. L'adaptateur serveur le résout via l'API des équipes ; l'appartenance est transitive pour les équipes imbriquées.
- **Bloc de suggestion** (§4.2, étage 0 du §3.5.1) : un bloc de code délimité dont l'*info string* est `suggestion` — ` ```suggestion ` —, inséré par le bouton dédié de l'éditeur de commentaire de diff. C'est ce marqueur, et lui seul, qui déclenche le label implicite.
- **Comptes de service.** `dependabot[bot]`, `github-actions[bot]` et `azure-pipelines[bot]` — cette dernière identité étant le login de l'application GitHub d'Azure Pipelines, et non un compte Azure DevOps — figurent typiquement dans `exemptUsers` (§8.2).

### A.8 Mise en œuvre serveur (composant B)

- **GitHub App** — mise en œuvre nominale —, abonnée aux événements `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`, `pull_request_review_thread`. Ce dernier est disponible comme webhook de dépôt, d'organisation et d'App, et lui seul notifie la résolution d'un fil.

  Une **GitHub Action ne peut pas s'y substituer sans perte** : `pull_request_review_thread` ne figure pas parmi les événements déclencheurs de workflows, qui n'offrent que `pull_request`, `pull_request_review`, `pull_request_review_comment` et `pull_request_target`. Une mise en œuvre par Action ne verrait donc les résolutions de fil qu'à la réconciliation périodique (§6.4), avec le délai correspondant — c'est un choix possible, mais il faut l'assumer et régler `server.reconcileIntervalSeconds` en conséquence.
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
- **Provenance d'une étiquette : non exposée par l'API documentée.** `GET …/pullRequests/{id}/labels` rend des `WebApiTagDefinition`, dont les seuls champs sont `active`, `id`, `name` et `url` — ni l'auteur de la pose, ni sa date. Le modèle de PR expose les étiquettes sous la même forme. **En l'état, le contrat `fetchLabels()` n'est donc pas implémentable ici**, et le repli du §6.3.2 s'applique : l'étiquette seule n'accorde aucune exemption, qui passe par le point d'entrée d'administration du §6.2.4.
  Le spike `P1'` (§14) tranche : soit il établit une source fiable de provenance — journal d'audit de l'organisation, ou tout autre point d'API non identifié ici —, soit le repli devient définitif sur cette plateforme. **`P5` ne démarre pas côté Azure DevOps sans cette réponse** : c'est le mécanisme d'urgence du §6.3 qui en dépend.
- **`resolverOverrideGroup`** : le nom d'un groupe de sécurité Azure DevOps, à l'échelle de l'organisation ou du projet, sous la forme `[Scope]\Nom du groupe`. L'appartenance est transitive pour les groupes imbriqués.
- **Bloc de suggestion** (§4.2, étage 0 du §3.5.1) : Azure DevOps offre la même fonctionnalité — icône d'ampoule sous la zone de commentaire d'une ligne de diff, bouton *Apply changes* côté auteur — et la rend elle aussi sous forme de **bloc de code délimité**. L'*info string* exact n'est pas documenté et reste **à établir par le spike `P1'`** (§14), qui ouvre déjà cet éditeur (§B.2) : c'est une lecture, pas un développement. Tant qu'il ne l'est pas, l'adaptateur Azure DevOps ne reconnaît aucun bloc de suggestion et ces commentaires relèvent du cas général — un `suggestion:` explicite y reste toujours accepté.
- **Comptes de service.** Les commentaires de pipeline sont postés par `Project Collection Build Service ({Org})` ou `{Project} Build Service ({Org})` selon la configuration — ce sont ces identités qui figurent dans `exemptUsers` (§8.2). L'identité `azure-pipelines[bot]` n'existe **pas** sur Azure DevOps : c'est le login de l'application GitHub du même produit, et elle relève de l'annexe A.
- **Versions à couvrir en test** (§9.4) : Azure DevOps Services (continu) et les versions d'Azure DevOps Server encore supportées — liste à arrêter avec la même méthode qu'en A.1.

### B.7 Mise en œuvre serveur (composant B)

- Service Hook sur `Pull request created`, `Pull request updated`, `Pull request commented on` → déclenche une Azure Function.
- **Résolutions de fil et étiquettes.** Aucun de ces trois hooks ne notifie un changement de statut de fil ni la pose d'une étiquette. Aucune dérivation n'est nécessaire pour autant : `Pull request updated` **déclenche une réévaluation complète**, et l'étape 6 du §6.4 relit de toute façon l'état courant plutôt que le contenu de l'événement. Les valeurs `thread.resolved`, `label.added` et leurs symétriques (§9.2.1) restent donc sans producteur sur cette plateforme, ce qui est sans conséquence : elles ne sont consommées par rien.
- **Réserve de latence, opposable.** Un changement de statut de fil qui ne s'accompagne d'aucune mise à jour de PR n'est vu qu'à la réconciliation périodique, dont l'intervalle par défaut — 900 s — **excède la NFR de 60 s du §10**. Laissée à l'état de remarque, cette observation ferait qu'une configuration par défaut du produit contreviendrait à sa propre exigence non fonctionnelle.

La règle est donc : **sur Azure DevOps, le mode `enforce` exige que `server.reconcileIntervalSeconds` soit ≤ 60**, à moins que le spike `P1'` n'établisse qu'un changement de statut de fil émet bien un `Pull request updated` — auquel cas la voie événementielle porte la latence et l'intervalle par défaut suffit. Le composant B émet un `config-warning` (§9.2.1) à chaque évaluation d'un dépôt Azure DevOps en `enforce` dont l'intervalle dépasse 60 s sans que cette voie soit établie. Le coût en appels d'API d'une réconciliation à 60 s est réel, et c'est précisément ce que le spike permet d'éviter.
- **`targetUrl` obligatoire** (§6.3.1) : le statut ne portant pas de corps, c'est elle qui donne accès à la sortie complète. Elle pointe vers une page servie par le composant B.
- La fonction publie un **PR Status** via
  `POST https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/statuses?api-version=7.1`
  avec, dans sa **description**, la ligne de résumé du §6.3.1 — `state`, `isDraft`, `exempted`, `mode`, `activatedAt`, `coreVersion`, `configFingerprint`, trois compteurs — et un état pris dans `GitStatusState` : `succeeded`, `failed`, et `notApplicable` pour le `state: 'neutral'` du §9.2.1 — celui du délai de grâce (§6.4) et de la configuration disparue (§8.1.5). L'ensemble complet de l'énumération est `notSet`, `pending`, `succeeded`, `failed`, `error`, `notApplicable`. Le `state` est calculé par `core/` selon les critères du §6.2.1 ; l'adaptateur ne fait que le traduire. Le paramètre `api-version` est **obligatoire**.
- **Point structurant :** le statut doit porter un `context: { genre, name }`, et c'est le couple **`genre/name`** — et non un nom nu — qui lie le statut publié à la policy de branche. Sans lui, la policy ne trouvera jamais le statut et O3 ne sera pas satisfait.
- **Restitution lisible par l'extension** (§6.3.1) : un PR Status ne porte ni corps ni Markdown — un état, une **description d'une ligne**, une `targetUrl` et le `context`. C'est la ligne `cc/1` qui y loge, avec tous ses champs ; la sortie humaine est derrière la `targetUrl`. `readPublishedResult()` y restitue le **même** `PublishedSummary` que sur GitHub, et le bandeau du §5.5 tire ses ancres du DOM, comme partout. `CA-03` et `CA-32` sont donc passables ici comme là ; c'est précisément pour cela que le résumé est une ligne de texte et non un document.
- Ce statut est déclaré comme **policy de branche obligatoire** (*Status checks*), en le référençant par ce même couple `genre/name` → complétion bloquée nativement.
- Alternative sans code : policy native *Check for comment resolution*, mais elle ne sait pas distinguer bloquant / non bloquant — insuffisante pour satisfaire O3 telle quelle.
