# DEC0004 | L'amendement de la spec livré avec son code

*English: [DEC0004-spec-amendments-ship-with-their-code-en.md](DEC0004-spec-amendments-ship-with-their-code-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-09-24 | Accepté | Reprise de la décision consignée dans `CLAUDE.md` et le commit `fe37170`, qui a retiré le garde CI le 2026-10-24, le 2026-11-11 |  |

## Contexte

`specifications-fr.md` est la référence normative du comportement, et la règle du dépôt interdit de la modifier pour la faire correspondre à l'implémentation : un amendement est une décision de conception.

Une étape de la CI refusait toute pull request qui modifiait `specifications-fr.md` en même temps que du code.

## Décision

Une pull request peut modifier `specifications-fr.md` avec le code qui l'implémente.

## Justification

Un amendement du contrat se livre avec le code qui l'implémente.

La règle que le garde protégeait ne dépend pas de lui : la spécification ne se plie toujours pas à l'implémentation, et c'est la revue qui juge un amendement comme une décision de conception.

## Alternatives envisagées

Aucune alternative n'a été documentée au moment de la décision.

## Conséquences

### Positives

- Un amendement du contrat et son implémentation arrivent ensemble.

### Négatives

- Aucun garde mécanique ne signale plus qu'une pull request touche la spécification.

### Risques

- Aucun relevé au moment de la décision.

### Actions de suivi

- Aucun relevé au moment de la décision.
