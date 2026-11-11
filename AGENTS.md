# Instructions pour les agents autres que Claude Code

Les instructions de travail de ce dépôt sont dans [`CLAUDE.md`](./CLAUDE.md) : elles valent
pour tout agent, pas seulement pour Claude Code. Les lire avant toute modification.

## Skills

Les skills livrés par le dépôt vivent dans `skills/` ; ce sont eux qu'il faut suivre.
Les choix que CE dépôt a enregistrés pour eux sont rangés à côté de leur installation
Claude Code, dans `.claude/skills/<nom>/`, et valent pour tous les agents.

En particulier, les sessions de revue de ce dépôt sont nommées par **Slugger** :
`.claude/skills/review-pull-request/session-id.md` le dit, et donne la commande. Ne pas passer
par `session-id-setup.md`, et ne jamais écrire soi-même un identifiant, GUID compris — il est
tiré par une commande, que le rapport de revue cite.
