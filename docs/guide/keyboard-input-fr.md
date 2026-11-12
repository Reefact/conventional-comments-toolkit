# Saisie au clavier

**Langues :** [English](keyboard-input-en.md) | Français (ce fichier)

Trois façons d'écrire un préfixe sans toucher la souris. Elles complètent la barre d'outils ;
toutes trois produisent exactement le texte qu'un clic produirait.

| Façon | Vous saisissez | Qui la règle |
|---|---|---|
| [Liste de complétion](#liste-de-complétion) | `/` ou `:` dans un champ vide | Personne : elle liste les labels actifs |
| [Abréviations](#abréviations) | `?ib` puis `Tab` | L'équipe, dans la configuration du dépôt |
| [Raccourcis directs](#raccourcis-directs) | `Alt+I` | Vous, dans les réglages de l'extension |

## Liste de complétion

Dans un champ de commentaire **vide**, saisissez `/` ou `:`. Une liste des labels actifs
s'ouvre et se resserre au fil de la saisie.

```text
:su
```

liste `suggestion` et `summary`. `↑` et `↓` parcourent la liste, `Entrée` ou `Tab` accepte le
label sélectionné, `Échap` ferme la liste. Accepter `suggestion` laisse :

```text
suggestion: 
```

avec le curseur après l'espace, prêt pour le sujet. La liste suit l'ordre des boutons de la
barre d'outils, votre ordre personnel compris.

## Abréviations

Saisissez une abréviation, puis appuyez sur `Tab` : elle se développe en un préfixe complet,
décoration comprise.

```text
?ib
```

puis `Tab` donne :

```text
issue (blocking): 
```

Une abréviation se développe là où se trouve le curseur : elle fonctionne donc aussi après
une citation ou une ligne de contexte.

### Abréviations livrées

| Abréviation | Se développe en | | Abréviation | Se développe en |
|---|---|---|---|---|
| `?i` | `issue: ` | | `?ch` | `chore: ` |
| `?ib` | `issue (blocking): ` | | `?ty` | `typo: ` |
| `?su` | `suggestion: ` | | `?po` | `polish: ` |
| `?ni` | `nitpick: ` | | `?qui` | `quibble: ` |
| `?no` | `note: ` | | `?sum` | `summary: ` |
| `?pr` | `praise: ` | | `?r` | `reviewed: ` |
| `?to` | `todo: ` | | `?thx` | `thanks: ` |
| `?th` | `thought: ` | | `?do` | `done: ` |
| `?que` | `question: ` | | `?a` | `ack: ` |
| `?de` | `decision: ` | | `?di` | `disagree: ` |

Une abréviation prend autant de lettres qu'il lui en faut pour désigner un seul label : deux
distinguent `nitpick` de `note`, il en faut trois pour `question` et `quibble`. Comme le
développement attend `Tab`, `?i` et `?ib` peuvent coexister.

Une abréviation livrée ne se développe qu'en un label **actif**. `?qui` ne fait rien tant que
le dépôt n'active pas `quibble`, et `?do` ne fait rien dans un dépôt qui a désactivé `done`.

### Ajouter les vôtres

La table appartient à l'équipe. Elle vit dans le fichier `.conventional-comments.json` du
dépôt, sous `shortcuts.abbreviations`. Chaque entrée associe une abréviation au texte inséré,
deux-points et espace compris :

```json
{
  "shortcuts": {
    "abbreviations": {
      "?sec": "issue (blocking, security): ",
      "?snb": "suggestion (non-blocking): "
    }
  }
}
```

Vos entrées s'ajoutent à celles qui sont livrées ; une entrée portant la même abréviation la
redéfinit ([configuration](configuration-fr.md)).

## Raccourcis directs

Une combinaison de touches insère directement un label dans le commentaire que vous êtes en
train d'écrire.

| Raccourci | Label | | Raccourci | Label |
|---|---|---|---|---|
| `Alt+I` | `issue` | | `Alt+Q` | `question` |
| `Alt+S` | `suggestion` | | `Alt+P` | `praise` |
| `Alt+N` | `nitpick` | | `Alt+C` | `chore` |
| `Alt+T` | `todo` | | `Alt+D` | `decision` |

Vous avez saisi :

```text
ce nom ne dit pas ce que contient la variable
```

`Alt+N` donne :

```text
nitpick: ce nom ne dit pas ce que contient la variable
```

Vous avez changé d'avis ? `Alt+I` **remplace** le label au lieu d'en ajouter un second :

```text
issue: ce nom ne dit pas ce que contient la variable
```

Une décoration déjà écrite reste : sur `nitpick (non-blocking): …`, un raccourci change le
label et garde `(non-blocking)`. Un raccourci vers un label que le dépôt a désactivé ne fait
rien.

### Les modifier

Les raccourcis directs sont une préférence personnelle. Dans la
[page de réglages](settings-fr.md), sous *Préférences locales* → *Raccourcis directs*,
écrivez un raccourci par ligne :

```text
Alt+R=reviewed
Alt+D=
```

- `Alt+R=reviewed` ajoute un raccourci.
- `Alt+D=`, sans label, désactive le raccourci livré `Alt+D`.
- Les raccourcis livrés que vous ne mentionnez pas restent tels quels.

Un raccourci, c'est `Alt` plus une lettre, et son label s'écrit par son identifiant
(`reviewed`, pas un alias). La préférence vous suit grâce à la synchronisation de votre
navigateur, et s'applique au prochain champ de commentaire qui s'ouvre, pas à ceux qui sont
déjà ouverts.

### Limite connue sur macOS

L'extension reconnaît un raccourci au caractère que la touche produit. Sur macOS, `Option`
plus une lettre saisit en général un caractère spécial au lieu de la lettre : un raccourci
direct peut donc ne pas se déclencher. Cela n'a pas été mesuré sur un Mac. La liste de
complétion et les abréviations ne dépendent pas de `Alt` et ne sont pas concernées.
