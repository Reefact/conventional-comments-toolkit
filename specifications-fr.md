# Spécification — « Conventional Comments Toolkit »

**Cibles :** GitHub (github.com, Enterprise Cloud / EMU, Enterprise Server), Azure DevOps (Services, Server) et GitLab (gitlab.com ; Dedicated et Self-Managed : à vérifier, §C.1)
**Statut :** Draft v0.2 — à valider par l'équipe
**Type de document :** spécifications communes (indépendantes de la plateforme) + annexes par plateforme

---

## 1. Contexte et objectif

L'équipe a adopté [Conventional Comments](https://conventionalcomments.org/) pour les commentaires de revue de code, actuellement sans contrainte technique. L'objectif est de passer d'une convention *encouragée* à une convention *outillée*, puis, si l'équipe le choisit, *exigée à la saisie*, sur les plateformes de revue de code utilisées en parallèle.

### Objectifs

| # | Objectif | Priorité |
|---|----------|----------|
| O1 | Tout commentaire de revue respecte le format Conventional Comments | Must |
| O2 | L'écriture au format conventionnel est plus rapide que l'écriture libre | Must |
| O3 | Les **fils** bloquants non résolus d'une PR sont signalés à qui la consulte | Must |
| O4 | Expérience identique et cohérente entre les plateformes supportées | Must |
| O5 | Adoption progressive, sans blocage brutal du flux de travail existant | Should |
| O6 | Mesure de l'adoption (taux de conformité, répartition des labels) | Could |

### Non-objectifs

- Ne concerne **pas** les messages de commit (voir Conventional Commits, sujet distinct).
- Ne remplace **pas** les linters, analyseurs statiques ou revues automatisées par IA.
- Ne juge **pas** la qualité ou la pertinence du contenu d'un commentaire, uniquement sa **forme**.
- Ne gère pas Bitbucket ou Gerrit (extensibilité prévue, implémentation hors périmètre — voir §9.2). GitLab, d'abord rangé ici, entre dans le périmètre : décision du propriétaire, 2026-11-08, annexe C. Ce qui rend l'ajout d'une plateforme envisageable n'est pas qu'il soit devenu moins exigeant, mais qu'il soit outillé : un adaptateur se construit désormais avec l'assistance d'une IA, en suivant un protocole qui mesure la plateforme avant d'écrire une ligne (captures réduites, sélecteurs justifiés par une capture, tests sur pages réelles), et le même protocole sert à anticiper ses évolutions (canari en ligne, recapture d'un état). Une plateforme de plus reste une décision du propriétaire, et passe par sa propre annexe.
- Ne contrôle **pas** la complétion d'une PR : le produit est une extension navigateur, et rien d'autre (§2, décision du propriétaire, 2026-11-10).

---

## 2. Avertissement d'architecture : périmètre du navigateur

> **Quatre notions employées avant d'être définies, si vous lisez dans l'ordre.** Les **modes de fonctionnement** (`off`, `assist`, `enforce`) sont définis au §7 ; le **plancher** de configuration, et les **bornes** qui le portent, au §8.1.1 ; le **fil bloquant** au §6.1 ; la notion de commentaire **conforme** au §3.5.2. Tout ce qui suit y renvoie sans les redéfinir.

> **Point structurant.** Une extension navigateur agit **côté client uniquement**. Elle peut empêcher un utilisateur de cliquer sur un bouton, mais elle ne peut pas empêcher la publication d'un commentaire via l'API REST/GraphQL, une CLI, un IDE, un autre navigateur, ou un poste sans l'extension.

**Le produit est cette extension, et elle seule.** Le document la nomme aussi **composant A**. Elle assiste la rédaction, valide en temps réel, peut bloquer l'envoi d'un commentaire non conforme (§5.4) et signale les fils bloquants non résolus d'une PR (§5.5). Ce sont des garanties de confort et de prévention : l'extension ne se contourne pas, elle se désactive — l'API, une CLI, un autre navigateur ou un poste sans l'extension y suffisent, et cela ne demande aucun droit particulier.

**Le produit ne contrôle pas la complétion d'une PR** (décision du propriétaire, 2026-11-10). Une rédaction antérieure décrivait un second composant, un vérificateur exécuté dans l'intégration continue de la plateforme, qui publiait un statut de conformité opposé au merge. Il est retiré, et avec lui ce qui n'existait que pour lui : le statut publié et sa relecture par l'extension, la gouvernance des résolutions de fil, l'exemption de PR, le périmètre d'activation, et la comparaison des empreintes de configuration. O3 (§1) se lit en conséquence : les fils bloquants non résolus sont **signalés**, jamais empêchés de fusionner.

*Sans valeur normative : chaque équipe peut, si elle le souhaite, s'appuyer côté intégration continue sur les options natives de sa plateforme, par exemple la résolution obligatoire des conversations.*

**L'extension est un seul produit.** Une seule extension embarque un adaptateur par plateforme supportée (voir §9.2) ; chaque adaptateur n'est activé que sur les hôtes explicitement autorisés par l'utilisateur ou par la politique d'entreprise (`optional_host_permissions`, détaillé en annexes A et B). Cela évite de multiplier les extensions à déployer et à maintenir, tout en gardant les permissions minimales par poste.

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

Nous durcissons donc **la forme du préfixe** — casse du label, position du deux-points, syntaxe des décorations (§3.3) — parce que c'est ce qui rend le commentaire analysable par une machine. En revanche nous ne touchons **pas au sujet** : sa rédaction relève du contenu, que le §1 place explicitement hors périmètre.

Deux tolérances assumées : l'amont écrit ses décorations sans espace après la virgule (`(ux,non-blocking)`), nous acceptons les deux formes ; et les écarts de **style** sur les décorations — casse, espaces de bordure, doublon — sont des avertissements corrigeables en un clic. Les défauts de **syntaxe**, eux, restent des erreurs : la frontière exacte est posée au §3.3.

**Au-delà de l'amont, sur un terrain qu'il n'aborde pas.** La même page ne dit **rien** du geste de *répondre* à une remarque : elle décrit comment ouvrir une discussion, jamais comment la continuer. Et elle invite explicitement à s'écarter de sa liste — « *Feel free to diverge from this specific list of labels if it seems appropriate.* »

Ce document en a déjà usé une fois, sans le dire : `decision` (§3.2) est une addition propre à cette boîte à outils, absente de la liste de l'amont. Les **labels ajoutés** du §3.2 — les labels de réponse et `reviewed` — en sont une seconde, livrée **activée** : une équipe qui veut s'en tenir à la liste de l'amont les désactive (§8.2). Ni les uns ni l'autre ne font partie de Conventional Comments, et rien dans le produit ne doit laisser croire le contraire — ni l'interface, ni la documentation. C'est une extension volontaire et retirable, qui s'énonce comme telle.

La formulation compte, et elle est **factuelle plutôt que défensive** : nous n'étendons pas une norme, nous faisons ce que la norme dit qu'on peut faire, sur un terrain qu'elle n'occupe pas. C'est aussi pourquoi ce vocabulaire n'a **pas** de nom propre — « labels de réponse », en minuscules, et non « Extended Conventional Comments » : un nom propre bâti sur celui de l'amont est une revendication de filiation, que la phrase de désaveu passerait ensuite son temps à démentir.

### 3.2 Labels

Liste par défaut (configurable — voir §8). La colonne « Bloquant par défaut » détermine si un fil est bloquant au sens du §6.1, donc signalé par le bandeau du §5.5.

**Deux types de labels.** Chaque label a un **type** (`labels[].kind`, §8.2). Un label `remark` **ouvre un point** : c'est le cas des labels de Conventional Comments et de `reviewed`. Un label `reply` **n'en ouvre aucun** : il répond à un point. Le produit en livre cinq : `decision`, qui répond à un point en actant qu'on ne le traitera pas, et les quatre labels de réponse, plus bas. Le type ne change **aucun verdict** — ni la validation, ni le caractère bloquant, ni la résolution d'un fil. Il range le bouton dans sa zone de la barre d'outils (§5.1) et sépare les indicateurs (§12). Un label qu'une équipe déclare est `remark`, sauf si elle écrit le contraire.

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
| `decision` | Acte le choix de **ne pas** traiter un point soulevé, en énonçant pourquoi. Employé en réponse dans un fil bloquant — voir §6.1.1. De type `reply`. | Non | **Oui** |

Conventional Comments en compte trois de plus : `typo`, `polish`, `quibble`. Les deux premiers sont livrés **activés**, comme tous les autres labels du produit ; une équipe désactive ceux qu'elle ne veut pas, une entrée par label (§8.1.4). **`quibble` est livré désactivé**, et c'est la seule exception. Il reste livré, par fidélité à la liste de l'amont, mais conventionalcomments.org le définit lui-même comme un `nitpick` sous un autre nom — « Quibbles are very much like nitpick, except it does not conjure up images of lice » —, et deux boutons pour un même sens ne laissent qu'un choix arbitraire, qui disperse un même geste sur deux labels et deux lignes des indicateurs du §12. Un dépôt qui y tient l'active d'une entrée, `{"id": "quibble", "enabled": true}` ; son abréviation `?qui` ne se déplie qu'alors (§5.2).

**Labels de réponse — extension du produit, livrés activés.** Conventional Comments outille très bien la **remarque** de revue et ne dit rien de la **réponse** à une remarque (§3.1). La conséquence est concrète : demander que *tous* les commentaires d'une PR respectent la convention — ce que `scope.validateReplies` (§4.1) permet — condamne aujourd'hui à écrire `note: corrigé` ou `thought: bien vu`, c'est-à-dire à détourner des labels dont ce n'est pas le sens. Les quatre labels ci-dessous comblent ce manque, et rien d'autre.

| Label | Description | Bloquant par défaut | Toujours non bloquant | Alias |
|-------|-------------|:---:|:---:|---|
| `thanks` | Remercie, sans prendre position sur le point ni sur le code. | Non | **Oui** | `thx` |
| `done` | Le code a changé à la suite de la remarque — le diff est à relire. | Non | **Oui** | `fixed` |
| `ack` | Reçu et accepté ; le code n'a pas changé. | Non | **Oui** | `acknowledged` |
| `disagree` | Refuse la remarque, et le sujet dit pourquoi. N'emporte aucune autorité et ne résout rien. | Non | **Oui** | — |

Ils sont livrés **activés**, et de type `reply`. Une équipe qui veut s'en tenir à Conventional Comments les désactive, une entrée par label dans `labels[]` (§8.1.4) — `{"id": "done", "enabled": false}` —, comme n'importe quel label. Il n'existe **aucune clé de configuration propre** à ce vocabulaire, et cette absence est un choix, justifié au §8.2 (« Pourquoi ce vocabulaire n'a pas de clé »).

**Ce que ce vocabulaire ne fait pas**, et qui décide de tout le reste : il détermine **quels labels existent**, jamais **ce qu'il advient** d'un commentaire non conforme — cela reste au mode du §7 — ni **où** un label est exigé — cela reste à `scope` (§4.1). Les trois questions sont indépendantes deux à deux ; répondre à l'une n'engage aucune des autres.

**Pourquoi ces trois-là, et pas les autres.** Une réponse de revue prend position sur une seule question qu'on tranche en une seconde sans juger personne : *le code a-t-il bougé, et si non, est-ce que je concède le point ?* Trois réponses, trois labels — `done`, `ack`, `disagree` — et aucune quatrième. Le partage n'est pas de notre invention : Gerrit propose depuis longtemps deux boutons de réponse rapide sur un commentaire, et exactement deux — « *you can quickly resolve the comment by clicking "Done" (if it was resolved in a next patchset) or "Ack" (if you acknowledge the comment, but don't want to make changes)* ». Ces deux-là, plus le refus, qui n'a nulle part de bouton parce qu'il demande une phrase. Les deux autres gestes possibles dans un fil ont déjà leur label : **apporter une information** est `note` (« information à porter à connaissance »), **redemander** est `question`. C'est ce qui borne la famille à trois, et ce qui fait qu'un `answer:` n'a pas été retenu : il ne dit rien de plus que `note`, et son sens dépend de ce à quoi il répond, alors que la règle du §3.5 est locale à chaque message.

- `done` plutôt que `fixed` comme identifiant. `fixed` présuppose que la remarque signalait un **défaut** — faux dès qu'on répond à `suggestion`, `nitpick`, `polish` ou `chore` —, et c'est par ailleurs l'un des statuts de fil d'Azure DevOps (§B.5), ce qui rendrait « fil `fixed` fermé par une réponse `fixed` » ambigu dans toute sortie de diagnostic. `fixed` est conservé en **alias** : il est accepté en entrée, ne produit aucun diagnostic, et hérite intégralement de `done` (§8.2).
- `ack` plutôt que `acknowledged`. Personne ne tape la forme longue, et douze caractères en feraient le badge le plus large du produit — `suggestion` en compte dix — sur la famille dont les sujets sont les plus courts et sur une ligne dont le caractère mono-ligne est *mesuré* (`npm run check:subject-line`, §5.5). `acknowledged` reste accepté en alias. Le coût est réel et il faut le nommer : `ack` est du jargon — courant chez qui a pratiqué Gerrit ou les listes du noyau (`Acked-by:`), opaque partout ailleurs —, et le badge est lu par toute l'équipe — y compris par qui n'a pas installé l'extension et ne verra jamais l'infobulle. La description française doit donc **enseigner le mot**, pas le translittérer.
- `ack` ne dit **pas** « et rien ne changera ». Il dit : reçu, accepté, le code n'a pas bougé *à ce stade*. C'est ce qui lui permet de couvrir sans quatrième label le cas « d'accord, je le fais bientôt » et le cas « bien noté, je n'ai pas d'avis » — et c'est pourquoi son exemple canonique doit être un accusé de réception pur (`ack: bien noté, je garde ça pour le module suivant`) et **jamais** un refus poli (`ack: juste, mais je laisse tel quel`), qui relève de `disagree` et enseignerait la mauvaise frontière dès la première infobulle.
- La frontière `ack` / `disagree` est la seule qui demande un instant de réflexion, et elle se tranche par une question : **le point était-il valide ?** Si oui et que je ne le traite pas — coût, périmètre, priorité —, c'est `ack` ; si je conteste sa validité, c'est `disagree`. Les deux laissent le code inchangé.

**`thanks` ne prend pas position, et c'est pour cela qu'il n'est pas une quatrième réponse au point.** Les trois labels ci-dessus répondent à la question du point ; `thanks` répond à la **personne**. Il comble le même manque qu'eux : sous `scope.validateReplies`, un « merci ! » en réponse tombe en `E-NO-LABEL`, et la seule issue était `note: merci` — le détournement que cette famille existe pour éviter. Il ne recouvre pas `praise`, qui souligne un point positif **du code**, ni `ack`, qui **accepte** une remarque. `thx` est accepté en alias ; l'identifiant reste le mot entier, que toute l'équipe lit sur le badge sans infobulle — l'argument qui a fait préférer `ack` à `acknowledged`, la largeur, ne joue pas sur six lettres.

**Ce que cela donne dans un fil.** Les réponses sont des commentaires comme les autres : même grammaire (§3.1), mêmes décorations, mêmes règles de sujet et de discussion.

```text
issue (blocking): les jetons CSS d'une plateforme fuient dans la feuille partagée

Cette feuille est aussi chargée sur Azure DevOps.
```
```text
done: jeton propre à la plateforme retiré

Le garde détecte désormais les jetons déclarés par la feuille de chaque plateforme.
```

```text
suggestion: extraire cette correspondance vers l'adaptateur.
```
```text
disagree: la correspondance est volontairement indépendante de la plateforme

La déplacer dans l'adaptateur dupliquerait la même règle entre les deux.
```

```text
nitpick: ce nom de variable se lit mal.
```
```text
ack: bien noté, je garde ça pour le module suivant
```

**`disagree` n'est pas `decision`, et la confusion serait coûteuse.** `disagree` est un avis, que n'importe qui peut exprimer et qui ne referme rien. `decision` acte un choix de revue : le §6.1.1 lui impose un motif d'au moins `rules.minDecisionSubjectLength` caractères, que l'extension valide à la saisie, et exige qu'il se trouve dans le fil qu'il clôt. Ni l'un ni l'autre ne résout le fil, qui reste un geste de la plateforme. `decision` reste par ailleurs **activé par défaut** et ne rejoint pas la famille : l'y verser le désactiverait sur tout dépôt qui ne l'active pas, et éteindrait silencieusement le label du §6.1.1.

**`reviewed` — clore sa revue, livré activé.** Un dernier geste revient dans toutes les revues et n'avait pas de label : dire qu'on n'a plus rien à ajouter.

| Label | Description | Bloquant par défaut | Toujours non bloquant | Alias |
|-------|-------------|:---:|:---:|---|
| `reviewed` | Clôt la revue de qui l'écrit : ses points sont traités, il n'a plus rien à ajouter. N'approuve rien. | Non | **Oui** | — |

C'est le geste que les équipes faisaient faute de mieux en écrivant `praise: revue terminée`, détournant un label dont le sens est de souligner un point positif, et faussant au passage le ratio `praise` du §12. **`reviewed` n'est pas un label de réponse** : il ne répond à aucun point, il fait le point sur la revue elle-même — une remarque sur la revue, de type `remark`. Il **n'approuve rien** : l'approbation est un état que la plateforme possède — « Approve » sur GitHub, le vote sur Azure DevOps — et que l'outil ne pose pas, pour la raison qui a fait écarter `resolved` ci-dessous. Il ne vérifie pas davantage que la revue est réellement finie.

**Quand le publier.** `reviewed` clôt le **processus** de revue de son auteur, pas une passe de lecture : une revue comprend la levée des points, le suivi de leur traitement et la vérification des corrections. Le relecteur le publie quand chacun de ses points est **traité** — corrigé et vérifié, ou écarté par une réponse qu'il accepte, ce qu'un point non bloquant peut légitimement être — et qu'une dernière lecture n'en révèle aucun nouveau. Tant qu'un de ses points reste ouvert, quelle que soit sa priorité, sa revue l'est aussi. Le label ne couvre que l'état de la PR effectivement examiné. Toute modification ultérieure de la PR rouvre la revue de son auteur : les nouveaux changements doivent être examinés, et un nouveau `reviewed` ne peut être publié qu'après vérification de l'ensemble des conditions de clôture. Chaque relecteur clôt la sienne, indépendamment des autres. Ce que la PR exige pour être fusionnée — approbations, relecteurs requis — reste l'affaire de la plateforme : l'outil ne compte pas les `reviewed`, et aucun nombre de `reviewed` ne vaut approbation. C'est une convention d'usage, que l'outil énonce sans la contrôler.

Il est livré activé, toujours non bloquant, et se désactive comme les labels de réponse. Ensemble, ces cinq labels — les quatre labels de réponse et `reviewed` — forment ce que ce document appelle les **labels ajoutés** : ceux que le produit ajoute à Conventional Comments et livre activés, et qu'une équipe qui veut s'en tenir à la liste de l'amont désactive d'un même geste (§8.2). Le groupe ne recoupe pas le type : il dit ce que le produit ajoute, le type dit si un label ouvre un point. `decision`, lui aussi propre au produit, et `reply` lui aussi, n'en fait pas partie (ci-dessus) : une équipe qui retire les ajouts pour s'en tenir à la liste de l'amont ne doit pas éteindre avec eux le label `decision` du §6.1.1.

**Candidats écartés, et pourquoi** — sans quoi chacun sera reproposé :

| Candidat | Motif du rejet |
|---|---|
| `answer` | Ne dit rien de plus que `note`, et son sens classe le commentaire **parent** plutôt que la position de qui écrit — or la règle du §3.5 est locale à chaque message, et le §4.1 interdit d'en faire un enchaînement. |
| `clarification` | La description de `question` dans le tableau ci-dessus est déjà « **demande de clarification** » : le même mot aux deux bouts du même échange. Relève de `note`. |
| `deferred` | « Pas maintenant » contre « pas du tout » se porte par le **sujet**, ou par une décoration libre — `ack (follow-up): suivi dans PROJ-142` —, `decorations.allowFree` valant `true` par défaut (§3.3). C'est aussi le seul candidat dont la condition de vérité n'a pas encore eu lieu : il fabriquerait l'attente de suivi que le §4.1 interdit à l'outil de tenir. |
| `wontfix` | Le sens de `decision` sous un autre nom, sans aucune de ses conditions de validité : le motif d'au moins `minDecisionSubjectLength` caractères se contournerait en tapant `wontfix: non`. À écarter **aussi comme alias**. |
| `resolved` | Affirme un état que la plateforme possède et que l'outil ne pose délibérément pas (« Resolve conversation » sur GitHub, `Resolved` sur Azure DevOps). Un badge qui contredit le contrôle natif à deux centimètres de là défait le positionnement du §3.1 plus sûrement qu'aucune phrase ne le rétablit. |
| `noted` | Inséparable de `note` : ils partagent tous leurs préfixes, aucune abréviation ne les distingue sous la règle du §5.2, et `closestLabel` les rapproche à une distance de 1. Le sens visé est `ack`. |
| `approved`, `signoff` | Pour `reviewed`. Tous deux nomment l'approbation, un état que la plateforme possède et que l'outil ne pose pas : même motif que `resolved`. |
| `closing` | Pour `reviewed`. Se lit « Close pull request », un contrôle natif à deux centimètres du badge. |
| `lgtm`, `r+`, `+1` | Ces jetons s'adressent à une **machine**, et le §4.2 offre déjà de quoi les écarter — `allowlistPatterns` prend `^LGTM$` pour exemple, le sentinel `/*` de `toolCommands` couvre `/lgtm` ; deux clés **vides par défaut**, qu'un dépôt renseigne. En faire un label rendrait en badge une chaîne que le même document est bâti pour laisser sortir du périmètre. Les labels de réponse s'adressent à une **personne** et sont validés. |

**Contraintes de forme, valables pour tout label configuré.** Un identifiant de label est un mot unique de lettres ASCII : la regex de référence capture `(?<label>[A-Za-z]+)` (§3.4.2) et l'étage 1b lit le premier mot de la même façon. Un `follow-up` serait donc un label configurable **structurellement impossible à écrire**, qui retomberait en `E-NO-LABEL` sans que rien ne le signale. Et un label ne doit reprendre ni l'`id` ni un alias d'un autre label de la configuration résolue : la règle d'ombrage est posée au §8.2.

**Une conséquence mesurée, à connaître avant d'arrêter les mots.** Famille désactivée par un dépôt, `done: rebasé sur main` produit `E-UNKNOWN-LABEL` et l'étage 2 propose le label le plus proche : c'est `note`, à une distance de 2. La correction en un clic change donc le sens. Ce n'est pas un défaut introduit ici — c'est ce que le produit fait déjà de tout mot inconnu —, mais `ack`, `disagree`, `reviewed` et les deux alias ne réveillent, eux, aucune proposition.

*Nota — `praise` :* la recommandation « à utiliser au moins une fois par revue » relève d'une bonne pratique culturelle, non d'une règle de validation outillée. Elle n'a pas de code d'erreur associé et n'affecte jamais la conformité d'un commentaire.

### 3.3 Décorations

| Décoration | Effet sur le caractère bloquant | Porteuse |
|------------|--------------------------------|:---:|
| `(blocking)` | Force le caractère **bloquant**, quel que soit le label. | Oui |
| `(non-blocking)` | Force le caractère **non bloquant**, quel que soit le label. | Oui |
| `(if-minor)` | Force le caractère **non bloquant** — le point n'est à traiter que si l'effort est faible. | Oui |
| Décoration libre (`(security)`, `(perf)`, `(a11y)`…) | Aucun — purement descriptive. Autorisée si `decorations.allowFree` vaut `true`. | Non |

**Précédence pour déterminer si un commentaire est bloquant.** Les règles sont évaluées dans l'ordre ; la première qui s'applique l'emporte.

1. **Conflit avec un label toujours non bloquant.** Un label marqué `alwaysNonBlocking` — la colonne du §3.2, jamais une liste recopiée ici : elle s'allonge, la dernière fois avec les labels de réponse — portant la décoration `(blocking)` produit `E-CONFLICT`. Le commentaire est en erreur ; la question du caractère bloquant ne se pose pas.
2. **Décorations contradictoires.** La présence simultanée de plusieurs décorations **porteuses** aux effets opposés — `(blocking)` avec `(non-blocking)`, ou `(blocking)` avec `(if-minor)` — produit également `E-CONFLICT`. Aucune règle de « la première gagne » n'est définie, précisément parce qu'un tel commentaire traduit une intention ambiguë qu'il vaut mieux faire corriger.
3. **`(blocking)` seul** → bloquant.
4. **`(non-blocking)` ou `(if-minor)`** → non bloquant.
5. **Aucune décoration porteuse** → valeur `blockingByDefault` du label (§3.2).

Cette liste doit rester exhaustive : le tableau ci-dessus seul ne suffit pas. `(if-minor)` y est déclaré non bloquant, mais une liste de précédence qui ne le mentionnerait pas rendrait `issue (if-minor):` **bloquant** par le jeu de la règle 5 — en contradiction directe avec le tableau.

**Un commentaire en `E-CONFLICT` reste évaluable comme racine de fil.** Les règles 1 et 2 disent que la question du caractère bloquant « ne se pose pas » **du point de vue de la personne qui écrit** : cette personne doit corriger, aucune interprétation ne lui sera prêtée. La question se pose en revanche pour le décompte des fils bloquants (§6.1), qui demande une réponse booléenne sur chaque racine de fil. La règle est donc : **une racine en `E-CONFLICT` est bloquante si son label l'est par `blockingByDefault`** (§3.2), les décorations contradictoires étant ignorées. C'est un **départage**, et il vaut partout où le caractère bloquant est en jeu : bandeau du §5.5, `W-NO-DISCUSSION`, `W-NOT-BLOCKABLE`. Une notion qui n'aurait de valeur que « pour ce calcul-ci » laisserait les autres sans réponse.

Sans elle, rendre son propre commentaire indécidable serait un chemin d'évasion à un caractère près : `issue (blocking, non-blocking): …` sortirait du décompte des fils bloquants au prix d'une simple erreur de forme, que le mode `assist`, qui est le défaut, laisse publier. La règle place l'ambiguïté du côté sûr — `issue` reste bloquant, `nitpick (blocking)` ne le devient pas.

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

L'extension lit un champ de saisie vivant, où les fins de ligne sont des `LF` ; un corps stocké porte des `CRLF`, la spécification HTML imposant la normalisation des fins de ligne d'un `<textarea>` en `CRLF` à la soumission. Sans prétraitement qui traite les deux formes à l'identique, **le même commentaire reçoit deux verdicts opposés** selon la forme sous laquelle il est lu. La règle reste normative (décision du propriétaire, 2026-11-10) : elle ne tient pas à un second composant, mais à la diversité des plateformes, dont chacune livre ses corps sous sa propre forme.

L'algorithme, appliqué à l'identique quelle que soit la forme lue, est :

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

**Pourquoi les jeux de caractères sont énoncés en toutes lettres.** « Appliquer `trim()` » n'est pas une règle : le `trim()` de JavaScript retire U+FEFF, celui de Python ne le retire pas. Deux implémentations conformes, deux verdicts — sur un BOM, que `CA-06` teste explicitement. Les jeux sont donc clos, et énoncés ici : `\p{White_Space}` ∪ {U+FEFF} pour l'étape 4 ; `\p{White_Space}` privé de l'espace et de la tabulation pour l'étape 5 ; U+FEFF seul pour l'étape 6.

**Pourquoi U+FEFF est supprimé et non remplacé.** Il **n'a pas** la propriété `White_Space` — c'est une marque d'ordre d'octets, pas un blanc —, il doit donc être traité à part. Et le traiter comme un blanc produirait un message faux dans l'autre sens : `issue` suivi d'un BOM puis du deux-points deviendrait `issue : x`, qui reçoit le motif 4, « espace avant le deux-points », en désignant une espace que personne n'a tapée. Supprimé, le cas retombe sur `issue: x`, qui est conforme — ce qui est exact, un BOM invisible n'étant pas une faute de forme. Placé *après* le deux-points, il disparaît de même et laisse `issue:sujet`, qui reçoit le motif 5, « espace manquante après le deux-points » : exact également, puisque aucune espace n'a été saisie. Un caractère de largeur nulle n'est pas un blanc — le remplacer par une espace inventerait une saisie que personne n'a faite. Le point est de la même nature que le `CRLF` traité plus haut : une commodité de bibliothèque qui diverge silencieusement d'un langage à l'autre.

**Pourquoi l'étape 5.** Une espace insécable est invisible à l'écran et fréquente en français, où claviers et traitements de texte l'insèrent d'eux-mêmes devant un deux-points. La regex n'accepte que `[ \t]` : sans normalisation, `issue:` suivi d'une insécable puis du sujet échouerait à l'étage 1a du §3.5.1, puis serait diagnostiqué par le motif 6 — « caractère inattendu » — dont le message serait faux. Cette substitution ne produit **aucun diagnostic** : on ne signale pas à quelqu'un un caractère qu'il ne voit pas. Elle rend en revanche exact le diagnostic **suivant** : une insécable placée *avant* le deux-points donne, après normalisation, `issue : x`, qui reçoit le motif 4 — « espace avant le deux-points » — qui est le bon message.

Un corps vide, constitué uniquement de blancs, ou dont il ne reste rien après l'étape 2, ne produit **aucune** ligne de préfixe : ce cas relève de l'exemption du §4.2 (contenu non rédigé), pas d'une erreur de format.

**Le corps traité ici est celui que le §3.6 a privé de son marqueur de session**, s'il en porte un. Le retrait précède l'étape 1, et c'est ce corps-là, et lui seul, que lisent la suite de cette section, le §3.5 et le §4.2.

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

Cette distinction est structurante. Sans elle, on ne saurait ni si `issue:` sans sujet doit ressortir conforme, ni combien de diagnostics comparer dans le test de non-régression `CA-06`.

**Temps 1 — reconnaissance du préfixe.** Une même ligne peut échouer pour des raisons de nature très différente, et un message unique serait faux dans la majorité des cas.

| Étage | Question | Si **oui** | Si **non** |
|:---:|---|---|---|
| **−2** | La **zone** est-elle exclue par configuration — une réponse de fil alors que `scope.validateReplies` vaut `false`, ou un corps de revue alors que `scope.validateReviewSummary` vaut `false` (§4.1) ? | Analyser le préfixe malgré tout, puis : s'il s'agit d'une **réponse de fil** dont le label résolu est `decision`, reprendre à l'étage **−1** et poursuivre normalement (§4.1, « Analyser n'est pas exiger ») ; dans tous les autres cas **aucun diagnostic**, validation terminée | passer à l'étage **−1** |
| **−1** | Le commentaire est-il **exempté** au sens du §4.2 — corps vide, aucun contenu propre, auteur exempté, message de plateforme, commande adressée à un outil, motif de `allowlistPatterns` ? | **Aucun diagnostic**, validation terminée | passer à l'étage **0** |
| **0** | Le **corps brut** contient-il un **bloc de suggestion natif** de la plateforme (§4.2, marqueur en annexe) ? | voir les trois cas énoncés sous le tableau | passer à l'étage **1a** |
| **1a** | La ligne a-t-elle la **forme** `label: sujet` (§3.4.2) ? | passer à l'étage **2** | passer à l'étage **1b** |
| **1b** | Le premier mot de la ligne est-il un **label connu** ou l'un de ses alias — autrement dit, s'agissait-il d'une tentative ? | **`E-MALFORMED-PREFIX`** : énoncer le motif exact (tableau ci-dessous) et proposer la correction | **`E-NO-LABEL`** : énoncer le format attendu et proposer l'insertion d'un label. Ne **jamais** parler de label inconnu — la personne n'a pas tenté d'en écrire un |
| **2** | Le label capturé figure-t-il dans la liste configurée (§3.2) ou ses alias (§8.2) ? | passer à l'étage **3** | **`E-UNKNOWN-LABEL`** : lister les labels disponibles et proposer le plus proche (`isue:` → `issue:`) |
| **3** | Est-il dans la **bonne casse** ? | préfixe reconnu → **temps 2** | **`W-CASE`** : avertissement, correction en un clic, puis **temps 2** |

**L'étage −2 est le seul qui analyse sans valider.** Une réponse de fil n'est pas validée par défaut, mais une réponse `decision` l'est **toujours** (§4.1) : il faut donc lire le préfixe pour savoir s'il faut le juger. **Ce barreau reste une liste d'exactement un identifiant, et les labels de réponse (§3.2) n'y entrent pas** : aucun d'eux n'acte de décision de revue, et les y ajouter — geste qui se présente de lui-même, « pour que le vocabulaire serve à quelque chose » — imposerait des règles de forme sur une zone que la configuration vient précisément d'éteindre, ce qui est l'argument même que ce paragraphe donne pour `decision` ailleurs qu'en réponse. C'est aussi la seule modification qui casserait `CA-07` en ayant l'air d'une amélioration. La reprise se fait à l'étage **−1**, et non plus loin : une `decision` écrite par un compte exempté reste exemptée, et `W-CASE` sur `Decision:` reste évalué à l'étage 3. L'analyse du préfixe faite ici sert à décider, pas à consommer un étage. L'exception ne vaut que pour les **réponses de fil** : une `decision` écrite dans un corps de revue n'a aucun effet — le §6.1.1 exige qu'elle se trouve dans le fil qu'elle clôt, jamais ailleurs —, et la valider reviendrait à imposer un seuil de 20 caractères sur une zone que la configuration vient d'éteindre. L'ordre compte, et il est contre-intuitif — d'où ce barreau explicite. Corollaire : une réponse dont le préfixe est **mal formé** ne porte aucun label, donc pas le label `decision`, donc n'est pas validée. Elle ne vaut pas non plus décision au sens du §6.1.1, ce qui est le comportement recherché : une décision illisible n'en est pas une.

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

**Aucune règle propre aux labels de réponse.** Ils traversent les mêmes étages que tous les autres, sans code de diagnostic nouveau et sans contrôle supplémentaire : pas de seuil de sujet propre — n'inventer surtout pas un second `min…SubjectLength`, il entrerait dans le domaine de `fingerprint()` (§9.2.2) et traînerait derrière lui tout le problème de compatibilité —, pas de décoration exigée — `W-MISSING-DECORATION` reste borné à `suggestion` et `question`, que le §3.5.2 compte comme **deux** déclencheurs —, pas de règle d'enchaînement, et aucune vérification de véracité : l'outil ne cherche jamais à savoir si un `done:` dit vrai. Les deux règles par label qui existent déjà — `W-MISSING-DECORATION` et `E-DECISION-SUBJECT` — sont ce qui rend la tentation réelle, et c'est pourquoi le refus est écrit.

**Multiplicité.** Un contrôle produit **au plus un diagnostic par code**, quel que soit le nombre d'occurrences fautives : `issue (foo, bar): x` produit **un seul** `E-UNKNOWN-DECORATION`, dont le message énumère `foo` et `bar`. Le même commentaire peut en revanche porter plusieurs codes **différents** — c'est le sens de « cumulatifs ». Sans cette règle, la liste comparée par `CA-06` aurait une longueur dépendante de l'implémentation, et deux implémentations également correctes échoueraient au test de non-régression.

**Exclusion.** Trois contrôles s'effacent devant un autre, faute de quoi un même défaut compterait deux fois et la liste de `CA-06` dépendrait de l'implémentation :

- `W-SUBJECT-TOO-SHORT` et `W-SUBJECT-TOO-LONG` ne sont évalués **que si un sujet est présent** : sur `issue:`, `E-EMPTY-SUBJECT` les remplace. Un sujet vide n'est pas un sujet court.
- `E-DECISION-SUBJECT` remplace `W-SUBJECT-TOO-SHORT` sur une réponse `decision` : le seuil de `minDecisionSubjectLength` est le seul qui s'y applique. Sur une réponse `decision` **sans aucun sujet**, c'est `E-EMPTY-SUBJECT` qui l'emporte à son tour : les deux codes diraient la même chose, et le §6.1.1 fait de la présence du sujet une condition distincte de sa longueur.
- Un code dont `severities` fixe la sévérité à `off` **est retiré de la liste restituée** : il n'apparaît ni dans la liste rendue par `validate()` (§9.2.2), ni dans la pastille (§5.3), ni dans le verdict comparé par `CA-06`. Désactiver une règle, c'est ne plus l'évaluer, pas l'évaluer en silence.

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

**Définition de « conforme ».** Un commentaire est **conforme** s'il ne produit, après application de `severities` (§8.2), **aucun diagnostic de sévérité `error`**. Un commentaire qui ne porte que des avertissements est donc conforme : c'est ce qui rend simultanément vraies la phrase ci-dessus et la promesse du §3.1. Les avertissements sont comptés **séparément** — ils apparaissent dans la pastille (§5.3) et dans les indicateurs du §12, jamais comme cause de blocage. C'est ce sens, et lui seul, qu'emploient le §5.4, le §12 et `CA-37`.

*Calibrage :* `W-SUBJECT-TOO-SHORT` est délibérément un avertissement, et non une erreur, avec un seuil bas de 5 caractères. Un sujet trop court n'est pas un défaut de forme grave — le pénaliser en erreur bloquante pousse à contourner la règle plutôt qu'à l'appliquer (voir la lecture des indicateurs en §12).

### 3.6 Marqueur de session

Un relecteur peut superviser plusieurs agents qui relisent la même PR en parallèle, ou plusieurs passes d'un même compte technique. La plateforme dit **qui** a écrit un commentaire ; elle ne dit pas **quelle session de revue** l'a produit. Un commentaire peut donc se terminer par un **marqueur de session**, optionnel, qui rend cette information visible (#160) :

```text
issue (blocking): Some title

Some text explaining the finding.

[session:Melancholy-Coordinated-Value-Object]
```

**Syntaxe.** `[session:<valeur>]`, où `session` s'écrit en minuscules, collé au crochet ouvrant et au deux-points. La **valeur** est un texte libre, non vide une fois retirés ses blancs de bordure (jeu de l'étape 4 du §3.4.1) ; elle s'étend jusqu'au **dernier** `]` de la ligne. Aucun format n'est imposé — ni GUID, ni générateur — et une valeur en minuscules séparées par des tirets (`melancholy-coordinated-value-object`) est **recommandée** pour la lisibilité, sans qu'une autre forme soit jamais refusée.

**Position.** Le marqueur occupe **à lui seul la dernière ligne non blanche** du corps, blancs de bordure tolérés ; il peut être suivi d'autant de lignes blanches qu'on veut. Il n'est **pas** reconnu :

- ailleurs que sur la dernière ligne non blanche ;
- sur une ligne qui porte aussi autre chose (`fin [session:a]`, `[session:a] fin`) ;
- dans un bloc de code délimité, refermé ou non, ou dans une citation — les lignes que l'étape 2 du §3.4.1 écarte ;
- avec une valeur vide, ou sous une autre forme (`[Session:a]`, `[session :a]`, `[session:a`).

Un marqueur non reconnu — mal formé ou mal placé — **reste du texte ordinaire**. Il ne produit aucun diagnostic : la convention n'en exige pas, et elle ne sanctionne donc pas une tentative ratée.

**Une métadonnée, pas du contenu de revue.** Le marqueur reconnu est **retiré du corps avant le prétraitement du §3.4.1**, et c'est le corps sans lui que jugent le §3.4, le §3.5 et le §4.2. Le retrait est fait par `validate()` et `analyze()` eux-mêmes, comme le prétraitement (§9.2.2) : aucun appelant ne peut l'oublier, et les deux composants le font à l'identique. Conséquences, qui sont toutes la même règle :

- il n'est **jamais** la ligne de préfixe, ni le sujet, ni de la discussion : `issue: le nom est ambigu` suivi du seul marqueur produit `W-NO-DISCUSSION`, exactement comme sans lui ;
- il n'est pas du **contenu propre** (§4.2) : un corps réduit au marqueur est un corps vide, **exempté** comme lui — une métadonnée seule ne fait pas un commentaire de revue, et ne lui impose pas non plus de label ;
- il n'entre pas dans `allowlistPatterns`, appliquées au corps sans lui : `LGTM` suivi d'un marqueur reste exempté par `^LGTM$` ;
- il ne change **aucun effet** : ni le label résolu, ni les décorations, ni le caractère bloquant (§3.3), ni le critère 2 (§6.2.1), ni la résolution d'un fil par `decision` (§6.1.1), ni le sens de `reviewed` (§3.2).

**Le contenu stocké n'est jamais modifié.** Ni l'extension ni le vérificateur ne réécrivent le marqueur — sa casse, notamment, reste celle de l'auteur. Seul l'affichage du §5.5 le transforme, côté client, et de façon réversible.

**Décalage de version de `core/`.** Un `core/` antérieur à ce paragraphe lit le marqueur comme une ligne ordinaire : la discussion n'y est pas vide, et un corps réduit au marqueur y reçoit `E-NO-LABEL`. Les verdicts peuvent donc différer d'un composant à l'autre pendant un déploiement. C'est l'écart de version que la règle 5 du §8.1.3 déclare normal, et il n'entre pas dans l'empreinte (§9.2.2), qui ne porte que sur la configuration.

Hors périmètre : filtrer, regrouper ou rechercher par session, un tableau de bord, un cycle de vie de session, une attestation d'identité ou de provenance, et la génération de l'identifiant. Les consignes données aux agents pour poser le marqueur relèvent d'une suite distincte.

---

## 4. Périmètre d'application

### 4.1 Zones soumises à validation

| Zone | Format validé | Peut porter un état bloquant | Justification |
|------|:---:|:---:|---|
| Commentaire inline sur une ligne de diff | ✅ | ✅ | Cœur de la revue ; porte un état de résolution |
| Commentaire de fil de discussion racine (thread parent) | ✅ | ✅ | Idem |
| Commentaire général sur la PR (hors diff — voir annexes) | ✅ | ❌ | Aucun état de résolution sur les plateformes cibles |
| Corps d'une revue soumise en lot (le cas échéant — voir annexe par plateforme) | ✅ | ❌ | Idem |
| **Réponse dans un fil existant** | ⚙️ configurable, **désactivé par défaut** | ❌ | La convention n'est pas exigée des réponses — voir ci-dessous |
| Réponse portant le label `decision` | ✅ *(toujours)* | ❌ | Porte une décision de revue — §6.1.1 |
| Description de la PR | ❌ | ❌ | Hors périmètre Conventional Comments |
| Commentaires de bots et comptes de service | ❌ | ❌ | Liste d'auteurs exemptés `exemptUsers` (§8.2) |
| Commentaires sur les tickets / éléments de travail liés | ❌ | ❌ | Hors périmètre |

**Règle de la colonne « peut porter un état bloquant ».** Un commentaire situé dans une zone marquée ❌ dans cette colonne est validé **en format uniquement** : même s'il porte un label bloquant (`issue:`, `todo:`, `chore:`), il n'est **jamais** compté parmi les fils bloquants (§6.1), donc jamais par le bandeau du §5.5.

Sans cette règle, un `issue: merci de rebaser` écrit dans la zone de conversation générale — laquelle n'offre aucun bouton de résolution sur les plateformes cibles — resterait signalé par le bandeau comme fil bloquant non résolu de façon définitive, sans autre issue que la suppression du commentaire. Le §6.1 suppose une correspondance « commentaire validé → fil résolvable » qui n'existe que pour les fils de diff.

**Le motif de cette ligne a changé, pas son comportement.** Elle disait « « Corrigé, merci » ne doit pas exiger un label », et c'était vrai *parce qu'aucun label ne convenait*. Depuis le §3.2, `done:` convient. Le défaut de `scope.validateReplies` reste `false`, mais pour la raison qui subsiste : la convention structure la **remarque** de revue, et rien n'oblige une équipe à l'étendre à ses réponses.

**Trois questions distinctes, et aucune implication entre elles.** Elles portent sur la même zone et se confondent facilement :

| Clé | Question qu'elle tranche |
|---|---|
| `labels[].enabled` (§3.2, §8.1.4) | **Quels labels existent** — donc si `done:` est un label ou un mot inconnu. |
| `scope.validateReplies` (§8.2) | **Où un label est exigé** — donc si une réponse sans préfixe est un défaut. |
| `mode` (§7) | **Ce qu'il advient** d'un commentaire non conforme. |

Les labels de réponse, actifs par défaut, n'activent jamais `scope.validateReplies`, et réciproquement. Avec la configuration par défaut — vocabulaire actif *ou* désactivé par le dépôt —, une réponse de fil n'est pas validée du tout : `done: rebasé sur main` et `dnoe: rebasé sur main` y sont également silencieux, l'étage −2 écartant la zone avant que le label ne compte. C'est la preuve mécanique de l'orthogonalité, et c'est aussi la conséquence inconfortable qu'il faut connaître : **avec les défauts, la désactivation du vocabulaire est invisible là même où le vocabulaire sert**. Une équipe qui veut que ses réponses soient labellisées pose `scope.validateReplies: true` — et depuis que la configuration s'applique **en direct** (§8.1.3, règle 1), ce geste vaut aussitôt pour les PR **déjà ouvertes** : toutes les réponses écrites sans préfixe y deviennent non conformes d'un coup. D'où l'ordre recommandé, et la raison qui le fonde : laisser les réponses adopter le vocabulaire, que les défauts proposent déjà, et n'exiger qu'ensuite.

Ce que le vocabulaire fait, lui, dès qu'il est actif — c'est le défaut — et quel que soit `scope` : la barre d'outils et la saisie rapide le proposent (§5.1, §5.2 — ce sont des aides à la rédaction, pas de la validation), les réponses publiées reçoivent leur badge, et les indicateurs du §12 les comptent.

**Le rendu des badges ne dépend pas de `scope`**, et il faut le dire plutôt que le laisser déduire : le §5.5 décore tout commentaire publié dont le label se résout, quelle que soit sa zone. Avec les défauts, le produit dit donc deux choses en apparence opposées d'une même réponse — le badge s'affiche, le composeur reste muet. Ce n'est pas une incohérence : décorer, c'est **lire** ce qui est écrit, valider c'est **exiger** qu'il le soit, et le §4.1 n'éteint que la seconde. L'asymétrie existe déjà pour `decision` ; les labels de réponse en font le cas courant.

**Analyser n'est pas exiger.** Que les réponses de fil ne soient pas *validées* par défaut (ligne ci-dessus) ne dispense pas de les *analyser* : il faut lire le préfixe d'une réponse pour savoir si elle porte une `decision`, que le §6.1.1 soumet toujours aux règles de forme. Une réponse sans label reste parfaitement valide — elle n'est simplement porteuse d'aucune décision. La ligne « réponse portant le label `decision` » du tableau ne rend donc pas les réponses obligatoirement labellisées : elle dit qu'une réponse *qui porte ce label* est soumise aux règles de forme, parce qu'elle acte une décision de revue.

Le parcours des réponses reste motivé par `decision`, et par lui seul : **aucun label de réponse ne déclenche, n'annule ni ne conditionne la résolution d'un fil** (§6.1.1). Ils ne sont pas non plus restreints à une zone — ce sont des labels ordinaires, écrivables en racine de fil, dans la conversation générale et dans un corps de revue, avec les mêmes effets qu'ailleurs.

L'extension (composant A) signale ce cas à la saisie par un avertissement `W-NOT-BLOCKABLE` (§3.5) : *« ce label est bloquant, mais cette zone ne permet pas de résoudre un fil — il ne sera pas compté parmi les fils bloquants »*. C'est un avertissement, jamais une erreur.

### 4.2 Exclusions de contenu

Un commentaire est **exempté** de validation si :

- **son corps est vide ou ne contient que des blancs** — cas le plus fréquent et le plus important : une revue approuvée sans texte (*Approve* sans commentaire) crée une revue au corps vide. Sans cette exemption, le geste le plus courant d'une revue produit `E-NO-LABEL` sur chaque approbation — et, en mode `enforce`, **empêche d'approuver sans texte** (§5.4) ;
- **il n'a pas été rédigé par une personne dans un éditeur de commentaire** : message généré par la plateforme, entrée de timeline, notification système, événement de mise à jour de branche. Ces contenus ne sont pas des commentaires de revue et ne relèvent pas de la convention. Cette catégorie est structurelle et ne dépend pas de la liste nominative `exemptUsers` ci-dessous — `CA-20` l'exige. Les marqueurs qui l'identifient sont propres à chaque plateforme et **traduits par l'adaptateur** en un booléen, `CommentInfo.isSystemGenerated` (§9.2.1) : `core/` n'a pas à les connaître, et une plateforme nouvelle n'oblige pas à le modifier ;
- il ne contient **aucun contenu propre** : après retrait des blocs de code **délimités**, des citations Markdown (`>`) et des blancs, il ne reste rien. C'est la lecture normative de « sans contenu propre » : sans elle, un bloc de code suivi d'une phrase relèverait de l'interprétation. Un **bloc de suggestion natif fait exception** : il compte comme contenu propre, et un commentaire qui n'en contient qu'un n'est donc pas exempté — c'est une proposition de modification, elle dit quelque chose, et l'étage 0 du §3.5.1 l'attend ;
- il commence par une **commande adressée à un outil**, reconnue via `toolCommands` (§8.2) — une liste **configurable par le dépôt, vide par défaut**, dont chaque entrée est soit le jeton exact `/*`, qui active la reconnaissance **générique** de toute commande slash (`/[A-Za-z][A-Za-z0-9_-]*` en tête de corps — `/azp`, `/retest`, `/lgtm`, `/deploy`, sans qu'aucune ne soit énumérée), soit un handle **exact** tel que `@codex` ou `@dependabot`. La reconnaissance porte sur le **premier jeton du corps**, suivi d'une espace ou de la fin de ligne, et est insensible à la casse pour les mentions — `@Codex review` et `@codex review` désignent le même compte GitHub. `@codex review` est une commande ; `@codexplique pourquoi` n'en est pas une, la reconnaissance portant sur le jeton entier ;
- il correspond à une expression de la liste `allowlistPatterns`, **appliquée au corps entier une fois `trim()` appliqué** — jamais à la seule ligne de préfixe, sans quoi `^LGTM$` ne matcherait pas un `LGTM` suivi d'une ligne vide. La précision compte : `CA-06` compare des verdicts au caractère près ;
- son auteur figure dans la liste d'auteurs exemptés `exemptUsers`. La comparaison porte sur **`UserInfo.login`**, insensible à la casse — jamais sur le nom affiché ni sur l'identifiant interne. C'est à l'adaptateur d'y placer une valeur comparable ; les identités données en annexe sont des exemples de valeurs, pas deux conventions différentes. Sans ce point fixe, A et B compareraient deux champs distincts et `CA-06` tomberait.

**Une commande n'est pas conventionnalisée, elle est exemptée.** La question se pose : plutôt qu'exempter `@codex review`, pourquoi ne pas exiger `chore: @codex review` ? Deux raisons, dans cet ordre. La première est dirimante et ne dépend pas de nous : la quasi-totalité de ces outils ancre son analyseur en tête de corps — `/azp`, Dependabot, les commandes Prow et `bors` exigent la commande au **tout début** du commentaire. Un préfixe conventionnel ne rend pas la commande mal formée : il l'empêche de se déclencher, et le commentaire est perdu sans que rien ne le signale. La seconde tient à la convention elle-même : une commande n'a ni sujet ni discussion au sens du §3.1, et n'ouvre aucun fil à résoudre. Lui imposer un label bloquant — `chore:` l'est par défaut (§3.2) — ferait d'une relance de robot écrite en racine de fil un fil bloquant que quelqu'un devrait résoudre, et produirait `W-NO-DISCUSSION` sur un commentaire qui n'a rien à discuter. Le seul label qui passerait proprement est `note:`, non bloquant par construction (§3.2) — et c'est précisément celui qui casse le plus d'analyseurs.

**Une seule liste, deux formes, une asymétrie qui tient à la grammaire — pas à la source.** `toolCommands` est une liste de chaînes exactes : chaque entrée est comparée au jeton, jamais interprétée comme un motif. C'est ce qui rend la genericité du slash sûre et celle de la mention impossible, sans devoir les traiter différemment ailleurs dans le mécanisme.

Le slash **n'ouvre pas une remarque de revue** : aucune phrase de relecteur ne commence par lui, et la contrainte de forme du sentinel `/*` écarte le seul faux positif crédible — le chemin : `/etc/hosts n'est pas le bon endroit` et `/api/v1/users devrait être versionné` portent un second `/` dans le jeton et ne sont donc pas exemptés. Reste `/tmp est plein`, qu'on assume — c'est **exactement** le contournement, assumé de la même façon, du bloc délimité ci-dessous : il n'atteint que l'hygiène de forme, jamais le décompte des fils bloquants. C'est pourquoi `/*` peut se permettre d'être générique : un seul jeton couvre les commandes Prow, les *comment triggers* d'Azure Pipelines, les `/deploy` maison et toute commande future, sans qu'aucune ne soit énumérée ni qu'aucun dépôt n'ait à l'entretenir.

L'arobase, elle, **ouvre couramment une remarque de revue** : interpeller quelqu'un est l'une des façons les plus naturelles de commencer un commentaire, et `@alice peux-tu regarder ça ?` en est une. Un sentinel générique pour les mentions n'existe donc pas dans la grammaire de `toolCommands` — il ne peut pas en exister, une entrée n'étant jamais qu'une chaîne comparée telle quelle. Le risque qu'un tel sentinel poserait n'est pas le contournement, qui suppose une intention, mais le **faux négatif silencieux** : une classe entière de vrais commentaires sortirait du périmètre sans que personne ne l'ait voulu ni ne s'en aperçoive, précisément sur la zone où la convention sert le plus. C'est une tout autre nature de défaut, et la grammaire l'exclut par construction plutôt que de compter sur la discipline de qui édite la configuration.

**Vide par défaut, comme `exemptUsers` et `allowlistPatterns`.** Aucune valeur n'est pré-remplie : un dépôt qui veut que `@codex review` ou `/retest` soit exempté l'écrit dans son `.conventional-comments.json`, sur le modèle donné en annexe (§A.7) et dans `.conventional-comments.example.json`. Trois raisons à ce choix plutôt qu'une liste embarquée dans l'adaptateur :

1. **La provenance d'un handle n'est pas universelle.** `@codex`, `@claude` ou `@bors` désignent un service cloud bien identifié sur github.com — mais rien ne garantit qu'il en va de même sur une instance GitHub Enterprise Server auto-hébergée, où ces mêmes handles peuvent appartenir à des comptes humains internes. Une liste embarquée dans l'adaptateur s'appliquerait pourtant à toute installation du produit, y compris celle-là, et y exempterait silencieusement de vraies remarques adressées à de vraies personnes. Une liste vide par défaut ne se trompe jamais : c'est le dépôt, qui sait qui est réellement un robot sur son instance, qui la remplit.
2. **`toolCommands` est alors une clé de configuration comme les autres** (§8.2, comme `exemptUsers` et `allowlistPatterns`) : résolue aux trois niveaux du §8.1.2 et bornée par le plancher, sans traitement particulier à écrire. Une valeur embarquée dans le code de l'adaptateur, elle, changerait le verdict d'une version de l'extension à l'autre sans qu'aucune configuration ne le dise — exactement le trou qu'aurait laissé une liste portée par le code plutôt que par la configuration.
3. **Un seul mécanisme, pas deux.** Un outil tiers installé sur GitHub *ou* sur Azure DevOps s'ajoute de la même façon, dans la même clé — nul besoin d'un canal de configuration séparé par plateforme (§A.7, §B.6).

**Résoudre le handle plutôt que le nommer n'est pas une option.** L'idée se présente d'elle-même : exempter `@handle` lorsque le compte interpellé *est* un robot, ce que GitHub et Azure DevOps savent dire. Elle bute sur le §10 et sur `CA-06`. La validation s'exécute **à la frappe** dans le navigateur ; une résolution de compte la rendrait asynchrone, dépendante du réseau et de droits de lecture que l'extension n'a pas (§10), et ferait dépendre le verdict d'un état extérieur au corps et à la configuration. Une liste de chaînes exactes, quelle que soit sa source, est ce qui permet à `validate()` de rester une fonction pure de son entrée.

**Exempter un auteur, c'est le retirer des deux décomptes.** Un commentaire exempté ne porte aucun label résolu : il n'est donc jamais bloquant au sens du §6.1, et n'apparaît pas dans les indicateurs du §12. Les deux effets sont solidaires et ne se dissocient pas. La conséquence porte sur les **relecteurs automatiques** — revue de code par IA, analyseurs qui commentent une ligne de diff —, dont les remarques sont, elles, de vraies remarques de revue : les inscrire dans `exemptUsers` garantit qu'un `issue (blocking):` qu'ils poseraient sur un défaut réel ne sera pas compté parmi les fils bloquants. Le choix appartient à l'organisation et il est explicite : soit l'outil reste exempté et ses remarques sont consultatives, soit on lui apprend la convention — ils savent tous la produire sur instruction — et il est traité comme un relecteur. La seconde branche a un coût qu'il faut connaître : on n'édite pas le commentaire d'un tiers, donc un `E-NO-LABEL` de sa part n'est corrigeable que par lui.

**Le bloc de suggestion natif n'est pas une exemption, c'est un label.** Un commentaire contenant un bloc de suggestion de la plateforme porte un label `suggestion` **implicite** : il est validé normalement — sous les trois réserves de l'étage 0 du §3.5.1 — et compté comme `suggestion` dans les indicateurs (§12). Un préfixe explicite, s'il est présent, est validé comme d'habitude et l'emporte sur le label implicite — y compris s'il est mal formé, auquel cas le diagnostic correspondant s'applique.

**Contournement connu, assumé.** Écrire tout son commentaire à l'intérieur d'un bloc délimité, ou le préfixer de `> `, produit un corps sans contenu propre : il est exempté, et rien n'est signalé — y compris en mode `enforce`. Le contournement est réel et il coûte trois caractères.

Il est assumé pour une raison précise : **il n'atteint pas ce qui compte.** Ce qu'il esquive est l'hygiène de forme. Le signalement des fils bloquants — ce que porte O3 — est intact : un commentaire entièrement cité n'ouvre aucun fil bloquant, donc n'exempte personne de traiter quoi que ce soit. Et le §2 pose déjà que l'extension est contournable par construction. Fermer ce cas coûterait un seuil arbitraire — « moins de N caractères » — appliqué au geste parfaitement légitime de citer du code sans commentaire, pour un gain nul sur l'objectif du produit.

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

- Un bouton par label, avec libellé et couleur distincts, **sans icône** : les boutons forment une rangée où la largeur prise par l'un est prise à tous les autres, et le libellé suffit à désigner le label. L'icône configurée (`labels[].icon`, §8.2) reste rendue là où elle ne coûte aucune place — le badge d'un commentaire publié (§5.5), seul en tête de son commentaire.
- **Des rangées empilées, jamais une seule** : les boutons de label d'abord, les commandes de décoration ensuite. Elles ne se mêlent jamais, quelle que soit la largeur disponible ; ce qui déborde d'une rangée passe à la ligne **dans cette rangée**. Une suite unique de commandes, coupée là où la place manque, finit par rendre un bouton de label et un segment de décoration côte à côte — deux gestes de natures différentes présentés comme s'ils n'en formaient qu'un. Les labels occupent eux-mêmes deux rangées, décrites ci-dessous.
- Sélecteur de décoration segmenté : *aucune*, puis **un segment par décoration dont `forces` n'est pas `null`** (§8.2) — soit `blocking`, `non-blocking` et `if-minor` par défaut. Il se construit depuis la configuration, sans quoi une décoration porteuse ajoutée par une organisation n'aurait aucune commande. Complété d'un champ libre lorsque `decorations.allowFree` vaut `true`, sans quoi les décorations libres autorisées resteraient inaccessibles à la souris.
- Le clic sur un label **insère ou remplace** le préfixe existant sans détruire le texte déjà saisi. En l'absence de sélection, le curseur est repositionné en fin de préfixe ; avec une sélection active, le texte sélectionné n'est pas remplacé et la sélection est **restaurée, décalée de la longueur du préfixe inséré**.
- Un second clic sur un label déjà actif le retire (toggle).
- Infobulle au survol : **quand employer le label** — une consigne d'emploi, tournée vers qui écrit (« Signaler un problème à corriger… ») —, puis un exemple, dans la langue de l'interface. Elle diffère de celle du badge (§5.5), qui dit ce que le commentaire **signifie** pour qui le lit. Une configuration qui écrit `labels[].usage` (§8.2) la remplace par ce texte, exemple compris, et la retire si elle l'écrit vide ; à défaut d'`usage`, le bouton prend `labels[].description`.
- **Les réponses sur leur propre ligne, sous un trait.** Les labels `remark` d'abord, dans leur rangée qui se replie comme avant ; puis les labels `reply` (§3.2, `labels[].kind`), **toujours sur une rangée à part**, en dessous ; chaque groupe dans l'ordre décrit plus bas. Un **trait horizontal fin**, sur toute la largeur de la barre, sépare les deux ; un **double trait fin** sépare ensuite les labels des décorations. Il n'y a ni cadre ni titre de section. La règle des rangées empilées se justifie par la **nature du geste** — poser un label contre appliquer une décoration — et elle tient : poser `done:` et poser `issue:` restent le même geste, insérer ou remplacer un préfixe. Le trait ne sépare pas deux gestes, il sépare deux **intentions** : ouvrir un point, ou n'en ouvrir aucun. Il ne restreint pas pour autant les labels `reply` aux réponses de fil (§4.1) : ils sont proposés dans toutes les zones, comme les autres.

  **Pourquoi une ligne à part, et pourquoi un trait.** Une première rédaction laissait les réponses partager la dernière ligne des remarques, séparées par un trait vertical affiché seulement dans ce cas. Elle ne se lisait pas : quand les remarques se replient sur plusieurs lignes, la ligne des réponses n'en était qu'une de plus, et le trait apparaissait ou non selon la largeur de la fenêtre. Sur leur propre ligne, les réponses ont la même place à toutes les largeurs ; et sans le trait, cette ligne se confondrait encore avec une ligne de remarques de plus — c'est lui qui dit « autre groupe ». Le double trait, au-dessus des décorations, marque la séparation d'un cran plus forte : deux groupes de labels d'un côté, les décorations — un autre geste — de l'autre. Il reste en place tant qu'au moins un label est actif ; sans aucun, il ne séparerait rien et disparaît, avec la rangée vide des remarques. Sans label `reply` actif, ni rangée des réponses ni trait simple ; sans label `remark` actif, la rangée des réponses n'a pas de trait, qui ne séparerait rien. La géométrie se **mesure** dans un vrai navigateur (`npm run check:composer-layout`) : un DOM sans moteur de rendu ne sait pas sur quelle ligne tombe un bouton.

  **L'ordre des boutons.** Par défaut, chaque groupe suit l'ordre de la configuration résolue, sans tri. Celui que le produit livre est l'ordre de conventionalcomments.org pour ses labels — `praise`, `nitpick`, `suggestion`, `issue`, `todo`, `question`, `thought`, `chore`, `note`, `typo`, `polish`, `quibble` —, suivi de `reviewed` ; et, pour les réponses, du plus conciliant au plus tranché : `thanks`, `done`, `ack`, `decision`, `disagree`. Les labels qu'une organisation puis un dépôt créent suivent, dans l'ordre où ils sont écrits ; redéclarer un label existant ne le déplace pas.

  **Un ordre personnel**, préférence locale de l'utilisateur (§8.1.2), place certains labels en tête de leur groupe. C'est **une seule liste** pour les deux groupes, et non une par zone : le type d'un label appartient au dépôt (§8.2), que la page d'options ne connaît pas, et une liste par groupe ne saurait où ranger un label qu'un dépôt a déclaré `reply`. Chaque groupe prend donc, dans l'ordre de la liste, ceux des labels listés qui lui appartiennent, puis les autres dans l'ordre par défaut. La saisie se lit ainsi : virgules comme séparateur, **tous** les espaces supprimés, casse ignorée, identifiants seulement — un alias ne désigne pas un bouton —, première occurrence retenue ; un jeton qui n'est pas un identifiant de label est écarté et signalé. Un nom inconnu sur le dépôt, ou désactivé, ne place rien et ne produit aucune erreur ; la page d'options, qui ne connaît que les labels livrés, signale seulement ceux qu'elle ne connaît pas. L'ordre ne change aucun verdict, n'entre dans aucune empreinte et n'est pas plancher-able. Comme les raccourcis directs, il est lu à la construction de la barre : il vaut pour la prochaine zone de saisie instrumentée, pas en direct dans celles déjà ouvertes.

  **La géométrie est à mesurer, pas à supposer — et il faut distinguer ce qui existe de ce qui reste à écrire.** Tous les labels livrés sauf `quibble` étant actifs par défaut (§3.2), la rangée porte **dix-sept** boutons. Ce palier est mesuré : `check:composer-layout` construit la vraie barre depuis la configuration par défaut et la monte à onze largeurs, de 240 à 1 400 px, pour vérifier que les réponses sont toujours sous la dernière remarque, le trait entre les deux (`CA-48`). Ce qu'il ne vérifie pas, c'est la rangée elle-même à chaque largeur — qu'elle reste lisible, qu'aucun bouton ne déborde du cadre de la plateforme —, et `check:subject-line` rend des commentaires fixes. Ce paragraphe demande donc encore une mesure **à écrire**, non un garde à rejouer : la rangée, dans le composeur d'une vraie page. Si elle brise la mise en page, la réponse honnête est de désactiver des labels — pas d'ajouter une rangée.

### 5.2 Saisie rapide au clavier

- Déclencheur de complétion : `/` ou `:` en début de zone, ouvrant une liste filtrable au fil de la frappe.
- Navigation `↑` `↓`, validation `Entrée` ou `Tab`, annulation `Échap`.
- Abréviations extensibles par `Tab` : `?i` → `issue: `, `?ib` → `issue (blocking): `, `?su` → `suggestion: `, `?ni` → `nitpick: `, `?no` → `note: `… La table complète est configurable par la clé `shortcuts.abbreviations` (§8.2). **Autant de lettres qu'il en faut pour désigner un label sans ambiguïté** : deux suffisent pour `nitpick`/`note`, `todo`/`thought` ou `praise`/`polish` ; il en faut **trois** pour `question`/`quibble`, que deux ne séparent pas (`?que` / `?qui`). Un alphabet à une lettre ne peut pas couvrir sans collision l'ensemble des labels du §3.2 — la contrainte se lit sur cette liste, dont la longueur a déjà changé une fois. Les labels ajoutés y apportent `?a` → `ack: `, `?do` → `done: `, `?di` → `disagree: `, `?r` → `reviewed: ` et `?thx` → `thanks: `, de la même graphie que son alias — `?th` est `thought` et ne se redéfinit pas ; aucune entrée existante n'est redéfinie, et **`?de` reste `decision`**, le seul label soumis à un seuil propre (§6.1.1), celui où une réaffectation silencieuse se paierait le plus cher.

**Une abréviation par défaut ne se déplie que vers un label actif.** Livrer `?do` pour un label désactivé composerait un préfixe que le validateur rejette à la frappe suivante en `E-UNKNOWN-LABEL` — l'outil ferait écrire la faute qu'il signale. La règle vaut pour toute la table livrée, et elle corrige d'abord un défaut antérieur : `?ty`, `?po` et `?qui` sont déjà livrées pour trois labels désactivés, alors que la liste de complétion, elle, ne montre que les labels actifs. Les deux surfaces doivent dire la même chose. Une abréviation **écrite par une configuration** n'est pas concernée : ce qu'une équipe déclare lui appartient.

L'expansion étant déclenchée par `Tab` et non au fil de la frappe, `?i` et `?ib` peuvent coexister : ce qui doit être unique, c'est l'abréviation **au moment où `Tab` est pressée**, pas au fil des caractères. La table étant configurable, c'est cette propriété qui est normative, et non une longueur fixe.
- Raccourcis directs configurables (ex. `Alt+I` pour `issue`).
- La liste de complétion suit l'ordre des boutons (§5.1), ordre personnel compris : le groupe `remark`, puis le groupe `reply`.

### 5.3 Retour visuel temps réel

- **Pastille de validation** permanente sous la zone de saisie : ✅ conforme / ⚠️ conforme, avec avertissements / ❌ non conforme. Les deux premiers états sont **conformes** au sens du §3.5.2 — la distinction est informative, pas normative.
- Une situation fait que la pastille **ne peut pas affirmer** « conforme », et elle prime alors sur ✅ : l'**état dégradé** au sens du §5.4 — une configuration que l'extension n'a pas pu lire. Afficher « conforme » sans avoir pu lire les règles serait une affirmation que rien ne soutient.
- **Avis de configuration.** Les faits que la résolution de la configuration signale — `floor-override`, `config-warning`, `invalid-config`, `unsupported-version` (§9.2.1) — s'affichent là où l'extension montre son état dégradé : dans la pastille et dans la page d'options (décision du propriétaire, 2026-11-10). Ils ne changent aucun verdict.
- En cas d'erreur : message explicite dans la langue résolue au §8.1.2, avec le code (§3.5) et une proposition de correction actionnable en un clic.
- **Quand plusieurs diagnostics s'appliquent** — les contrôles de contenu sont cumulatifs (§3.5.1) : l'indicateur d'état porte la **sévérité la plus élevée**, et le message les énumère **tous**, dans l'ordre de restitution du §3.5.1, chacun avec sa correction quand elle est calculable. N'en afficher qu'un ferait réapparaître le suivant après chaque correction, autant de fois qu'il reste d'écarts.
- Bordure de la zone de saisie colorée selon l'état.
- Aucun clignotement ni déplacement de contenu (pas de *layout shift*) pendant la frappe. Validation débattue (*debounce*) à 150 ms.

### 5.4 Blocage de l'envoi (mode `enforce`)

**Quand le blocage s'applique.** Le mode `enforce` ne suffit pas : deux conditions doivent être réunies, et elles sont énoncées ici parce qu'elles ne le sont nulle part ensemble.

1. le mode effectif est `enforce` (§7) ;
2. la configuration effective a été **lue sans repli dégradé** — aucune des lectures du §9.2.3 n'a rendu `{ status: 'unreachable' }`. C'est le sens normatif, et le seul, de l'expression **état dégradé** dans ce document : on ne refuse pas un envoi au nom d'une règle qu'on n'a pas pu lire. Un fichier simplement absent n'est pas une dégradation, et la dégradation de sélecteur du §9.4 est encore autre chose.

Si l'une manque, l'extension se comporte comme en mode `assist` : elle affiche ses diagnostics et laisse publier. Le blocage ne dépend ni de l'âge de la PR ni d'aucun état publié sur elle (décision du propriétaire, 2026-11-10).

- Le bouton d'envoi est marqué `aria-disabled="true"` tant que le commentaire est en erreur, et son activation est interceptée. **L'attribut natif `disabled` ne doit pas être utilisé ici** : il retire l'élément de l'ordre de tabulation, si bien qu'une personne naviguant au clavier n'atteint jamais le bouton et n'entend donc jamais le motif du blocage — ce qui viderait `CA-12` (§11) de son sens. `disabled` reste réservé aux contrôles réellement inertes.
- Le motif du blocage est annoncé dans une zone `aria-live="polite"`.
- L'interception doit également couvrir la soumission au clavier.

**Pas de bouton de contournement — décision assumée.** Ce document ne prévoit **aucun** bouton permettant de publier un commentaire non conforme, pour deux raisons.

La première est qu'un tel bouton **ne contrôlerait rien**. Une extension navigateur se désactive en deux clics, et le §2 pose déjà que le composant A est contournable par construction. Il n'ajouterait donc aucune capacité réelle à qui veut passer outre : seulement une cérémonie, un motif à saisir, un journal nominatif à tenir — et l'illusion d'un contrôle là où il n'y en a pas.

La seconde est plus importante : **il ferait sortir la justification hors de la convention.** Or la convention existe précisément pour rendre l'intention de revue explicite et lisible par tous, dans le fil, à l'endroit où la discussion a lieu. « Nous avons choisi de ne pas traiter ce point, pour telle raison » est un acte de revue à part entière, pas une échappatoire technique : sa place est dans un commentaire labellisé (§6.1.1), visible de tous et conservé avec la PR — pas dans un journal externe que personne ne relit.

Le blocage d'envoi du mode `enforce` est donc un **garde-fou, pas un mur** : il empêche l'erreur d'inattention, qui est le cas courant, et n'a jamais prétendu empêcher la personne déterminée. Le produit ne fournit aucune contrainte en aval (§2).

### 5.5 Affichage des commentaires publiés

- Les labels des commentaires déjà publiés sont rendus sous forme de badges colorés (option `badgeStyle`, voir schéma §8.2), sans modifier le contenu stocké côté plateforme. Un badge porte **l'identifiant du label et, lorsqu'elle est configurée, son icône** : `labels[].icon` est optionnel, et un label qui n'en déclare pas donne un badge à l'identifiant seul.
- Infobulle au survol du badge de label : **ce que le commentaire signifie**, pour qui le lit, dans la langue de l'interface, et sans exemple, puisque le commentaire est sous ses yeux. Elle n'est pas celle du bouton (§5.1), qui dit quand employer le label. Le texte est **positif** — il dit l'intention du relecteur sans juger le lecteur — et ne promet rien que le label ne garantisse : ni qu'un point est bloquant, ce que dit le badge de décoration, ni qu'une piste de correction l'accompagne. Une configuration qui écrit `labels[].description` (§8.2) la remplace, et la retire si elle l'écrit vide. Un label qu'aucune source ne décrit, créé par une organisation ou un dépôt sans texte, n'a d'infobulle ni sur le badge ni sur le bouton. Le badge garde le curseur flèche : il se survole pour être compris, il ne se sélectionne pas comme le texte qui l'entoure.
- Un bandeau en tête de PR récapitule : *N **fils** bloquants non résolus*, avec liens d'ancrage vers chacun. Des **fils**, et non des commentaires : c'est ce que définit le §6.1, et `CA-03` exige que le bandeau et `isBlocking()` (§9.2.2) comptent la même chose — en valeur comme en sens. **Sa source est unique : les fils lus dans le DOM de la page** (`getThreads()`, §9.2.3) (décision du propriétaire, 2026-11-10). Un fil dont l'état n'y est pas rendu (`resolution: 'unknown'`) est compté **non résolu**, comme au §B.5, et reçoit son ancre comme les autres.

  Le bandeau compte ce que la page montre : un fil est résolu tel que la plateforme l'affiche, quel que soit l'auteur de la résolution — l'extension ne tranche aucune autorisation (§10). Une rédaction antérieure affichait d'abord un décompte publié par un vérificateur et ne se rabattait sur la page qu'à défaut ; ce vérificateur est retiré (§2), et la page est désormais la seule source.
- Filtre local par label dans la liste des fils de discussion.
- **Marqueur de session** (§3.6). Dans un commentaire publié, la dernière ligne `[session:<valeur>]` reconnue est masquée et remplacée **à sa place**, en bas du commentaire, par une mention discrète : l'icône `sessionIcon` (§8.2, un robot par défaut), puis `session: ` et la valeur **en minuscules** — `🤖 session: melancholy-coordinated-value-object`. La mention est un texte **atténué** (la couleur de texte secondaire de la plateforme) et en italique, sur sa propre ligne, séparée de ce qui la précède par **un écart de paragraphe** — l'équivalent d'une ligne blanche. **En-tête et pied sont symétriques** : la ligne du sujet est séparée du corps par le même écart. Un commentaire écrit avec des lignes blanches (faites d'espaces ou non) entre le préfixe, le corps et le marqueur, et le même écrit d'un bloc, une fin de ligne simple entre chacun, se rendent **à l'identique** : le rendu Markdown replie les premières, l'extension pose le même écart à la place des secondes. L'écart est celui que la page applique entre deux paragraphes, lu au rendu et non supposé ; seule dans le corps, la mention n'a rien au-dessus d'elle et aucun écart. Ni `#`, ni badge, ni panneau : la mention est distincte des badges de label et de décoration, et ne change le sens d'aucun d'eux. Elle est affichée quel que soit le verdict du commentaire, y compris sans label résolu. C'est une **projection client** : le contenu stocké garde le marqueur tel qu'écrit, casse comprise, et l'édition le montre. Comme pour le masquage du préfixe, la projection **renonce** dès qu'elle n'est pas sûre — dernier bloc qui n'est pas l'un des paragraphes déclarés par `renderedBodyShape()`, forme non mesurée (`null`), dernière ligne qui ne se réduit pas à un nœud de texte égal au marqueur, mise en forme sur la ligne — et le marqueur reste alors lisible tel qu'écrit. Elle est **défaite** quand la dernière ligne cesse d'être un marqueur, quand la plateforme cesse de déclarer sa forme, et quand l'extension se retire (mode `off`, plus de PR).

**Masquage du préfixe et mise en avant du sujet.** Les badges disent déjà ce que le préfixe structuré écrit ; les laisser côte à côte fait lire deux fois la même chose. Quand les conditions ci-dessous sont réunies, le préfixe est donc **masqué dans le corps rendu** — jamais supprimé du contenu stocké (§5.5, premier point) —, les badges prennent sa place **en tête de la ligne du sujet**, et le **sujet** — le texte qui suit le préfixe jusqu'à la première fin de ligne — est mis en avant. La ligne se lit alors comme un titre : de quoi il s'agit, précédé de ce qui le qualifie.

Le masquage n'est permis **que si la projection en badges est sans perte** : tout ce qui disparaît du texte doit rester lisible **par son nom** dans les badges. Une décoration syntaxiquement valide mais rejetée (§3.3), ou repliée dans un badge de dépassement « +N », interdit donc le masquage — la replier ET l'effacer du texte perdrait l'information au lieu de la déplacer.

**Ces deux opérations interrogent la plateforme, et renoncent quand elle ne répond pas.** Ce qu'elles ont besoin de savoir — quelles balises enveloppent une ligne de Markdown ordinaire, laquelle matérialise une fin de ligne simple — est un fait de RENDU, propre à chaque plateforme, que le §9.2.3 fait déclarer par l'adaptateur (`renderedBodyShape()`). Le renoncement est obligatoire dans chacun de ces cas :

- la plateforme n'a pas mesuré la forme de son corps rendu (`renderedBodyShape()` rend `null`) ;
- le conteneur de premier niveau n'est pas l'une des balises de paragraphe déclarées ;
- la projection en badges n'est pas sans perte, au sens ci-dessus.

**Renoncer, c'est afficher moins, jamais afficher faux.** Les badges restent posés — au-dessus du corps plutôt que dans la ligne du sujet —, le corps s'affiche **entier**, préfixe compris, et rien n'est ni tronqué ni réordonné. C'est un **repli de rendu**, et il faut le distinguer de la dégradation de sélecteur du §9.4 : celle-ci constate qu'une détection a ÉCHOUÉ et se journalise à ce titre, alors qu'ici la plateforme a répondu — elle a répondu qu'elle ne sait pas. Rien à journaliser, donc, et surtout pas à chaque rendu de chaque commentaire. Le point commun avec `CA-11` est ailleurs, et il est le seul qui vaille : aucun dialogue, aucune exception, aucun contrôle natif entravé. C'est le seul repli admissible — un rendu incomplet se corrige, un rendu faux se remarque après coup. En particulier, une borne de sujet calculée sur une balise que la plateforme n'emploie pas ferait passer une partie de la discussion dans le sujet mis en avant — c'est le défaut que ces règles existent pour rendre impossible.

Une plateforme qui **cesse** de répondre après avoir répondu — configuration modifiée, mise à jour de l'adaptateur — doit voir le masquage antérieur **défait**, et non simplement plus entretenu : un préfixe masqué que plus rien ne gouverne serait un contenu perdu pour le lecteur. **Désactiver un label produit la même situation par un autre chemin** : le préfixe des commentaires déjà publiés qui le portent cesse de se résoudre, et il doit alors réapparaître dans le corps rendu. Le cas devient courant avec les labels de réponse, qu'une équipe peut désactiver après les avoir employés ; il vaut pour tout label qu'on désactive.

**Les labels ajoutés portent des badges ordinaires**, avec icône et couleur, sous les mêmes règles de projection sans perte et de masquage. Deux contraintes qui sont des **mesures**, pas des goûts. D'abord, chaque couleur est vérifiée à 3:1 au moins (WCAG 2.1 SC 1.4.11) contre les **neuf fonds Primer de github.com**, comme toutes les autres — ce sont les seuls fonds mesurés, et le garde porte le nom de sa plateforme. Les fonds d'Azure DevOps ne l'ont jamais été : le chiffre de 3:1 n'y est donc pas établi, et cette mesure reste à écrire au même titre que celle de la barre demandée au §5.1 — une palette choisie à l'œil est déjà descendue à 1,23:1 en thème sombre sur `decision`. Ensuite — et c'est une contrainte **éditoriale** sur la palette, non une mesure : ne pas aller chercher le garde qui la vérifierait — `disagree` doit être **neutre, jamais rouge ni dans un registre d'alerte** — tout en restant distinguable de `nitpick`, qui occupe déjà le neutre de la palette (`#76818E`) : deux gris voisins sur deux intentions opposées se valent un badge illisible, et le garde de contraste n'écarte que les doublons exacts. Le rouge, lui, est celui d'`issue`, et un badge de désaccord en couleurs d'accusation est plus brutal que la phrase qu'il résume, dans un produit dont l'amont consacre une page entière à la façon de formuler une remarque. Les quatre nouveaux badges doivent être mesurés par `check:subject-line`, qui ne rend aujourd'hui que des commentaires fixes portant un seul label : les y faire entrer est un élargissement du garde, pas un simple rejeu.

---

## 6. Fils bloquants

Cette section définit ce que le bandeau du §5.5 compte. Une rédaction antérieure la consacrait au blocage de la complétion de la PR par un vérificateur ; ce blocage est retiré (§2), et O3 se limite au signalement (décision du propriétaire, 2026-11-10).

### 6.1 Définitions

Un fil de discussion est **bloquant** si son **commentaire racine** est bloquant au sens du §3.3.

Un fil bloquant est considéré **résolu** selon des états propres à chaque plateforme — voir annexes A, B et C pour le détail des statuts pris en compte.

Un fil est résolu **tel que la page l'affiche, quel que soit l'auteur de la résolution** : l'extension ne tranche aucune autorisation (§10). Une rédaction antérieure ne retenait une résolution que de l'auteur du commentaire racine, ou d'un membre d'un groupe habilité appuyé sur une réponse `decision` ; cette règle de gouvernance n'était appliquée que par le vérificateur, et elle est retirée avec lui (décision du propriétaire, 2026-11-10).

**Le caractère bloquant d'un fil se lit de l'état courant, et de lui seul.** Un fil est bloquant si son commentaire racine l'est **maintenant** (§3.3). Éditer une racine `issue:` en `note:` la rend donc non bloquante, et le fil cesse d'être compté.

C'est un contournement, et il est assumé. Une règle de **monotonie** l'interdirait — une racine observée bloquante ne pourrait plus être affaiblie —, mais elle demanderait de se souvenir de ce qu'un commentaire disait avant : ce qu'aucune page de plateforme ne rend, et que l'extension ne retient pas.

Ce qui en tient lieu n'est pas un mécanisme : c'est le fait que **la plateforme rend le geste visible**. Une racine éditée porte la mention « edited », son historique est consultable, et le fil reste dans la page sous le nom de son auteur. Un outil qui prétendrait empêcher cela déplacerait un problème d'équipe vers un problème de configuration, sans le résoudre.

Il en va de même de la **suppression** d'un commentaire racine : le fil qu'il portait cesse d'être compté, et rien n'est signalé — l'extension ne compare pas l'état courant à un passé qu'elle ne détient pas.

#### 6.1.1 Clore un fil bloquant sans faire le changement demandé

Un fil bloquant se referme normalement parce que le point soulevé a été traité, et c'est son auteur qui en juge. Reste le cas où l'équipe décide **délibérément de ne pas le traiter** : le point est hors périmètre, la dette est assumée, l'arbitrage a été rendu ailleurs, ou un correctif urgent doit partir maintenant et son auteur est indisponible.

Ce cas ne relève pas d'un contournement de l'outil : c'est une **décision de revue**, et elle se prend dans la convention.

**Règle.** La réponse qui acte ce choix porte le label `decision` et énonce le motif :

```
decision: hors périmètre de cette PR, dette suivie en PROJ-142

L'auteur du commentaire est en congé et le correctif doit partir
aujourd'hui. Le point est réel, il sera traité dans la PR de suivi.
```

Conditions de forme, validées par l'extension à la saisie (§3.5) :

- son sujet est renseigné et d'au moins 20 caractères (`rules.minDecisionSubjectLength`) — un motif tel que « ok » ne documente rien et rendrait la règle décorative. En deçà, `E-DECISION-SUBJECT` (§3.5.2) : la réponse ne vaut pas décision ;
- elle se trouve **dans le fil** qu'elle clôt, jamais ailleurs.

**Ce que `decision` ne fait pas.** Il ne résout pas le fil : la résolution reste un geste de la plateforme, fait par qui elle y autorise. Et il ne porte plus d'effet vérifié par un tiers : une rédaction antérieure le réservait à un groupe habilité et en faisait la seule voie pour qu'une résolution par un autre que l'auteur du commentaire soit retenue ; cette gouvernance est retirée (§6.1) (décision du propriétaire, 2026-11-10). Ce qui reste est une **convention de revue outillée** : le label, son seuil, et sa place dans le fil.

**Pourquoi ce mécanisme plutôt qu'un bouton de contournement.** Il produit exactement ce qu'un contournement détruit : une trace **lisible par des humains**, **à l'endroit de la discussion**, **conservée avec la PR**, et **attribuée**. Une personne qui relit la PR six mois plus tard voit la décision et son motif ; un journal externe, elle ne l'ouvrira jamais. `decision` est par ailleurs `alwaysNonBlocking` (§3.2) : une décision ne peut pas elle-même ouvrir un fil bloquant.

**Ce que ce n'est pas.** `decision` ne dispense pas du format et ne s'applique pas aux commentaires non conformes.

**Aucun label ajouté ne s'y substitue.** Les labels ajoutés du §3.2 — `thanks`, `done`, `ack`, `disagree`, `reviewed` — ne valent pas décision, ne résolvent ni ne dé-résolvent rien, et — avec leurs drapeaux livrés, qu'un dépôt peut surcharger (`CA-45`, `CA-46`) — n'entrent pas dans le décompte des fils bloquants. Écrire `done:` ou `disagree:` dans un fil bloquant ne le referme pas, et `reviewed:` n'approuve pas la PR. La clause est écrite **ici**, et pas seulement au §4.1, parce que c'est ici que la cherchera qui croit avoir refermé un fil avec le mot que le vocabulaire venait de lui donner. C'est cette clause qui empêche le vocabulaire de devenir un enchaînement.

---

## 7. Modes de fonctionnement (adoption progressive)

Configurables globalement et surchargeables par dépôt, sous réserve du plancher imposé par une politique d'entreprise (§8.1).

| Mode | Assistance | Diagnostic affiché | Envoi bloqué |
|------|:---:|:---:|:---:|
| `off` | ❌ | ❌ | ❌ |
| `assist` *(défaut à l'installation)* | ✅ | ✅ | ❌ |
| `enforce` | ✅ | ✅ | ✅ (§5.4) |

**`warn` est retiré, et reste accepté comme alias d'`assist`** (décision du propriétaire, 2026-11-10). Les deux modes étaient identiques côté extension — assister et afficher ses diagnostics sans jamais bloquer l'envoi — et ne se distinguaient que par ce que publiait le vérificateur, retiré (§2). Une configuration ou un plancher qui écrit `"warn"` est lu comme `"assist"` : le refuser comme valeur hors domaine ferait retomber dans le repli du §8.1.5 toute configuration existante qui l'emploie. Sur l'échelle du plancher (§8.1.1), `warn` se range donc avec `assist`. La lecture de `"warn"` produit un avis `config-warning` — valeur obsolète, à remplacer par `"assist"` —, affiché comme les autres avis de configuration (§5.3), pour que les configurations existantes soient mises à jour plutôt que de porter indéfiniment un mode qui n'existe plus.

**Le vocabulaire ne figure pas sur cette échelle et ne la modifie pas.** Activer ou désactiver les labels ajoutés (§3.2) ne change ni le mode effectif, ni ce qu'un mode fait d'un commentaire non conforme : le vocabulaire dit **ce qui est un label**, l'échelle dit **ce qu'il advient** de ce qui n'en porte pas. Le tableau reste à trois lignes. C'est vrai par construction — `labels[]` n'a jamais interagi avec `mode` —, et la phrase est ici pour qu'on n'aille pas le redériver.

**Trajectoire recommandée**, à partir du mode `assist` livré par défaut : `assist`, le temps de suivre le taux de conformité si la télémétrie est activée (§12) → `enforce` sur un dépôt pilote → généralisation.

---

## 8. Configuration

### 8.1 Emplacement et précédence

La configuration se résout en **deux temps**.

#### 8.1.1 Bornes (plancher)

Un **plancher** fixe un mode minimum (`minimumMode`) et une liste de règles non désactivables. Aucune configuration de niveau inférieur ne peut assouplir le mode en deçà de ce plancher ni désactiver une règle qu'il impose ; un dépôt peut en revanche durcir davantage.

**Le plancher a un seul canal** : la politique d'entreprise poussée par le navigateur (clé de manifeste `storage.managed_schema`, API `chrome.storage.managed`, nœud de politique `3rdparty`), dont la portée est le poste de travail. Une rédaction antérieure lui ajoutait un second canal — un document servi par une URL, lu par le vérificateur — qui disparaît avec lui (§2) (décision du propriétaire, 2026-11-10).

**Forme du plancher.** Le canal porte un document, dont voici le schéma. Il ne reprend que les clés plancher-ables : un plancher n'est pas une configuration et ne fixe aucune valeur par défaut.

```json
{
  "floorVersion": 1,
  "configUrl": "https://interne.example/cc/organisation.json",
  "minimumMode": "assist",
  "severities": { "E-NO-LABEL": "error", "E-UNKNOWN-LABEL": "error" },
  "labels":      { "minimum": ["issue", "todo"] },
  "rules": { "minDecisionSubjectLength": 20 },
  "exemptUsers":       { "minimum": ["<compte-de-service>"], "closed": false },
  "allowlistPatterns": { "minimum": [], "closed": true },
  "toolCommands":      { "minimum": [], "closed": false },
  "configCacheTtlSeconds": 3600
}
```

**Deux natures de clés dans ce document.** `minimumMode` et les suivantes sont des **bornes** : elles contraignent ce qu'un niveau inférieur peut écrire. `floorVersion` et `configUrl` sont des **clés de canal** : elles ne bornent rien, elles disent au composant qui lit le plancher comment lire le reste. `configUrl` y figure parce qu'elle n'a pas d'autre emplacement possible — la porter dans le fichier de dépôt reviendrait à laisser un dépôt désigner lui-même la configuration d'organisation qui est censée le contraindre (§8.1.2).

`floorVersion` suit la même règle que la version du schéma de configuration : un plancher dont la version dépasse celle supportée par l'extension déclenche le repli du §8.1.5 — mode `assist`, ou le plancher **précédemment connu** s'il est plus strict — et le fait est signalé (`unsupported-version`, §9.2.1). Un plancher qu'on ne sait pas lire ne s'efface jamais en silence.

Toute clé absente n'est **pas** planchée. **En l'absence de politique d'entreprise — canal muet — le plancher vaut `{"minimumMode": "off"}` et n'impose aucune règle** : c'est le cas du déploiement public standard, où la configuration de dépôt et celle d'organisation décident seules. C'est aussi ce que désigne « le plancher en vigueur » partout où le document emploie l'expression.

`minimumMode` porte le plancher de la clé `mode`. Le nom diffère volontairement pour qu'un plancher ne puisse être ni confondu avec une configuration, ni collé tel quel dans l'un des fichiers du §8.2.

**Clés soumises au plancher** (« plancher-ables ») : `mode` (via `minimumMode`), `severities`, `labels[].enabled`, `labels[].blockingByDefault` et `labels[].alwaysNonBlocking` (via `minimum`), `rules.minDecisionSubjectLength`, `exemptUsers`, `allowlistPatterns`, `toolCommands` et `configCacheTtlSeconds`. Ce sont celles qui, laissées libres, permettraient de se soustraire à la contrainte. Les clés purement cosmétiques ou ergonomiques — libellés, icônes, langue, style de badge, seuils de longueur du sujet — restent librement surchargeables.

**Ce que « plancher » signifie, clé par clé.** « Plancher » veut dire *le niveau inférieur ne peut pas assouplir* — mais assouplir ne se traduit pas par la même opération arithmétique selon la clé. Le tableau est donc normatif ; il ne se déduit pas d'une règle générale.

| Clé | Contrainte imposée au niveau inférieur |
|---|---|
| `mode` | **Minimum** sur l'échelle des modes : `enforce` > `assist` > `off` — `warn`, alias d'`assist` (§7), se range avec lui. Durcir est permis. |
| `rules.minDecisionSubjectLength` | **Minimum** numérique : on peut exiger un motif plus long, jamais plus court. |
| `severities` | Ensemble de codes dont la sévérité **ne peut pas être abaissée**. |
| `configCacheTtlSeconds` | **Maximum** : un niveau inférieur peut raccourcir le cache de l'extension, jamais l'allonger au-delà de ce que le plancher accepte. C'est la durée pendant laquelle un poste peut assister sur une configuration périmée (§8.1.3, règle 4). |
| `exemptUsers`, `allowlistPatterns`, `toolCommands` | Deux contraintes distinctes. `minimum` est le **sous-ensemble** qu'aucun niveau inférieur ne peut retirer. `closed` gouverne l'autre sens : à `true`, **aucun ajout** n'est admis en dessous du plancher. |
| `labels` | `minimum` : ensemble d'`id` dont **aucun des trois drapeaux ne peut être assoupli** en dessous du plancher — ni `enabled` ni `blockingByDefault` ne passent à `false`, et `alwaysNonBlocking` ne passe pas à `true`. Le plancher **force toujours `enabled`** ; il ne relève `blockingByDefault` que sur un label dont le produit livre l'`alwaysNonBlocking` à `false` — la valeur **livrée**, jamais l'effective. Un label que le produit ne livre pas — un label maison qu'une organisation impose — compte comme livré à `false` : le plancher le rend bloquant, comme il l'a toujours fait. Voir la seconde justification ci-dessous. C'est aussi la clé dont l'absence viderait le décompte des fils bloquants. |

Le drapeau `closed` mérite sa justification, car il fait exception à la fusion par union du §8.1.4. Sur `exemptUsers`, la seule contrainte d'un sous-ensemble minimal borne l'opération qui **durcit** — retirer une exemption — et laisse entière celle qui **assouplit** : un dépôt s'ajoute lui-même à la liste et sort de la contrainte, immédiatement et jusque sur ses PR déjà ouvertes, la fusion par union étant élargissante (§8.1.3). Ce serait l'inverse exact du principe du plancher : durcir est toujours permis, assouplir ne l'est pas en dessous de lui. C'est donc `closed` qui rend ces trois clés réellement plancher-ables ; `minimum` seul ne suffit pas.

**Pourquoi `labels` est plancher-able, alors qu'elle a l'air d'un simple réglage.** C'est la clé par laquelle un dépôt éteint la contrainte le plus complètement, et sans rien désactiver en apparence. Il suffit de pousser sur la branche par défaut :

```json
{ "labels": [ { "id": "issue", "enabled": false },
              { "id": "todo",  "enabled": false },
              { "id": "chore", "enabled": false } ] }
```

Plus aucun label n'est `blockingByDefault`. Tout `issue:` ressort en `E-UNKNOWN-LABEL` à l'étage 2, n'atteint donc jamais le temps 2, et **aucun fil n'est plus bloquant** : le bandeau du §5.5 n'en signale plus aucun, et le départage `E-CONFLICT` devient inopérant, par un commit qu'une seule personne peut pousser. C'est exactement le test que la phrase ci-dessus énonce — « se soustraire à la contrainte » — et `labels` y échoue plus complètement que `mode`, qui est protégé.

**Pourquoi le plancher ne relève pas `blockingByDefault` sur un label toujours non bloquant.** Forcer les deux drapeaux ensemble paraît naturel — le plancher existe pour durcir — et produit pourtant une paire **incohérente** : `alwaysNonBlocking: true` avec `blockingByDefault: true`. Un `done:` nu devient alors bloquant par la règle 5 du §3.3, tandis que `done (blocking):` produit `E-CONFLICT` par la règle 1 — le même label bloque quand on ne le dit pas et refuse qu'on le dise. L'organisation qui rendrait obligatoire le vocabulaire de réponse ferait ainsi de chaque accusé de réception un fil bloquant, ce que personne ne demande en écrivant `{"labels": {"minimum": ["thanks", "done", "ack", "disagree", "reviewed"]}}`.

Le point ne naît pas avec cette famille : il vaut déjà pour `decision`, et il contredit alors la phrase du §6.1.1 selon laquelle « une décision ne peut pas elle-même ouvrir un fil bloquant ». Les labels ajoutés apportent cinq cibles à un défaut qui existe ; la règle ci-dessus le referme pour tous. Elle ne retire rien au plancher : `enabled` reste forcé, et c'est bien lui qui rend un vocabulaire obligatoire.

**Pourquoi la valeur LIVRÉE, et pourquoi `alwaysNonBlocking` devient plancher-able du même coup.** Écrite sur l'`alwaysNonBlocking` **effectif**, cette exception rouvrirait en un geste la porte que tout le §8.1.1 ferme, et sur **n'importe quel** label. `alwaysNonBlocking` n'était protégé par rien, et la configuration s'applique en direct (§8.1.3, règle 1) : un dépôt sous un plancher `{"labels": {"minimum": ["issue"]}}` écrivait `{"id": "issue", "blockingByDefault": false, "alwaysNonBlocking": true}`, l'exception se déclenchait sur le drapeau qu'il venait lui-même de poser, `blockingByDefault` n'était plus forcé, et `issue:` cessait d'ouvrir un fil bloquant — plancher `enforce` compris.

Deux verrous plutôt qu'un, parce qu'ils ferment deux moitiés différentes. La valeur **livrée** rend l'exception insensible à ce qu'un dépôt déclare : elle vaut pour `decision` et les cinq labels ajoutés, que le produit livre ainsi, et pour eux seuls. Et interdire de **relever** `alwaysNonBlocking` sur un `id` planché ferme l'autre moitié — celle qui, sans toucher à l'exception, produirait quand même la paire incohérente sur un `issue` planché, où `issue:` bloque par la règle 5 pendant que `issue (blocking):` est refusé par la règle 1. C'est le sens habituel du plancher, appliqué à un troisième drapeau : durcir reste permis — un dépôt peut toujours passer `alwaysNonBlocking` de `true` à `false` —, assouplir ne l'est pas.

Une erreur d'implémentation typique consisterait à appliquer `max(plancher, dépôt)` à toutes les clés scalaires : sur `configCacheTtlSeconds`, borné en **maximum**, cela produit exactement l'inverse de l'effet recherché.

#### 8.1.2 Valeur effective

Par ordre de priorité décroissante, **au sein des bornes ci-dessus** :

1. `.conventional-comments.json` à la racine de la branche par défaut du dépôt.
2. Configuration d'organisation, servie par une URL.
3. Valeurs par défaut du produit.

**L'extension met ces lectures en cache**, pour `configCacheTtlSeconds` (3600 s par défaut) sur les niveaux 1 et 2. Elle peut donc juger sur une configuration périmée pendant au plus cette durée — pour l'affichage seulement : avant de bloquer un envoi, elle contourne son cache (§8.1.3, règle 3).

**D'où vient cette URL.** `configUrl` provient **exclusivement** du canal de plancher (§8.1.1). Un `configUrl` posé dans le fichier de dépôt est **ignoré**, et le fait signalé (`config-warning`, §9.2.1). Sans cette règle, un dépôt détournerait le niveau 2 vers un document qu'il contrôle et se donnerait à lui-même la configuration d'organisation — ce que toute cette section existe pour empêcher. La résolution serait par ailleurs circulaire : il faudrait lire la configuration pour savoir où aller la chercher.

Le fichier de dépôt étant modifiable par les personnes mêmes que la convention encadre, il ne peut jamais assouplir une clé plancher-able : un `{"mode": "off"}` poussé sur la branche par défaut d'un dépôt dont le plancher d'organisation vaut `enforce` est **ignoré pour la clé `mode`**, et le fait est signalé (`floor-override`, §5.3).

Les préférences locales de l'utilisateur restent, dans tous les cas, **limitées** : langue, thème, raccourcis, ordre des boutons de label (§5.1), style de badge. L'utilisateur ne peut ni assouplir le mode ni modifier la liste des labels, quel que soit le niveau de configuration en vigueur.

**Résolution de la langue**, par ordre de priorité décroissante : préférence locale de l'utilisateur, puis clé `language` de la configuration effective, puis langue de l'interface de la plateforme.

#### 8.1.3 Application de la configuration

Cette section dit quand une modification de configuration prend effet dans l'extension. Elle s'intitulait « Parité A/B » et fermait les divergences entre l'extension et un vérificateur, retiré (§2) ; seules restent les règles qui gouvernent l'extension elle-même (décision du propriétaire, 2026-11-10). La numérotation des règles est conservée : la règle 2, comparaison des empreintes de configuration, est retirée.

**1. La configuration s'applique en direct, dans les deux sens.** Une modification — restrictive comme élargissante — vaut pour les PR déjà ouvertes dès que l'extension la lit : à l'expiration de son cache (règle 4), ou aussitôt avant tout blocage d'un envoi (règle 3). Il n'existe pas de configuration épinglée.

**Le coût doit être dit.** Durcir la configuration d'un dépôt peut rendre non conforme, sur une PR ouverte, un commentaire que son auteur avait écrit conforme. Et le caractère bloquant d'une racine dépend de la configuration : passer `labels[].blockingByDefault` de `false` à `true`, ou activer un label bloquant par `labels[].enabled`, rend bloquantes des racines non résolues qui ne l'étaient pas — sur **toutes** les PR ouvertes à la fois, et sans qu'aucune d'elles ait changé : le bandeau du §5.5 les signale d'un coup. Le levier est ordinaire : durcir en `assist`, observer ce que la pastille et le bandeau signalent, puis passer en `enforce`.

**3. Contournement du cache.** Le cache de configuration (§8.1.2) est contourné dans **une situation, et une seule** : avant de bloquer un envoi, quel que soit le diagnostic. L'extension ne peut pas apprendre autrement qu'un document distant a changé ; c'est cette relecture qui rend effectifs sans attente, au moment où ils comptent, aussi bien un assouplissement du `mode` que l'ajout d'un label.

*Assouplissement du `mode`.* La configuration d'organisation (§8.1) est le point de bascule : le passage de `enforce` à un mode inférieur doit valoir **sur l'ensemble des dépôts qui n'écrivent pas eux-mêmes leur `mode`**, sans intervention par dépôt. Elle ne peut pas davantage : le fichier de dépôt l'emporte sur elle (§8.1.2), si bien qu'un dépôt qui écrit `"mode": "enforce"` continue de bloquer ; et un plancher `minimumMode: "enforce"` (§8.1.1) ne se laisse assouplir par aucun des deux. Un retour arrière complet assouplit donc, dans cet ordre, le plancher de la stratégie d'entreprise s'il impose `enforce`, la configuration d'organisation, puis le fichier de chaque dépôt qui l'écrit (§14). **Un assouplissement du `mode` lève donc tout blocage dès la tentative d'envoi suivante**, sans attendre l'expiration du cache (décision du propriétaire, 2026-11-10). L'extension n'a aucun moyen d'apprendre qu'un document distant a changé — rien ne le lui notifie —, et c'est donc au moment de bloquer qu'elle vérifie : **avant tout blocage d'un envoi**, elle relit sa configuration en contournant son cache (paragraphe suivant). Un envoi n'est jamais bloqué sur une configuration périmée ; l'affichage, lui — pastille, diagnostics —, peut garder l'ancien mode jusqu'à l'expiration de `configCacheTtlSeconds`, une heure par défaut, ce qui ne bloque rien. `CA-27` le teste.

*Avant un rejet.* Avant de **bloquer un envoi**, quel que soit le diagnostic — `E-NO-LABEL` compris, et pas seulement les rejets qui dépendent du vocabulaire, `E-UNKNOWN-LABEL` et `E-UNKNOWN-DECORATION` —, l'extension rafraîchit **les deux niveaux** en contournant son cache : `getRepoConfig({ bypassCache: true })` **et** `getOrgConfig({ bypassCache: true })` (§9.2.3), puis revalide le texte sur la configuration relue. Les **deux**, car un label peut avoir été ajouté, ou le `mode` assoupli, au fichier du dépôt aussi bien qu'au document d'organisation. Ce n'est qu'après cette relecture qu'un blocage est prononcé. Le coût est une relecture par envoi refusé, jamais par frappe.

C'est une application directe de la règle 1 : l'ajout d'un label est une modification élargissante, donc effective en direct. Sans ce rafraîchissement, elle serait vraie sur le papier et fausse en pratique pendant toute la durée du cache — l'extension refuserait une saisie que la configuration courante accepte, sur un label que l'organisation vient d'ajouter.

**4. Un seul cache, celui de l'extension.** `configCacheTtlSeconds` décrit la durée pendant laquelle l'extension peut assister sur une configuration périmée. La clé reste plancher-able (§8.1.1), pour qu'une organisation puisse borner de combien un poste peut être en retard sur elle.

**5. Compatibilité de `core/`.** L'extension se met à jour automatiquement depuis un store, à son rythme, et une configuration peut avoir été écrite pour une version de `core/` plus récente que celle qu'elle embarque. Le fichier de configuration porte donc `coreMinVersion` : une configuration produite pour une version majeure supérieure à celle de l'extension qui la lit déclenche **le repli que le §8.1.5 définit pour une version de schéma non supportée — mode `assist`, ou le plancher en vigueur s'il est plus strict** — et l'écart est signalé (`unsupported-version`, §5.3). Les deux cas partagent le même repli parce qu'ils posent le même problème : un document qu'on sait lire mais qu'on ne sait pas appliquer entièrement.

**6. Normalisation d'entrée.** Traitée au §3.4.1, qui est normatif.

#### 8.1.4 Sémantique de fusion

Sans règle explicite, un dépôt qui ne déclare que deux labels laisse indéterminé s'il en a désormais deux ou dix — et deux implémentations raisonnables produiraient deux produits différents. La règle est donc fixée **par clé** :

| Clé | Fusion |
|-----|--------|
| `labels` | **Fusion par `id`.** Un niveau inférieur surcharge les propriétés d'un label existant et peut en ajouter de nouveaux ; il ne supprime jamais un label. Pour retirer un label, lui donner `"enabled": false`. |
| `decorations.known` | Fusion par `id`, même règle. |
| `shortcuts.abbreviations` | **Fusion par abréviation**, même règle que `severities` : un niveau inférieur en ajoute ou en redéfinit une sans effacer les autres. |
| `severities` | **Fusion par code.** Un niveau inférieur surcharge la sévérité d'un code sans effacer celles que le niveau supérieur a posées pour d'autres codes. Les codes absents de tous les niveaux gardent la sévérité du tableau §3.5.2. |
| `exemptUsers`, `allowlistPatterns`, `toolCommands` | **Concaténation** (union), sans suppression possible depuis un niveau inférieur — **sauf `closed: true` au plancher** (§8.1.1), qui interdit alors tout ajout depuis un niveau inférieur. |
| `rules`, `scope`, et les autres clés scalaires | **Remplacement** de la valeur, clé par clé. |

Le §3.2 livre **tous** ses labels activés. En désactiver un consiste à passer son `enabled` à `false`, une entrée à la fois — c'est ainsi qu'une équipe retire les labels ajoutés pour s'en tenir à Conventional Comments. La liste vit au §3.2 et n'est pas recopiée ici : elle s'est déjà allongée.

#### 8.1.5 Configuration absente, illisible ou invalide

Ces cas ne sont pas théoriques : casser le fichier de configuration serait, à défaut de règle, le moyen le plus simple de désactiver le contrôle.

| Situation | Comportement de l'extension |
|-----------|-------------|
| Fichier absent | Repli sur le niveau inférieur — organisation, puis défauts du produit — dans les bornes du plancher. Ce n'est pas un incident |
| JSON syntaxiquement invalide, ou **valeur inconnue pour une clé connue** (`"mode": "banana"`) | Repli sur le **dernier niveau valide** (organisation, puis défauts), avis `invalid-config` avec la ligne fautive, affiché dans la pastille et la page d'options (§5.3) |
| **Lecture impossible** — API injoignable, limite d'appels atteinte (`{ status: 'unreachable' }`, §9.2.2) | Repli sur le niveau inférieur, **en état dégradé** au sens du §5.4 : l'extension assiste et ne bloque plus |
| Version de schéma supérieure à celle supportée, ou `coreMinVersion` non satisfaite (§8.1.3) | Repli en mode `assist`, **ou au plancher en vigueur s'il est plus strict** (§8.1.1), avis `unsupported-version`. Jamais de blocage implicite |

**Une clé inconnue, elle, est simplement ignorée**, avec un avertissement, et ne déclenche aucun repli. C'est ce qui permet à une configuration écrite pour une version ultérieure d'être lue par une version antérieure sans faire disparaître la contrainte. Le repli est réservé à ce qu'on ne sait pas interpréter : un document illisible, ou une valeur hors du domaine d'une clé connue — dont on ne peut rien conclure, alors qu'une clé inconnue se laisse écarter sans risque.

Un fichier invalide ne fait donc **jamais** disparaître la contrainte : il la signale (§5.3). Le repli est borné par le plancher, faute de quoi une simple montée de version du schéma permettrait de descendre sous un plancher `enforce`.

### 8.2 Schéma

Le bloc ci-dessous est un **exemple de configuration de dépôt**, destiné à montrer la forme de chaque clé. Ce ne sont **pas** les valeurs par défaut du produit : il n'énumère qu'une poignée des labels du §3.2 — le compte n'est pas repris ici, il a déjà changé une fois, et sa clé `severities` éteint volontairement un avertissement pour illustrer la surcharge.

**Les valeurs par défaut du produit** sont ailleurs, et par construction : **tous** les labels du §3.2 — tous activés, `decision` et les quatre labels de réponse de type `reply`, les autres de type `remark` —, les décorations du §3.3, les sévérités du tableau §3.5.2, `mode: "assist"`, `severities: {}`, `decorations.allowFree: true`, `scope: { validateReplies: false, validateReviewSummary: true }`, et les seuils du `rules` ci-dessous. Une implémentation qui construirait ses défauts en recopiant ce bloc livrerait un produit amputé de la plupart de ses labels, et dont `W-MISSING-DECORATION` est éteint — c'est la confusion que ce paragraphe existe pour empêcher.

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
    { "id": "done", "enabled": true, "blockingByDefault": false, "alwaysNonBlocking": true },
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
  "exemptUsers": ["<compte-de-service>"],
  "allowlistPatterns": ["^LGTM$"],
  "toolCommands": ["/*", "@codex", "@dependabot"],
  "configUrl": null,
  "coreMinVersion": "1.0.0",
  "configCacheTtlSeconds": 3600,
  "badgeStyle": "pill",
  "sessionIcon": "🤖",
  "shortcuts": { "abbreviations": { "?i": "issue: ", "?ib": "issue (blocking): " } },
  "language": "fr",
  "telemetry": { "enabled": false, "endpoint": null }
}
```

Clés du schéma dont le rôle demande une précision :

| Clé | Rôle |
|-----|------|
| `configUrl` | **Ignorée si elle est posée ici.** L'URL de la configuration d'organisation provient exclusivement du canal de plancher (§8.1.1, §8.1.2) : la laisser au fichier de dépôt permettrait à un dépôt de désigner lui-même la configuration censée le contraindre. La clé reste dans le schéma pour que sa présence soit diagnosticable (`config-warning`), pas pour être renseignée. |
| `configCacheTtlSeconds` | Durée du cache de configuration **de l'extension** (§8.1.2). Plancher-able en **maximum** (§8.1.1, §8.1.3, règle 4). |
| `coreMinVersion` | Version majeure minimale de `core/` requise pour appliquer cette configuration (§8.1.3). En deçà, le repli du §8.1.5 s'applique : mode `assist`, ou le plancher en vigueur s'il est plus strict. |
| `scope.validateReplies` | Validation des réponses de fil (§4.1). `false` par défaut. |
| `scope.validateReviewSummary` | Validation du corps d'une revue soumise en lot (§4.1). Sans objet sur les plateformes qui n'ont pas ce concept — voir annexes. |
| `rules.minDecisionSubjectLength` | Longueur minimale du motif d'une réponse `decision` (§6.1.1). Défaut : 20. Plancher-able. |
| `labels[].enabled` | Active ou désactive un label sans le retirer de la liste (§8.1.4). Tous les labels du §3.2 sont livrés à `true` ; c'est **cette clé, et elle seule**, qui désactive les labels ajoutés. |
| `labels[].kind` | `"remark"` ou `"reply"` (§3.2). Range le bouton dans sa zone de la barre d'outils (§5.1) et sépare les indicateurs (§12). Défaut : le type livré pour un label que le produit livre, `"remark"` pour tout autre ; la fusion du §8.1.4 ne le change que s'il est écrit. Ne change **aucun verdict**, et n'est pas plancher-able. Toute autre valeur est une erreur de type, traitée comme celle de n'importe quelle propriété de `labels[]` (§8.1.5). |
| `shortcuts.abbreviations` | Table des abréviations extensibles par `Tab` (§5.2) : abréviation → **texte inséré, deux-points et espace compris** (`"?i": "issue: "`). Les raccourcis clavier directs relèvent, eux, des préférences locales de l'utilisateur (§8.1.2). |
| `labels[].color` | Couleur du bouton et du badge (§5.1, §5.5). Doit satisfaire les contrastes du §10. |
| `sessionIcon` | Icône de la mention qui remplace le marqueur de session à l'affichage (§3.6, §5.5). Une chaîne non vide ; défaut : `🤖`, la convention servant d'abord à suivre des sessions de revue d'agents. Ne change aucun verdict : hors du domaine de `fingerprint()` (§9.2.2), non plancher-able. |
| `labels[].description` | **Signification** du label, affichée en infobulle sur le badge (§5.5), et sur le bouton à défaut de `labels[].usage`. Une chaîne, rendue telle quelle quelle que soit la langue de l'interface : c'est le texte de l'équipe, pas une traduction. Elle vaut pour un label créé comme pour un label livré, et la fusion du §8.1.4 la traite comme les autres propriétés : **écrite, elle remplace** — le texte du catalogue, ou celle d'un niveau supérieur — ; **vide (`""`), elle retire l'infobulle** ; **absente, rien ne change**, et un label livré garde le texte de son catalogue. Ne change aucun verdict. |
| `labels[].usage` | **Consigne d'emploi** du label, affichée en infobulle sur le bouton (§5.1). Mêmes règles que `labels[].description` : écrite, elle remplace le texte du catalogue et son exemple ; vide, elle retire l'infobulle du bouton ; absente, le bouton prend `labels[].description`, puis le catalogue. Ne change aucun verdict. |
| `labels[].aliases` | Orthographes acceptées en entrée pour ce label — voir ci-dessous. |
| `decorations.known[].forces` | `"blocking"`, `"non-blocking"` ou `null` (descriptive). C'est cette clé qui exprime la précédence du §3.3, qu'une simple liste de chaînes ne pouvait pas porter. |
| `severities` | Sévérité par code de diagnostic (§3.5) : `off`, `warn` ou `error`. Plancher-able — voir la règle ci-dessous. **Cette clé est une surcharge** : les valeurs absentes gardent la sévérité du tableau §3.5.2, qui reste la référence, et sa valeur par défaut est l'objet vide. L'exemple ci-dessus désactive `W-MISSING-DECORATION` à titre d'illustration. |

**Clés retirées** (décision du propriétaire, 2026-11-10). `formatSeverity`, `overrideLabel`, `resolverOverrideGroup`, `activation` et `docUrl` ne servaient qu'au vérificateur — sévérité de son critère de forme, étiquette d'exemption de PR, habilitation à résoudre ou à exempter, date de bascule, lien porté par sa sortie — et sont retirées du schéma. Une configuration qui les porte encore reste lisible : chacune y est une clé inconnue, ignorée et signalée (`config-warning`, §8.1.5), sans repli.

**`mode` accepte `off`, `assist` et `enforce`** ; `warn` y est accepté comme alias d'`assist` (§7).

**Pourquoi ce vocabulaire n'a pas de clé.** L'évidence était d'ajouter un interrupteur — `{"responseLabels": true}` — et c'est la solution que ce document **écarte**, parce que `labels[].enabled` fait déjà exactement cela, et le fait mieux. La raison tient à une défaillance **silencieuse** :

**Il ouvrirait une porte que le plancher ne ferme pas.** `labels[].enabled` est plancher-able par `labels.minimum` (§8.1.1). Un interrupteur ne le serait pas sans qu'on l'ajoute à la liste, et un `false` de dépôt annulerait alors un vocabulaire rendu obligatoire par l'organisation sans jamais toucher à `enabled` — le contournement même que le §8.1.1 existe pour fermer. Il n'aurait pas davantage de ligne au §8.1.4 : ce qui l'emporte entre un `{"responseLabels": false}` de dépôt et un `{"id": "done", "enabled": true}` d'organisation serait indéfini.

Le coût de ce choix est réel et se paie en ergonomie : désactiver le vocabulaire, c'est écrire cinq entrées plutôt qu'un booléen, et le fichier de configuration ne porte nulle part le mot « réponse ». Il est modeste — le geste est un commit sur la branche par défaut, et une famille tenue à cinq labels le borne —, et la découvrabilité se rattrape là où elle manque vraiment, dans la **page d'options** de l'extension : une section qui présente ces labels, dit qu'ils sont actifs par défaut, affiche le bloc `labels[]` qui les **désactive**, à coller dans `.conventional-comments.json`, et une commande qui le **copie** dans le presse-papiers — la page d'options n'écrit pas un fichier de dépôt (§10). La commande s'intitule « Copier la configuration », et jamais « Désactiver » : elle ne désactive rien, et un intitulé qui annoncerait un effet qu'elle ne produit pas serait faux. Son message dit ce qui s'est réellement passé : « copié » quand le presse-papiers a accepté le texte, sinon le bloc est sélectionné pour une copie manuelle. Le bloc est construit depuis la définition livrée des labels ajoutés, jamais recopié. Cette commande ne gouverne aucun verdict, n'est pas plancher-able, et ne figure donc pas dans ce schéma.

**Limite basse de sévérité.** Un code `E-` ne peut jamais voir sa sévérité descendre sous `warn`, quel que soit le niveau de configuration. C'est ce qui rend exprimable la liste de règles non désactivables du §8.1.1 : elle se déclare comme un ensemble de codes dont la sévérité ne peut pas être abaissée.

**Alias de label.** Un alias est une orthographe alternative acceptée **en entrée** : `bug: fuite mémoire` est reconnu comme le label `issue` et en hérite intégralement (caractère bloquant, décorations admises, sévérités). L'alias n'est pas un label distinct — il n'apparaît ni dans la barre d'outils, ni dans les indicateurs du §12, où il est comptabilisé sous son label canonique. Un alias ne produit **aucun diagnostic** — c'est une orthographe admise, pas un écart. L'extension propose la réécriture vers la forme canonique comme une commodité d'édition, jamais comme une correction de `Diagnostic.fix` (§9.2.1), et sans l'imposer. `Bug:` cumule deux choses distinctes : la casse est comparée à la forme canonique de l'**alias reconnu**, donc `Bug:` produit `W-CASE` avec la correction `bug:` ; la réécriture vers `issue:` reste une proposition à part, que rien n'exige d'accepter. La comparaison est insensible à la casse.

**Aucun ombrage entre labels et alias.** Dans la configuration résolue, deux labels **actifs** ne partagent aucun nom : l'`id` de l'un n'est pas un alias de l'autre, et un même alias n'est pas porté par deux. Sans cette règle, c'est l'**ordre** de la liste qui décide du verdict — la résolution compare, label par label dans l'ordre, l'`id` puis les alias, si bien qu'un label déclarant `done` en alias et placé avant le label `done` capte toutes les saisies.

La règle est **posée ici**, et c'est une nouveauté : rien ne l'imposait jusqu'à présent, et une configuration existante peut donc en dépendre sans le savoir. Elle vaut pour tout label, pas seulement pour cette famille ; ce sont les labels de réponse qui la rendent atteignable, en réservant des noms qu'une équipe a pu employer avant eux. Elle ne regarde jamais l'ordre de la liste, et ne retire jamais un label entier à cause d'un alias :

- **un identifiant l'emporte sur un alias** : l'alias qui reprend l'`id` d'un autre label actif est retiré de son porteur. L'identité d'un label est son `id` ; un alias n'est qu'une orthographe admise en plus. Une équipe qui veut changer le sens de `note:` redéclare `note` par son `id` — la fusion du §8.1.4 est faite pour cela —, elle ne le masque pas sous l'alias d'un autre label ;
- **un alias porté par deux labels n'appartient à aucun** : il est retiré des deux. Ni l'un ni l'autre n'a de titre à le garder, et en laisser un l'attribuerait selon l'ordre ;
- **deux `id` qui ne diffèrent que par la casse** — la fusion les compare au caractère près, la résolution sans égard à la casse — ne se départagent pas ainsi : le second dans la liste est écarté. C'est le seul cas où l'ordre décide ; il suppose une configuration qui écrit deux fois le même label ;
- **seuls les labels actifs comptent** : un label désactivé est écarté par la résolution avant ses alias et ne décide d'aucun verdict. Le compter ferait qu'une entrée éteinte retire un nom à un label actif — `{"id": "memo", "enabled": false, "aliases": ["note"]}` ôterait `note` à la convention entière —, ou signalerait tout dépôt possédant son propre label `fixed` alors que le `done` livré, qui porte cet alias, est désactivé ;
- **le nom retiré est signalé** (`config-warning`, §9.2.1), avec le label qui le perd, et **quitte la configuration effective** ;
- **le plancher est protégé par construction.** Un identifiant planché (`labels.minimum`, §8.1.1) est un `id`, et un `id` ne cède jamais devant un alias : sous un plancher qui impose `issue`, un label non bloquant déclarant `issue` en alias perd cet alias, et `issue:` reste le `issue` planché, bloquant. Une rédaction antérieure faisait céder la définition livrée devant la déclaration d'un dépôt ; elle rouvrait exactement ce contournement — le plancher ne recrée pas un label qu'il ne trouve plus, `applyFloor()` ignorant un `id` absent de la liste (revue Codex, PR #88) —, et elle laissait l'ordre décider quand deux déclarations s'opposaient, en contradiction avec `CA-45`. Sans aucune règle, d'ailleurs, ce chemin n'existait pas : la définition livrée précède l'entrée du dépôt et son `id` est comparé en premier.

**Réserver un identifiant a un coût, et il se documente plutôt qu'il ne se découvre.** Une équipe qui possédait déjà un label `done` verra son entrée **fusionner** avec celle que le produit livre (§8.1.4, fusion par `id`), et la fusion ne lit une propriété que si elle est écrite. Elle hérite de `alwaysNonBlocking: true` : son `done (blocking):` jusque-là valide se met à produire `E-CONFLICT`. Mesuré sur `{"id": "done", "blockingByDefault": true}` : `done (blocking): corrige ce point` produit `E-CONFLICT` et `W-NO-DISCUSSION`, pendant que `done: corrige ce point` reste bloquant — la paire `alwaysNonBlocking: true` + `blockingByDefault: true`, que le plancher refuse de produire (§8.1.1), est ici composée par la fusion à partir de la déclaration du dépôt. Elle hérite aussi du type `reply`, sans effet sur aucun verdict. La réparation tient en une propriété dans son propre fichier — `"alwaysNonBlocking": false` —, une déclaration explicite l'emportant toujours, et vaut de même pour `thanks`, `ack`, `disagree` et `reviewed`. Le précédent est exact et n'avait, lui, jamais été écrit : livrer `typo`, `polish` et `quibble` avait réservé trois noms de la même façon. Les identifiants réservés ici sont **huit** : les labels `thanks`, `done`, `ack`, `disagree` et `reviewed`, plus les alias `thx`, `fixed` et `acknowledged`, qu'une saisie atteint exactement de la même façon. Ils appellent une entrée de changelog et une note de migration, pas une découverte en revue.

Le champ `exemptUsers` de l'exemple est un espace réservé : les identités de comptes de service diffèrent d'une plateforme à l'autre et sont données dans les annexes.

**`toolCommands`** obéit à la même logique. La valeur de l'exemple ci-dessus (`["/*", "@codex", "@dependabot"]`) illustre la **forme** de la clé, pas des valeurs par défaut du produit : sa valeur par défaut est la liste **vide**, et la grammaire des entrées — `/*` pour la reconnaissance générique du slash, un handle exact tel que `@codex` pour une mention — est celle du §4.2. Chaque entrée est une **chaîne comparée telle quelle**, jamais interprétée comme un motif : rien de comparable à `^(a+)+$` n'y est possible, et les bornes de sûreté du paragraphe suivant, propres à `allowlistPatterns`, n'ont donc pas d'équivalent à écrire ici. Une entrée qui n'est ni `/*` ni de la forme `@[A-Za-z0-9_-]+` est **ignorée et signalée** (`config-warning`, §9.2.1), au même titre qu'un motif hors bornes de `allowlistPatterns`.

**Contrainte sur `allowlistPatterns`.** Ces motifs sont fournis par le dépôt et exécutés dans le navigateur du relecteur : un motif tel que `^(a+)+$` le gèlerait. Trois bornes, toutes **statiques**, c'est-à-dire vérifiables avant exécution : **au plus 50 motifs**, **256 caractères** par motif, et **aucun quantificateur imbriqué** — un quantificateur portant sur un groupe qui en contient déjà un, forme dont relève l'essentiel des ReDoS connus. Un motif qui dépasse ces bornes est **ignoré et signalé** (`config-warning`, §9.2.1).

Un délai maximal d'exécution serait le contrôle évident, et il n'est pas retenu : une expression régulière JavaScript s'exécute sur le fil principal et ne s'interrompt pas. La seule façon de la borner dans le temps serait de l'exécuter dans un *worker* que l'on termine — coût disproportionné pour un motif dont on peut refuser la forme à la lecture.

Le schéma est **versionné**. Une configuration dont la version dépasse celle supportée par le composant qui la lit déclenche le repli décrit au §8.1.5 — mode `assist`, ou le plancher en vigueur s'il est plus strict — accompagné d'un avertissement, jamais un blocage silencieux.

Les emplacements par défaut ci-dessus sont ceux d'un déploiement public standard ; une organisation qui déploie via politique d'entreprise peut pointer `$schema` vers ses propres emplacements internes, et y déclarer son `configUrl` — dans le **canal de plancher**, jamais ici (§8.1.1). Voir §10, Compatibilité.

---

## 9. Architecture technique

### 9.1 Découpage

```
packages/
├── core/            # Aucune dépendance DOM ni plateforme
│   ├── parser       # Analyse d'un commentaire → AST
│   ├── validator    # AST + config → diagnostics
│   ├── config       # Chargement, fusion, validation du schéma, résolution des bornes (§8.1)
│   └── i18n         # fr / en
├── adapters/        # Composant A — un adaptateur par plateforme
│   ├── github/      # Sélecteurs DOM, cycle de vie SPA — aucun appel d'API à jeton (§10)
│   └── azdo/        # Idem Azure DevOps
└── extension/       # Manifest V3, content scripts, service worker, options — une seule extension
```

`packages/core/` est publié comme paquet et consommé par l'extension et ses adaptateurs. **Aucune règle de validation ne doit être dupliquée.**

**Ce qui est commun, et ce qui appartient à une plateforme.** Le *modèle* est commun : la grammaire, les labels, les décorations, la validation, et la mécanique de l'interface — un clic pose un préfixe, une zone de saisie porte barre d'outils et pastille, un commentaire publié porte ses badges. Ce qui touche la page d'une plateforme lui appartient : la lecture de son DOM, l'écriture dans son éditeur, la place qu'y prennent les éléments de l'extension, ses couleurs et ses longueurs. Le code commun ne nomme aucune plateforme et ne contient aucun branchement sur l'une d'elles ; il interroge l'adaptateur (§9.2.3).

**Chaque plateforme publie une fiche d'identité**, sans DOM, que le service worker et la page d'options lisent sans charger l'adaptateur : son identifiant, le site cloud à hôte fixe qu'on peut autoriser d'un clic, les domaines de produit qui permettent de la reconnaître, la règle de `credentials` d'une lecture de configuration quand elle en a une de mesurée, les paramètres d'URL qui désignent une vue, son glyphe. **L'extension tient un registre de ces fiches, et c'est la seule liste qui énumère les plateformes** : en ajouter une, c'est ajouter son paquet et une entrée au registre. Le schéma de politique d'entreprise et les catalogues de libellés, qui les nomment aussi, sont vérifiés contre lui.

### 9.2 Interfaces d'adaptateur

#### 9.2.1 Types partagés

Ces types vivent dans `core/` et ne dépendent d'aucune plateforme. Ils sont la **frontière réelle** : sans eux, les contrats ci-dessous sont des signatures sans contenu, et l'affirmation « implémenter le contrat suffit » est fausse.

```ts
type ResolutionState = 'unresolved' | 'resolved' | 'unknown';

interface PrRef {
  platform: string;                   // identifiant d'adaptateur — jamais une union fermée, sans quoi
                                      // ajouter une plateforme obligerait à éditer `core/` (§9.2.2)
  host: string;                        // github.com, ghe interne, dev.azure.com…
  scope: string[];                     // owner/repo, ou org/project/repo
  number: number | string;
}

interface UserInfo {
  id: string;                          // identifiant stable de plateforme, jamais le nom affiché
  login: string;
  displayName?: string;
  // Pas de `isServiceAccount` : il ne servait qu'à un indicateur du §12, retiré avec le vérificateur
  // (décision du propriétaire, 2026-11-10). L'exemption structurelle du §4.2 passe par
  // `CommentInfo.isSystemGenerated`, et les bots par `exemptUsers`.
}

interface CommentInfo {
  id: string;
  author: UserInfo;
  body: string;                        // corps stocké brut — la normalisation est faite par core/ (§3.4.1)
  createdAt: string;                   // ISO 8601
                                       // `updatedAt` et `lastEditedBy` ont été retirés d'ici : ils
                                       // n'existaient que pour signaler une édition affaiblissante
                                       // « avec son auteur » (§6.1), règle qui demandait de se souvenir
                                       // du corps précédent. Une racine éditée se lit désormais telle
                                       // qu'elle est, et plus rien n'appelait ces deux champs
  permalink: string;                   // lien permanent du commentaire
  isSystemGenerated: boolean;          // §4.2 — l'adaptateur le pose depuis les marqueurs de sa plateforme
  canCarryBlockingState: boolean;      // §4.1 — pilote `W-NOT-BLOCKABLE`. Porté ici, et non par le seul
                                       // `ThreadInfo`, parce que les commentaires hors fil y sont soumis aussi
}

interface ThreadInfo {
  id: string;
  pr: PrRef;
  root: CommentInfo;
  replies: CommentInfo[];              // §4.1 — réponses du fil
  resolution: ResolutionState;         // normalisé ici ; le mapping des états bruts est dans l'adaptateur
  canCarryBlockingState: boolean;      // hérité de `root` (§4.1) ; présent ici pour la lisibilité des règles
}
```

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

type NoticeKind =                    // avis de configuration, affichés dans la pastille et la page d'options (§5.3)
  | 'floor-override'        // §8.1.2 — clé de dépôt ignorée au titre du plancher
  | 'invalid-config'        // §8.1.5 — JSON invalide ou valeur hors domaine
  | 'config-warning'        // §8.1.5 — clé inconnue ignorée ; §8.2 — expression d'allowlist écartée
  | 'unsupported-version';  // §8.1.5, §8.1.3 — schéma, plancher ou core/ trop récent

interface Notice {
  kind: NoticeKind;
  message: string;
  actor?: UserInfo;                    // renseigné dès que le fait a un auteur
  at?: string;                         // ISO 8601
  ref?: string;                        // lien permanent, clé de configuration, ou numéro de ligne selon `kind`
}

interface Disposable { dispose(): void; }
```

#### 9.2.2 Contrat de `core/`

Le contrat d'adaptateur du §9.2.3 est typé à la virgule près. Les fonctions de `core/` ne l'étaient pas : `core/` n'apparaissait que comme « AST + config → diagnostics » dans l'arborescence du §9.1. Or c'est **l'interface par laquelle passe tout verdict**, quelle que soit la plateforme.

```ts
// La configuration du §8.2 une fois résolue et bornée, et le document de plancher du §8.1.1.
// Leur forme est celle de ces deux sections ; ils sont nommés ici parce que les signatures
// ci-dessous les prennent, et qu'une fonction dont l'entrée n'a pas de forme n'a pas de contrat.
type EffectiveConfig = /* §8.2, toutes clés résolues, dans les bornes du §8.1.1 */ object;
type Floor           = /* §8.1.1, document de plancher */ object;

// Ce que `core/` ne peut pas lire lui-même, et que l'adaptateur lui passe après l'avoir lu (§9.2.3).
// Trois résultats, et non deux : un fichier **absent** est le cas nominal du §8.1.5 et n'a rien de dégradé ;
// une lecture **impossible** l'est, et c'est elle — et elle seule — qui désarme la condition 2 du §5.4.
// Les confondre ferait qu'un dépôt sans fichier de configuration éteindrait `enforce` côté extension.
type ConfigRead =
  | { status: 'found'; text: string }
  | { status: 'absent' }
  | { status: 'unreachable'; reason: string };

// Tout ce qui est propre à une plateforme entre par ici, et `core/` n'en connaît rien d'autre.
// Sans cet objet, les étages −1 et 0 du §3.5.1 obligeraient `core/` à embarquer des marqueurs de
// plateforme, ce que le §9.1 lui interdit — et l'affirmation « implémenter le contrat suffit »
// (§9.2.3) serait fausse : ajouter une plateforme demanderait d'éditer `core/`.
interface PlatformProfile {
  id: string;                          // 'github', 'azdo', ou toute autre — jamais une union fermée
  suggestionInfoString: string | null; // §3.5.1 étage 0 ; `null` = la plateforme n'a pas d'étage 0
}
// La commande adressée à un outil (§4.2) n'est plus une donnée de plateforme : elle est
// portée par `EffectiveConfig.toolCommands`, résolue comme toute autre clé de la
// configuration (§8.2). `PlatformProfile` reste donc réduit aux deux seuls faits qu'un
// dépôt ne peut jamais choisir lui-même.

interface ValidationInput {
  body: string;                        // corps brut, avant le prétraitement du §3.4.1
  platform: PlatformProfile;           // §3.5.1 étage 0
  isSystemGenerated: boolean;          // §4.2 — message de plateforme, entrée de timeline ; l'adaptateur
                                       // le traduit depuis les marqueurs de sa plateforme, il ne juge pas
  zone: Zone;                          // §4.1, défini au §9.2.3 — pilote `scope.validateReplies`
                                       // (`zone === 'reply'`) et `scope.validateReviewSummary` ; `'conversation'` couvre le commentaire
                                       // général hors diff, `'review-body'` le corps d'une revue en lot
  canCarryBlockingState: boolean;      // §4.1
  author?: UserInfo;                   // à la saisie, l'utilisateur courant (`getCurrentUser()`), sans quoi un
                                       // compte de `exemptUsers` recevrait à la frappe des diagnostics dont il
                                       // est exempté
  comment?: CommentInfo;               // le commentaire publié, quand il existe — jamais renseigné à la saisie
}

// Les fonctions de `core/`. Aucune ne fait d'entrée-sortie : la lecture de l'état de la
// plateforme reste dans l'adaptateur (§9.2.3).
function validate(input: ValidationInput, config: EffectiveConfig): Diagnostic[];   // §3.5
function isBlocking(input: ValidationInput, config: EffectiveConfig): boolean;      // §3.3
function resolveConfig(floor: Floor, org: ConfigRead, repo: ConfigRead
                      ): { config: EffectiveConfig; notices: Notice[] };            // §8.1.2
```

**`resolveConfig()` ne prend que ce qu'on vient de lire.** Ni configuration épinglée, ni mémoire d'une résolution précédente : la configuration effective est fonction des seules lectures du moment (§8.1.3, règle 1).

`resolveConfig()` rend **aussi des `notices`**, et non la seule configuration : `floor-override`, `invalid-config` avec sa ligne fautive, `config-warning` et `unsupported-version` naissent tous de la résolution, et d'elle seule. Sans ce second membre, les quatre `NoticeKind` du §9.2.1 n'auraient aucun producteur, alors que le §5.3 exige de les afficher.

`validate()` prend le **corps brut** et non une ligne prétraitée : le prétraitement du §3.4.1 est à l'intérieur, c'est ce qui garantit qu'aucun appelant ne puisse l'oublier ou le faire à sa façon. C'est la contrepartie de `CA-06`, dont le corpus est injecté **en amont** de ces fonctions, au niveau des adaptateurs.

#### 9.2.3 Contrat client (composant A)

```ts
// `Zone` dit *où vit* le commentaire : les quatre emplacements que le tableau du §4.1 distingue et qui
// peuvent porter un commentaire soumis à validation.
// Elle est employée par `core/` comme par les adaptateurs. Ce que *fait* l'utilisateur est une notion
// d'interface, portée séparément par `action`, et une édition n'en reste pas moins située dans une zone.
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
}

interface EditorHandle {
  id: string;
  element: Element;
  context: EditorContext;
}

interface SubmitControl {
  element: Element;
  kind: 'submit' | 'submit-and-resolve';
}

// Ce que seule la plateforme sait du CHÂSSIS entourant une zone de saisie. Chaque champ vaut `null`
// pour dire « je ne me prononce pas », et le composant A applique alors une règle qui ne nomme
// personne — voir la prose ci-dessous, qui dit pourquoi ce type existe et ce qu'il n'a pas le droit
// de porter.
interface EditorChrome {
  framedContainer: Element | null;     // le conteneur qui encadre ensemble l'en-tête natif de la boîte,
                                       // ses onglets, le champ et ce que l'extension injecte — celui à
                                       // qui donner le retrait intérieur (§5.1, §5.3)
  mount: ComposerMount | null;         // où poser la barre d'outils (§5.1, devant `anchor`) et la
                                       // pastille (§5.3, derrière lui)
  ringInset: boolean | null;           // le trait d'état (§5.3) se dessine-t-il à l'intérieur du champ,
                                       // parce qu'un conteneur le rognerait ?
}

interface ComposerMount {
  container: Element;                  // reçoit l'insertion
  anchor: Element;                     // celui de ses enfants qui contient la zone de saisie
}

// La FORME du HTML qu'une plateforme produit en rendant un corps de commentaire Markdown — les deux
// seuls faits que le masquage de préfixe et la mise en avant du sujet (§5.5) interrogent.
// Les noms de balises s'écrivent dans LA CASSE QU'ON VEUT : le code partagé normalise avant de
// comparer. Imposer la casse de `Element.tagName` aurait fait d'une écriture naturelle — `'p'`,
// `'br'` — une forme conforme au type et inerte à l'exécution, sans aucun diagnostic.
interface RenderedBodyShape {
  paragraphTags: readonly string[];    // conteneurs de premier niveau enveloppant une ligne de Markdown
                                       // ordinaire sans avoir consommé de syntaxe de tête ; tout le reste
                                       // fait RENONCER le masquage, ce qui est l'issue sûre (§5.5)
  lineBreakTag: string;                // ce qui matérialise une fin de ligne simple dans ce corps rendu
}

interface PlatformAdapter {
  currentPr(): PrRef | null;           // §2 — la PR que la page AFFICHE, lue dans l'URL et le DOM ;
                                       // `null` hors d'une page de PR. L'activation d'un hôte ne passe pas
                                       // par l'adaptateur : elle se décide sur la répartition des hôtes
                                       // accordés (`optional_host_permissions`, §A.4, §B.4) que le
                                       // composant A publie, jamais sur ce qu'un adaptateur sait des hôtes
  platformProfile(): PlatformProfile;  // §9.2.2 — marqueurs propres à la plateforme, passés à `validate()`
  getRepoConfig(pr: PrRef,
                opts?: { bypassCache: boolean }): Promise<ConfigRead>;  // §8.1.2 niveau 1 — fichier du dépôt,
                                       // lu sur la session ; mis en cache pour `configCacheTtlSeconds`,
                                       // et `bypassCache` est ce qu'exige la règle 3 du §8.1.3 avant de
                                       // bloquer un envoi
  getOrgConfig(url: string | null,
               opts?: { bypassCache: boolean }): Promise<ConfigRead>;  // §8.1.2 niveau 2 — URL issue du
                                       // canal de plancher ; même cache, même contournement
  observeEditors(cb: (editor: EditorHandle) => void): Disposable;  // §4.1 — zones ; l'appel du cb est l'instant
                                                                   // mesuré par la NFR d'injection (§10)
  renderedBodyShape(): RenderedBodyShape | null;  // §5.5 — la forme du HTML rendu par cette
                                       // plateforme, ou `null` si elle n'a pas été MESURÉE.
                                       // Obligatoire pour la même raison que la suivante
  getEditorChrome(editor: EditorHandle): EditorChrome;  // §5.1, §5.3 — où l'extension s'accroche dans CE
                                       // composeur. Obligatoire : une méthode optionnelle laisserait une
                                       // plateforme nouvelle compiler sans jamais répondre
  getSubmitControls(editor: EditorHandle): SubmitControl[];  // §4.3 — tous les points de sortie, §5.4 — interception
  submitKeystrokes(editor: EditorHandle): SubmitKeystrokes;  // §4.3, §5.4 — les touches qui PUBLIENT sur cette
                                       // plateforme : depuis le champ (`field`) et sur un contrôle d'envoi qui a
                                       // le focus (`control`). Le composant A n'en connaît aucune : il arrête ce
                                       // que l'adaptateur déclare, si bien qu'un raccourci propre à une
                                       // plateforme ne touche jamais les autres (décision du propriétaire,
                                       // 2026-11-10). Obligatoire, pour la même raison que `getEditorChrome()`
  readValue(editor: EditorHandle): string;
  writeValue(editor: EditorHandle, text: string, caret?: number): void;  // §5.1, §5.2 — insertion de préfixe ;
                                                                          // stratégie d'écriture imposée par le §9.3
  getThreads(): Promise<ThreadInfo[]>;      // depuis le DOM de la page uniquement (§10) ; `resolution` vaut
                                           // 'unknown' si l'état n'y est pas rendu. Jamais d'appel d'API.
  getCurrentUser(): Promise<UserInfo>;      // depuis le DOM ; sert au rendu et à l'exemption d'auteur de
                                            // l'étage −1 (§3.5.1), jamais à une décision d'autorisation
  getBannerMount(): Element | null;    // §5.5 — l'élément APRÈS lequel le bandeau s'insère, « en tête de
                                       // PR » ; `null` : le composant A se replie sur le haut du document
  getRenderedThreadElements(): { id: string; element: Element }[];  // §5.5 — les fils rendus, pour le
                                       // filtre local ; `id` est celui de `getThreads()`, même dérivation
  getRenderedComments(): { element: Element; bodyText: string }[];  // §5.5 — les corps à DÉCORER (badges,
                                       // masquage), avec leur texte lu hors des badges déjà posés
  getRenderedCommentElements(): Element[];  // §5.5, §9.4 — les corps que la plateforme REND, éléments
                                       // seuls : la sonde des signatures de reprise, jamais
                                       // `getRenderedComments()`, qui clone chaque sous-arbre pour en
                                       // lire le texte ; peut compter ce que les badges écartent (§4.1)
}
```

**Tout ce que le composant A demande à un adaptateur est dans ce contrat, et tout y est obligatoire.** Cinq réponses ont vécu hors de lui — la PR affichée, l'en-tête de PR, les fils rendus, les corps à décorer, les corps rendus —, lues par conversion de type dans le code partagé, chacune avec un repli silencieux : une plateforme qui ne les portait pas compilait, et n'affichait ni bandeau, ni filtre, ni badges, et tenait la page pour « hors PR », sans qu'aucun diagnostic ne le dise. La règle énoncée plus bas pour `getEditorChrome()` — une méthode optionnelle laisse une plateforme nouvelle compiler sans jamais répondre — vaut pour chaque membre : le compilateur pose la question, et `null` ou la liste vide est une réponse. Une méthode `matches(url)` a porté l'« activation par domaine » dans ce contrat sans qu'aucun code ne l'appelle, et une `matchesHost(url)` à côté d'elle, avec des hôtes par défaut codés en dur : l'activation se décide sur la répartition des hôtes accordés que le composant A publie (§2), jamais sur ce qu'un adaptateur croit savoir des hôtes, et les deux sont retirées.

**`getRepoConfig()` et `getOrgConfig()` sont les seules requêtes réseau de l'extension, et elles demandent leur justification.** Sans elles, l'extension ne connaît ni les labels ni les seuils : elle valide contre les défauts produit et se trompe sur le cas le plus banal — un dépôt qui a ajouté un label. Le §8.1.5 lui prescrit d'ailleurs trois comportements de repli sur le fichier de dépôt, ce qui suppose qu'elle le lise.

Il en faut **deux**, et pas seulement la première : la configuration se résout sur trois niveaux (§8.1.2), et une extension qui ignorerait le niveau 2 appliquerait une autre configuration que celle que l'organisation a écrite.

Les deux lectures sont **mises en cache pour `configCacheTtlSeconds`** — valeur de la **configuration effective précédemment résolue**, ou 3600 s tant qu'aucune ne l'a été, la clé vivant dans le document qu'elle sert à mettre en cache. Elles sont faites **hors du chemin critique du chargement de page** : la NFR de 50 ms du §10 porte sur ce chemin, et l'extension assiste avec la configuration précédemment mise en cache en attendant la réponse.

Elle est compatible avec le §10, qui interdit trois choses précises : détenir un jeton ou un secret, faire sortir du contenu de commentaire, de code ou de diff, et prendre une décision d'autorisation. Lire un fichier de configuration versionné, sur la **session déjà authentifiée** de la personne qui regarde la page, n'est aucune des trois : rien ne sort, rien n'est décidé, et le fichier est visible de quiconque a accès au dépôt.

Quand une lecture est **impossible** — route inaccessible, dépôt privé derrière une API à jeton, politique réseau —, la méthode renvoie `{ status: 'unreachable' }` et l'extension **se rabat sur le niveau inférieur, en signalant son état dégradé** dans les options et dans son indicateur. Elle ne bloque jamais l'envoi sur une règle qu'elle n'a pas pu lire (§5.4).

Le champ `context` est indispensable : sans lui, l'extension ne peut pas distinguer une racine de fil d'une réponse, ni une rédaction d'une édition — donc ne peut pas appliquer le tableau du §4.1, dont c'est pourtant le cœur, à commencer par son défaut « les réponses ne sont pas validées ».

**`getEditorChrome()` existe pour que le §9.4 soit tenable.** Ce contrat décrivait comment *lire* une plateforme, jamais où l'interface de l'extension *s'accroche* — l'adaptateur tendait une zone de saisie et s'arrêtait là. Le composant A devait donc trouver seul le conteneur à parer, et il l'a fait comme on le fait toujours dans ce cas : en reconnaissant, dans du code partagé par toutes les plateformes, des noms propres à l'une d'elles. C'est précisément ce que le §9.4 interdit — « les sélecteurs DOM sont centralisés dans un fichier unique par adaptateur » —, et l'interdiction était **inapplicable** tant qu'aucune méthode ne permettait de demander ce conteneur. Une règle qu'aucun chemin légal ne permet de respecter n'est pas une règle ; c'est ce manque que cette méthode comble.

Trois propriétés la rendent sûre, et chacune répond à un échec précis :

- **`null` est une réponse, pas un trou.** Un adaptateur qui ne se prononce pas obtient une règle qui ne nomme personne — le composant A remonte au conteneur qui *dessine* le cadre, question de mise en page posée au moteur de style. C'est le comportement d'avant cette méthode, et c'est la réponse **juste** pour une plateforme dont la boîte de commentaire n'a pas été mesurée : ne rien affirmer plutôt qu'affirmer sur elle ce qu'on a relevé sur une autre.
- **Elle porte des éléments, jamais des longueurs ni des couleurs.** La frontière n'est pas cosmétique : le contrat dit *quel élément joue quel rôle*, la feuille de style de la plateforme dit *combien il mesure*. Sans cette règle, une mesure faite sur une plateforme redevient une constante que toutes les autres subissent — le défaut exact que cette méthode corrige.
- **Aucune signature de ce contrat ne nomme une plateforme.** Un port qui exposerait `isGitHubChangesView()` aurait échoué : il obligerait le code partagé à savoir de qui il parle, et le `if` que le polymorphisme doit supprimer reviendrait sous un autre nom. Cette propriété est vérifiable mécaniquement, et elle est vérifiée.

**Où l'extension se loge est un fait de plateforme, au même titre que le cadre qu'elle pare.** `mount` et `ringInset` portent les deux décisions de placement que le composant A prenait seul, par des règles géométriques mesurées sur une seule plateforme : poser la barre et la pastille dans le premier ancêtre qui *empile* ses enfants, et rentrer le trait d'état quand un ancêtre qui coupe ce qui dépasse *épouse* la boîte du champ. Ces règles restent la réponse à `null`, et elles conviennent à la plateforme sur laquelle elles ont été mesurées ; mais une plateforme dont le DOM les met en défaut n'avait aucun moyen de le dire, sinon en modifiant la règle — donc le rendu de toutes les autres. Déclarer son point d'insertion ne change que son propre composeur. Un point d'insertion **incohérent** — `anchor` qui n'est pas un enfant de `container`, ou qui ne contient pas la zone de saisie — est ignoré au profit de la règle : une déclaration fausse ne doit pas priver le composeur de sa barre d'outils.

Elle est **obligatoire**, et ce choix se paie : toute doublure de test doit y répondre. Une méthode optionnelle ne coûterait rien et laisserait une plateforme nouvelle compiler sans jamais se prononcer — son extension se logerait alors au jugé sur un DOM que personne n'a regardé, silencieusement. Le compilateur doit poser la question ; répondre « rien de spécial » ne coûte qu'un mot. La règle vaut pour chaque membre de ce contrat, et elle est vérifiée dans les deux sens : un adaptateur incomplet ne compile pas, et le code partagé ne lit rien par conversion de type ni n'importe un adaptateur concret hors de son point de composition (`check:platform-isolation`).

`renderedBodyShape()` répond à la même nécessité pour le §5.5, et mérite d'être distinguée de `getEditorChrome()` sur un point : c'est la seule des deux dont l'absence produisait un rendu **faux** plutôt qu'un renoncement. Les faits de forme y étaient écrits en dur — un conteneur de paragraphe, un marqueur de fin de ligne —, mesurés sur une seule plateforme et appliqués à toutes. Sur un corps rendu où la fin de ligne n'est pas ce marqueur, la borne du sujet ne se déclenche jamais et un fragment entier du corps passe dans le sujet mis en avant. Les autres fuites de ce genre renoncent proprement ; celle-là se trompe, et c'est pourquoi la donnée doit venir de la plateforme — y compris quand la plateforme n'a rien à en dire.

**Elle rend `null` quand la forme n'a pas été mesurée, et cette troisième réponse est nécessaire.** Le châssis peut se passer d'une réponse : le composant A remonte alors au conteneur qui *dessine* le cadre, question de mise en page posée au moteur de style. Ici il n'existe aucun repli de ce genre — rien ne permet de **deviner** quelle balise matérialise une fin de ligne dans un corps rendu. Sans `null`, un adaptateur n'aurait le choix qu'entre affirmer une forme qu'il n'a pas observée et ne pas compiler ; déplacer une hypothèse depuis le code partagé vers l'adaptateur ne la rend pas vraie.

`null` fait **renoncer** le masquage du préfixe et la mise en avant du sujet, sans rien retirer d'autre : les badges restent posés, le corps s'affiche entier. C'est le repli de rendu du §5.5, **et non une dégradation de sélecteur** — la distinction est la même que pour `getEditorChrome()`, et elle vaut d'être répétée parce qu'une première rédaction de ce document les confondait (revue Reefact, PR #65). Le §9.4 journalise un ÉCHEC DE DÉTECTION : un sélecteur qu'on croyait bon ne ramène plus rien. Ici rien n'a échoué — la plateforme répond, et sa réponse est qu'elle n'a pas mesuré. Le tenir pour une dégradation mettrait une plateforme entière en état d'échec permanent et lui ferait écrire une entrée de journal à chaque commentaire rendu, noyant les vraies. Ce que `null` partage avec `CA-11` est seulement l'exigence de discrétion : jamais un blocage de l'usage normal. Rendre une forme est donc une **affirmation**, au même titre qu'un sélecteur mesuré, et non une valeur par défaut commode.

En cas d'échec de reconnaissance, le §9.4 s'applique sans réserve : aucune exception ne remonte, la dégradation est journalisée, et l'absence de retrait intérieur ne dégrade que l'esthétique du composeur — jamais l'usage normal de la plateforme (`CA-11`).

**« Je ne me prononce pas » et « je ne reconnais plus » se ressemblent, et ne doivent pas se confondre.** Les deux rendent `framedContainer: null` ; le premier est le cas nominal d'une plateforme dont la boîte n'est pas nommée, le second est une rupture de la plateforme. Le contrat ne les distingue pas par sa valeur de retour, et il n'a pas à le faire — ce serait charger tous les appelants d'un état qui ne les regarde pas. **L'obligation porte donc sur l'adaptateur** : celui qui NOMME un châssis et ne le reconnaît plus doit journaliser la dégradation au sens du §9.4, comme pour n'importe quel sélecteur pourri ; celui qui n'en nomme aucun ne journalise rien, sous peine de noyer `CA-11` sous des non-événements. Sans cette règle, un renommage chez la plateforme retire le retrait intérieur **en silence**, et le journal qui existe pour révéler la pourriture des sélecteurs reste vide au moment précis où il devrait parler.

La même règle vaut pour toute réponse qui se dérobe : un adaptateur ne peut rendre « rien » que là où il n'a jamais rien affirmé. Là où il a affirmé, l'absence est une mesure, et une mesure se journalise.

**L'adaptateur traduit, il ne juge pas.** Traduire `fixed` ou `wontFix` en `ResolutionState.resolved` est une traduction, et elle appartient donc à l'adaptateur — les tables des §A.6 et §B.5 sont sa spécification. C'est pourquoi `ThreadInfo.resolution` est déjà typé `ResolutionState` à la frontière : ce que l'adaptateur livre est normalisé.

Ce découpage définit également le point d'extension pour une plateforme non prévue au périmètre initial (§1, non-objectifs) : implémenter le contrat ci-dessus et les types du §9.2.1 suffit à intégrer une nouvelle plateforme sans toucher au reste de `core/`. C'est une affirmation opposable — toute règle du corps du document qui exigerait une donnée qu'aucune méthode ne rend serait un défaut de cette section, pas une liberté d'implémentation.

### 9.3 Contraintes d'implémentation connues

Les contraintes concrètes d'implémentation par plateforme (type d'éditeur, écriture programmatique, navigation SPA, gestion des domaines) sont documentées dans les annexes A, B et C, qui suivent la même trame — quatre rubriques communes en tête de chacune, complétées par ce qui est propre à la plateforme.

**Stratégie d'écriture programmatique — commune à toutes les plateformes.** Les éditeurs pilotés par un état applicatif absorbent l'affectation directe de `value` : le champ paraît modifié, mais le contenu soumis ne l'est pas. C'est vrai des vues React de GitHub (§A.2) comme, probablement, de l'éditeur Azure DevOps (§B.2). GitLab ajoute un cas que les deux autres n'ont pas : un éditeur de texte enrichi qui n'est **pas** une `<textarea>` (§C.2), où le setter natif de `value` n'existe pas et où seule la commande d'insertion de texte reste candidate — à établir sur ce cas avant d'y écrire quoi que ce soit. Les adaptateurs emploient donc **la même méthode partout** — passer par le setter natif de la propriété puis émettre un événement `input` qui remonte, ou recourir à une commande d'insertion de texte du navigateur — et **jamais** `element.value = …`.

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

**Confidentialité**
- Aucun contenu de commentaire, de code ou de diff ne quitte le navigateur.
- Télémétrie **désactivée par défaut**, opt-in explicite, et limitée à des compteurs agrégés (label utilisé, code d'erreur, mode, dépôt) — jamais de texte libre.
- Les décisions de revue (`decision`, §6.1.1) ne font l'objet d'**aucune journalisation externe** : elles vivent dans la PR, sous le compte de leur auteur, comme n'importe quel commentaire de revue. C'est un avantage du mécanisme sur un journal de contournements — il ne crée aucun traitement de données nouveau.

**Sécurité**
- Manifest V3, permissions minimales (`storage`, `scripting`, `activeTab`), pas de `<all_urls>` — les domaines de plateforme sont demandés via `optional_host_permissions`, activés à la demande (§2, annexes A, B et C). **L'hôte de `configUrl` en fait partie** : il est souvent interne à l'organisation et distinct de tout domaine de plateforme, et sans cette permission `getOrgConfig()` échoue structurellement — l'extension serait alors en état dégradé permanent (§5.4) et n'appliquerait jamais la configuration d'organisation. La politique d'entreprise qui pousse le plancher pré-autorise cet hôte en même temps que les domaines de plateforme.
- Aucun stockage de PAT ni de secret dans l'extension. **Conséquence à assumer :** les API publiques des plateformes n'acceptent pas l'authentification par cookie de session — elles exigent un jeton, que l'extension n'a pas le droit de détenir. Toute donnée que l'extension ne peut pas lire dans le DOM — état d'un fil que la page ne rend pas, auteur d'une résolution, appartenance à un groupe — lui reste donc **inconnue**, et elle n'y substitue aucune supposition qui la ferait juger : un fil dont l'état n'est pas rendu est compté non résolu (§5.5). C'est pourquoi `getThreads()` et `getCurrentUser()` (§9.2.3) ne lisent que le DOM : l'extension s'en sert pour afficher, jamais pour trancher. Elle ne prend **aucune décision d'autorisation** : qui peut résoudre un fil reste l'affaire de la plateforme (§6.1). Ce n'est pas l'**état dégradé** du §5.4 — qui désigne une configuration que l'extension n'a pas pu lire, et qui seul désarme le blocage d'envoi.

  **Une exception, et une seule : la lecture de la configuration (`getRepoConfig()`, `getOrgConfig()`, §9.2.3).** L'extension lit le fichier `.conventional-comments.json` du dépôt affiché et le document d'organisation désigné par le canal de plancher, par une requête que la **session de l'utilisateur** autorise déjà, sans jeton — la route web du fichier brut sur GitHub (§A.4), le point `items` de l'API REST sur Azure DevOps, appelé avec les cookies de session (§B.4). C'est la **seule** requête que l'extension adresse à la plateforme : elle ne relit jamais par API l'historique d'une PR, l'état de ses fils ni une autorisation. La distinction n'est pas un contournement de la règle ci-dessus, elle en est la lecture exacte : la règle interdit de détenir un secret, de faire sortir du contenu, et de trancher une autorisation. Lire un fichier de configuration versionné, visible de quiconque a accès au dépôt, n'est aucun des trois.
  Sans cette exception, l'extension ignorerait les labels et les seuils, et se tromperait sur le cas le plus banal qui soit : un dépôt qui a ajouté un label. Elle doit résoudre **les trois niveaux** du §8.1.2. La route exacte est propre à chaque plateforme (annexes) ; là où il n'y en a pas, ou lorsque l'appel échoue, la méthode renvoie `{ status: 'unreachable' }` et l'extension se rabat sur le niveau inférieur, **en signalant son état dégradé** et sans jamais bloquer un envoi sur une règle qu'elle n'a pas pu lire. Un fichier simplement **absent** est un cas nominal, pas une dégradation : il ne désarme rien.
- Content Security Policy stricte, aucun code distant, aucune dépendance chargée depuis un CDN.
- Code source public, auditable par quiconque (dépôt Apache-2.0).
- Une extension distribuée sur un store public passe en revue par l'éditeur du store, qui porte notamment sur l'usage des permissions d'hôte et la déclaration de toute collecte de données — la conception à permissions minimales et à télémétrie opt-in (ci-dessus) est également ce qui simplifie cette revue.

**Accessibilité**
- Conformité RGAA 4.1.2 (qui transpose WCAG 2.1 AA) : navigation clavier complète, contrastes suffisants, rôles ARIA, messages d'erreur associés au champ (`aria-describedby`).
- L'information ne repose jamais uniquement sur la couleur : **toute information qu'une couleur distingue est aussi dite par un texte**, porté par l'élément lui-même ou par un élément qui lui est associé — la bordure de la zone de saisie et la pastille qui en énonce l'état (§5.3) sont un seul signal, à deux endroits. L'icône, là où elle est rendue, s'ajoute à ce texte et ne le remplace jamais ; son absence, sur les boutons du §5.1, ne retire donc rien.
- Respect des thèmes clair / sombre et des réglages `prefers-reduced-motion`.
- RGAA 5, qui transposera WCAG 2.2, est attendu dans la fenêtre du phasage (§14) : les nouveaux critères sont à intégrer au fil de leur publication plutôt qu'en reprise finale.

**Internationalisation**
- Interface disponible en français et en anglais, dans la langue résolue selon le §8.1.2 : préférence locale de l'utilisateur, puis clé `language` de la configuration effective, puis langue de l'interface de la plateforme.
- Les **identifiants de labels restent en anglais** (`issue`, `suggestion`...) pour garantir l'interopérabilité et la compatibilité avec l'écosystème existant. Seules les descriptions et infobulles sont traduites. La règle a une conséquence à assumer sur `ack` (§3.2) : c'est un mot de jargon qu'un lecteur francophone ne reconstruit pas seul, et le badge du §5.5 est vu par toute l'équipe — y compris par qui n'a pas installé l'extension et n'aura jamais d'infobulle. Sa description française doit donc **enseigner le mot**, non le translittérer.

**Compatibilité**
- Chrome et Edge (Chromium ≥ 3 dernières versions majeures), Firefox ESR 128 ou supérieur — `optional_host_permissions`, sur lequel repose l'activation des adaptateurs (§2), n'existe pas avant cette version. Firefox implémente Manifest V3 avec des divergences notables : **event pages** au lieu d'un service worker (celui de Chrome étant lui-même non persistant, c'est le mécanisme et non la persistance qui diffère), et espace de noms `browser.*` que Chrome n'expose pas. Un build ou un chargement conditionnel spécifique est donc à prévoir ; l'état exact de ces divergences est à revérifier contre les versions cibles au moment de l'implémentation.
- Déploiement principal via les stores publics (Chrome Web Store, Firefox Add-ons, Edge Add-ons). Une organisation peut, en complément, forcer l'installation par politique d'entreprise et pointer la configuration vers ses propres emplacements internes (§8.2). Le nom de la politique diffère selon le navigateur : `ExtensionInstallForcelist` sur Chrome et Edge, `ExtensionSettings` avec `"installation_mode": "force_installed"` sur Firefox — ce dernier n'implémente pas `ExtensionInstallForcelist`.
- Mise à jour automatique depuis le store d'origine, ou depuis un dépôt/store privé pour un déploiement entreprise.

---

## 11. Critères d'acceptation

- `CA-01` Un commentaire sans label ne peut pas être publié en mode `enforce`, ni par bouton ni par raccourci clavier — configuration lue sans repli dégradé (§5.4), quel que soit l'âge de la PR.
- `CA-02` **Insertion de préfixe.** Sur `issue (blocking): le nom est ambigu`, cliquer `todo` donne `todo (blocking): le nom est ambigu` — décoration et sujet conservés, curseur en fin de préfixe. Avec une sélection active, le texte sélectionné n'est pas remplacé, et la sélection est restaurée décalée de la longueur du préfixe inséré (§5.1). Vérifié sur les deux plateformes et sur les deux générations de DOM GitHub (§A.5).
- `CA-03` **Décoration non bloquante.** Un `issue (non-blocking):` n'est compté comme bloquant ni par `isBlocking()` (§9.2.2), ni par le bandeau du §5.5 — les deux décomptes concordent, en valeur comme en sens. Le même `issue (non-blocking):` sans discussion ne produit pas `W-NO-DISCUSSION` (§3.1).
- `CA-04` Un `nitpick (blocking):` produit l'erreur `E-CONFLICT` et **n'ouvre pas** de fil bloquant, `nitpick` n'étant pas bloquant par défaut. Un `issue (blocking, non-blocking):` produit le même code et **ouvre** un fil bloquant, `issue` l'étant (§3.3).
- `CA-06` **Non-régression du transport.** Le corpus est **synthétique et versionné dans `core/`**. Chaque cas y figure sous ses **deux formes de transport** : la valeur d'un champ de saisie (`LF`, indentation conservée) et un corps stocké (`CRLF`). Le corpus est injecté **au niveau des adaptateurs** — en sortie de `readValue()` pour le corps, d'`observeEditors()` pour le contexte et de `getRepoConfig()`/`getOrgConfig()` pour la configuration (§9.2.3) —, donc en amont de `core/`, et sans aucun appel d'API. Les deux formes d'un même cas produisent le même verdict. C'est un test de non-régression de l'extension, et non plus de parité avec un vérificateur (décision du propriétaire, 2026-11-10).
  Chaque cas est un **triplet** : un corps, un `EditorContext` synthétique, et la configuration effective à lui appliquer. Les trois sont **figés dans le corpus** ; les points d'injection ci-dessous sont la manière de les faire entrer par le chemin nominal, jamais une lecture de l'environnement. Un corps seul ne suffirait pas : `W-NOT-BLOCKABLE` dépend de `canCarryBlockingState`, `E-DECISION-SUBJECT` de la position dans un fil, `E-UNKNOWN-LABEL` et `E-UNKNOWN-DECORATION` de la configuration. Seul le corps est décliné sous les deux formes de transport.
  Le corpus couvre au minimum : fins de ligne `LF` et `CRLF`, indentation de tête, blancs de fin, BOM, blancs Unicode non sécables, emoji simples et composés, préfixes mal formés (§3.5.1), bloc de code en tête, bloc de suggestion, et **chaque code de diagnostic au moins une fois**. Le verdict comparé est la **liste ordonnée des couples (code, sévérité)**, pas un booléen de conformité. Objectif : **100 %**, aucun écart toléré.
  *Ce que ce test attrape, et ce qu'il n'attrape pas.* Il attrape les divergences de **transport** — un prétraitement qui ne traiterait pas les deux formes à l'identique, une normalisation oubliée dans un adaptateur — et les régressions de `core/` sur le corpus. Il n'attrape **pas** une erreur commise *dans* `core/` que les deux formes partagent : c'est aux tests unitaires de `core/` (`P1`) de la couvrir. Deux écueils qu'il évite en revanche : un corpus de commentaires réels se heurterait à l'engagement du §10 — aucun contenu de commentaire ne quitte le navigateur — et une injection faite **en aval** des adaptateurs laisserait passer exactement la classe de défaut que le §3.4.1 existe pour empêcher.
- `CA-07` Une réponse dans un fil existant n'exige pas de label avec la configuration par défaut.
- `CA-08` Les commentaires des bots de pipeline ne déclenchent aucune erreur.
- `CA-09` Le mode `assist` — et `warn`, son alias (§7) — n'empêche aucune publication.
- `CA-11` **Dégradation silencieuse.** Sélecteurs volontairement invalidés : aucun dialogue, aucune exception remontée à l'utilisateur, tous les contrôles natifs de la plateforme restent fonctionnels, et l'échec de détection est tracé : dans la journalisation locale du §9.4 toujours, et par un événement de télémétrie **si la télémétrie est activée** — elle ne l'est pas par défaut (§10).
- `CA-12` **Parcours clavier.** Script énuméré et rejoué : focus de l'éditeur → ouverture de la complétion → sélection d'un label → choix d'une décoration → envoi → lecture du message d'erreur en cas de rejet. Chaque étape atteignable et annoncée, sans souris.
- `CA-14` Une configuration de dépôt ne peut pas assouplir le mode en deçà du plancher fixé par une politique d'entreprise (§8.1).
- `CA-16` **Décoration mal formée.** `issue (perf*): x` et `issue (): x` produisent `E-DECORATION-SYNTAX` ; `issue (BLOCKING): x` et `issue( blocking ): x` produisent chacun **un seul** `W-DECORATION-STYLE` — celui de `issue( blocking ): x` énumérant ses deux écarts, espace manquante et espaces de bordure (§3.5.1, multiplicité) — et restent publiables.
- `CA-17` **Diagnostic en étages.** `Attention : le build casse` produit `E-NO-LABEL` avec le format attendu ; `attention: le build casse` produit `E-UNKNOWN-LABEL` avec la liste des labels ; `Issue: x` produit `W-CASE`. Aucun de ces trois messages n'est interchangeable.
- `CA-18` **Fins de ligne.** Le même commentaire, sous sa forme de champ de saisie (`LF`) et sous celle d'un corps stocké (`CRLF`), produit un verdict identique. Test étendu à l'indentation de tête et aux blancs de fin.
- `CA-19` **Approbation sans texte.** Une revue approuvée sans commentaire ne produit aucun diagnostic, et son envoi n'est pas bloqué en mode `enforce`.
- `CA-20` **Message de plateforme.** Un message généré par la plateforme (mise à jour de branche, entrée de timeline) ne produit aucun diagnostic, sans dépendre de `exemptUsers`.
- `CA-21` **Bloquant non résolvable.** Un `issue:` écrit dans une zone qui ne peut pas porter d'état bloquant (§4.1) est validé en format, déclenche `W-NOT-BLOCKABLE` à la saisie, et **n'est jamais compté** parmi les fils bloquants du bandeau (§5.5). Un `issue (non-blocking):` dans la même zone ne déclenche pas cet avertissement.
- `CA-24` **Plancher hors de portée du dépôt.** Un `{"mode": "off"}` poussé sur la branche par défaut d'un dépôt dont le plancher vaut `enforce` est ignoré pour la clé `mode`, et le fait est signalé (`floor-override`) dans la pastille et la page d'options (§5.3).
- `CA-27` **Assouplissement sans attente.** Configuration d'organisation en cache en `enforce`, puis passée à `assist` côté plateforme, sans notification à l'extension : un commentaire sans label (`E-NO-LABEL`) envoyé ensuite **n'est pas bloqué** — l'extension relit la configuration avant de bloquer et la trouve assouplie —, sans attendre l'expiration de `configCacheTtlSeconds` (§8.1.3, règle 3). Contre-épreuve : configuration inchangée, le même envoi reste bloqué après la relecture.
- `CA-30` **Configuration en direct.** Merger sur la branche par défaut une modification de configuration s'applique, y compris aux PR déjà ouvertes, dans les deux sens, dès que l'extension la lit (§8.1.3, règle 1).
- `CA-31` **Plancher en direct.** Durcir le plancher d'entreprise sur `mode` prend effet sur les PR **déjà ouvertes**. Contre-épreuve dans l'**autre sens** : l'assouplir vaut tout aussi bien sur ces mêmes PR (§8.1.3, règle 1). C'est ce sens que raterait un cliquet — une implémentation qui n'appliquerait en direct que les durcissements et continuerait de bloquer un envoi que la configuration courante accepte —, et que la moitié « durcissement » du critère, seule, ne verrait pas.
- `CA-33` **Anti-cache sur rejet.** Un label ajouté à la configuration d'organisation est accepté par l'extension sans attendre l'expiration de son cache, dès la première saisie qu'elle aurait bloquée (§8.1.3, règle 3).
- `CA-36` **Le verdict se lit de l'état courant.** Éditer `issue:` en `note:` sur le commentaire racine rend le fil non bloquant à la lecture suivante de la page, et rien n'est signalé : l'extension ne compare l'état courant à aucun passé (§6.1).
- `CA-37` **Bloc de suggestion.** Un commentaire contenant un bloc de suggestion natif, suivi d'une phrase libre, est conforme sans label explicite, compte comme `suggestion` dans les indicateurs, et ne produit ni `W-MISSING-DECORATION` ni diagnostic de sujet.
- `CA-38` **Préfixe mal formé.** `issue (blocking: x` produit `E-MALFORMED-PREFIX` désignant la parenthèse non fermée, jamais `E-NO-LABEL` ; `issue : le nom est ambigu` désigne l'espace avant le deux-points ; `Attention : le build casse` produit toujours `E-NO-LABEL` avec le format attendu.
- `CA-40` **Commande adressée à un outil** (§4.2, §8.2). Le critère porte sur l'**étage −1** de l'échelle du §3.5.1, et sur lui seul : un commentaire qu'un étage antérieur écarte — zone éteinte par `scope` — ou qu'une **autre** exemption du §4.2 retient — motif de `allowlistPatterns`, auteur exempté, message de plateforme — sort de son périmètre, quel que soit le contenu de `toolCommands`. La **reconnaissance** se lit sur la configuration appliquée à la PR évaluée au sens du §8, jamais sur l'un de ses niveaux pris isolément : les trois niveaux du §8.1.2 y concourent, et les bornes du §8.1.1 peuvent en écarter une entrée — `toolCommands` est plancher-able, et son drapeau `closed` interdit alors tout ajout en dessous du plancher.
  
  Cela posé : `toolCommands` étant **vide par défaut**, `@codex review` et `/rebase` restent des remarques de revue et produisent `E-NO-LABEL`. Le sentinel `/*` exempte ensuite toute commande slash — `/azp run`, `/lgtm`, `/rebase` qu'il reconnaît sans le nommer — sans qu'aucune ne soit énumérée, tandis qu'un chemin comme `/etc/hosts n'est pas le bon endroit` porte un second `/` dans son premier jeton et reste validé. Un handle déclaré exempte la commande sans égard à la casse — `@Codex review` comme `@codex review` —, un handle non déclaré ne l'exempte pas, et la reconnaissance porte sur le **jeton entier** : `@codexplique pourquoi` n'est pas une commande. `@alice peux-tu regarder ça ?` n'est exempté que si `@alice` est déclaré : aucun sentinel générique n'existe pour les mentions, si bien qu'aucune configuration ne peut les exempter en bloc — l'asymétrie avec `/*` que le §4.2 justifie.
- `CA-41` **Labels ajoutés désactivés par un dépôt — eux seuls disparaissent.** Un dépôt qui désactive les cinq labels ajoutés voit chacun d'eux devenir un mot inconnu (`E-UNKNOWN-LABEL` en zone validée), et la liste de ses labels actifs devient exactement celle de Conventional Comments plus `decision` : aucun autre label ne bouge.
- `CA-42` **Vocabulaire actif — des labels ordinaires, les mêmes mécanismes.** Les labels de réponse traversent le **même** parseur et le **même** validateur, sans code de diagnostic nouveau et sans règle propre : `W-CASE` sur `Done:`, `E-EMPTY-SUBJECT` sur `ack:`, `E-CONFLICT` sur `done (blocking):` par `alwaysNonBlocking` (§3.3, règle 1), `E-UNKNOWN-DECORATION` et `W-DECORATION-STYLE` comme partout. `fixed: corrige` est reconnu comme `done` sans produire aucun diagnostic (§8.2, alias), et `reviewed: rien à ajouter` n'en produit aucun — un sujet d'un seul caractère déclencherait `W-SUBJECT-TOO-SHORT`, qui est une règle de sujet et non un effet de l'alias. Avec leurs drapeaux livrés (`CA-46`), aucun d'eux n'ouvre de fil bloquant ni n'affecte le décompte du bandeau du §5.5, et aucun ne vaut décision au sens du §6.1.1. Le **mode effectif** est le même dans les deux états. Le type `reply` ne change aucun verdict : déclarer `{"id": "note", "kind": "reply"}` laisse identiques les diagnostics de tout commentaire `note:`.
- `CA-43` **Orthogonalité avec `scope.validateReplies`.** `CA-07` reste vrai **dans les deux états** : avec la configuration par défaut, une réponse de fil n'exige aucun label, que le vocabulaire soit actif ou non. Le parcours de l'étage −2 est **identique** dans les deux états — `done: rebasé sur main` écrit en réponse ne produit aucun diagnostic ni avec ni sans le vocabulaire — et le barreau de reprise reste une liste d'exactement un identifiant, `decision` (§3.5.1). Activer le vocabulaire ne modifie jamais `scope`, et réciproquement.
- `CA-44` **Le plancher ne rend jamais bloquant un label toujours non bloquant, et ne se laisse pas désarmer.** Un plancher `{"labels": {"minimum": ["thanks", "done", "ack", "disagree", "reviewed"]}}` force `enabled: true` sur les cinq entrées et laisse leur `blockingByDefault` à `false` : un `done:` nu **n'ouvre pas** de fil bloquant, et la paire incohérente `alwaysNonBlocking: true` + `blockingByDefault: true` n'est jamais produite (§8.1.1). Deux contre-épreuves, sans lesquelles le critère passerait le contournement ouvert : sous un plancher `{"labels": {"minimum": ["issue"]}}`, un dépôt qui écrit `{"id": "issue", "blockingByDefault": false, "alwaysNonBlocking": true}` voit `issue:` **rester bloquant** — l'exception se lit sur l'`alwaysNonBlocking` *livré*, et le relèvement du drapeau est refusé au titre du plancher ; et la propriété du premier membre vaut aussi pour `decision`, dont le §6.1.1 affirme qu'une décision ne peut pas elle-même ouvrir un fil bloquant.
- `CA-45` **Le dépôt garde la maîtrise de son vocabulaire.** Un dépôt peut désactiver **un seul** label de réponse sans les autres ; en réactiver **un** que son organisation avait désactivés ; surcharger sa couleur, ses alias, son type ou son caractère bloquant sans que le reste de la définition bouge. Une déclaration explicite l'emporte toujours sur la valeur livrée, aux deux niveaux et dans les deux sens (§8.1.4). Contre-épreuve d'ombrage (§8.2) : un alias qui reprend l'`id` d'un autre label actif est **retiré de son porteur et signalé** (`config-warning`), le label restant ; un alias porté par deux labels est retiré des deux ; l'ordre de `labels[]` ne décide d'aucun verdict ; un label désactivé ne retire rien à un label actif. Sous un plancher `{"labels": {"minimum": ["issue"]}}`, un dépôt qui déclare un label non bloquant portant `issue` en alias voit cet alias retiré, et `issue:` reste bloquant.
- `CA-46` **Activation en direct, et sans effet sur le décompte des fils bloquants avec les drapeaux livrés.** Désactiver le vocabulaire prend effet **en direct** (§8.1.3, règle 1), y compris sur les PR déjà ouvertes, et le réactiver aussi. Désactivé, un `done:` déjà publié retombe en `E-UNKNOWN-LABEL` **dans une zone validée** ; dans une réponse de fil avec `scope.validateReplies` à `false`, valeur par défaut, l'étage −2 (§3.5.1) écarte la zone avant que le label ne compte, et **aucun diagnostic** n'est émis — seul le badge disparaît et le préfixe réapparaît (§5.5). Les deux cas sont testés. C'est le comportement d'ensemble du §8.1.3, règle 1, pas une règle propre à cette famille. La contre-épreuve, elle, ne vaut que pour elle, et c'est celle qui compte : le §8.1.3 avertit qu'activer un label peut rendre bloquantes, sur **toutes** les PR ouvertes à la fois, des racines non résolues qui ne l'étaient pas. **Aucun des cinq labels ajoutés ne le peut avec ses drapeaux livrés** — `blockingByDefault: false` et `alwaysNonBlocking: true` — : activer ce vocabulaire tel qu'il est livré est la seule activation de label dont le décompte des fils bloquants ne peut pas bouger. La garantie porte sur ces valeurs livrées : un dépôt peut surcharger le caractère bloquant d'un label de réponse (`CA-45`, §8.1.4), et un `done` déclaré `alwaysNonBlocking: false` et `blockingByDefault: true` ouvre alors un fil bloquant comme n'importe quel label — c'est une configuration explicite, et la contre-épreuve vérifie qu'elle produit bien cet effet.
- `CA-47` **Une abréviation livrée ne se déplie que vers un label actif.** `?do` puis `Tab`, avec `done` désactivé par la configuration, ne compose **pas** un préfixe que le validateur rejette au caractère suivant en `E-UNKNOWN-LABEL` (§5.2). Contre-épreuve sur le défaut antérieur : la même propriété vaut pour `?ty`, `?po` et `?qui` quand un dépôt désactive leurs labels. Une abréviation écrite par une configuration n'est pas concernée.
- `CA-48` **Les réponses sur leur propre ligne, sous un trait** (§5.1). Mesuré dans un vrai navigateur, à des largeurs où les remarques tiennent sur une ligne et à d'autres où elles en occupent plusieurs : chaque bouton `reply` est sous la dernière ligne des boutons `remark`, jamais à côté ; un trait horizontal court sur toute la largeur de la barre entre les deux ; les décorations restent dessous, sous un double trait fin qui court lui aussi sur toute la largeur. Sans label `reply` actif, ni rangée des réponses ni trait simple, le double trait restant ; sans aucun label actif, aucun trait ; sans label `remark` actif, pas de trait. Contre-épreuve : un label déclaré `{"id": "merci", "kind": "reply"}` rejoint la rangée des réponses, et `{"id": "done", "kind": "remark"}` la quitte.
- `CA-49` **Le type d'un label se lit et se valide comme ses autres propriétés** (§8.2). `"kind": "reply"` sur un label déclaré par un dépôt est retenu ; un label déclaré sans `kind` est `remark` ; une entrée qui redéclare un label livré sans écrire `kind` garde le type livré ; toute autre valeur que `"remark"` ou `"reply"` rend la configuration invalide (§8.1.5), comme une valeur mal typée de n'importe quelle propriété de `labels[]`.
- `CA-50` **Ordre des boutons** (§5.1, §5.2). Sans préférence, la barre et la liste de complétion suivent l'ordre de la configuration : celui du §5.1 pour les labels livrés, puis les labels créés, dans l'ordre d'écriture. Avec la préférence `suggestion,nitpick,disagree,praise,ack`, le groupe `remark` commence par `suggestion`, `nitpick`, `praise` et poursuit dans l'ordre par défaut, le groupe `reply` par `disagree`, `ack`, puis `thanks`, `done`, `decision`. La saisie `Disagree , praise` donne `disagree,praise` ; `disagree praise` donne le seul nom `disagreepraise`, qui ne place rien ; un doublon ne compte qu'une fois ; un jeton hors identifiant est écarté ; un label inconnu ou désactivé sur le dépôt ne place rien et ne lève aucune erreur. Contre-épreuve : un label qu'un dépôt déclare `reply` et que la liste nomme se place en tête de le groupe `reply`, jamais dans le groupe `remark`.
- `CA-51` **Reconnaissance du marqueur de session** (§3.6). `[session:<valeur>]` est reconnu sur la dernière ligne non blanche, suivie de zéro, une ou plusieurs lignes blanches, `LF` comme `CRLF` ; toute valeur libre non vide l'est, un GUID comme `run 42`, avec sa casse. Il n'est **pas** reconnu au milieu du corps, en ligne avec du texte, dans un bloc de code délimité (refermé ou non) ni dans une citation, avec une valeur vide ou sous une autre forme — et il reste alors du texte ordinaire, sans aucun diagnostic nouveau.
- `CA-52` **Une métadonnée seule ne satisfait aucune exigence, et ne change aucun effet** (§3.6). `issue: le nom est ambigu` suivi du seul marqueur produit `W-NO-DISCUSSION`, comme sans lui ; `issue:` suivi du marqueur produit `E-EMPTY-SUBJECT`, le marqueur n'étant jamais la ligne de préfixe ; un corps réduit au marqueur est exempté comme un corps vide (§4.2) ; `LGTM` suivi du marqueur reste exempté par `^LGTM$`. Label résolu, décorations, caractère bloquant, critère 2 et résolution par `decision` sont identiques avec et sans marqueur. `sessionIcon` n'entre pas dans l'empreinte.
- `CA-53` **Affichage du marqueur de session** (§5.5). Le marqueur reconnu d'un commentaire publié — dans son propre paragraphe, ou après un saut de ligne — est remplacé à sa place par `🤖 session: <valeur en minuscules>`, l'icône suivant `sessionIcon`, en italique, à un écart de paragraphe du texte qui précède ; un commentaire écrit avec des lignes blanches et le même écrit d'un bloc se rendent à l'identique, en-tête comme pied — mesuré dans Chromium (`check:session-line`), avec contre-épreuve ; le corps relu garde le marqueur tel qu'écrit, casse comprise ; un second passage ne change rien au DOM ; un affichage emporté par la plateforme est reposé. Un commentaire sans marqueur ne reçoit rien. Défaire — extension inactive, forme du corps rendu non déclarée, dernière ligne qui n'est plus un marqueur — rend le corps d'avant. Repli : marqueur mis en forme, dans une liste, un bloc de code, une citation, ou précédé sur sa ligne d'un texte mis en forme — rien n'est projeté, et il reste lisible tel qu'écrit.

---

## 12. Indicateurs de suivi

Ils se limitent à ce que la **télémétrie de l'extension** peut compter (décision du propriétaire, 2026-11-10) : des compteurs agrégés, **désactivés par défaut** et soumis à un opt-in explicite, sans aucun texte libre (§10). L'extension ne relit par API ni l'historique des PR, ni l'état des fils, ni une autorisation — sa seule requête à la plateforme est la lecture de la configuration (§10) : un indicateur qui exigerait de relire l'historique des PR — délais de résolution ou de revue, fils clos par une `decision`, part des comptes de service — n'en fait donc pas partie. Sans télémétrie activée, aucun indicateur n'est produit.

- Taux de conformité des commentaires **au sens du §3.5.2**, mesuré à la saisie — aucun diagnostic de sévérité `error` (cible : > 95 % à 3 mois) — et **taux d'avertissement**, suivi séparément : un commentaire qui ne porte que des avertissements est conforme et ne doit pas disparaître de la mesure pour autant.
- Répartition par label — surveiller un ratio `praise` durablement nul, signe d'un déséquilibre de la culture de revue. **Les labels de réponse (§3.2) sont comptés à part**, et ce n'est pas un raffinement : les mêler à la répartition déplacerait le **dénominateur** du ratio `praise` du seul fait qu'une équipe active un vocabulaire — les réponses sont nombreuses —, et l'indicateur qui existe pour mesurer la culture de revue signalerait une dégradation que personne n'a produite. Le ratio se lit sur les labels de type `remark`, et sur eux seuls. `reviewed` lui rend d'ailleurs un service : écrit à la place de `praise: revue terminée`, il retire du numérateur des `praise` qui n'en étaient pas.

**Un signal change de sens sans que personne le touche, et il faut le dire.** Activer `scope.validateReplies` change le **dénominateur** du taux de conformité : la cible de 95 % n'est pas comparable de part et d'autre de cet interrupteur.

**Un indicateur est refusé d'avance** : tout ce qui apparierait un label de réponse à son commentaire parent ou à une durée — « fils portant un `disagree:` ouvert », « délai entre un `issue:` et son `done:` ». Ce serait l'enchaînement que le §4.1 refuse, réintroduit sous forme de tableau de bord — et un tableau de bord crée l'obligation que ces labels ont été conçus pour ne pas créer.

---

## 13. Points à trancher

**Aucune de ces questions ne bloque le démarrage de `core/`.** Celle qui le pourrait — l'existence d'un contournement — est tranchée dans le corps du document : §5.4 et §6.1.1.

| # | Question | Pourquoi elle compte | Échéance |
|---|----------|----------------------|----------|
| Q1 | `chore` doit-il rester bloquant par défaut ? | Calibrage : un `chore` bloquant par défaut peut multiplier les fils clos par `decision` (§6.1.1). | avant P4 |
| Q2 | Quel niveau l'organisation renseigne-t-elle en pratique — configuration d'organisation, fichiers par dépôt, ou les deux ? | Choix d'exploitation : les trois niveaux du §8.1.2 existent de toute façon, la question est de savoir lequel porte les valeurs. Sans effet sur le code. | avant P6 (passage en `enforce`) |
| Q3 | Étend-on la convention aux commentaires de tickets / éléments de travail liés ? | Élargit le périmètre du §4.1 et le contrat d'adaptateur. | après P6 |
| Q4 | Quatre labels de réponse suffisent-ils, ou « accepté, action à venir » mérite-t-il le sien ? | Calibrage (§3.2), et l'ordre des essais est dicté par une asymétrie : **ajouter** un label ne rend aucun commentaire non conforme, tandis qu'en **retirer** un fait retomber en `E-UNKNOWN-LABEL` tous ceux qui le portaient dans une zone validée — sur les PR déjà ouvertes comprises, la configuration s'appliquant en direct (§8.1.3) —, et fait perdre aux autres leur badge (§4.1, `CA-46`). Commencer petit est le sens réparable. | après P4 |

*Trois questions voisines trouvent leur réponse dans le corps du document et ne figurent donc pas au tableau : la validation des réponses de fil (§4.1, désactivée par défaut), le diagnostic des lignes qui ne sont pas des labels (§3.5.1, en étages), et le contournement — **aucun bouton de publication forcée n'est prévu** (§5.4). Une question voisine, souvent confondue avec elle, est un acte différent et a sa propre réponse : clore légitimement un fil bloquant qu'on décide de ne pas traiter passe par le label `decision` (§6.1.1). Deux autres relèvent d'un simple choix de valeur : le style de badge, fixé par `badgeStyle` (§8.2), et le choix extension contre userscript, tranché par le §2 (« une seule extension », Manifest V3) et par le §9.1.*

---

## 14. Phasage proposé

| Phase | Contenu | Dépendance |
|-------|---------|------------|
| **P1** | `core/` (parser, validator, config) + tests unitaires | — |
| **P1'** *(parallèle à P1)* | Spike technique : écriture programmatique dans les éditeurs — vues React de GitHub **et** Azure DevOps (dont l'établissement du type d'éditeur) | — |
| **P2** | Extension mode `assist` sur la première plateforme (GitHub) | P1 ; **volet GitHub de P1'** pour la seule insertion de préfixe |
| **P3** | Adaptateur Azure DevOps | P1', P2 |
| **P4** | Télémétrie opt-in et restitution des indicateurs du §12 | P2 |
| **P6** | Mode `enforce` (blocage de l'envoi, §5.4) sur dépôt pilote, puis généralisation | P4 |

`P5`, le vérificateur, est retirée (§2, décision du propriétaire, 2026-11-10) ; l'identifiant n'est pas réutilisé. `P0`, la mesure de référence, l'est aussi : elle préparait le « délai total de revue avant / après » du §12, indicateur qui exigeait l'API de la plateforme et qui est retiré avec lui — la télémétrie de l'extension ne compte rien avant son installation.

**Le prérequis au passage en `enforce`**, rassemblé ici parce qu'il conditionne `P6` : **la procédure de retour arrière est écrite et son exécutant désigné**, y compris l'ordre des opérations et leurs préconditions (§8.1.3, règle 3) : assouplir le plancher de la stratégie d'entreprise s'il impose `enforce`, puis le `mode` de la configuration d'organisation, puis celui de chaque dépôt qui écrit lui-même `"mode": "enforce"` — l'organisation ne l'emporte pas sur lui (§8.1.2). La procédure liste donc ces dépôts à l'avance. Chaque assouplissement vaut dès la tentative d'envoi suivante, sans attendre l'expiration du cache.

`P4` ne dépend pas de `P3` : la trajectoire du §7 commence par `assist` et le suivi du taux de conformité, et attendre la seconde plateforme pour l'entamer sur la première n'aurait pas de sens. `P3` élargit le périmètre de `P4`, il ne le conditionne pas.

**Un travail ne figure pas dans le tableau et conditionne pourtant le calendrier :**

- **La revue des stores est un délai subi.** Toute livraison du composant A y passe (§10), avec un résultat incertain sur les permissions d'hôte. Une soumission « coquille » doit être amorcée dès `P2` pour découvrir le processus sur un enjeu faible.

Le spike (`P1'`) est mené en parallèle du développement de `core/`, et non comme préalable bloquant. Il couvre les **deux** plateformes : les vues React de GitHub absorbent l'affectation directe de `value` au même titre qu'un éditeur piloté par un état applicatif (§9.3). Son volet Azure DevOps conditionne `P3` ; son volet GitHub conditionne la partie « insertion de préfixe » de `P2` (`CA-02`) et doit donc aboutir tôt.

---

## Annexe A — GitHub

Couvre github.com, GitHub Enterprise Cloud (y compris EMU) et GitHub Enterprise Server.

### A.1 Matrice cloud / auto-hébergé

| | Cloud | Auto-hébergé |
|---|---|---|
| **Offre** | github.com, GitHub Enterprise Cloud (EMU) | GitHub Enterprise Server |
| **Domaine** | `github.com` ; sous-domaine dédié de `ghe.com` pour la résidence de données. Aucun des deux n'est pré-déclaré : tous relèvent du mécanisme runtime décrit en A.4, au même titre que l'auto-hébergé | Domaine interne, variable par instance |
| **Rythme de mise à jour du produit** | Continu | Par release, plusieurs versions supportées en parallèle |
| **Version minimale supportée** | — | *à définir avant P2 (génération de DOM à cibler)* |

### A.2 Éditeur et écriture programmatique

- Éditeur : `<textarea>` Markdown — dans les deux générations d'interface (héritée et React), le composeur encapsule bien un `<textarea>`.
- Écriture programmatique : **l'affectation directe de `value` suivie d'un événement `input` ne suffit pas** sur les vues React, désormais servies par défaut sur la page *Files changed*. React mémorise la valeur du nœud et absorbe l'événement synthétique : le champ paraît modifié, mais l'état applicatif — donc le contenu réellement soumis — ne l'est pas. C'est le même risque de désynchronisation que celui décrit en annexe B, et il impose la stratégie commune du §9.3.

### A.3 Navigation

SPA (Turbo) — l'adaptateur écoute les événements de navigation Turbo pour ré-attacher la barre d'outils sans rechargement de page.

**Turbo seul ne suffit pas.** Les vues réécrites en React changent le DOM sans nécessairement émettre d'événement Turbo. L'adaptateur combine donc l'écoute Turbo avec un `MutationObserver` sur le conteneur racine — comme sur Azure DevOps (§B.3) — sous peine de manquer l'apparition d'un éditeur sur les pages migrées.

### A.4 Domaines et lecture de la configuration

**Lecture du fichier de configuration par l'extension** (`getRepoConfig()`, §9.2.3, §10) : la route web `https://{hôte}/{owner}/{repo}/raw/{branche-par-défaut}/.conventional-comments.json`, servie sur la session de l'utilisateur, sans jeton. Elle fonctionne sur les dépôts privés auxquels la personne a accès, ce que `raw.githubusercontent.com` ne permettrait pas.

**Aucun domaine n'est pré-déclaré, `github.com` compris.** Tous relèvent du même mécanisme : `optional_host_permissions`, accordé à l'exécution depuis les options d'installation ou pré-autorisé par politique d'entreprise.

La raison tient en une phrase, et elle est étroite : **l'extension ne peut pas rendre une permission que le manifeste exige.** `permissions.remove()` la refuse — « You cannot remove required permissions. » — là où il retire un octroi optionnel. Un accès pré-déclaré ne peut donc pas être repris depuis le produit, et le produit ne peut rien bâtir autour d'un consentement qu'il ne sait pas défaire.

*Ce que cette règle ne prétend pas.* Un domaine pré-déclaré n'est pas « révocable par rien » : le navigateur garde ses propres contrôles d'accès aux sites, et rien ici ne les remplace. Il n'est pas non plus invisible pour l'extension : `permissions.getAll()` rend aussi ce que le manifeste déclare. Ces deux justifications-là ont été écrites, dans cet ordre, et l'une comme l'autre était fausse ; celle qui reste est mesurée dans un vrai navigateur par `npm run smoke:mv3`, à côté du code qu'elle justifie.

Ce qui distingue ensuite les domaines n'est pas le droit d'être actif, mais la façon de le demander. Le critère est **l'hôte concret est-il connu à la compilation** — pas la plateforme, ni le fait d'être une offre cloud :

- **Hôte connu** (`github.com`) : proposé dans un catalogue de la page d'options, où un seul geste l'autorise et désigne sa plateforme — celle-ci n'ayant pas à être choisie, elle est déjà connue.
- **Hôte inconnu, dont seul le suffixe l'est** : GitHub Enterprise Server (domaine interne), et GitHub Enterprise Cloud with data residency, qui attribue à chaque client un sous-domaine dédié de `ghe.com` avec ses propres points d'accès d'API. L'hôte se saisit, et sa plateforme se choisit **avant** l'octroi : un hôte autorisé sans plateforme associée n'active aucun adaptateur (§2).

**Un suffixe connu ne vaut pas un hôte connu**, et la distinction porte une conséquence : demander `https://*.ghe.com/*` accorderait l'accès à *tous* les clients de la résidence de données, alors qu'un poste n'en sert qu'un. Les permissions minimales par poste (§2) l'interdisent. Un motif à joker ne s'emploie donc que là où la politique d'entreprise en pré-autorise un délibérément, jamais comme entrée de catalogue.

### A.5 Gestion du DOM multi-générations

Contrainte propre à GitHub, absente sur Azure DevOps : **github.com évolue en continu** alors que **GHE Server est figé par release**, avec plusieurs versions en support simultané. Un même adaptateur doit donc reconnaître plusieurs générations de DOM à un instant donné. Conséquences pour l'implémentation :

- Sélecteurs organisés en **chaînes avec repli** (tenter la génération la plus récente, puis les précédentes) plutôt qu'un sélecteur unique par élément.
- **Détection de génération** au chargement, par sondage de traits du DOM ou lecture de la version de l'instance lorsqu'elle est exposée.
- Le smoke test quotidien (§9.4) doit être exécuté contre **plusieurs versions de GHE Server représentatives des versions supportées**, en plus de github.com — sans quoi les régressions spécifiques à une version GHES ne sont détectées que par remontée utilisateur.
- Quand aucune génération connue ne matche, la dégradation silencieuse du §9.4 s'applique zone par zone.

### A.6 Résolution de fil

État considéré comme résolu : conversation marquée *Resolved*.

### A.7 Actions couvertes spécifiques

- Soumission d'une revue en lot (plusieurs commentaires *pending* validés en une action) — chacun doit être conforme, l'erreur doit indiquer lequel. C'est la plateforme qui porte le concept de corps de revue global, d'où `scope.validateReviewSummary` (§8.2) ; il est sans objet sur Azure DevOps.
- **Commandes adressées à un outil** (§4.2) : `toolCommands` (§8.2), vide par défaut, à configurer par le dépôt. La valeur qu'on recommande d'y placer sur GitHub — donnée en exemple dans `.conventional-comments.example.json`, jamais imposée par le produit — est :

  ```json
  "toolCommands": [
    "/*",
    "@dependabot", "@copilot", "@coderabbitai",
    "@codex", "@claude", "@mergifyio", "@renovate", "@rustbot", "@bors"
  ]
  ```

  Le sentinel `/*` couvre, sans qu'aucune ne soit énumérée : `/rebase`, les *comment triggers* d'Azure Pipelines `/azp` (fonctionnalité **GitHub uniquement**, absente d'Azure Repos), les commandes Prow répandues dans l'écosystème CNCF (`/lgtm`, `/approve`, `/hold`, `/retest`, `/override`…), les `/deploy` d'une Action maison et toute commande qu'une App installée plus tard reconnaîtrait. Les huit handles couvrent `@dependabot` (`rebase`, `recreate`, `merge`, `squash and merge`, `cancel merge`, `reopen`, `close`, `ignore this major version`…), `@copilot`, `@coderabbitai` (`review`, `full review`, `resolve`, `pause`, `resume`, `ignore`, `configuration`, `help`), `@codex`, `@claude`, `@mergifyio` (`refresh`, `update`, `rebase`, `backport <branche>`, `queue`), `@renovate`, `@rustbot`, `@bors` — la forme la plus employée, et celle dont l'absence coûte le plus cher : sans elle, `@codex review` tombe en `E-NO-LABEL` et le mode `enforce` **empêche de relancer un relecteur automatique** — la zone de conversation générale, où ces commandes s'écrivent, est validée en format (§4.1).

  **Cette valeur est une recommandation, pas un défaut du produit, et la nuance compte sur GitHub Enterprise Server.** Un dépôt auto-hébergé où `@codex` ou `@bors` désignerait un compte humain interne, plutôt que le service cloud, ne recopie pas cette entrée — ou la retire. C'est précisément ce que le §4.2 explique être hors de portée d'une liste embarquée dans l'adaptateur : elle s'appliquerait à toute installation du produit, y compris celle où elle a tort.

  `bors r+` et `r? @alice`, qui ne portent **ni slash ni mention** au sens d'un premier jeton isolé, n'entrent pas dans `toolCommands`, dont la grammaire ne compare qu'un seul jeton exact — `bors` seul exempterait « bors est cassé depuis hier ». Un dépôt qui les emploie les déclare en `allowlistPatterns`, sous une forme ancrée **aux deux bouts**. Ce sont deux commandes distinctes, donc **deux motifs**, et non un seul qui prétendrait couvrir les deux :

```
^bors\s+(r\+|r-|r=[\w,-]+|try|try-|retry|ping|delegate\+|delegate=[\w,-]+)$
^r\?\s+@?[\w/-]+$
```

Le premier fait 75 caractères, le second 17 ; aucun ne porte de quantificateur imbriqué — les bornes du §8.2 les autorisent l'un et l'autre. Le second couvre les deux formes d'assignation de Rust, `r? @alice` et `r? rust-lang/compiler`.

**L'ancre de fin n'est pas une précaution de style, elle est la condition du bon fonctionnement.** `allowlistPatterns` est éprouvée par `test()` sur le corps entier une fois `trim()` appliqué : un motif seulement ancré en tête matche donc tout corps qui *commence* par la commande. Sans le `$`, `bors retry is broken since yesterday` — une remarque de revue parfaitement ordinaire — serait silencieusement exempté, exactement le défaut que le paragraphe ci-dessus reproche à un `bors` nu. C'est aussi pourquoi chaque argument est **délimité** plutôt que laissé ouvert : `r=[\w,-]+` accepte `bors r=alice,bob` et refuse `bors r=alice et pense à rebaser`.

**Le délimiteur, lui, est le même pour toute cette famille, et `\b` n'en est pas un.** Un motif de robot interne s'écrit `^@notre-bot(\s|$)` — jamais `^@notre-bot\b`. La différence n'est pas cosmétique : `\b` marque une frontière de **mot**, et le tiret est un séparateur de mot en expression régulière JavaScript. `^@notre-bot\b` matche donc `@notre-bot-user peux-tu regarder ça ?`, c'est-à-dire une remarque de revue adressée à un **autre compte** dont le handle commence par celui du robot. Le délimiteur correct est celui que `toolCommands` applique déjà : une espace ou la fin de ligne.

La différence avec `bors` subsiste, mais elle porte sur les **arguments**, pas sur le délimiteur. `@notre-bot`, une fois correctement délimité, ne peut désigner qu'un compte : ce qui suit peut rester libre, comme dans la grammaire de `toolCommands`. `bors` est un mot ordinaire dans une phrase, que même un délimiteur exact ne suffit pas à distinguer — `bors retry is broken` commence bien par le jeton `bors` suivi d'une espace. Seule l'exigence que le corps **entier** soit la commande le rend discriminant. Deux familles, deux exigences : un délimiteur exact pour l'une, un ancrage complet pour l'autre.
- **Bloc de suggestion** (§4.2, étage 0 du §3.5.1) : un bloc de code délimité dont l'*info string* est `suggestion` — ` ```suggestion ` —, inséré par le bouton dédié de l'éditeur de commentaire de diff. C'est ce marqueur, et lui seul, qui déclenche le label implicite.
- **Comptes de service.** `dependabot[bot]`, `github-actions[bot]` et `azure-pipelines[bot]` — cette dernière identité étant le login de l'application GitHub d'Azure Pipelines, et non un compte Azure DevOps — figurent typiquement dans `exemptUsers` (§8.2).

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

- Éditeur : **une `<textarea>` Markdown**, dans toutes les zones — nouveau commentaire général, réponse, commentaire de ligne, modification —, mesuré sur un vrai tenant le 2026-11-09 (`packages/adapters/azdo/CAPTURES.md`). L'hypothèse d'un éditeur riche n'est pas vérifiée : aucune bascule vers un éditeur riche n'existe dans la barre d'outils, dont toutes les commandes n'écrivent que du texte. Chaque éditeur porte une **seconde** `<textarea>`, cachée, qui recopie la saisie pour calculer la hauteur : ce n'est pas un champ. Avant le clic, le champ général et chaque champ de réponse sont un `<input>` de façade, que le clic remplace par l'éditeur.
- Écriture programmatique : la `<textarea>` est contrôlée par l'application de la page, si bien que l'affectation directe de `value` ne suffit pas — la stratégie commune du §9.3 s'applique, et c'est celle de l'adaptateur.

**Risque de désynchronisation entre le DOM et l'état de la page — levé pour l'état, pas pour l'envoi.** Mesuré le 2026-11-09 : sur un champ vide, l'écriture par la stratégie du §9.3 (un préfixe inséré par la barre d'outils) a été vue par la page — son bouton *Comment*, inactif champ vide, est devenu actif, et la `<textarea>` cachée a recopié la valeur écrite. Le contenu effectivement PUBLIÉ après une écriture programmatique, lui, n'a pas été mesuré : aucun envoi n'a été fait pendant la validation. Le risque reste donc ouvert sur ce seul point, et se vérifie au premier envoi réel.

### B.3 Navigation

SPA — pas d'équivalent de Turbo : l'adaptateur observe le conteneur racine via `MutationObserver` pour détecter l'apparition/disparition des éditeurs.

### B.4 Domaines et lecture de la configuration

`dev.azure.com`, `{organisation}.visualstudio.com`, ou domaine on-premise pour Azure DevOps Server → `optional_host_permissions` dans **tous** les cas, selon la règle unique du §A.4. Le critère y étant l'hôte concret et non l'offre, les deux domaines cloud d'Azure DevOps ne se rangent pas du même côté :

- **`dev.azure.com`** est un hôte fixe — l'organisation vit dans le CHEMIN. Il va donc au catalogue, et l'autoriser est le minimum possible pour ce domaine.
- **`{organisation}.visualstudio.com`** (URLs historiques) donne au contraire un sous-domaine PAR organisation. Il relève du cas « suffixe connu, hôte inconnu » : l'hôte concret se saisit, exactement comme un sous-domaine de `ghe.com`. Le mettre au catalogue reviendrait à demander `https://*.visualstudio.com/*`, donc l'accès à toutes les organisations sur URLs historiques quand un poste n'en sert qu'une — ce que §2 interdit.
- Le **domaine on-premise** se saisit de même, plateforme choisie avant l'octroi.

**Lecture du fichier de configuration par l'extension** (`getRepoConfig()`, §9.2.3, §10) : Azure DevOps n'expose pas de route de fichier brut équivalente à celle de GitHub ; l'accès au contenu d'un fichier passe par le point d'API `items` du dépôt — `/{organisation}/{projet}/_apis/git/repositories/{dépôt}/items?path=/.conventional-comments.json&api-version=7.1`, qui sert le fichier de la branche par défaut. **Mesuré le 2026-11-10** sur un vrai tenant (`packages/adapters/azdo/CAPTURES.md`) : sur la session de l'utilisateur, il répond **200 sans redirection, avec le contenu brut** du fichier — à condition de ne pas demander `Accept: application/json`, qui rend des métadonnées — et **404 sans redirection** pour un fichier absent ; sans session, il **redirige vers la connexion** Microsoft. La requête reste donc de même origine pour une session ouverte, ce qu'un script de contenu peut lire (`check:content-script-cors`), et un 404 y dit vraiment « pas de fichier ». Toute autre réponse — autre code, page HTML, exception — vaut `{ status: 'unreachable' }`, et l'extension y est alors en **état dégradé** au sens du §5.4 — elle assiste sans bloquer (§10).

### B.5 Résolution de fil

L'énumération `CommentThreadStatus` est sérialisée en JSON en **camelCase à initiale minuscule** — c'est cette forme qu'une comparaison de chaîne doit utiliser, et non la casse de l'énumération .NET que l'on rencontre dans certaines documentations :

| Considérés comme résolus | Considérés comme non résolus |
|---|---|
| `fixed`, `wontFix`, `closed`, `byDesign` | `active`, `pending`, `unknown` |

`unknown` est la valeur par défaut lorsqu'aucun statut n'a été posé sur le fil : elle est classée **non résolue**, afin qu'un fil bloquant sans statut explicite ne puisse pas être compté comme traité.

### B.6 Actions couvertes spécifiques

- **Tous les boutons d'envoi passent par la validation**, et chacun publie : *Comment* sur un nouveau fil ; *Reply* et *Reply & resolve* sur une réponse ; *Update* et *Update & resolve* sur une modification ; et, sur un fil déjà résolu, *Reply & reactivate*, qui publie et rouvre le fil (mesurés sur un vrai tenant, 2026-11-09 et 2026-11-10, `packages/adapters/azdo/CAPTURES.md`). L'adaptateur les reconnaît par leur **place** — tous les boutons du pied de l'éditeur sauf le premier, *Cancel* —, jamais par leur libellé, qui est localisé.
- **Le clavier sur ces boutons publie, sans clic.** Mesuré le 2026-11-10 : Entrée, Ctrl+Entrée et Espace sur un bouton d'envoi qui a le focus partent en publication sans émettre d'événement `click` — le bouton agit sur la touche elle-même. L'adaptateur Azure DevOps les déclare donc sur ses contrôles d'envoi (`submitKeystrokes().control`, §9.2.3), en plus de Ctrl/⌘+Entrée depuis le champ.
- **Le commentaire général peut porter un état bloquant** (§4.1, `canCarryBlockingState`) — à l'inverse de GitHub, comme sur GitLab (§C.6). Sur Azure DevOps, tout commentaire général de PR est un **fil**, avec un état (*Active*, *Pending*, *Resolved*…) et un bouton *Resolve*, comme un fil de ligne de diff (mesuré sur les captures du 2026-11-09, `packages/adapters/azdo/CAPTURES.md`) : le motif du §4.1 — « aucun état de résolution » — ne s'y vérifie pas. Décision du propriétaire, 2026-11-10 : la zone de conversation d'Azure DevOps est traitée comme pouvant bloquer, `W-NOT-BLOCKABLE` ne s'y affiche pas, et un label bloquant y compte parmi les fils bloquants (§6.1). Contrairement à GitLab, aucune variante « note simple » non résoluble n'a été observée.
- **Pas d'équivalent de revue soumise en lot** : Azure DevOps ne propose pas de corps de revue global comparable à celui de GitHub. La clé `scope.validateReviewSummary` (§8.2) est donc **sans objet** sur cette plateforme et y est ignorée.
- **Aucune commande native, ni slash ni mention.** Les *comment triggers* du type `/azp run` sont une fonctionnalité d'Azure Pipelines réservée aux dépôts **GitHub** ; Azure Repos passe par les policies de branche. Aucun écosystème de robots pilotés au commentaire ne s'y est établi non plus : la revue de code assistée que la plateforme propose se déclenche par son interface, pas par une interpellation dans un fil. `toolCommands` (§4.2, §8.2) y vaut donc **`[]`** par défaut, exactement comme sur GitHub — l'exemption n'a ici aucune illustration native à recommander en exemple. Une organisation qui installe malgré tout un outil tiers piloté au commentaire dispose du **même mécanisme** que sur GitHub, sans repli particulier à écrire : elle ajoute son sentinel `/*` ou son handle exact à `toolCommands` dans son `.conventional-comments.json`, la configuration étant la même clé sur les deux plateformes (§4.2).
- **Bloc de suggestion** (§4.2, étage 0 du §3.5.1) : un bloc de code délimité dont l'*info string* est `suggestion` — ` ```suggestion `, le même marqueur que sur GitHub (§A.7) —, inséré par le bouton *Insert a suggestion* (icône d'ampoule) de l'éditeur de commentaire de ligne de diff, absent des autres éditeurs. Mesuré sur un vrai tenant le 2026-11-09 (`packages/adapters/azdo/CAPTURES.md`) : le bouton écrit ` ```suggestion `, la ligne visée, puis ` ``` `. C'est la SOURCE qui est un bloc délimité ; le commentaire publié le rend en encadré *Suggested change* — un tableau de diff, pas un `<pre>` —, avec un bouton *Apply change* côté auteur. C'est ce marqueur, et lui seul, qui déclenche le label implicite : l'adaptateur Azure DevOps le déclare (`suggestionInfoString: 'suggestion'`). Un `suggestion:` explicite y reste toujours accepté.
- **Comptes de service.** Les commentaires de pipeline sont postés par `Project Collection Build Service ({Org})` ou `{Project} Build Service ({Org})` selon la configuration — ce sont ces identités qui figurent dans `exemptUsers` (§8.2). L'identité `azure-pipelines[bot]` n'existe **pas** sur Azure DevOps : c'est le login de l'application GitHub du même produit, et elle relève de l'annexe A.
- **Versions à couvrir en test** (§9.4) : Azure DevOps Services (continu) et les versions d'Azure DevOps Server encore supportées — liste à arrêter avec la même méthode qu'en A.1.

---

## Annexe C — GitLab

Couvre gitlab.com. GitLab Dedicated et GitLab Self-Managed sont dans la cible (en-tête), mais **rien n'y a été mesuré** : chaque affirmation ci-dessous vaut pour gitlab.com, à la date et sur les captures indiquées, et se relit avant d'être étendue aux deux autres offres.

Entrée au périmètre : décision du propriétaire, 2026-11-08 (§1). Les faits de cette annexe viennent des pages capturées le même jour sur un projet de test (`packages/adapters/gitlab/test/fixtures/pages/`, détail dans `packages/adapters/gitlab/CAPTURES.md`) ou de la documentation GitLab, citée comme telle. Ce qui n'a été ni mesuré ni lu s'écrit **à vérifier**.

### C.1 Matrice cloud / auto-hébergé

| | Cloud | Auto-hébergé |
|---|---|---|
| **Offre** | gitlab.com ; GitLab Dedicated (instance dédiée, à vérifier) | GitLab Self-Managed |
| **Domaine** | `gitlab.com`, hôte fixe. Dedicated : hôte propre à chaque client, à vérifier | Domaine interne, variable par instance |
| **Rythme de mise à jour du produit** | Continu | Par release |
| **Version minimale supportée** | — | *à définir avec la même méthode qu'en A.1* |

### C.2 Éditeur et écriture programmatique

- **Deux éditeurs, au choix de l'utilisateur, et le choix est mémorisé pour son compte.** Par défaut, une `<textarea>` Markdown. La commande *Switch to rich text editing*, présente sous chaque champ, la remplace par un éditeur de texte enrichi : un `div[contenteditable="true"]` (ProseMirror), la `<textarea>` disparaissant du DOM. Mesuré le 2026-11-08 sur toutes les zones (nouveau commentaire, réponse, commentaire de ligne, modification) ; après une seule bascule, un rechargement, une autre vue et un autre champ s'ouvrent tous en texte enrichi. Un utilisateur qui a basculé une fois y reste : ce n'est pas un cas marginal.
- Écriture programmatique, `<textarea>` : stratégie commune du §9.3.
- Écriture programmatique, texte enrichi : **à établir**. Le setter natif de `value` n'existe pas sur un `contenteditable` ; la commande d'insertion de texte du navigateur (§9.3) est la seule candidate, et ce qu'elle produit dans l'état de l'éditeur — donc dans le corps soumis — n'est pas mesuré. Un `input[type=hidden][name="note[note]"]` accompagne l'éditeur ; qu'il porte le Markdown soumis est à vérifier. **Tant que ce n'est pas établi, l'adaptateur n'intervient pas dans l'éditeur de texte enrichi** — ni écriture, ni lecture : rien plutôt qu'une écriture désynchronisée (même risque qu'en §B.2) ou une lecture qui ne serait pas celle du corps soumis.
- Lecture : la valeur d'une `<textarea>` se lit sur l'élément ; celle de l'éditeur de texte enrichi est à établir avec l'écriture.
- **Conséquence, à connaître avant un passage en `enforce`** : un utilisateur en mode texte enrichi n'a ni l'assistance ni le blocage à la saisie de l'extension. Le mode étant mémorisé par compte, ce n'est pas un cas marginal ; c'est la première mesure à faire pour GitLab.

### C.3 Navigation

Application à vues dynamiques : les onglets *Overview* et *Changes* d'une merge request, et les formulaires de commentaire, apparaissent sans rechargement. L'adaptateur observe le conteneur racine par `MutationObserver`, comme sur Azure DevOps (§B.3). Les événements de navigation propres à GitLab, s'il en existe d'exploitables, sont à vérifier.

**Deux vues de l'onglet *Changes*.** *Rapid Diffs*, vue par défaut d'après la documentation GitLab (« Changes in merge requests », lue le 2026-11-08), et la vue classique, que l'utilisateur choisit par *Switch to classic loading* — choix mémorisé, mesuré. Leur DOM diffère (Rapid Diffs : éléments `<diff-file>`, classes `rd-diff-…`) et l'adaptateur doit reconnaître les deux, au titre du §A.5 : plusieurs générations de DOM à un même instant.

### C.4 Domaines et lecture de la configuration

`gitlab.com` est un hôte fixe — le groupe et le projet vivent dans le CHEMIN : il va au catalogue de la page d'options, selon la règle du §A.4. Un domaine Self-Managed se saisit, plateforme choisie avant l'octroi ; l'hôte de Dedicated, de même, à vérifier.

**Lecture du fichier de configuration par l'extension** (`getRepoConfig()`, §9.2.3, §10) : **à établir par une mesure**, avec les questions que le dépôt a appris à poser (`check:content-script-cors`, `check:relay-cors`) — quelle route, si elle redirige, ce que la cible répond en CORS, ce qu'elle exige en `credentials`. Une route de fichier brut de la forme `/{groupe}/{projet}/-/raw/{branche}/…` est à vérifier, jusqu'à son existence même. Tant que la lecture n'est pas mesurée, `getRepoConfig()` y renvoie `{ status: 'unreachable' }` et l'extension y est en état dégradé au sens du §5.4.

### C.5 Résolution de fil

Les fils portent un bouton *Resolve thread*. Mesuré le 2026-11-08 sur un fil résolu puis rouvert (captures `03-overview-fil-resolu`, `03-changes-fil-resolu`) :

- **État résolu.** Dans l'Overview, le conteneur du fil porte `data-discussion-resolved="true"` et se replie : son en-tête reste, ses notes ne sont plus dans le DOM. **Dans la vue Rapid Diffs de *Changes*, un fil résolu n'est pas dans le DOM du tout.** `getThreads()` ne peut donc lire l'état de résolution que dans l'Overview ou la vue classique ; ailleurs, un fil absent n'est pas rapporté : ni résolu, ni `unknown` — qui le compterait non résolu (§5.5) et ferait reparaître comme bloquant un fil déjà résolu.

### C.6 Actions couvertes spécifiques

Mesurées le 2026-11-08 ; chaque chemin d'envoi passe par la validation, et le bouton qui ANNULE n'est jamais intercepté.

- **Nouveau commentaire général** : bouton scindé *Comment* / menu *Comment type*, dont l'option *Start thread* change le libellé du bouton d'envoi ; case *Make this an internal note*, qui le change encore (*Add internal note*). Le même formulaire porte **un second chemin d'envoi**, *Comment and close merge request* (et ses variantes), qui ferme la merge request en publiant.
- **Le commentaire général peut porter un état bloquant** (§4.1, `canCarryBlockingState`) — à l'inverse de GitHub. Publié par *Start thread*, il devient un fil résoluble (mesuré : tous les fils généraux du projet de test portent `data-discussion-resolvable`). Décision du propriétaire, 2026-11-08 : la zone de conversation de GitLab est traitée comme pouvant bloquer, et W-NOT-BLOCKABLE ne s'y affiche pas. **Limite connue** : publié par *Comment*, le commentaire est une note simple, qui n'est pas — à vérifier — un fil résoluble ; un label bloquant y passe alors sans avertissement et sans être compté parmi les fils bloquants. Lire le type choisi dans le menu *Comment type* lèverait cette limite, à condition d'en trouver une marque indépendante de la langue de l'interface.
- **Réponse, commentaire de ligne, modification** : *Add comment now*, *Start a review* / *Add to review*, *Save comment*.
- **Revue soumise en lot** : GitLab porte un corps de revue (*Submit your review*, champ de résumé), d'où `scope.validateReviewSummary` (§8.2), comme sur GitHub (§A.7).
- **Note interne** : un commentaire peut être publié comme note interne. Qu'il entre dans le périmètre de la validation et du blocage comme un commentaire ordinaire est **à trancher** (§4.1).
- **Commandes adressées à un outil** (§4.2) : GitLab a des *quick actions* — commandes `/…` dans un commentaire, que l'éditeur annonce (`data-supports-quick-actions`, bouton *Add a quick action*). Le sentinel `/*` de `toolCommands` (§8.2) les couvre ; le recommander en exemple pour GitLab est à trancher, comme sur GitHub (§A.7) — jamais imposé par le produit.
- **Bloc de suggestion** (§4.2, étage 0 du §3.5.1) : un bloc de code délimité dont l'*info string* commence par `suggestion`, **suivi d'une plage de lignes** — mesuré : ` ```suggestion:-0+0 `, inséré par l'éditeur de commentaire de ligne, rendu en bloc *Suggested change* avec *Apply suggestion*. **Le marqueur de GitLab n'est donc pas une info string fixe** : la détection actuelle de `core/` compare le premier mot exactement (`containsSuggestionBlock()`) et ne reconnaîtrait pas `suggestion:-0+0`. Fixer la forme du marqueur — `suggestion` suivi d'une plage `:-N+M`, optionnelle ou obligatoire, à vérifier dans la documentation GitLab — relève d'un amendement de ce paragraphe ; l'adapter dans `core/`, d'une PR de code partagé distincte. Tant que ce n'est pas fait, `suggestionInfoString` vaut `null` pour GitLab : pas d'étage 0, et un `suggestion:` explicite y reste toujours accepté.
- **Comptes de service** (`exemptUsers`, §8.2) : à établir.
- **Versions à couvrir en test** (§9.4) : gitlab.com, dans ses deux vues de *Changes* et ses deux éditeurs ; Self-Managed, liste à arrêter avec la même méthode qu'en A.1.
