# DEC0011 | Raccourcis de publication déclarés par plateforme

*English: [DEC0011-publishing-keystrokes-declared-per-platform-en.md](DEC0011-publishing-keystrokes-declared-per-platform-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-11-10 | Accepté | Reprise de la décision consignée dans `specifications-fr.md` (§9.2.3) et le commit `5ee23c2`, le 2026-11-11 |  |

## Contexte

Sous `enforce`, un commentaire non conforme a été publié sur Azure DevOps en appuyant sur Ctrl+Entrée pendant que le bouton *Comment* avait le focus. Mesuré le 2026-11-10 dans Chrome : Entrée, Ctrl+Entrée et Espace sur ce bouton envoient la requête de publication sur la touche elle-même, sans déclencher de clic. Le garde partagé n'arrêtait que les clics sur les contrôles d'envoi, et un Ctrl+Entrée écrit en dur dans le champ.

## Décision

Chaque adaptateur déclare les raccourcis qui publient sur sa plateforme, depuis le champ et depuis un contrôle d'envoi qui a le focus, et le garde partagé n'arrête que ce que l'adaptateur déclare.

## Justification

Un raccourci n'est pas le même d'une plateforme à l'autre, et celui d'une plateforme ne doit jamais toucher les autres : un raccourci propre à Azure DevOps écrit dans le code partagé aurait changé le comportement sur GitHub et GitLab.

La méthode est obligatoire au contrat, si bien qu'une nouvelle plateforme ne peut pas oublier de la déclarer.

## Alternatives envisagées

Aucune alternative n'a été documentée au moment de la décision.

## Conséquences

### Positives

- Les raccourcis mesurés sur Azure DevOps sont arrêtés, sans changement sur GitHub et GitLab.

### Négatives

- Chaque adaptateur doit mesurer et déclarer ses raccourcis.

### Risques

- Un raccourci non déclaré par un adaptateur n'est pas arrêté.

### Actions de suivi

- Aucun relevé au moment de la décision.
