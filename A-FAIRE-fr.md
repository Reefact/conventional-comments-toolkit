# À faire — état des lieux pour vous

Ce fichier est pour **vous**. Il répond à trois questions : où en est le projet, comment
l'essayer en vrai, qu'est-ce qui reste à faire et par qui.

À supprimer ou déplacer dans `docs/` une fois que vous n'en avez plus besoin — il ne fait
partie d'aucune convention du chantier.

## En une phrase

**L'extension est écrite, testée et livrée ; le vérificateur est écrit et testé, mais n'a
jamais tourné.** La distinction compte : 1 247 tests automatisés et plusieurs revues
contradictoires disent que le code fait ce qu'on croit, pas qu'il a été éprouvé en vrai.
Le compagnon serveur est retiré — **il n'y a plus rien à héberger**, le vérificateur est
une GitHub Action qui s'exécute dans le dépôt qu'elle protège.

Ce qui manque n'est donc pas du code non écrit, mais des étapes qu'aucun test ne remplace :
essayer l'extension dans un vrai navigateur, poser les workflows sur un dépôt pilote — ce
qui tranchera du même coup les deux prémisses de plateforme que ce dépôt écrit sans les
avoir mesurées (§A.8) —, et mener la phase de mesure (P0), qui ne peut se faire qu'avant
tout déploiement.

## 1. Deux composants, deux niveaux de préparation très différents

### Composant A — l'extension navigateur : **installable et testable dès maintenant**

Elle fonctionne **seule**, sans le vérificateur : en mode `assist` (celui livré par
défaut), elle aide à écrire un commentaire conforme et affiche des diagnostics, mais ne
bloque jamais rien. C'est ce que vous pouvez tester tout de suite.

### Composant B — le vérificateur : **une GitHub Action, rien à héberger**

Le service auto-hébergeable n'existe plus, et c'était l'objet de l'issue #56 : plus de
serveur, plus d'image Docker, plus de stockage, plus de webhooks, plus de secrets. Le
vérificateur est `packages/action/` — une GitHub Action qui s'exécute dans le dépôt qu'elle
protège, authentifiée par le `GITHUB_TOKEN` que le runner lui remet, et qui publie le check
run `conventional-comments`.

La mise en place tient en **deux fichiers de workflow, un fichier de configuration et une
règle de branche**. Elle est écrite pas à pas dans
[`docs/github-setup-fr.md`](./docs/github-setup-fr.md) (anglais :
[`docs/github-setup-en.md`](./docs/github-setup-en.md)), avec les workflows prêts à copier
dans `docs/examples/`.

Ce qui manque est donc **un dépôt pilote où le poser**. Tant que personne ne l'a fait,
aucune PR n'est réellement bloquée — c'est attendu (§2 : le composant A est contournable par
construction, c'est B qui porte la contrainte réelle).

**Azure DevOps n'a pas de vérificateur** (§B.7) : l'extension y est un composant
d'assistance, et rien d'autre.

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
5. **Mode `enforce` sans vérificateur** — tant que les workflows ne sont pas posés sur un
   dépôt, l'extension ne peut jamais passer en blocage réel (c'est le mode `warn`/`assist`
   qui s'applique de fait) : rien à tester ici avant l'étape 2 du tableau ci-dessous.

Deux critères d'acceptation de la spec (§11) ne sont *que partiellement* automatisés et
attendent ce genre de passage manuel — voir `docs/ca-matrix-fr.md`, section « Critères
vérifiés partiellement » : le parcours clavier complet (`CA-12`) et le rendu exact du
corps du check GitHub (`CA-25`).

## 4. Ce qui reste à faire, et par qui

| # | Tâche | Qui |
|---|-------|-----|
| 1 | Essayer l'extension en vrai (§3 ci-dessus) | Vous |
| 2 | **Mesure de référence P0** (temps de revue, taux de conformité *avant* l'outil). **Irrattrapable** si l'outil est posé avant — §14, `docs/operations-fr.md` | Vous |
| 3 | Choisir un dépôt pilote, y poser les deux workflows de `docs/examples/` et son `.conventional-comments.json`, puis suivre la trajectoire `assist → warn → enforce` — pas à pas dans `docs/github-setup-fr.md`. Bloquant pour tout blocage réel de PR | Vous |
| 4 | ~~Choisir un hébergement pour le serveur~~ — **sans objet** : il n'y a plus de serveur (issue #56) | — |
| 5 | ~~Créer une app GitHub / un service hook~~ — **sans objet** : aucune app, aucun webhook, aucun secret ; le runner remet son jeton | — |
| 6 | **Deux prémisses que seule une exécution réelle peut établir**, et que le §A.8 range comme telles : les variables que le runner pose (`GITHUB_EVENT_PATH`, `GITHUB_API_URL`, la convention `INPUT_<NOM>`), et **où GitHub rend exactement l'`output.title` d'un check run sur la page d'une PR** — le §6.5 fait dépendre de cette ligne le grisage du bouton de merge par l'extension. Se tranche avec l'étape 3 | Vous (ou moi, avec un accès) |
| 7 | Soumission aux stores (Chrome Web Store, Firefox Add-ons) : **toute livraison du composant A y passe** (§10, §14), et c'est le seul chemin qui donne la mise à jour automatique. Les zips de release (`docs/release-fr.md`) servent à l'essai et aux postes sans chaîne de build, ils ne s'y substituent pas | Vous |
| 8 | Fournir des captures DOM réelles pour le smoke test de sélecteurs (§9.4) | Vous (ou moi, avec un accès) |
| 9 | Vérifier sur un vrai tenant Azure DevOps ce que le spike n'a pas tranché : type d'éditeur, lisibilité du fichier de config, et **la forme du corps rendu** — quelle balise enveloppe une ligne de Markdown ordinaire, laquelle matérialise une fin de ligne simple (`renderedBodyShape()`, §9.2.3). Replis dégradés déjà en place, documentés dans `spikes/p1-prime/README-fr.md` | Vous (ou moi, avec un accès) |

Rien dans cette liste n'est du développement inachevé : le code est complet, testé, et la
CI est verte. Ce sont des étapes d'**exploitation**, à l'exception de l'étape 6, qui est une
**mesure** — deux affirmations sur la plateforme que ce dépôt écrit aujourd'hui sans les
avoir vérifiées, et qu'il dit telles quelles plutôt que de les présenter comme acquises.

## 5. Où trouver le reste

- `README.md` — vue d'ensemble, commandes, statut par phase (§14).
- `docs/github-setup-fr.md` — mettre en place le contrôle sur GitHub, de bout en bout.
- `docs/architecture-fr.md` — comment A et B partagent les règles sans jamais diverger.
- `docs/operations-fr.md` — procédure de retour arrière, prérequis avant `enforce`, rapport
  à blanc.
- `docs/ca-matrix-fr.md` — chaque critère d'acceptation → le test qui le vérifie.
- `specifications-fr.md` — la référence normative complète (ne se modifie jamais pour
  suivre le code).
