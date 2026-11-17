# Instructions pour les agents autres que Claude Code

Les instructions de travail de ce dépôt sont dans [`CLAUDE.md`](./CLAUDE.md) : elles valent
pour tout agent, pas seulement pour Claude Code. Les lire avant toute modification.

## Skills

Les skills livrés par le dépôt vivent dans `skills/` ; ce sont eux qu'il faut suivre.

Les sessions de revue de ce dépôt sont nommées par **Slugger**, et le skill dit lui-même comment
le lancer (sa section « Session marker ») : le binaire natif sur Linux x64, sinon l'outil .NET
installé dans un répertoire temporaire, sinon le tirage Python. Le dépôt n'enregistre aucun
choix à côté du skill et ne déclare plus l'outil (DEC0015). Ne jamais
écrire soi-même un identifiant, GUID compris — il est tiré par une commande, que le rapport de
revue cite.

## Décisions

Les décisions importantes du dépôt sont consignées en IDR dans [`docs/idr/`](docs/idr/README-fr.md)
(DEC0001). Avant de finaliser une pull request, la vérifier contre ce registre en suivant
[`.claude/skills/idr/SKILL.md`](.claude/skills/idr/SKILL.md) : un agent propose un IDR, il ne
l'accepte jamais lui-même, et la plupart des pull requests n'en portent aucun.
