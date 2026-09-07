# À faire — état des lieux pour vous

Ce fichier est pour **vous**. Il répond à trois questions : où en est le projet, comment
l'essayer en vrai, qu'est-ce qui reste à faire et par qui.

À supprimer ou déplacer dans `docs/` une fois que vous n'en avez plus besoin — il ne fait
partie d'aucune convention du chantier.

## En une phrase

Le **code** de toute la spécification est écrit, testé et vérifié par plusieurs revues
contradictoires. Ce qui **manque** n'est pas du code non écrit, mais des étapes humaines :
essayer l'extension en vrai, poser le workflow GitHub sur un dépôt et le regarder bloquer
une PR, et mener une phase de mesure (P0) qui ne peut se faire qu'avant tout déploiement.
Sur GitHub, « choisir où héberger le serveur » ne figure plus dans cette liste : il n'y a
plus de serveur à héberger.

## 1. Deux composants, deux niveaux de préparation très différents

### Composant A — l'extension navigateur : **installable et testable dès maintenant**

Elle fonctionne **seule**, sans le composant serveur : en mode `assist` (celui livré par
défaut), elle aide à écrire un commentaire conforme et affiche des diagnostics, mais ne
bloque jamais rien. C'est ce que vous pouvez tester tout de suite.

### Composant B — le vérificateur : **sur GitHub, plus rien à déployer**

Sur **GitHub**, le vérificateur est désormais une **GitHub Action** exécutée dans le dépôt
qu'elle protège (`packages/action/`). Il n'y a plus de machine à trouver, plus d'URL HTTPS
publique à exposer, plus de jeton à fabriquer : le runner fournit le sien. La mise en place
tient en deux gestes — copier un fichier de workflow, déclarer le check obligatoire — et
elle est écrite pas à pas dans **[`docs/github-setup-fr.md`](./docs/github-setup-fr.md)**
(anglais : [`docs/github-setup-en.md`](./docs/github-setup-en.md)).

Ce qui reste **chez vous** sur GitHub est donc une décision, pas une infrastructure :
choisir la parade à la fenêtre de dé-résolution (§7 du guide), et le moment de passer de
`warn` à `enforce`.

Sur **Azure DevOps**, le service auto-hébergé demeure — la plateforme n'offre pas
l'équivalent du couple « déclencheur de revue + jeton d'écriture » de GitHub :
`packages/server/src/main.ts` (variables `CCT_*`), une image Docker (`Dockerfile`, validée
par le job CI « Image Docker du composant B ») et trois stockages au choix derrière
l'interface `Storage`. Tout est dans **`docs/deployment-fr.md`**. Là, il manque toujours
une machine, une URL HTTPS et de vrais jetons.

## 2. Installer l'extension pour l'essayer

**Poste vierge (aucun Node.js/npm/Git installé) ?** Suivez plutôt le guide dédié, pas à
pas, avec les messages d'erreur exacts et leur solution :
[`docs/extension-setup-fr.md`](./docs/extension-setup-fr.md) (anglais :
[`docs/extension-setup-en.md`](./docs/extension-setup-en.md)).

**Poste où `npm` est impossible** (pas de Node, pas de droits, politique d'entreprise) ?
Poser un tag `vX.Y.Z` publie une Release GitHub qui porte l'extension déjà construite, en
zip : un pour Chromium, un pour Firefox. Il ne reste qu'à télécharger, décompresser et
charger le dossier — rien à installer sur le poste. C'est une voie d'**essai**, pas un
canal de déploiement : une extension chargée depuis un zip ne se met pas à jour toute
seule, et la spécification fait passer toute livraison du composant A par les stores (§10,
§14). La procédure est dans [`docs/release-fr.md`](./docs/release-fr.md).

Si Node.js et npm sont déjà installés, la version courte suffit. Le bundle **n'est pas
committé** (`dist-ext/` est dans `.gitignore` — c'est un artefact de build) : sur un clone
frais, il faut le générer une fois, Node ≥ 20 requis :

```sh
npm install
npm run build            # compile core/ + adaptateurs + extension
npm run build:extension  # génère packages/extension/dist-ext/ (Chromium + variante Firefox)
```

Ça produit `packages/extension/dist-ext/` (Chromium) et
`packages/extension/dist-ext/firefox/` (Firefox).

### Chrome / Edge

1. `chrome://extensions` (ou `edge://extensions`).
2. Activer **Mode développeur** (coin supérieur droit).
3. **Charger l'extension non empaquetée** → sélectionner le dossier
   `packages/extension/dist-ext/`.
4. Aller sur une vraie Pull Request GitHub : la barre d'outils doit apparaître au-dessus
   de tout champ de commentaire.

### Firefox

1. `about:debugging#/runtime/this-firefox`.
2. **Charger un module complémentaire temporaire**.
3. Sélectionner `packages/extension/dist-ext/firefox/manifest.json`.
4. Ce module disparaît au redémarrage du navigateur (limitation de Firefox pour les
   extensions non signées) — à recharger à chaque session de test.

### GitHub fonctionne tout de suite, Azure DevOps demande un clic de plus

`github.com` est préautorisé dans le manifeste. Pour Azure DevOps (ou un GitHub
Enterprise Server interne), ouvrez la page d'options de l'extension (un clic sur son
icône dans la barre d'outils, ou `chrome://extensions` puis « Détails ») et ajoutez le
domaine (`dev.azure.com`, ou votre `*.visualstudio.com`, ou le domaine de votre GHES) —
un clic sur **Autoriser** suffit ensuite. *(Correction apportée aujourd'hui même : avant
ce commit, accorder cette permission n'activait rien du tout sur ces domaines — le
script ne s'y injectait jamais. C'est réparé et testé, mais ça n'a encore jamais tourné
dans un vrai navigateur sur une vraie page Azure DevOps — voir §3.)*

## 3. Que tester, concrètement — et ce que je ne peux pas avoir testé moi-même

Je n'ai pas de navigateur pour cliquer dans une vraie page ; tout ce que j'ai vérifié
l'a été par des tests automatisés (DOM simulé) ou par exécution scriptée dans un
Chromium sans interface. Un passage humain reste donc utile, dans cet ordre :

1. **GitHub, cas simple** — ouvrir une PR, écrire un commentaire sans label : la pastille
   doit afficher un avertissement, la barre d'outils doit permettre de cliquer un label
   (ex. `issue`) et le voir s'insérer correctement.
2. **Saisie rapide** — taper `?i` puis `Tab` dans un champ de commentaire : doit se
   développer en `issue: `. Tester aussi un raccourci direct (`Alt+I` par défaut).
3. **Décoration** — cliquer `issue`, puis ajouter la décoration `blocking` : le texte
   déjà saisi ne doit pas être perdu.
4. **Page d'options** — ajouter le domaine `dev.azure.com`, vérifier qu'une page Azure
   DevOps (PR réelle) fait apparaître la même barre d'outils. C'est le test qui valide
   la correction du jour, jamais exécuté en conditions réelles.
5. **Mode `enforce` avec le check GitHub** — c'est maintenant testable sans rien héberger :
   suivre `docs/github-setup-fr.md` sur un dépôt bac à sable, ouvrir une PR, y écrire un
   `issue:` et vérifier que le merge est refusé tant que le fil n'est pas résolu. C'est le
   seul bout de la chaîne qui n'a jamais tourné sur un vrai GitHub.

Deux critères d'acceptation de la spec (§11) ne sont *que partiellement* automatisés et
attendent ce genre de passage manuel — voir `docs/ca-matrix-fr.md`, section « Critères
vérifiés partiellement » : le parcours clavier complet (`CA-12`) et le rendu exact du
corps du check GitHub (`CA-25`).

## 4. Ce qui reste à faire, et par qui

| # | Tâche | Qui | Bloquant pour merger #2 ? |
|---|-------|-----|---------------------------|
| 1 | Essayer l'extension en vrai (§3 ci-dessus) | Vous | Non |
| 2 | ~~Programme de déploiement du composant B~~ — **fait** : `docs/deployment-fr.md`, image Docker | — | — |
| 3 | **GitHub** : poser `.github/workflows/conventional-comments.yml` sur un dépôt et déclarer le check obligatoire (`docs/github-setup-fr.md`) | Vous | Non — mais c'est ce qui donne le blocage réel de PR, et ça ne demande plus aucun hébergement |
| 3b | **Azure DevOps seulement** : choisir un hébergement pour le service (conteneur toujours actif, VM — pas de « sans serveur » qui endort le processus) et l'y déployer | Vous | Non |
| 4 | **Azure DevOps seulement** : créer un service hook (PAT, secret de webhook). Sur GitHub il n'y a plus ni app ni jeton à créer | Vous | Non |
| 5 | **Mesure de référence P0** (temps de revue, taux de conformité *avant* l'outil) | Vous | Non, mais **irrattrapable** si l'outil est déployé avant — §14, `docs/operations-fr.md` |
| 6 | Choisir un dépôt pilote et suivre la trajoire `assist → warn → enforce` | Vous | Non |
| 7 | Soumission aux stores (Chrome Web Store, Firefox Add-ons) : **toute livraison du composant A y passe** (§10, §14), et c'est le seul chemin qui donne la mise à jour automatique. Les zips de release (`docs/release-fr.md`) servent à l'essai et aux postes sans chaîne de build, ils ne s'y substituent pas | Vous | Non |
| 8 | Fournir des captures DOM réelles pour le smoke test de sélecteurs (§9.4) | Vous (ou moi, avec un accès) | Non |
| 9 | Vérifier les deux hypothèses AzDO non tranchées par le spike (type d'éditeur, lisibilité du fichier de config) sur un vrai tenant Azure DevOps | Vous (ou moi, avec un accès) | Non — replis dégradés déjà en place, documentés dans `spikes/p1-prime/README-fr.md` |

Rien dans cette liste ne bloque le merge de la PR #2 : le code est complet, testé, et la
CI est verte. Ces tâches sont des étapes d'**exploitation**, pas de développement
inachevé.

## 5. Où trouver le reste

- `README.md` — vue d'ensemble, commandes, statut par phase (§14).
- `docs/architecture-fr.md` — comment A et B partagent les règles sans jamais diverger.
- `docs/operations-fr.md` — procédure de retour arrière, prérequis avant `enforce`, rapport
  à blanc.
- `docs/ca-matrix-fr.md` — chaque critère d'acceptation → le test qui le vérifie.
- `specifications-fr.md` — la référence normative complète (ne se modifie jamais pour
  suivre le code).
