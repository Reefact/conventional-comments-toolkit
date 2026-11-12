# Plateformes

**Langues :** [English](platforms-en.md) | Français (ce fichier)

Ce que fait l'extension sur chaque plateforme, et ce qu'elle ne fait pas encore. Une seule
extension gère les trois plateformes, et chacune n'est prise en charge que sur les domaines
que vous avez autorisés.

## En un coup d'œil

| | GitHub | Azure DevOps | GitLab |
|---|:---:|:---:|:---:|
| Barre d'outils, saisie au clavier, pastille de validation | Oui | Oui | Oui, dans l'éditeur Markdown seulement |
| Badges sur les commentaires publiés | Oui | Oui | Oui |
| Bandeau des fils bloquants non résolus | Oui | Oui | Oui |
| Filtre des fils | Oui | Oui | Oui, sauf dans l'onglet *Changes* |
| Lit le `.conventional-comments.json` du dépôt | Oui | Oui | **Pas encore** |
| Blocage de l'envoi (`enforce`) | Oui | Oui | **Pas encore** |
| Un commentaire général peut ouvrir un fil bloquant | Non | Oui | Oui, s'il est publié avec *Start thread* |
| Corps d'une revue soumise en bloc | Oui | N'existe pas | Oui |
| Bloc de suggestion lu comme une `suggestion` | Oui | Oui | Pas encore |

## Domaines

| Offre | Domaine | Dans la page de réglages |
|---|---|---|
| GitHub.com | `github.com` | *Domaines connus*, un clic |
| GitHub Enterprise Cloud avec résidence des données | votre propre sous-domaine de `ghe.com` | *Autres domaines* : saisissez-le, choisissez GitHub |
| GitHub Enterprise Server | votre propre domaine | *Autres domaines* : saisissez-le, choisissez GitHub |
| Azure DevOps Services | `dev.azure.com` | *Domaines connus*, un clic |
| Azure DevOps Services, ancienne URL | `<organisation>.visualstudio.com` | *Autres domaines* : saisissez-le, choisissez Azure DevOps |
| Azure DevOps Server | votre propre domaine | *Autres domaines* : saisissez-le, choisissez Azure DevOps |
| GitLab.com | `gitlab.com` | *Domaines connus*, un clic |
| GitLab Self-Managed, GitLab Dedicated | votre propre domaine | *Autres domaines* : saisissez-le, choisissez GitLab. **Non vérifié.** |

L'installation n'autorise aucun domaine, pas même `github.com`. Pour `ghe.com` et
`visualstudio.com`, vous saisissez votre propre sous-domaine plutôt que d'autoriser tout le
domaine : l'extension n'obtient accès qu'à l'hôte que vous utilisez.

## GitHub

- L'extension prend en charge les deux versions de la page d'une pull request, *Conversation*
  (classique) et *Overview* (nouvelle), ainsi que l'onglet *Files changed*.
- La conversation générale d'une pull request n'a pas de bouton « résoudre » : un label
  bloquant écrit là ne peut donc pas ouvrir un fil bloquant. La pastille le dit avec
  `W-NOT-BLOCKABLE`.
- Quand vous soumettez une revue, son corps est validé (`scope.validateReviewSummary`) ;
  approuver sans texte reste possible.
- Un fil est résolu quand la conversation est marquée *Resolved*.
- L'extension lit le fichier du dépôt avec votre session GitHub : les dépôts privés
  fonctionnent pour toute personne connectée qui y a accès.

## Azure DevOps

- Tous les boutons d'envoi passent par la validation : *Comment*, *Reply*, *Reply & resolve*,
  *Update*, *Update & resolve*, *Reply & reactivate*.
- Un commentaire général est un fil doté d'un statut, comme un commentaire sur une ligne : un
  label bloquant y compte parmi les fils bloquants.
- Un fil compte comme non résolu tant que son statut est *Active* ou *Pending*, ou quand il
  n'en a aucun. Tout autre statut compte comme résolu.
- Il n'y a pas de corps de revue : `scope.validateReviewSummary` est ignorée.
- Les commentaires de pipeline sont publiés par `Project Collection Build Service (<Org>)` ou
  `<Project> Build Service (<Org>)` : ce sont les noms à mettre dans `exemptUsers`.

## GitLab

Vérifié sur gitlab.com seulement.

- **L'extension ne lit pas encore le fichier du dépôt sur GitLab.** Elle applique les valeurs
  par défaut du produit, affiche *Configuration non lue*, et **ne bloque donc jamais un
  envoi** sur cette plateforme, quel que soit le mode.
- **Seul l'éditeur Markdown est géré.** GitLab laisse chaque personne basculer vers un éditeur
  de texte enrichi et mémorise ce choix. Dans cet éditeur, l'extension n'intervient pas du
  tout : ni barre d'outils, ni validation. Pour revenir à l'éditeur Markdown, cliquez sur
  *Switch to plain text editing*, sous le champ.
- Un commentaire général publié avec *Start thread* est un fil résoluble et peut être
  bloquant. Publié avec *Comment*, c'est une simple note : un label bloquant n'y est pas
  compté, et aucun avertissement ne le dit.
- Dans l'onglet *Changes*, le filtre des fils n'est pas affiché, et la page ne contient pas
  les fils résolus : l'extension ne peut donc pas les lire.
- GitLab Self-Managed et GitLab Dedicated n'ont pas été vérifiés.

## Navigateurs

| Navigateur | Version |
|---|---|
| Chrome, Edge, autres navigateurs Chromium | Les trois dernières versions majeures |
| Firefox | 128 ou ultérieure |
