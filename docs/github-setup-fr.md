# Mettre en place le blocage Conventional Comments sur GitHub

Ce guide mène un dépôt de rien du tout à : *une pull request ne peut pas être fusionnée
tant qu'un fil de revue bloquant n'est pas résolu*.

**Il n'y a aucun serveur à déployer.** La vérification est une GitHub Action, exécutée dans
le dépôt qu'elle protège, authentifiée par le jeton que le runner lui remet déjà. Rien à
héberger, rien à exposer sur internet, aucun secret à stocker, aucune base de données.

Si vous vous attendiez à déployer un service compagnon : ce chemin existe toujours, mais
pour Azure DevOps seulement, faute d'équivalent gratuit au couple « déclencheur de revue +
jeton d'écriture ». Sur GitHub, il est inutile et n'est plus proposé.

---

## 1. La version en cinq minutes

1. Copiez [`examples/conventional-comments.yml`](./examples/conventional-comments.yml) dans
   `.github/workflows/conventional-comments.yml` et fusionnez-le **sur votre branche par défaut**.
2. Ajoutez `.conventional-comments.json` à la racine du dépôt :

   ```json
   {
     "$schema": "https://conventional-comments-toolkit.dev/schema/v1.json",
     "version": 1,
     "mode": "warn",
     "activation": { "activatedAt": "2026-09-07T00:00:00Z" }
   }
   ```

   Un exemple plus complet vit dans
   [`.conventional-comments.example.json`](../.conventional-comments.example.json).

3. Ouvrez une pull request, écrivez un commentaire de revue, et regardez apparaître le check
   **conventional-comments**.
4. Quand l'équipe est prête, passez `"mode"` à `"enforce"` et déclarez le check
   **obligatoire** (§6).

Tout ce qui suit est le détail de ces quatre étapes, et la poignée de comportements de
GitHub qui vous surprendraient autrement.

---

## 2. Ce que vous installez

| Pièce | Où elle vit | Ce qu'elle fait |
|---|---|---|
| Le workflow | `.github/workflows/conventional-comments.yml`, chez vous | dit **quand** évaluer |
| L'action | `Reefact/conventional-comments-toolkit@v1`, récupérée par le runner | lit la PR, l'évalue, publie le check |
| La configuration | `.conventional-comments.json`, à la racine du dépôt | dit **quelles** sont les règles |
| Le check obligatoire | une *ruleset* ou une protection de branche | c'est ce qui bloque réellement le merge |

C'est la dernière ligne qu'on oublie. **L'action publie un verdict ; elle ne bloque rien.**
Le blocage est le métier de GitHub, et il n'a lieu qu'une fois que vous lui avez dit que le
check `conventional-comments` est obligatoire.

---

## 3. Permissions du jeton

Le workflow les déclare ; vous ne créez aucune GitHub App et ne fabriquez aucun jeton
personnel.

```yaml
permissions:
  checks: write        # publier le check run
  pull-requests: read  # fils de revue, commentaires, étiquettes, état brouillon
  contents: read       # lire .conventional-comments.json
```

Ajoutez `pull-requests: write` **uniquement** si votre dépôt emploie l'étiquette
d'exemption de PR (`cc-override` par défaut). Sans elle, l'action évalue et publie
normalement ; elle se contente d'un avertissement dans le journal si elle a un jour besoin
de retirer une étiquette. Si vous l'ajoutez, elle *remplace* la ligne `pull-requests: read`.

Si votre organisation impose des permissions de workflow en lecture seule par défaut, le
bloc `permissions:` du workflow prime pour ce workflow — aucun réglage d'organisation à
changer.

---

## 4. Ce qui le réveille

| Déclencheur | Ce qu'il couvre |
|---|---|
| `pull_request_target` | ouverture, réouverture, push, bascule brouillon, étiquette, édition |
| `pull_request_review` | une revue est soumise, éditée ou rejetée |
| `pull_request_review_comment` | un commentaire de diff est créé, édité ou supprimé |
| `issue_comment` | un commentaire de conversation est créé, édité ou supprimé |
| `workflow_dispatch` | vous le relancez à la main, sur une PR ou sur toutes |
| `schedule` *(optionnel)* | réconciliation périodique — voir §7 |

Deux remarques à lire avant de modifier cette liste.

**`pull_request_target`, et non `pull_request`.** Sur une PR issue d'un fork,
`pull_request` donne au workflow un jeton en lecture seule, incapable de publier un check.
`pull_request_target` s'exécute dans le contexte du dépôt de base et le peut. Ce
déclencheur est un piège de sécurité bien connu **dès qu'un workflow construit ou exécute
le code proposé**, puisqu'il lui remet un jeton en écriture et vos secrets. Celui-ci ne
fait jamais de `checkout` de la PR et n'exécute rien qui en provienne : il lit des données
d'API et écrit un check run. Gardez-le ainsi — n'ajoutez pas `actions/checkout` à ce
workflow.

**Le fichier de workflow doit être sur votre branche par défaut.** Tous les déclencheurs
ci-dessus lisent le workflow depuis la branche par défaut, jamais depuis la PR. La PR qui
*ajoute* le workflow n'est donc pas vérifiée par lui. La suivante l'est.

---

## 5. Comment le check est créé et mis à jour

Chaque exécution relit l'état **courant** de la PR — fils de revue et leur état de
résolution via GraphQL, commentaires, étiquettes, brouillon, SHA de tête, et votre fichier
de configuration —, l'évalue par `@cct/core`, et publie un check run nommé
`conventional-comments` sur le commit de tête.

Le check run porte trois choses :

- **sa conclusion** — `success`, `failure` ou `neutral`. `neutral` **satisfait** une
  vérification obligatoire : c'est ce qui empêche un état « je n'ai pas pu évaluer » de
  bloquer indéfiniment ;
- **un titre d'une ligne**, la ligne machine `cc/1`, que l'extension navigateur lit
  directement sur la page de la PR ;
- **un corps Markdown** listant chaque fil bloquant non résolu et chaque diagnostic de
  format, chacun sous forme de lien.

Il porte enfin, dans un commentaire HTML invisible, le peu d'état qui ne se recalcule pas
depuis GitHub : quels fils ont déjà été vus bloquants, le verdict à la première observation
de chaque racine bloquante, et la configuration épinglée à cette PR. L'exécution suivante
le relit depuis le check run qu'elle a elle-même publié. **Cet outil ne stocke rien qui lui
appartienne, nulle part.**

Pourquoi cet état doit exister : sans lui, un `issue:` de relecteur se neutraliserait en
l'éditant en `note:`, et le fil cesserait de bloquer sans que personne ne l'ait résolu. La
règle qui ferme ce chemin doit se souvenir de ce que le commentaire disait avant, et aucune
API GitHub ne rend le corps précédent d'un commentaire.

---

## 6. Rendre le check obligatoire

C'est l'étape qui transforme un verdict en blocage de merge.

**Avec une *ruleset*** (recommandé — une ruleset se définit une fois au niveau de
l'organisation et s'applique à de nombreux dépôts) :

1. *Settings → Rules → Rulesets → New branch ruleset*.
2. Ciblez les branches protégées (`main`, ou un motif `release/*`).
3. Activez **Require status checks to pass**.
4. Ajoutez `conventional-comments`. S'il n'apparaît pas dans la liste, lancez d'abord le
   workflow une fois sur n'importe quelle PR : GitHub ne propose que les checks qu'il a
   déjà vus.
5. Envisagez **Do not allow bypassing the above settings**, sans quoi les administrateurs
   du dépôt ne sont pas couverts.

**Avec une protection de branche classique** : *Settings → Branches → Add rule → Require
status checks to pass before merging*, puis le même nom de check.

Optionnellement, activez aussi **Require conversation resolution before merging**. C'est
natif, gratuit, et cela exige la résolution de **tous** les fils plutôt que des seuls
bloquants — une règle plus grossière que celle de cet outil, mais qui ferme complètement la
fenêtre décrite au §7.

---

## 7. La limite de GitHub sur laquelle vous devez trancher

**Résoudre un fil de revue ne déclenche aucun workflow.** L'événement
`pull_request_review_thread` (`resolved` / `unresolved`) existe comme webhook, mais ne
figure pas parmi les événements déclencheurs de workflows — et c'est le seul qui notifie
une résolution.

La conséquence est asymétrique, et c'est ce qui la rend vivable :

- **résoudre** le dernier fil bloquant ne fait pas passer le check au vert tout seul. Il
  reste **rouge** jusqu'au prochain déclencheur — un commentaire, un push, un rejeu manuel.
  Gênant ; jamais dangereux : la PR reste bloquée alors qu'elle pourrait passer ;
- **dé-résoudre** un fil bloquant ne le fait pas repasser au rouge. Il reste **vert**
  jusqu'au prochain déclencheur. La fenêtre est réelle, et c'est le seul endroit où ce
  dispositif est moins strict qu'un service abonné aux webhooks.

Choisissez l'une des trois réponses, **délibérément** :

1. **Ne rien faire.** Raisonnable si votre modèle de menace ne retient pas « un relecteur
   dé-résout un fil sans rien écrire, et quelqu'un fusionne avant le déclencheur suivant ».
2. **Activer la réconciliation planifiée** — décommentez le bloc `schedule:` du workflow.
   Elle borne la fenêtre à l'intervalle choisi. Attention : GitHub désactive les workflows
   planifiés d'un dépôt **public** resté 60 jours sans activité.
3. **Activer « Require conversation resolution before merging »** (§6). Ferme complètement
   la fenêtre, au prix d'exiger la résolution de tous les fils, pas seulement des bloquants.

Deux limites plus petites, ici pour qu'elles ne vous surprennent pas plus tard :

- **Le bouton de rejeu du check run ne rejoue rien.** GitHub ne délivre pas
  `check_run: rerequested` pour les *check suites* créées par GitHub Actions — c'est sa
  garde anti-récursion. Rejouez le **workflow** : onglet Actions, ou la ligne du job dans
  la PR ; ou *Run workflow* avec un numéro de PR.
- **Les PR de forks reçoivent un statut, mais pas de rafraîchissement sur les commentaires
  de revue.** Voir §8.

---

## 8. Dépôts qui acceptent des PR de forks

Sur une PR issue d'un fork, GitHub donne au `GITHUB_TOKEN` des permissions en lecture
seule. C'est connu pour `pull_request` ; c'est **aussi documenté** pour
`pull_request_review` et `pull_request_review_comment`, et c'est la partie qui surprend.

Sur ces PR, donc :

- un statut **est** publié — `pull_request_target` couvre l'ouverture, chaque push, les
  changements d'étiquette et de brouillon, et ces exécutions ont bien un jeton en écriture ;
- ce qui manque est le **rafraîchissement sur l'activité de revue** : un `issue:` bloquant
  posté par un relecteur après le dernier push ne fera pas rougir le check.

Si votre dépôt accepte des PR de forks et que vous voulez que le blocage s'y applique,
ajoutez [`examples/conventional-comments-forks.yml`](./examples/conventional-comments-forks.yml)
à côté du workflow principal. Il passe par `workflow_run`, qui s'exécute dans le contexte
du dépôt de base avec un jeton en écriture, et réconcilie les PR ouvertes.

Si toutes vos PR viennent de branches du dépôt lui-même — le cas courant en entreprise —,
ce fichier ne vous sert à rien.

---

## 9. D'où vient la configuration

Trois niveaux, fusionnés dans cet ordre, chacun pouvant **restreindre** ce que le précédent
autorise :

1. **Les défauts produit** — ce que vous avez sans aucun fichier.
2. **Le document d'organisation** — un JSON optionnel, à une URL que votre organisation
   contrôle, désignée par `configUrl` dans le document de plancher (ci-dessous).
3. **Le fichier de dépôt** — `.conventional-comments.json` à la racine de la branche par
   défaut, lu par l'API `contents` avec le jeton du workflow. Un dépôt privé n'exige aucune
   permission supplémentaire : `contents: read` suffit.

Un fichier de dépôt absent est une situation **nominale**, pas une erreur : les défauts
s'appliquent, et le mode par défaut (`assist`) ne publie aucun statut.

**Le plancher** (`floor-url`) porte la garantie d'entreprise : un document qui fixe un
minimum sous lequel les dépôts ne peuvent pas descendre. Il doit être servi depuis un
endroit que le dépôt ne peut pas modifier. **Un fichier de workflow versionné dans le dépôt
qu'il protège n'est pas un canal de plancher** — un dépôt qui peut éditer son workflow peut
éditer le plancher que ce workflow désigne, ce qui en fait une valeur par défaut, pas un
plancher. Employez une ruleset d'organisation exigeant un workflow défini dans un dépôt
d'administration, ou une URL que l'organisation contrôle, ou les deux.

Les clés les plus utiles pour commencer :

| Clé | Ce qu'elle fait |
|---|---|
| `mode` | `off`, `assist`, `warn`, `enforce` — voir la trajectoire d'adoption |
| `activation.activatedAt` | les PR créées avant cette date sont hors périmètre et passent toujours |
| `formatSeverity` | `warn` (défaut) ou `error` — un commentaire mal formé fait-il échouer le check |
| `resolverOverrideGroup` | `["org/team-slug"]`, qui peut clore un fil bloquant à la place de son auteur |
| `overrideLabel` | l'étiquette d'exemption de PR, `cc-override` par défaut |

Les clés `server.*` décrivent un service hébergé et sont **ignorées** ici, à l'exception de
`server.reconcileIntervalSeconds` si vous activez la réconciliation planifiée.

---

## 10. La trajectoire d'adoption

Ne commencez pas par `enforce`. Les modes existent pour être gravis :

| Mode | Ce que le check fait |
|---|---|
| `off` | ne publie rien |
| `assist` | ne publie rien — l'extension navigateur aide quand même à écrire |
| `warn` | publie un statut **jamais rouge**, qui liste ce qui échouerait |
| `enforce` | publie vert ou rouge selon les règles |

`warn` est aussi le chemin du **retour**. Si `enforce` se révèle trop, repassez en `warn`
plutôt qu'en `off` ou `assist` : ceux-là ne publient rien, et un check obligatoire qui
n'arrive jamais bloque **toutes** les PR. Pour la même raison, **désactiver le workflow
n'est pas un retour arrière** — c'est la façon la plus rapide de bloquer tout votre dépôt.
Passez d'abord en `warn` ; retirez le check obligatoire avant de retirer le workflow.

Avant de passer en `enforce`, tranchez ceci :

- **`resolverOverrideGroup` est renseigné.** Sans groupe désigné, les deux soupapes sont
  inertes — ni réponse `decision:`, ni exemption de PR — et un fil bloquant dont l'auteur
  est en congé bloque la PR sans recours.
- **Quelqu'un possède le retour arrière**, et sait qu'il consiste à passer en `warn`, pas à
  désactiver le workflow.
- **Vous avez choisi votre réponse au §7**, « aucune » comprise.
- **Le workflow compagnon est en place**, si vous acceptez des PR de forks.

---

## 11. Offres GitHub et hébergement

| | Fonctionne | Remarques |
|---|---|---|
| **github.com**, dépôt public | oui | minutes Actions gratuites ; les workflows planifiés sont désactivés après 60 jours sans activité |
| **github.com**, dépôt privé | oui | consomme vos minutes Actions |
| **GitHub Enterprise Cloud**, EMU compris | oui | les rulesets d'organisation sont la façon la plus simple de déployer largement |
| **GitHub Enterprise Server** | voir note | GHES exécute Actions et expose les mêmes API, et l'action lit son instance dans `GITHUB_API_URL` : aucune configuration supplémentaire. Que **votre** version de GHES porte tous les déclencheurs employés ici — `pull_request_target` en particulier — **est à vérifier sur votre instance avant de vous y fier**. Ce document n'affirme aucune version minimale, parce qu'elle dépend de ce que vous avez installé. |

Les runners auto-hébergés conviennent : l'action demande Node 20 et un accès sortant à
l'API de votre instance GitHub, rien d'autre.

---

## 12. Exemple minimal, de bout en bout

Au départ, un dépôt sans rien.

**Étape 1 — le workflow.** Sur une branche, créez
`.github/workflows/conventional-comments.yml` avec le contenu de
[`examples/conventional-comments.yml`](./examples/conventional-comments.yml). Fusionnez-le
sur votre branche par défaut. (Il ne peut pas vérifier sa propre PR : c'est attendu.)

**Étape 2 — la configuration.** Créez `.conventional-comments.json` à la racine :

```json
{
  "$schema": "https://conventional-comments-toolkit.dev/schema/v1.json",
  "version": 1,
  "mode": "warn",
  "activation": { "activatedAt": "2026-09-07T00:00:00Z" },
  "resolverOverrideGroup": ["acme/reviewers"]
}
```

Mettez `activatedAt` à maintenant : les PR ouvertes avant restent hors périmètre et passent
toujours, si bien qu'allumer l'outil n'illumine pas celles qui sont déjà en vol.

**Étape 3 — le voir marcher.** Ouvrez une PR. Sur une ligne modifiée, laissez un
commentaire de revue :

```
issue: ce nom ne dit pas ce que fait la fonction

`process` peut vouloir dire n'importe quoi. `normalizeAddress`, non.
```

En moins d'une minute, le check **conventional-comments** apparaît, encore vert (`warn`
n'échoue jamais), avec un corps qui nomme votre fil comme fil bloquant non résolu.

**Étape 4 — le voir bloquer.** Passez `"mode"` à `"enforce"` et fusionnez ce changement.
Poussez un commit sur votre PR pour déclencher une nouvelle évaluation. Le check passe au
rouge, et le bouton de merge est désactivé dès lors que vous l'avez rendu obligatoire (§6).

**Étape 5 — le voir se libérer.** Résolvez le fil — en tant que personne qui l'a écrit. Le
check ne bouge pas tout seul (§7) : poussez un commit, ajoutez un commentaire, ou lancez
*Actions → Conventional Comments → Run workflow* avec votre numéro de PR. Il passe au vert.

**Étape 6 — essayer la soupape.** Ouvrez un fil bloquant et, au lieu de le résoudre,
répondez **dans le fil** :

```
decision: hors périmètre de cette PR, dette suivie en PROJ-142

Le point est réel, son auteur est absent, et le correctif doit partir aujourd'hui.
```

Un membre de `resolverOverrideGroup` peut désormais résoudre le fil, et le check l'accepte
— avec le motif consigné dans la PR, là où le prochain lecteur le trouvera.

---

## 13. Quand ça ne marche pas

| Symptôme | Cause |
|---|---|
| Aucun check n'apparaît | mode `off` ou `assist` (ils ne publient rien, par conception) ; ou le workflow n'est pas encore sur la branche par défaut |
| Aucun check sur les PR de forks | attendu sur les événements de revue — voir §8 |
| Le check est rouge mais le fil qu'il nomme est résolu | la résolution n'a déclenché aucun événement — voir §7 ; rejouez le workflow |
| `conventional-comments` n'est pas dans la liste des checks obligatoires | lancez le workflow une fois ; GitHub ne liste que les checks déjà vus |
| L'exécution échoue sur un HTTP 403 au check run | `checks: write` manque dans le bloc `permissions:` |
| Toutes les PR sont bloquées et aucun check n'arrive | un check obligatoire est posé mais le workflow est désactivé ou en échec — c'est le piège du §10 |
| Le check est `neutral` avec « config » dans le résumé | votre `.conventional-comments.json` est invalide ou a disparu ; le corps nomme la ligne fautive |

Le journal d'exécution dit ce qui a été lu et ce qui a été publié, une ligne par PR.

---

## Voir aussi

- [`github-setup-en.md`](./github-setup-en.md) — le même guide, en anglais.
- [`extension-setup-fr.md`](./extension-setup-fr.md) — l'extension navigateur, qui aide à
  écrire des commentaires conformes en amont. Elle est indépendante : cette vérification
  fonctionne que quiconque l'ait installée ou non, et c'est précisément le but.
- `specifications-fr.md` §6.4.1 et annexe A.8 — les règles normatives derrière ce document.
