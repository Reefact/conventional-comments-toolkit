# DEC0005 | Une plateforme par pull request

*English: [DEC0005-one-platform-per-pull-request-en.md](DEC0005-one-platform-per-pull-request-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-10-27 | Accepté | Reprise de la décision consignée dans `CLAUDE.md` et le commit `c08b35a`, le 2026-11-11 |  |

## Contexte

L'interface GitHub est terminée ; une correction Azure DevOps ou la création de l'adaptateur GitLab ne doivent pas pouvoir la casser. Le paquet d'un adaptateur ne s'exécute que sur sa plateforme, alors que le code partagé s'exécute sur toutes : une pull request qui modifie les deux modifie aussi toutes les autres plateformes, sans le dire.

## Décision

Une pull request touche une seule plateforme, ou le code partagé, jamais les deux, sauf une pull request de contrat qui touche le code partagé et toutes les plateformes.

## Justification

Séparer le changement partagé du changement de plateforme rend visible ce qui touche toutes les plateformes, et protège celles qu'une pull request ne vise pas.

Une pull request de contrat est admise parce qu'un changement de contrat doit être appliqué partout à la fois. La documentation, les tests partagés et l'outillage hors de `packages/` sont neutres ; les fichiers d'inscription d'une plateforme ne le sont que dans la pull request qui la crée ou la retire.

La règle est vérifiée par `npm run check:pr-scope`, que la CI lance sur chaque pull request.

## Alternatives envisagées

Aucune alternative n'a été documentée au moment de la décision.

## Conséquences

### Positives

- Une pull request de plateforme ne peut plus modifier les autres plateformes sans le dire.

### Négatives

- Un changement partagé et son usage par une plateforme demandent deux pull requests.

### Risques

- Avec deux plateformes, une pull request qui touche les deux et le code partagé passe pour un contrat ; qu'elle en soit vraiment un reste une question de revue.

### Actions de suivi

- Aucun relevé au moment de la décision.
