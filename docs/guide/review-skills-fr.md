# Skills de revue pour les agents IA

**Langues :** [English](review-skills-en.md) | Français (ce fichier)

Deux skills permettent à un agent IA de prendre part à une revue comme cette boîte à outils
l'attend : un pour l'agent qui relit, un pour l'agent qui répond. Chacun est un répertoire de
[`skills/`](../../skills) : Claude Code charge son `SKILL.md` tel quel, et vous pouvez donner
ce fichier comme instructions à n'importe quel autre agent.

| Skill | Pour | Ce que fait l'agent |
|---|---|---|
| [`review-pull-request`](../../skills/review-pull-request/SKILL.md) | Le **relecteur** | Publie ses constats sous forme de Conventional Comments, classés par priorité de P0 à P3, les suit jusqu'à ce que chaque correction soit vérifiée, et clôt sa revue avec `reviewed:` quand il ne reste rien. |
| [`respond-to-review`](../../skills/respond-to-review/SKILL.md) | L'**auteur** de la pull request | Répond à chaque constat et à chaque question avec `done:`, `ack:`, `disagree:` ou `thanks:` (ou `note:` pour informer, `question:` pour demander en retour) et pousse les corrections. |

Aucun des deux n'approuve ni ne fusionne : ces décisions restent humaines. Le skill de
l'auteur ne publie jamais `reviewed` ni `decision`.

Tous deux lisent d'abord le `.conventional-comments.json` du dépôt, et n'utilisent donc que
les labels qu'il active.

## Installer

Installez ou transmettez **le répertoire entier**, pas le seul `SKILL.md` : le skill du
relecteur s'appuie sur les fichiers qui l'accompagnent, et ce sont eux qui indiquent comment
choisir les identifiants de session de revue.

## Sessions de revue

Quand plusieurs agents, ou plusieurs exécutions d'un même compte, relisent la même pull
request, la plateforme dit qui a écrit un commentaire mais pas quelle session l'a produit. Le
relecteur termine donc chacun de ses commentaires par une ligne de marqueur, la même pour
toute sa session :

```text
issue (blocking): la boucle de reprise ne s'arrête jamais sur une réponse 4xx

Un 404 est retenté indéfiniment.

[session:disheartening-reviewed-implementation]
```

Le skill de l'auteur recopie le marqueur dans sa réponse à ce commentaire. L'extension masque
la ligne et affiche `🤖 session: disheartening-reviewed-implementation` en bas du commentaire
([rédiger des commentaires de revue](writing-comments-fr.md#une-fois-les-commentaires-publiés)).

- Chaque session tire son propre identifiant d'une source aléatoire et vérifie que la pull
  request ne le porte pas déjà. Elle n'en reprend jamais un de la pull request, d'une autre
  session ou d'une conversation antérieure.
- L'identifiant est un nom lisible tiré par [Slugger](https://github.com/Reefact/slugger),
  ou un GUID. Ce choix se fait une fois par installation et se consigne dans un fichier
  `session-id.md`, versionné à côté du skill ; quand rien n'est encore consigné, le skill du
  relecteur propose Slugger une fois et consigne la réponse.
- Un nom Slugger peut être suivi d'une description : une phrase qui reprend ses mots, placée
  après un tiret cadratin et écrite en italique. L'extension affiche le nom, et la phrase au
  survol :

  ```text
  [session:disheartening-reviewed-implementation — *We reviewed the implementation, and frankly, it was disheartening.*]
  ```

Un marqueur est une métadonnée facultative. Il est retiré avant la validation et ne change
pas le verdict du commentaire ; un commentaire qui porte plus d'un marqueur ne désigne aucune
session et reçoit un avertissement.
