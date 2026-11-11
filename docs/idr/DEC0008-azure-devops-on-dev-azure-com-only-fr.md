# DEC0008 | Azure DevOps limité à dev.azure.com

*English: [DEC0008-azure-devops-on-dev-azure-com-only-en.md](DEC0008-azure-devops-on-dev-azure-com-only-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-11-09 | Accepté | Reprise de la décision consignée dans `packages/adapters/azdo/CAPTURES.md` et le commit `a9d8d3c`, le 2026-11-11 |  |

## Contexte

L'adaptateur Azure DevOps a été réécrit sur 25 captures de `dev.azure.com` ; ses versions précédentes avaient été écrites de mémoire et n'avaient jamais fonctionné. Les hôtes `{org}.visualstudio.com` et Azure DevOps Server n'ont pas été capturés.

L'en-tête de `specifications-fr.md` cite pourtant « Azure DevOps (Services, Server) » parmi les cibles.

## Décision

L'adaptateur Azure DevOps ne reconnaît que `dev.azure.com`.

## Justification

Chaque sélecteur de l'adaptateur cite la capture qui le justifie : un hôte qui n'a pas été capturé n'a aucune mesure qui fonde ses sélecteurs.

## Alternatives envisagées

Aucune alternative n'a été documentée au moment de la décision.

## Conséquences

### Positives

- L'adaptateur ne prétend fonctionner que là où il a été mesuré.

### Négatives

- Les organisations sur `{org}.visualstudio.com` ou sur Azure DevOps Server ne sont pas couvertes.

### Risques

- L'en-tête de la spécification et cette décision ne disent pas la même chose sur Azure DevOps Server.

### Actions de suivi

- Aucun relevé au moment de la décision.
