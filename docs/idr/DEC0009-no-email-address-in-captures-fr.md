# DEC0009 | Aucune adresse e-mail dans les captures

*English: [DEC0009-no-email-address-in-captures-en.md](DEC0009-no-email-address-in-captures-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-11-09 | Accepté | Reprise de la décision consignée dans `packages/adapters/azdo/CAPTURES.md` et le commit `1e495d1`, le 2026-11-11 |  |

## Contexte

Les pages capturées d'une plateforme sont versionnées dans le dépôt, qui est public, réduites à leur forme stockable. Le menu du compte Microsoft d'Azure DevOps (`.mectrl_root`) est présent, fermé, dans le DOM de chaque page, et y montre en clair l'adresse e-mail du compte connecté. Mesuré le 2026-11-09 : elle figurait dans les 25 premières captures Azure DevOps, qui n'avaient pas été poussées.

Le nom affiché du compte apparaît aussi, comme auteur des commentaires et dans des `aria-label`.

## Décision

Aucune capture versionnée ne garde d'adresse e-mail, et le nom affiché du compte y reste.

## Justification

L'adresse e-mail est une donnée personnelle, et les captures sont publiées avec le dépôt. Le texte d'origine ne consigne pas de raison pour garder le nom affiché ; il le note comme auteur des commentaires et dans des `aria-label`.

## Alternatives envisagées

Aucune alternative n'a été documentée au moment de la décision.

## Conséquences

### Positives

- Les captures versionnées ne publient plus d'adresse e-mail.

### Négatives

- Le nom affiché du compte de capture reste visible dans les captures.

### Risques

- Aucun relevé au moment de la décision.

### Actions de suivi

- Aucun relevé au moment de la décision.
