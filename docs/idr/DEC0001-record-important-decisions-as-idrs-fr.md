# DEC0001 | Consignation des décisions importantes en IDR

*English: [DEC0001-record-important-decisions-as-idrs-en.md](DEC0001-record-important-decisions-as-idrs-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-08-31 | Accepté | Décision prise le 2026-11-11 ; datée du 2026-08-31 par choix du mainteneur, pour précéder les décisions qu'elle consigne |  |

## Contexte

Le dépôt consignait ses décisions au fil de ses documents, sous la forme « décision du propriétaire, date » : une trentaine de mentions dans une dizaine de fichiers — `CLAUDE.md`, `specifications-fr.md`, `docs/architecture-fr.md`, `docs/operations-fr.md`, le `README.md`, des notes d'adaptateur et des skills. Aucun index ne les rassemblait, et le *pourquoi* d'une décision était souvent mêlé à la règle qu'elle produisait, ce qui allongeait `CLAUDE.md`.

`specifications-fr.md` est la référence normative du comportement : elle dit le *quoi*, et ne se plie jamais à l'implémentation.

Pendant la revue de la PR #188, un relecteur a demandé de faire passer le binaire natif de Slugger avant l'outil .NET installé, sans justification ; le débat qui a suivi n'est consigné que dans les fils de cette PR, qu'un agent ne relit pas une fois la PR fermée.

Le propriétaire tient un guide de rédaction des Important Decision Records (IDR), dans son dépôt `engineering-workbench`. Le dépôt Slugger l'applique déjà, en français. Le dépôt just-dummies tient un registre d'ADR dans un autre format, et vérifie chaque pull request contre lui par un skill d'agent consultatif, sans automatisme en CI.

La règle de langue du dépôt (DEC0002) veut qu'un document du dépôt soit écrit en anglais d'abord, avec un jumeau français quand c'est possible.

## Décision

Les décisions importantes du dépôt sont consignées en IDR bilingues dans `docs/idr/`, selon le guide du propriétaire, et chaque pull request est vérifiée contre ce registre.

## Justification

Un registre indexé rend les décisions trouvables là où des mentions dispersées ne l'étaient pas, et sépare le *pourquoi* de la règle : la règle reste dans le document qui la porte, son histoire part dans l'IDR, ce qui allège `CLAUDE.md`.

Un registre que rien ne consulte tombe en désuétude ; la vérification à chaque pull request est ce qui le fait vivre, et c'est aussi ce qui empêche un débat déjà tranché, comme celui de la PR #188, d'être rouvert faute de trace.

Le guide du propriétaire est déjà la référence de Slugger : le reprendre donne les mêmes règles d'un dépôt à l'autre. Le doublement en anglais et en français applique la règle de langue du dépôt.

La vérification reste consultative, comme dans just-dummies : consigner une décision est un acte que le propriétaire relit, pas un contrôle automatique.

## Alternatives envisagées

### Alternative 1 — Le statu quo

Garder les « décisions du propriétaire » au fil des documents. Écarté : une trentaine de mentions dispersées dans une dizaine de fichiers, sans index, le *pourquoi* mêlé à la règle.

### Alternative 2 — La justification dans les pull requests

Laisser le raisonnement dans les descriptions et les fils de revue, là où vit le débat de la PR #188. Écarté : rien n'y est indexé, et un agent ne relit pas une PR fermée.

### Alternative 3 — Un registre sans vérification à chaque PR

Tenir le registre et le consulter au besoin, comme Slugger. Écarté : un registre que rien ne consulte tombe en désuétude.

### Alternative 4 — Le format ADR de just-dummies

Reprendre ses fichiers, ses statuts et son en-tête daté. Écarté : le guide du propriétaire est la référence, et Slugger l'applique déjà.

### Alternative 5 — Des IDR en français seul

Comme Slugger. Écarté : la règle de langue du dépôt veut l'anglais d'abord pour un document du dépôt (DEC0002).

### Alternative 6 — Les justifications dans la spécification

Écarté : la spécification est la référence normative du *quoi*, en français seul, et y ajouter le *pourquoi* la gonflerait.

## Conséquences

### Positives

- Les décisions sont indexées en un seul endroit, et leur *pourquoi* ne charge plus les règles.
- Une décision tranchée a une trace qu'un relecteur peut citer au lieu de la rouvrir.

### Négatives

- Chaque décision importante coûte un document en deux langues.
- Cette décision est datée avant les décisions qu'elle consigne, par choix du mainteneur, alors qu'elle a été prise après elles.

### Risques

- Une vérification consultative peut être ignorée ; le registre ne vaut que si elle est faite.

### Actions de suivi

- Reprendre en IDR les décisions déjà consignées dans le dépôt, et ne laisser à leur place que la règle et l'identifiant de l'IDR.
- Écrire le skill d'agent qui vérifie chaque pull request contre le registre.
