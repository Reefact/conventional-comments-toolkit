# DEC0006 | Les rapports de diagnostic en issues

*English: [DEC0006-diagnostic-reports-as-issues-en.md](DEC0006-diagnostic-reports-as-issues-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-10-31 | Accepté | Reprise de la décision consignée dans le skill `diagnostic`, `CLAUDE.md` et le commit `8f25e81`, le 2026-11-11 |  |

## Contexte

La page d'options de l'extension exporte des archives de diagnostic (`cct-diagnostic-*`) : un `report.json` et des squelettes de page. Le premier rapport reçu (#113) révélait un sélecteur qui tenait à un attribut que la page change avec son état (`data-variant` suit les checks), et non avec sa structure.

Un rapport corrigé seul pousse à traiter un cas particulier en en cassant d'autres, ou le cas général.

## Décision

Chaque rapport de diagnostic est consigné en issue `diagnostic`, une par cause distincte, son archive conservée telle que reçue sur une branche `diagnostic/<date>-<chaîne>`, et rien n'est corrigé sur `main` avant qu'une trentaine d'issues ne soient ouvertes.

## Justification

Trente causes côte à côte montrent ce qu'elles ont en commun ; une seule n'en montre rien. L'unité est la cause distincte : deux rapports de même cause font une issue.

Conserver l'archive brute sur sa propre branche garde la mesure d'origine sans la mêler au code ; c'est la seule exception à la règle qui veut qu'une session ne pousse que sur la branche qu'elle désigne.

## Alternatives envisagées

Aucune alternative n'a été documentée au moment de la décision.

## Conséquences

### Positives

- Les corrections portent sur des causes communes plutôt que sur des cas isolés.

### Négatives

- Un défaut signalé attend, sur `main`, que le lot soit réuni.

### Risques

- Aucun relevé au moment de la décision.

### Actions de suivi

- Aucun relevé au moment de la décision.
