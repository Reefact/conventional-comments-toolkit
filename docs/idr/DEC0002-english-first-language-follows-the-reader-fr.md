# DEC0002 | L'anglais d'abord, la langue suit le lecteur

*English: [DEC0002-english-first-language-follows-the-reader-en.md](DEC0002-english-first-language-follows-the-reader-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-09-01 | Accepté | Reprise de la décision consignée dans `CLAUDE.md` et les commits `70e0902` et `3a5ab99`, le 2026-11-11 |  |

## Contexte

La convention de langue du dépôt existait dans la pratique et n'était écrite nulle part. Elle a dérivé : les messages de commit sont passés à l'anglais en cours de route sans que personne ne le décide, et un commentaire de déclenchement de revue est parti en français vers un robot qui relit en anglais.

Une première rédaction (commit `70e0902`) mettait les messages de commit en anglais et tout le reste en français. Deux rédactions successives ont énuméré des fichiers au lieu d'énoncer un critère, et les deux ont été prises en défaut par des revues Codex (PR #32 et #33) : la première condamnait à la traduction les documents destinés à un public anglophone, la seconde rangeait le catalogue anglais de l'interface sous « tout le reste est en français », alors que la spécification exige une interface bilingue (§10).

## Décision

La langue d'un texte du dépôt est choisie par une seule question, « qui le lit ? » : ce qui est lu hors de l'équipe s'écrit en anglais, et ce qui ne l'est pas suit la langue de l'équipe, le français.

## Justification

Un critère ne vieillit pas là où une liste de fichiers vieillit : les deux rédactions par énumération ont échoué sur des fichiers que la liste n'avait pas prévus.

Les messages de commit et le contenu des pull requests sont lus par quiconque clone le dépôt ou y contribue : ils sont en anglais. Les documents du dépôt sont en anglais d'abord, avec un jumeau français quand c'est possible, la paire portant les suffixes `-en.md` et `-fr.md` ; un document qui n'existe que dans une langue n'est pas une faute. Les chaînes de l'interface restent chacune dans sa langue, sans quoi le produit bilingue serait cassé. L'outillage interne et les commentaires de code s'adressent à l'équipe et suivent sa langue.

## Alternatives envisagées

### Alternative 1 — Énumérer les fichiers par langue

Les deux premières rédactions de la règle. Écarté : prises en défaut deux fois sur des fichiers non prévus.

## Conséquences

### Positives

- Une question unique tranche les cas qu'aucune liste n'avait prévus.

### Négatives

- Aucun relevé au moment de la décision.

### Risques

- Aucun relevé au moment de la décision.

### Actions de suivi

- Aucun relevé au moment de la décision.
