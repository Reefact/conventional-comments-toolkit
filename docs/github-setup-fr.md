# Mettre en place le contrôle des Conventional Comments sur GitHub

Jumeau anglais : [`github-setup-en.md`](./github-setup-en.md).

Voici la mise en place complète de l'objectif **O3** — une pull request ne peut pas être
fusionnée tant qu'un fil de revue bloquant n'est pas résolu — sur github.com, GitHub
Enterprise Cloud (EMU compris) et GitHub Enterprise Server.

**Il n'y a rien à héberger.** Le vérificateur est une GitHub Action qui s'exécute dans le
dépôt qu'elle protège, authentifiée par le `GITHUB_TOKEN` que le runner lui remet, et qui
publie un check run nommé `conventional-comments`. Aucune GitHub App à installer, aucun
webhook à déclarer, aucun secret à stocker, aucune base, aucun serveur. La mise en place
tient en un fichier de configuration, deux ou trois fichiers de workflow et une règle de
branche.

L'extension de navigateur est un composant distinct, et optionnel. Elle aide à *rédiger* des
commentaires conformes ; elle est contournable par construction et ce n'est pas elle qui fait
respecter quoi que ce soit. Voir [`extension-setup-fr.md`](./extension-setup-fr.md).

---

## Dans cet ordre

L'ordre n'est pas une préférence de rédaction. Deux de ces étapes, faites à l'envers, vous
laissent soit avec toutes les PR bloquées, soit avec un contrôle silencieusement éteint :

1. **Committer `.conventional-comments.json`** sur la branche par défaut, avec un `mode`
   `warn` ou `enforce` **et** une date `activation.activatedAt`.
2. **Ajouter les deux workflows obligatoires** — `conventional-comments.yml` (évalue une PR
   dès qu'un événement la désigne) **et** `conventional-comments-sweep.yml` (réévalue
   périodiquement toutes les PR ouvertes). Le balayage n'est pas un supplément : la
   résolution d'un fil ne déclenche aucun événement, et sans lui un fil rouvert laisse un
   check vert périmé sans borne de durée.
   Puis ajouter `conventional-comments-forks.yml` si le dépôt accepte des PR de forks ou de
   Dependabot.
3. **Ouvrir une PR témoin** et vérifier que le check apparaît.
4. **Seulement alors, déclarer le check obligatoire.**

Pourquoi cela compte :

- En `off` et en `assist` — et `assist` est le **défaut du produit** — le vérificateur ne
  publie **aucun statut**. Un check déclaré obligatoire que rien ne publie bloque toutes les
  PR, définitivement.
- Si aucun niveau ne résout `activation.activatedAt`, le vérificateur publie un `neutral`
  quel que soit le mode. Or GitHub compte `neutral` parmi les conclusions qui
  **satisfont** une vérification obligatoire : la barrière serait verte et les règles ne
  s'appliqueraient plus, sans que rien ne le dise.
- Le sélecteur qui ajoute un check obligatoire propose les noms que GitHub a vus récemment
  sur le dépôt. Avoir publié une fois fait apparaître le nom au lieu d'avoir à le taper de
  mémoire — et cela confirme que le workflow s'exécute avant qu'on ne conditionne quoi que
  ce soit à lui.

---

## Étape 1 — configuration du dépôt

Créer `.conventional-comments.json` à la racine de la **branche par défaut**. Le minimum qui
rend le contrôle effectif :

```json
{
  "version": 1,
  "mode": "warn",
  "activation": { "activatedAt": "2026-11-01T00:00:00Z" },
  "resolverOverrideGroup": ["alice,bob,carol"],
  "exemptUsers": ["dependabot[bot]", "github-actions[bot]"],
  "toolCommands": ["/*", "@dependabot", "@copilot", "@renovate"]
}
```

Commencer en `warn`. Dans ce mode le vérificateur publie un statut qui **n'échoue jamais**,
dont le corps liste exactement ce qui échouerait sous `enforce`. C'est le rapport à blanc,
rendu là où l'équipe regarde déjà, et c'est ainsi qu'on calibre `activatedAt` avant de
durcir.

Toutes les clés, avec leurs défauts et leurs bornes, sont dans
[`../.conventional-comments.example.json`](../.conventional-comments.example.json) — qui est
un exemple, et **pas** les défauts du produit (ceux-ci vivent dans
`packages/core/src/config/defaults.ts`). La référence normative est le §8 de
[`../specifications-fr.md`](../specifications-fr.md).

Quatre clés méritent un mot ici, parce que s'y tromper est silencieux plutôt que bruyant :

| Clé | Ce qu'il faut savoir |
|---|---|
| `activation.activatedAt` | Une PR est dans le périmètre seulement si elle a été **créée après** cette date. Poser la date *est* l'acte d'activation. Les PR ouvertes avant reçoivent un statut vert portant « PR antérieure à l'activation » — y compris pour les commentaires écrits bien après. Une branche de release de longue durée reste donc hors périmètre jusqu'à sa fermeture. |
| `resolverOverrideGroup` | Sur GitHub, c'est une **liste de comptes** : des logins séparés par des virgules, `"alice,bob,carol"`. Un slug d'équipe (`org/tech-leads`) **ne fonctionne pas** — le résoudre demande la permission d'organisation *Members*, dont le `GITHUB_TOKEN` ne dispose pas. Laissée vide, les deux soupapes d'urgence sont inertes simultanément : ni réponse `decision`, ni exemption de PR, et un fil dont l'auteur est en congé bloque la PR sans recours. |
| `toolCommands` | Vide par défaut. Sans `"/*"` et les handles de robots, `/rebase` et `@dependabot merge` sont des commentaires ordinaires — et sous `enforce` on ne peut plus relancer un robot. La liste du fichier d'exemple est une **recommandation**, pas un défaut ; sur Enterprise Server, vérifier qu'aucun de ces handles n'est un compte humain interne avant de la recopier. |
| `overrideLabel` | `cc-override` par défaut. La poser exempte la PR entière. Le droit de la poser est vérifié **a posteriori** contre `resolverOverrideGroup` ; GitHub ne sait pas restreindre qui ajoute une étiquette. |

### Comment le fichier est découvert

L'Action lit `GET /repos/{owner}/{repo}/contents/.conventional-comments.json` sans `ref`,
c'est-à-dire sur la **branche par défaut**. Trois issues, et ce ne sont pas la même chose :

- **200** — le fichier est appliqué.
- **404** — le fichier est absent. C'est légal : la configuration d'organisation et les
  défauts du produit décident. Aucun échec.
- **autre chose** — le fichier est *illisible*. Ce n'est pas une absence : le vérificateur ne
  peut pas évaluer, et le check est publié **en échec** (§6.4). Il n'y publie jamais
  `neutral`, précisément parce que `neutral` laisserait passer le merge.

Il n'y a aucun cache. Le vérificateur relit la configuration à chaque exécution ; il ne garde
rien d'une exécution à l'autre et n'a nulle part où le mettre.

---

## Étape 2 — les deux workflows

Copier **les deux** dans le `.github/workflows/` du dépôt à protéger. Ils portent leur
raisonnement en commentaires ; ce qui suit est ce sur quoi il faut décider.

| Fichier | Ce qu'il fait |
|---|---|
| [`conventional-comments.yml`](./examples/conventional-comments.yml) | Évalue UNE PR dès qu'un événement la désigne — un push, une revue, un commentaire, une étiquette, la bascule brouillon. |
| [`conventional-comments-sweep.yml`](./examples/conventional-comments-sweep.yml) | Réévalue toutes les PR ouvertes, périodiquement. **Requis, pas optionnel** : la résolution d'un fil ne déclenche aucun événement, et c'est donc la seule chose qui rattrape un fil dé-résolu. |

**Pourquoi le balayage est un fichier à part, et doit le rester.** Au-dessus de 256 PR
ouvertes sa liste se découpe en tranches, et l'indice de tranche vient de
`GITHUB_RUN_NUMBER` — un compteur des exécutions du *workflow qui l'héberge*. Partager un
fichier avec les déclencheurs d'événements ferait avancer ce compteur à chaque commentaire,
chaque revue et chaque push, d'un pas souvent constant : avec 512 PR ouvertes (deux
tranches) et une exécution événementielle entre deux balayages, il avance de 2, `indice % 2`
ne change jamais, et la seconde tranche n'est jamais évaluée. Réunir les deux fichiers
rouvrirait en silence le trou que le découpage existe pour fermer.

```yaml
- uses: Reefact/conventional-comments-toolkit/packages/action@v1
```

`uses:` lit l'arbre du dépôt de l'Action au ref demandé : il n'y a donc **aucune étape
`actions/checkout`** — un checkout de votre propre dépôt n'apporterait pas l'Action, et le
vérificateur ne fait jamais de checkout de la PR qu'il juge. `v1` est le tag mobile que pose
la première release portant l'Action ; poser un SHA de commit à la place pour une
installation durcie.

### Les déclencheurs, et celui qui n'existe pas

| Déclencheur | Pourquoi |
|---|---|
| `pull_request_target` (`opened`, `synchronize`, `reopened`, `ready_for_review`, `converted_to_draft`, `labeled`, `unlabeled`) | Le seul déclencheur d'événement de PR dont le jeton peut publier sur une PR de **fork**. C'est un piège de sécurité dès qu'un workflow construit ou exécute le code proposé ; celui-ci ne fait ni l'un ni l'autre, et cela doit le rester. **Les deux sens de la bascule brouillon y figurent** : l'état brouillon change le verdict (un brouillon reçoit un statut informatif, jamais en échec), si bien qu'écouter le seul `ready_for_review` laisse rouge une PR en échec remise en brouillon. |
| `pull_request_review`, `pull_request_review_comment` | Une revue ou un commentaire de revue change le verdict. |
| `issue_comment` | La zone de conversation générale est validée aussi (§4.1). |
| `schedule` (toutes les 30 min) | **Dans le fichier de balayage**, pas celui-ci. Borne l'âge maximal d'un statut ; livré, pas proposé en option — voir ci-dessous. |
| `workflow_dispatch` | **Dans le fichier de balayage** aussi. Un rejeu manuel ne désigne aucune PR : il passe par la répartition, pas par le job à une seule PR. |

**`pull_request_review_thread` ne figure pas dans ce tableau, et c'est tout le problème.** Il
existe comme webhook — et c'est le seul événement qui signale la résolution ou la
dé-résolution d'un fil — mais il **n'est pas un déclencheur de workflow**. La conséquence est
asymétrique :

- résoudre le dernier fil bloquant ne fait pas passer le check au vert de lui-même. Gênant,
  jamais dangereux : la PR reste bloquée alors qu'elle pourrait passer.
- **dé-résoudre** un fil ne le fait pas repasser au rouge. C'est le sens dangereux, et il doit
  être décidé les yeux ouverts.

L'exécution planifiée borne cette fenêtre à son intervalle de cron. Pour la fermer
complètement, l'option native *Require conversation resolution before merging* le fait — au
prix d'exiger la résolution de **tous** les fils, bloquants ou non. L'assumer simplement n'est
pas une option sous `enforce` : c'est renoncer à l'objectif.

### Permissions du jeton

Déclarées dans le workflow, accordées nulle part ailleurs :

| Permission | À quoi elle sert |
|---|---|
| `checks: write` | Publier le check run. |
| `pull-requests: read` | Fils, commentaires, étiquettes, état brouillon. |
| `contents: read` | `.conventional-comments.json`. |
| `pull-requests: write` | **Requise dès que le dépôt emploie l'étiquette d'exemption.** La remise à zéro doit pouvoir la retirer. C'est le fonctionnement normal, pas un repli. |

### Concurrence

Le workflow déclare un groupe de concurrence **par PR**, avec `cancel-in-progress: true`.
Sans lui, GitHub exécute les rafales en parallèle et c'est la dernière publication qui
l'emporte, plutôt que la lecture la plus fraîche.

Un groupe de concurrence est **à l'échelle du dépôt, pas du workflow** : deux workflows
différents qui déclarent le même `group` se sérialisent l'un l'autre. C'est ce qui rend
l'unité de sérialisation égale à la PR quel que soit le déclencheur — et c'est aussi ce qui
la rend facile à casser, un nom de groupe qui diverge d'un caractère rouvrant la course sans
rien signaler.

Le chemin planifié a donc deux étages : un job qui **énumère** les PR ouvertes sans rien
publier, puis **un job d'évaluation par PR** déclarant son `concurrency` au niveau du job —
le seul endroit où le contexte `matrix` existe — avec exactement le groupe du job
événementiel. Le job d'énumération garde un groupe à lui et **ne s'annule pas en cours** : ce
que GitHub annule dans ce groupe est l'exécution *en attente*, au profit de la plus récente,
celle qui tourne allant au bout. L'inverse réévaluerait sans fin les premières PR de
l'énumération et jamais les dernières.

---

## Étape 3 — PR de forks et de Dependabot

**Si le dépôt accepte des PR de forks et que vous comptez déclarer le check obligatoire,
cette étape n'est pas optionnelle.** Copier aussi
[`examples/conventional-comments-forks.yml`](./examples/conventional-comments-forks.yml) dans
`.github/workflows/` — en notant qu'**un workflow `workflow_run` ne se déclenche que depuis la
branche par défaut**.

La raison est un contournement complet, pas une gêne. Sur une PR issue d'un fork, le
`GITHUB_TOKEN` est **en lecture seule — y compris sur `pull_request_review` et
`pull_request_review_comment`**. La restriction est connue pour `pull_request` ; elle vaut
aussi pour les événements de revue. Ces PR reçoivent bien un statut, publié par
`pull_request_target` à l'ouverture et à chaque push, mais il **cesse d'être rafraîchi dès
qu'un relecteur écrit**. La PR reçoit ensuite un `issue:` bloquant, l'événement de revue
s'exécute en lecture seule et ne peut pas remplacer le vert — qui satisfait alors la
vérification obligatoire.

**Les PR de Dependabot suivent les mêmes règles que celles d'un fork**, y compris sur un dépôt
qui n'accepte aucun fork.

Un réglage de dépôt lève bien la restriction de jeton — *Send write tokens to workflows from
pull requests* — mais il la lève pour **tous** les workflows, y compris ceux qui construisent
le code proposé. Ce n'est pas une case à cocher pour installer un vérificateur.

Un dépôt qui ne veut pas du workflow compagnon doit assumer l'autre branche de l'alternative,
et l'écrire : **ces PR ne sont pas soumises au contrôle.**

---

## Étape 4 — déclarer le check obligatoire

Publier un verdict est tout ce que fait le vérificateur. Ce qui bloque le merge est une règle
de protection de branche ou une *ruleset*, que vous configurez.

1. Ouvrir une PR témoin et laisser le check publier une fois, pour que le nom soit proposé par
   le sélecteur plutôt que tapé de mémoire.
2. **Settings → Rules → Rulesets** (ou *Branches → Branch protection rules*), ciblant la
   branche par défaut.
3. Activer **Require status checks to pass before merging** et ajouter
   **`conventional-comments`**. Si vous avez changé l'entrée `check-name` de l'Action, ajouter
   ce nom-là — le changer après coup laisse la protection de branche attendre un nom que plus
   rien ne publie.
4. Activer **Do not allow bypassing the above settings**. Sans cela, les administrateurs et
   les acteurs de bypass déclarés fusionnent malgré tout, et O3 n'est pas satisfait pour eux.
5. Éventuellement activer **Require conversation resolution before merging**, qui ferme la
   fenêtre de dé-résolution décrite à l'étape 2, au prix d'exiger la résolution de tous les
   fils.

Une fois `warn` tenu assez longtemps pour connaître l'ampleur du chantier, passer `mode` à
`enforce` dans `.conventional-comments.json`.

### Retour arrière

`warn` est le mode de repli, **pas** `off`. En `warn`, le vérificateur continue de publier un
statut qui n'échoue jamais, ce qui débloque immédiatement les PR **sans exiger le retrait de
la protection de branche**. `assist` et `off` ne publient rien : y revenir depuis `enforce`
exige de retirer **d'abord** la protection, sans quoi l'absence de statut bloque toutes les
PR.

---

## Comment le check est créé et mis à jour

Chaque exécution publie un check run nommé `conventional-comments` par
`POST /repos/{owner}/{repo}/check-runs`, avec `status: completed` et une conclusion :

| Verdict | Conclusion | Quand |
|---|---|---|
| conforme | `success` | ou : PR en brouillon, PR exemptée, PR hors périmètre d'activation |
| non conforme | `failure` | sous `enforce` seulement, et sur toute lecture de configuration impossible (§6.4) |
| non évalué | `neutral` | activation non datée, configuration invalide — quel que soit le mode |

`neutral` **satisfait** une vérification obligatoire sur GitHub. C'est pourquoi une lecture
impossible publie `failure` et jamais `neutral`.

Le SHA de tête est relu **juste avant** la publication, pour que le statut se pose sur ce que
la PR est au moment où on la juge, et non au moment où l'exécution a démarré. Il n'y a aucune
déduplication : une exécution publie, à chaque fois. Republier un statut identique coûte un
appel d'API — moins que la mémoire qu'il faudrait tenir pour l'éviter.

Le **titre** du check run porte une ligne lisible par machine (§6.3.1), que l'extension de
navigateur relit depuis la page sans aucun appel d'API :

```
cc/1 state=failure draft=0 exempt=0 mode=enforce activated=2026-09-01T00:00:00Z core=1.4.0 cfg=9f3a1c7e t=3 c=7 w=12
```

Le **corps** porte la sortie humaine : un résumé d'une ligne à trois compteurs, chaque fil
bloquant non résolu avec son lien permanent, chaque diagnostic de format avec son code et sa
correction proposée, et les faits signalés — clé de dépôt ignorée, résolution refusée,
étiquette d'exemption retirée.

**Le bouton de rejeu d'un check run créé par une Action ne rejoue rien.** La garde
anti-récursion de la plateforme fait que `check_run` `rerequested` ne déclenche aucun workflow
quand la *check suite* a été créée par GitHub Actions. Rejouer le **workflow** à la place,
depuis l'onglet des exécutions, ou employer `workflow_dispatch`.

Le vérificateur ne poste jamais de commentaire sur la PR. Tout passe par la sortie du check.

---

## D'où vient la configuration

Trois niveaux, par priorité décroissante, chacun borné par celui du dessus :

1. `.conventional-comments.json` sur la branche par défaut du dépôt.
2. **Configuration d'organisation**, servie par une URL.
3. Valeurs par défaut du produit.

Au-dessus des trois se tient le **plancher** — un document servi par une URL que
l'organisation contrôle, passée à l'Action par l'entrée `floor-url` :

```yaml
- uses: Reefact/conventional-comments-toolkit/packages/action@v1
  with:
    floor-url: https://interne.example/cc/plancher.json
```

Un plancher fixe un mode minimum et un ensemble de règles qu'aucun niveau inférieur ne peut
assouplir ; un dépôt peut toujours durcir davantage. Il porte aussi `configUrl`, qui est **le
seul emplacement possible** de l'URL de configuration d'organisation — un `configUrl` écrit
dans le fichier de dépôt est ignoré et le fait signalé, sans quoi un dépôt désignerait
lui-même la configuration censée le contraindre.

Sans `floor-url`, le plancher vaut `{"minimumMode": "off"}` et n'impose rien : c'est le
déploiement public standard. Une `floor-url` posée mais injoignable fait échouer le check,
comme toute lecture impossible.

**Ce que le plancher protège, et ce qu'il ne protège pas.** Il met hors d'atteinte du dépôt la
configuration que le vérificateur applique. Il ne protège pas le vérificateur lui-même : le
workflow est du code versionné dans le dépôt protégé, et quiconque peut y pousser peut le
remplacer par un workflow qui publie un succès inconditionnel sous le même nom de check. La
garantie tient ici contre l'oubli, la distraction et le contournement ordinaire ; elle ne
tient pas contre quelqu'un qui a le droit de pousser et décide de désarmer le contrôle.
C'était déjà vrai du service compagnon, qui lisait la même configuration versionnée ; ce qui
change, c'est que le code du vérificateur rejoint cette configuration du côté modifiable.

Une organisation qui veut fermer cela dispose de *Require workflows to pass before merging*,
dans une *ruleset* d'organisation ou d'entreprise, où le fichier de workflow vit dans un dépôt
qu'elle contrôle. Elle **ne remplace pas** celui décrit ici — elle n'admet que
`pull_request`, `pull_request_target` et `merge_group`, pas les événements de revue dont ce
vérificateur dépend pour se rafraîchir — et elle relève des offres Team et Enterprise.
Combiner les deux est ce qu'on peut faire de mieux aujourd'hui : la *ruleset* d'organisation
sur `pull_request_target` pour l'ancrage, le workflow du dépôt pour les événements de revue,
en sachant que le second reste éditable.

---

## Offres et hébergement

| | github.com | Enterprise Cloud / EMU | Enterprise Server |
|---|---|---|---|
| L'Action | `uses: Reefact/conventional-comments-toolkit/packages/action@v1` | idem | l'Action doit être atteignable depuis l'instance : activer GitHub Connect pour Actions, ou miroiter ce dépôt en interne et pointer `uses:` sur le miroir |
| Base de l'API | automatique | automatique | automatique — l'Action lit `GITHUB_API_URL`, que le runner pose par instance |
| Runners Actions | hébergés | hébergés | **des runners auto-hébergés doivent exister et être activés** ; pas de runner, pas de vérificateur |
| Rulesets de dépôt | oui | oui | oui |
| Rulesets d'organisation / d'entreprise, *Require workflows to pass* | Team et Enterprise seulement | oui | oui |
| Résidence de données (`*.ghe.com`) | — | hôte et points d'accès d'API dédiés ; rien à configurer pour l'Action, qui les lit depuis le runner | — |

Sur Enterprise Server, vérifier aussi que les entrées `toolCommands` recommandées ont un sens
pour l'instance : `@codex` ou `@bors` peut y désigner un compte humain interne plutôt que le
service cloud, auquel cas recopier la liste recommandée exempterait silencieusement ses
commentaires.

---

## Limites, écrites plutôt que découvertes

- **Les merge queues sont hors périmètre.** Une file de merge crée un SHA de *merge group* et
  attend les checks requis sur *ce* SHA. Le vérificateur ne s'y déclenche pas, et le check
  n'arrivera donc jamais. **Un dépôt qui emploie une merge queue ne doit pas déclarer ce check
  obligatoire** tant que ce cas n'est pas conçu.
- **Au-dessus de 256 PR ouvertes, le balayage ralentit au lieu de tout couvrir d'un coup.**
  Une matrice produit au plus 256 jobs par exécution de workflow : le mode `dispatch` borne
  donc sa liste et fait tourner la tranche d'une exécution à la suivante. Chaque PR ouverte
  est alors réévaluée au plus tous les `intervalle de cron × ceil(total / 256)` — avec le
  cron livré, 30 min × ce quotient. La sortie `total` du job d'énumération dit combien de PR
  ouvertes existent, et son journal le signale dès qu'il tronque. La borne est **approchée**
  dès que la liste bouge entre deux exécutions : ouvrir ou fermer une PR décale les
  frontières de tranche, ce qui peut faire sauter un tour à une PR, jamais la sortir du
  cycle. Un dépôt de cette taille qui veut une borne plus serrée resserre le cron, ou
  restreint le balayage par étiquette ou par branche de base.
- **Dé-résoudre un fil ne fait pas repasser le check au rouge** avant la prochaine exécution
  planifiée ou le prochain événement qualifiant. Voir l'étape 2.
- **Quiconque peut pousser sur le dépôt peut remplacer le workflow.** Voir la section sur le
  plancher.
- **Le bouton de rejeu du check run ne fait rien.** Rejouer le workflow.
- **Les PR de longue durée ouvertes avant `activatedAt` restent hors périmètre** jusqu'à leur
  fermeture, y compris pour les commentaires écrits bien après l'activation.
- **Le relecteur qui a écrit un commentaire non conforme n'est pas notifié.** Il est nommé
  dans la sortie du check avec un lien permanent ; à l'auteur de la PR de le solliciter.

---

## Exemple minimal de bout en bout

Un dépôt `acme/widgets`, aucune politique d'organisation, en partant de rien.

**1. Configuration** — committer sur la branche par défaut :

```json
{
  "version": 1,
  "mode": "warn",
  "activation": { "activatedAt": "2026-11-01T00:00:00Z" },
  "resolverOverrideGroup": ["alice,bob"],
  "exemptUsers": ["dependabot[bot]", "github-actions[bot]"],
  "toolCommands": ["/*", "@dependabot", "@renovate"]
}
```

**2. Workflows** — copier `docs/examples/conventional-comments.yml` et
`docs/examples/conventional-comments-sweep.yml` dans `.github/workflows/`, sous les mêmes
noms. `acme/widgets` accepte les PR de Dependabot : copier aussi
`docs/examples/conventional-comments-forks.yml`. Committer les trois sur la branche par
défaut.

**3. Vérifier que ça tourne** — ouvrir une PR, écrire un commentaire de revue
`issue: cette boucle alloue à chaud`, et constater qu'un check `conventional-comments`
apparaît, conclusion verte, corps listant un fil bloquant non résolu. (`warn` n'échoue
jamais.)

**4. Mesurer** — laisser en `warn` deux à quatre semaines. Les corps de check disent quelle
part de l'habitude de revue existante est non conforme, et si `activatedAt` est posée
sensément.

**5. Durcir** — remplacer `"mode": "warn"` par `"mode": "enforce"` et committer. Vérifier sur
une PR témoin qu'un `issue:` non résolu produit maintenant un check rouge.

**6. Le rendre obligatoire** — Settings → Rules → Rulesets → branche par défaut → *Require
status checks to pass* → ajouter `conventional-comments` → *Do not allow bypassing the above
settings*.

C'est fini. Au total : trois fichiers de workflow, une configuration, une règle, rien d'hébergé.

---

## Dépannage

| Symptôme | Cause | Correctif |
|---|---|---|
| Aucun check sur aucune PR | `mode` vaut `assist` (le défaut) ou `off` | Passer `mode` à `warn` ou `enforce` |
| Toutes les PR bloquées, aucun check en cours | Le check a été déclaré obligatoire alors que le mode ne publie rien | Passer `mode` à `warn`, ou retirer l'exigence |
| Le check est toujours `neutral` | Aucun `activation.activatedAt` à aucun niveau | L'ajouter dans `.conventional-comments.json` |
| Check vert alors que la PR a des fils bloquants non résolus | PR créée avant `activatedAt`, ou brouillon, ou exemptée — le corps dit laquelle | Attendu ; lire le corps |
| `conventional-comments` n'est pas proposé par le sélecteur de checks obligatoires | GitHub ne l'a pas encore vu sur ce dépôt | Ouvrir une PR témoin et le laisser publier une fois |
| Le check est passé au vert et y reste après qu'un relecteur a écrit sur une PR de fork | Le workflow compagnon manque, ou n'est pas sur la branche par défaut | Étape 3 |
| Le check échoue sur « configuration illisible » | Une `floor-url` ou une `configUrl` est injoignable, ou l'API Contents a rendu autre chose que 200/404 | Vérifier l'URL ; un fichier de dépôt *absent* n'est pas cette erreur |
| Personne ne peut résoudre un fil dont l'auteur est absent | `resolverOverrideGroup` est vide | La renseigner — c'est un prérequis à `enforce` |
| Un slug d'équipe dans `resolverOverrideGroup` n'habilite personne | Les slugs d'équipe ne fonctionnent pas sur GitHub | Employer des logins séparés par des virgules |
| Rejouer le check depuis la page de la PR ne fait rien | Garde anti-récursion de la plateforme | Rejouer le workflow depuis l'onglet des exécutions |
| La merge queue ne se vide jamais | Le check est obligatoire et n'arrive jamais sur le SHA du merge group | Ne pas déclarer ce check obligatoire avec une merge queue |
| Une PR semble réévaluée plus rarement que le cron ne le dit | Plus de 256 PR ouvertes : la tranche tourne, le cycle dure `cron × ceil(total / 256)` | Attendu. Resserrer le cron, ou restreindre le balayage (étiquette, branche de base) |
