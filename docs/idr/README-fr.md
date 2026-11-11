# Important Decision Records

*English: [README-en.md](README-en.md)*

Un **Important Decision Record (IDR)** conserve une décision importante de ce dépôt, pour que chacun puisse comprendre, des mois ou des années plus tard, pourquoi elle était juste au moment où elle a été prise. C'est une mémoire historique, pas une documentation vivante : il dit ce qui était vrai, connu et décidé à cette date, et n'est pas mis à jour quand cela cesse d'être vrai. Les règles sont celles du guide IDR du propriétaire (tenu dans un dépôt privé) ; ce qui suit est ce dont un contributeur a besoin.

`specifications-fr.md` reste la référence normative du comportement du produit — le *quoi*. Un IDR consigne le *pourquoi* d'un choix ; la règle qu'il a produite reste dans le document qui la porte, et cite l'IDR.

## Règles

- **Une décision, un IDR.** Seuls les vrais choix sont consignés : une décision dont un futur mainteneur demanderait « pourquoi a-t-on fait comme ça ? ». Si l'implémentation changeait mais que la décision tenait, l'IDR n'aurait pas à changer.
- **Un IDR accepté ne se réécrit jamais.** Une décision qui évolue donne un nouvel IDR ; quand ce remplaçant est accepté, et seulement alors, le statut de l'ancien gagne une ligne qui le nomme.
- **Le statut est un historique où l'on ne fait qu'ajouter** : une ligne par changement, `Date | Statut | Note | Compte rendu lié`, aucune ligne modifiée ni supprimée. Statuts : Proposé, Accepté, Rejeté, Déprécié, Remplacé par DECxxxx.
- **Le Contexte contient des faits, la Justification des arguments** tirés de ces faits. **La Décision tient en exactement une phrase**, sans justification.
- **Rien n'est inventé.** Une alternative, une conséquence ou un risque n'entre dans un IDR qu'une fois validé par la personne qui porte la décision ; une alternative qui n'a jamais été documentée n'est pas reconstituée.
- **Un agent rédige, le propriétaire accepte.** Un agent écrit un IDR au statut Proposé et ne change jamais un statut sans que le propriétaire le lui demande.

## Fichiers

- `DECnnnn-<titre-anglais>-en.md` et `DECnnnn-<titre-anglais>-fr.md`, liés l'un à l'autre : chaque IDR existe en anglais et en français (DEC0002).
- L'index ci-dessous est tenu dans les deux README.

## Vérifier une pull request

Chaque pull request est vérifiée contre ce registre (DEC0001), par l'agent qui y travaille, au moyen du [skill `idr`](../../.claude/skills/idr/SKILL.md). La vérification est consultative et ne bloque jamais ; la plupart des pull requests ne portent aucune décision.

## D'où viennent ces décisions

DEC0002 à DEC0014 ont été reprises le 2026-11-11 des mentions « décision du propriétaire » de `CLAUDE.md`, de la spécification, de la documentation et de l'historique git ; chacune est datée du jour où elle a été prise, et la note de son statut nomme ses sources. DEC0001, la décision de tenir ce registre, a été prise le 2026-11-11 et datée du 2026-08-31 par choix du mainteneur, pour précéder les décisions qu'elle consigne.

## Index

| IDR | Titre | Statut | Date |
| --- | --- | --- | --- |
| [DEC0001](DEC0001-record-important-decisions-as-idrs-fr.md) | Consignation des décisions importantes en IDR | Accepté | 2026-08-31 |
| [DEC0002](DEC0002-english-first-language-follows-the-reader-fr.md) | L'anglais d'abord, la langue suit le lecteur | Accepté | 2026-09-01 |
| [DEC0003](DEC0003-an-inert-prettier-configuration-fr.md) | Une configuration Prettier inerte | Accepté | 2026-09-08 |
| [DEC0004](DEC0004-spec-amendments-ship-with-their-code-fr.md) | L'amendement de la spec livré avec son code | Accepté | 2026-09-24 |
| [DEC0005](DEC0005-one-platform-per-pull-request-fr.md) | Une plateforme par pull request | Accepté | 2026-10-27 |
| [DEC0006](DEC0006-diagnostic-reports-as-issues-fr.md) | Les rapports de diagnostic en issues | Accepté | 2026-10-31 |
| [DEC0007](DEC0007-gitlab-in-scope-fr.md) | GitLab dans le périmètre | Accepté | 2026-11-08 |
| [DEC0008](DEC0008-azure-devops-on-dev-azure-com-only-fr.md) | Azure DevOps limité à dev.azure.com | Accepté | 2026-11-09 |
| [DEC0009](DEC0009-no-email-address-in-captures-fr.md) | Aucune adresse e-mail dans les captures | Accepté | 2026-11-09 |
| [DEC0010](DEC0010-the-extension-is-the-whole-product-fr.md) | L'extension seule comme produit | Accepté | 2026-11-10 |
| [DEC0011](DEC0011-publishing-keystrokes-declared-per-platform-fr.md) | Raccourcis de publication déclarés par plateforme | Accepté | 2026-11-10 |
| [DEC0012](DEC0012-re-read-the-configuration-before-blocking-fr.md) | Relecture de la configuration avant tout blocage | Accepté | 2026-11-10 |
| [DEC0013](DEC0013-no-claude-code-footer-in-pull-requests-fr.md) | Pas de pied Claude Code dans les pull requests | Accepté | 2026-11-10 |
| [DEC0014](DEC0014-slugger-names-review-sessions-fr.md) | Slugger pour nommer les sessions de revue | Accepté | 2026-11-11 |
