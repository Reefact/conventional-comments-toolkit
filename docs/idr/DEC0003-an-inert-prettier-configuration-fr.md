# DEC0003 | Une configuration Prettier inerte

*English: [DEC0003-an-inert-prettier-configuration-en.md](DEC0003-an-inert-prettier-configuration-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-09-08 | Accepté | Reprise de la décision consignée dans `CLAUDE.md` et le commit `d925fae`, le 2026-11-11 | Revue de la PR #63 |

## Contexte

Le code du dépôt est mis en forme à la main, et aucun réglage ne rend Prettier idempotent sur lui : il restructure plutôt qu'il n'enroule. Un `prettier --write` lancé sur sept fichiers en cours de travail a produit environ 580 lignes de bruit dans un commit déjà poussé, qu'il a fallu défaire à la main.

Un fichier `.prettierrc` avait été ajouté pour fixer le style. L'extension VS Code de Prettier a un réglage `prettier.requireConfig`, largement activé, qui refuse de formater tant qu'aucune configuration locale n'existe : ajouter le fichier faisait passer de « ne formate pas » à « formate » les développeurs qui avaient aussi `editor.formatOnSave` activé (revue de la PR #63).

Mesuré sur l'ensemble des sources : avec `requirePragma: true`, aucun fichier n'est réécrit ; sans lui mais avec le reste de la configuration, 106 fichiers (+3 611 / −1 122 lignes) ; sans aucune configuration, 140 fichiers (+17 850 / −10 662).

## Décision

La configuration Prettier du dépôt porte `requirePragma: true`, si bien que Prettier ne formate aucun fichier qui ne le demande pas par un pragma Prettier (`@format` ou `@prettier`).

## Justification

Le fichier censé protéger créait le danger sur les éditeurs des humains, que `CLAUDE.md` ne protège pas ; `requirePragma` est la seule clé qui rend la commande inoffensive, mesuré dans les deux sens.

Les autres clés ne font que réduire les dégâts le jour où quelqu'un retirerait `requirePragma`, d'un facteur 6 (28 512 lignes de churn contre 4 733) ; elles fixent aussi le style pour le jour où l'on adopterait Prettier, ou pour un fichier qu'on y ferait entrer par un pragma. `singleQuote` et `trailingComma: es5` sont ce que le code emploie partout ; `printWidth: 100` correspond à sa convention réelle — p95 des lignes de code à 94 colonnes, commentaires enroulés à la main autour de 95 —, quand `120` produirait moins de churn (88 fichiers, +1 932) mais décrirait mal le code.

## Alternatives envisagées

### Alternative 1 — Un `.prettierignore` couvrant les sources

L'autre option proposée dans la revue de la PR #63. Écarté par l'auteur : un fichier d'ignore couvrant réellement les sources reviendrait à énumérer tout le dépôt ; la liste vieillirait au premier répertoire ajouté, et un fichier neuf serait formaté sans que personne le remarque. Le pragma inverse la charge : c'est le fichier qui doit demander à être formaté.

## Conséquences

### Positives

- `prettier --write` et le formatage à la sauvegarde ne réécrivent plus le dépôt.

### Négatives

- Le fichier de configuration dit l'inverse de ce qu'on attendrait de lui : le dépôt n'est pas formaté par Prettier.

### Risques

- Retirer `requirePragma` sans le savoir réécrirait plus d'une centaine de fichiers.

### Actions de suivi

- Aucun relevé au moment de la décision.
