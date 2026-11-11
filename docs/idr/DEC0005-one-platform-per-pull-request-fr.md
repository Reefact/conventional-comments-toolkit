# DEC0005 | Une plateforme par pull request

*English: [DEC0005-one-platform-per-pull-request-en.md](DEC0005-one-platform-per-pull-request-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-10-27 | Accepté | Reprise de la décision consignée dans `CLAUDE.md` et les commits `c08b35a` et `2dd4a7f`, le 2026-11-11 | Revue de la PR #78 |

## Contexte

L'interface GitHub est terminée ; une correction Azure DevOps ou la création de l'adaptateur GitLab ne doivent pas pouvoir la casser. Le paquet d'un adaptateur ne s'exécute que sur sa plateforme, alors que le code partagé s'exécute sur toutes : une pull request qui modifie les deux modifie aussi toutes les autres plateformes, sans le dire.

## Décision

Une pull request touche une seule plateforme, ou le code partagé, jamais les deux, sauf une pull request qui touche toutes les plateformes : un contrat si elle touche aussi le code partagé, sinon une pull request de toutes les plateformes.

## Justification

Séparer le changement partagé du changement de plateforme rend visible ce qui touche toutes les plateformes, et protège celles qu'une pull request ne vise pas.

Une pull request de contrat est admise parce qu'un changement de contrat doit être appliqué partout à la fois. La documentation, les tests partagés et l'outillage hors de `packages/` sont neutres ; les fichiers d'inscription d'une plateforme ne le sont que dans la pull request qui la crée. Le même jour, à la suite de la revue de la PR #78 (commit `2dd4a7f`), l'exception s'étend à la pull request qui retire une plateforme : retirer un adaptateur oblige à retirer son inscription, et aucun découpage ne reste vert — l'adaptateur d'abord laisse des imports morts, l'inscription d'abord fait échouer `platform-registry.test.ts`. Le même commit distingue la pull request qui touche toutes les plateformes sans code partagé : l'appeler contrat prétendait un code partagé qu'elle ne contient pas ; elle reste admise, sous son propre nom.

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
