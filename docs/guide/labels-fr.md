# Labels et décorations

**Langues :** [English](labels-en.md) | Français (ce fichier)

Tous les labels livrés avec l'extension, ce qu'ils veulent dire, et ce qui rend un commentaire
bloquant. Un dépôt peut modifier cette liste ([configuration](configuration-fr.md#labels)) ;
ce qui suit est ce que vous obtenez sans aucune configuration.

## Les labels qui soulèvent un point

Ce sont les labels de [Conventional Comments](https://conventionalcomments.org/). Ils ouvrent
un point, et c'est d'abord le relecteur qui les emploie.

| Label | À utiliser pour… | Exemple | Bloquant par défaut | Peut devenir bloquant |
|---|---|---|:---:|:---:|
| 👏 `praise` | Saluer un point remarquable du code. | `praise: gestion d’erreur très lisible` | Non | Oui |
| 🔍 `nitpick` | Signaler une préférence mineure, sans enjeu. | `nitpick: virgule finale` | Non | **Non** |
| 💡 `suggestion` | Proposer une amélioration et dire pourquoi. | `suggestion (non-blocking): extraire une méthode` | Non | Oui |
| 🔨 `issue` | Signaler un problème à corriger, idéalement avec une piste. | `issue: fuite mémoire sur le handler` | **Oui** | — |
| 📌 `todo` | Demander un petit changement nécessaire. | `todo: renommer la variable` | **Oui** | — |
| ❓ `question` | Demander une précision avant de conclure. | `question (non-blocking): pourquoi ce choix ?` | Non | Oui |
| 💭 `thought` | Partager une idée, sans rien demander. | `thought: on pourrait factoriser plus tard` | Non | **Non** |
| 🧹 `chore` | Demander une tâche annexe avant la fusion (job, doc, config…). | `chore: relancer le job de couverture` | **Oui** | — |
| 📝 `note` | Porter une information à la connaissance de tous. | `note: ce module part en refonte au T3` | Non | **Non** |
| 🔤 `typo` | Signaler une faute de frappe. | `typo: « recieve » → « receive »` | Non | Oui |
| ✨ `polish` | Proposer une finition, sans changer le sens. | `polish: aligner les imports` | Non | Oui |
| 🪶 `quibble` | Signaler un détail discutable. **Livré désactivé.** | `quibble: nom un peu long` | Non | Oui |

`quibble` est le seul label livré désactivé : Conventional Comments le définit comme un
`nitpick` sous un autre nom, et deux boutons pour un même sens ne laissent qu'un choix
arbitraire. Un dépôt qui le veut l'active avec `{ "id": "quibble", "enabled": true }`.

« Utiliser au moins un `praise` par revue » est une bonne pratique, pas une règle :
l'extension ne le vérifie jamais.

## Les labels qui ne font pas partie de Conventional Comments

Conventional Comments donne un vocabulaire à la **remarque** de revue et ne dit rien de la
**réponse** à cette remarque ; la convention invite d'ailleurs les équipes à adapter sa
liste. L'extension ajoute sept labels qui lui sont propres. Ce sont des labels ordinaires :
même format, mêmes décorations, mêmes règles. Aucun d'eux ne peut ouvrir un fil bloquant.

### Répondre à un point

| Label | À utiliser pour… | Exemple | Aussi accepté |
|---|---|---|---|
| 🤝 `thanks` | Remercier, sans prendre position. | `thanks: merci pour la relecture attentive` | `thx` |
| ✅ `done` | Indiquer que la correction est poussée, avec son commit. | `done: jeton propre à la plateforme retiré` | `fixed` |
| 👌 `ack` | Accepter un point sans changer le code à ce stade. | `ack: bien noté, je garde ça pour le module suivant` | `acknowledged` |
| ✋ `disagree` | Décliner une remarque en disant pourquoi. | `disagree: la correspondance est volontairement indépendante de la plateforme` | |
| ⚖️ `decision` | Acter qu’un point ne sera pas traité, motif à l’appui. | `decision: hors périmètre, dette suivie en PROJ-142` | |

```text
issue (blocking): les jetons CSS d'une plateforme fuient dans la feuille partagée
```
```text
done: jeton propre à la plateforme retiré
```

**`done`, `ack` ou `disagree` ?** Une réponse tranche une seule question : le code a-t-il
changé, et sinon, concédez-vous le point ?

- Le code a changé → `done`.
- Le code n'a pas changé et le point était valide (coût, périmètre, priorité, ou simplement
  « bien noté ») → `ack`.
- Le code n'a pas changé parce que vous contestez le point → `disagree`.

`ack` n'est pas un refus poli : `ack: juste, mais je laisse tel quel` est un `disagree`.

**`disagree` n'est pas `decision`.** `disagree` est un avis, que n'importe qui peut exprimer.
`decision` acte un choix des responsables de la pull request. Son sujet doit donner le motif
en au moins 20 caractères, et une `decision` est validée même là où les réponses ne le sont
pas
([clore un fil sans faire le changement](writing-comments-fr.md#clore-un-fil-bloquant-sans-faire-le-changement-demandé)).
Ni l'un ni l'autre ne résout le fil, qui se résout toujours dans l'interface de la
plateforme.

### Dire où en est une revue

| Label | À utiliser pour… | Exemple |
|---|---|---|
| 📋 `summary` | Faire le point sur une passe : vérifié, encore ouvert. Ne clôt pas la revue. | `summary: deux points vérifiés, un reste ouvert` |
| 🎉 `reviewed` | Clore votre revue quand tous vos points sont traités. N’approuve rien. | `reviewed: corrections vérifiées, rien à ajouter` |

**Quand publier `reviewed`.** Il clôt votre revue dans son ensemble, pas une passe de lecture.
Publiez-le quand chacun de vos points est traité (corrigé et vérifié, ou écarté par une
réponse que vous acceptez) et qu'une dernière lecture ne fait rien apparaître de nouveau.
Toute modification ultérieure de la pull request rouvre votre revue. Chaque relecteur clôt la
sienne. Ce qu'il faut à la pull request pour être fusionnée (approbations, relecteurs requis)
reste l'affaire de la plateforme : l'extension ne compte pas les `reviewed`, et aucun nombre
de `reviewed` ne vaut approbation.

Un `summary` ne tient jamais lieu de `reviewed`, même quand plus aucun point n'est ouvert.

### S'en tenir à Conventional Comments

Six de ces sept labels forment les **labels ajoutés** : `thanks`, `done`, `ack`, `disagree`,
`summary` et `reviewed`. Une équipe qui ne veut que la liste de Conventional Comments les
désactive dans la configuration du dépôt, une entrée par label. La
[page de réglages](settings-fr.md#labels-ajoutés) affiche le bloc et le copie pour vous :

```json
{ "labels": [ { "id": "thanks", "enabled": false },
              { "id": "done", "enabled": false },
              { "id": "ack", "enabled": false },
              { "id": "disagree", "enabled": false },
              { "id": "summary", "enabled": false },
              { "id": "reviewed", "enabled": false } ] }
```

`decision` ne fait pas partie de ce groupe : désactiver les labels ajoutés le laisse actif.

## Décorations

Une décoration se place entre parenthèses, entre le label et le deux-points. Plusieurs
décorations se séparent par des virgules.

| Décoration | Effet |
|---|---|
| `(blocking)` | Le commentaire est bloquant, quel que soit son label. |
| `(non-blocking)` | Le commentaire n'est pas bloquant, quel que soit son label. |
| `(if-minor)` | Non bloquant : ne traiter le point que si l'effort est faible. |
| Une décoration libre : `(security)`, `(perf)`, `(a11y)`… | Aucun. Elle décrit le commentaire. Autorisée par défaut (`decorations.allowFree`). |

```text
suggestion (non-blocking, perf): mettre en cache le motif compilé
```

Une décoration est un mot fait de lettres, de chiffres et de traits d'union. `(non blocking)`,
`()` et `(blocking,,)` sont des erreurs ; `(BLOCKING)` et `( blocking )` sont acceptés avec
un avertissement et une correction en un clic.

`suggestion` et `question` ne disent rien par eux-mêmes du caractère bloquant du point :
l'extension avertit donc quand ils ne portent aucune des trois décorations ci-dessus.

## Ce qui rend un commentaire bloquant

La première règle qui s'applique l'emporte :

1. Un label qui ne peut jamais être bloquant (`nitpick`, `thought`, `note` et les sept labels
   de l'extension) avec `(blocking)` est une **erreur**, `E-CONFLICT`.
2. `(blocking)` avec `(non-blocking)` ou `(if-minor)` est une **erreur**, `E-CONFLICT`.
3. `(blocking)` seul → bloquant.
4. `(non-blocking)` ou `(if-minor)` → non bloquant.
5. Aucune de ces décorations → le label décide : `issue`, `todo` et `chore` sont bloquants,
   les autres ne le sont pas.

| Commentaire | Bloquant ? |
|---|---|
| `issue: …` | Oui |
| `issue (non-blocking): …` | Non |
| `issue (if-minor): …` | Non |
| `suggestion: …` | Non, avec un avertissement qui demande une décoration |
| `suggestion (blocking): …` | Oui |
| `nitpick (blocking): …` | Erreur |

Un commentaire bloquant ouvre un **fil bloquant** quand il est le premier commentaire d'un
fil qui peut être résolu. Le bandeau compte ces fils tant qu'ils ne sont pas résolus
([le bandeau](writing-comments-fr.md#une-fois-les-commentaires-publiés)). Si vous modifiez
`issue:` en `note:`, le fil devient non bloquant : l'extension lit l'état courant de la page
et ne garde aucun historique.

## Alias

Un alias est une autre graphie acceptée pour un label : `fixed:` est lu comme `done:`, `thx:`
comme `thanks:`, `acknowledged:` comme `ack:`. Un alias ne produit aucun diagnostic ;
l'extension propose de le réécrire avec le nom du label, sans insister. Un dépôt peut déclarer
les siens, par exemple `bug` pour `issue` ([configuration](configuration-fr.md#labels)).
