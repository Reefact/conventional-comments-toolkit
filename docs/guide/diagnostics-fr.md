# Diagnostics

**Langues :** [English](diagnostics-en.md) | Français (ce fichier)

Tous les codes que la pastille peut afficher, ce qui les déclenche et comment les corriger.

Un code qui commence par `E-` est une **erreur** : le commentaire est non conforme. Un code
qui commence par `W-` est un **avertissement** : le commentaire reste conforme. Les
avertissements ne bloquent jamais un envoi ; les erreurs le bloquent, et seulement en mode
`enforce` ([modes](modes-and-adoption-fr.md)).

## Comment un commentaire est vérifié

1. **Le préfixe est reconnu**, ou il ne l'est pas. Cette étape signale au plus un problème et
   s'arrête là : on ne peut rien dire d'utile d'un préfixe qui n'a pas pu être lu.
2. **Le contenu est vérifié** : décorations, sujet, discussion. Ces vérifications
   s'additionnent, et la pastille les liste toutes, pour qu'en corriger une ne révèle pas la
   suivante.

Chaque message répond à ce que vous venez de taper. `Le build est cassé depuis ce matin`
reçoit le format attendu (`E-NO-LABEL`). `attention: le build est cassé` a la bonne forme et
reçoit la liste des labels (`E-UNKNOWN-LABEL`).

## Préfixe

| Code | Déclenché par | Exemple | Correction |
|---|---|---|---|
| `E-NO-LABEL` | Le commentaire ne commence pas par `label: sujet`. | `Le build est cassé` | Ajoutez un label : `issue: le build est cassé`. |
| `E-MALFORMED-PREFIX` | La ligne commence par un label connu, mais le préfixe est mal formé. Le message nomme la raison exacte. | `issue (blocking: x`, `issue blocking): x`, `issue (blocking) x`, `issue:x` | Refermez ou ouvrez la parenthèse, ajoutez le deux-points, ajoutez une espace après le deux-points. Un clic quand la correction peut être calculée. |
| `E-UNKNOWN-LABEL` | La forme est bonne, mais le label n'est pas dans la liste configurée. | `isue: x` | Utilisez l'un des labels listés ; le plus proche est proposé. |
| `W-CASE` | Le label est écrit dans une autre casse. | `Issue: x` | Un clic : `issue: x`. |

## Décorations

| Code | Déclenché par | Exemple | Correction |
|---|---|---|---|
| `E-DECORATION-SYNTAX` | Une décoration n'est pas un mot de lettres, de chiffres et de traits d'union : caractère interdit, espace interne, élément vide, parenthèses vides. | `(perf*)`, `(non blocking)`, `(blocking,,)`, `()` | Écrivez `(non-blocking)`, retirez l'élément vide. |
| `E-UNKNOWN-DECORATION` | Une décoration inconnue, dans un dépôt qui a désactivé les décorations libres (`decorations.allowFree: false`). | `issue (urgent): x` | Utilisez une décoration connue. |
| `E-CONFLICT` | `(blocking)` sur un label qui ne peut jamais être bloquant, ou deux décorations qui se contredisent. | `nitpick (blocking): x`, `issue (blocking, non-blocking): x` | Ne gardez qu'une intention. |
| `W-DECORATION-STYLE` | Majuscules, espaces à l'intérieur des parenthèses, doublon, ou espace manquante avant la parenthèse. | `(BLOCKING)`, `( blocking )`, `issue(blocking): x` | Un clic vers la forme canonique. |

## Sujet

| Code | Déclenché par | Exemple | Correction |
|---|---|---|---|
| `E-EMPTY-SUBJECT` | Rien après le deux-points. | `issue:` | Ajoutez un résumé sur une ligne. |
| `E-DECISION-SUBJECT` | Une réponse `decision` dont le motif est plus court que `rules.minDecisionSubjectLength` (20 par défaut). | `decision: ok` | Énoncez le motif. |
| `W-SUBJECT-TOO-SHORT` | Un sujet plus court que `rules.minSubjectLength` (5 par défaut). | `issue: bug` | Dites-en un peu plus. |
| `W-SUBJECT-TOO-LONG` | Un sujet plus long que `rules.maxSubjectLength` (120 par défaut). | | Gardez le résumé sur la première ligne, déplacez le reste dans la discussion. |

## Discussion et contexte

| Code | Déclenché par | Exemple | Correction |
|---|---|---|---|
| `W-NO-DISCUSSION` | Un commentaire **bloquant** qui n'a rien en dehors de sa ligne de préfixe. | `issue: fuite mémoire` seul | Expliquez pourquoi le point doit être traité. |
| `W-MISSING-DECORATION` | Une `suggestion` ou une `question` sans `(blocking)`, `(non-blocking)` ni `(if-minor)`. Une décoration libre comme `(perf)` ne le fait pas taire. | `suggestion: extraire une méthode` | Dites si le point bloque. |
| `W-NOT-BLOCKABLE` | Un commentaire bloquant écrit là où aucun fil ne peut être résolu, comme la conversation générale de GitHub. Il ne sera pas compté parmi les fils bloquants. | `issue: merci de rebaser` en commentaire général | Écrivez-le sur une ligne du diff, ou rendez-le `(non-blocking)`. |
| `W-SESSION-MULTIPLE` | Plus d'une ligne `[session:…]` : aucune session n'est désignée. | | Ne gardez qu'une ligne de marqueur. |

## Changer une sévérité

Un dépôt peut changer la sévérité d'un code avec `severities`
([configuration](configuration-fr.md#severities)) :

```json
{ "severities": { "W-MISSING-DECORATION": "off", "W-SUBJECT-TOO-LONG": "error" } }
```

Deux limites tiennent quoi que dise la configuration : un code `E-` peut être abaissé en
avertissement mais jamais désactivé, et `W-SESSION-MULTIPLE` ne peut jamais devenir une
erreur.

## Avis de configuration

Après les diagnostics, la pastille peut afficher des avis sur la configuration elle-même. Ils
ne changent aucun verdict.

| Avis | Signification |
|---|---|
| Clé ignorée : elle assouplirait le plancher d'entreprise | Le dépôt ou l'organisation a écrit une valeur en dessous de ce que la politique d'entreprise autorise. Le plancher s'applique. |
| Clé inconnue ou retirée, valeur obsolète | La clé est ignorée ; le reste du fichier s'applique. `"mode": "warn"` est lu comme `"assist"`. |
| Configuration invalide | Le fichier ne peut pas être analysé, ou une clé connue a une valeur inutilisable. L'extension se replie sur le dernier niveau valide : la configuration de l'organisation, puis les valeurs par défaut du produit. |
| Version non prise en charge | Le fichier a été écrit pour une version plus récente de l'extension. L'extension se replie sur `assist`, ou sur le plancher d'entreprise s'il est plus strict. |

*Configuration non lue* est un cas différent : l'extension n'a pas pu atteindre le fichier du
tout. Elle assiste alors sans bloquer
([FAQ](faq-fr.md#la-pastille-indique-une-configuration-non-lue)).
