# DEC0013 | Pas de pied Claude Code dans les pull requests

*English: [DEC0013-no-claude-code-footer-in-pull-requests-en.md](DEC0013-no-claude-code-footer-in-pull-requests-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-11-10 | Accepté | Reprise de la décision consignée dans `CLAUDE.md` et les commits `ab97a29`, `9b2fd9c`, `e51a67b` et `106e27f`, le 2026-11-11 |  |

## Contexte

Les sessions Claude Code terminent une description de pull request par la ligne « 🤖 Generated with Claude Code » et le lien de la session. Une règle de `CLAUDE.md` demandant de ne pas les écrire (commit `ab97a29`) a été annulée le même jour (commit `9b2fd9c`) : sur la PR #167, l'outil de création de pull request a ajouté son propre pied à un corps envoyé sans pied. Modifier une description par cet outil n'ajoute rien (mesuré sur la PR #165).

## Décision

Une description de pull request ne porte ni le pied « Generated with Claude Code » ni le lien de session, et un workflow les retire après la création.

## Justification

Une règle d'agent ne suffit pas, puisque l'outil de création pose son propre pied : seul un workflow que l'outil ne touche pas peut le retirer après coup. La règle de `CLAUDE.md` reste, parce qu'elle épargne au workflow la forme que la session écrirait elle-même.

Le workflow tourne sur `pull_request_target`, le seul déclencheur dont le jeton peut écrire sur la pull request d'un fork, et ne récupère jamais le code de la pull request.

## Alternatives envisagées

### Alternative 1 — Une règle d'agent seule

La première version de la décision. Écarté : l'outil de création pose son propre pied, mesuré sur la PR #167.

## Conséquences

### Positives

- Les descriptions de pull request ne portent plus le pied.

### Négatives

- Un workflow de plus, qui écrit sur les pull requests.

### Risques

- Aucun relevé au moment de la décision.

### Actions de suivi

- Aucun relevé au moment de la décision.
