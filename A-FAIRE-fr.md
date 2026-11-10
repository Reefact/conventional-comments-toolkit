# À faire — état des lieux pour vous

Ce fichier est pour **vous**. Il répond à trois questions : où en est le projet, comment
l'essayer en vrai, qu'est-ce qui reste à faire et par qui.

À supprimer ou déplacer dans `docs/` une fois que vous n'en avez plus besoin — il ne fait
partie d'aucune convention du chantier.

## En une phrase

**Le produit est l'extension, et elle seule** (§2) : elle est écrite, testée et passée par
plusieurs revues contradictoires. Le vérificateur (ancien « composant B ») est **retiré de la
spécification** (décision du propriétaire, 2026-11-10) : le produit ne contrôle pas la
complétion d'une PR, il signale les fils bloquants non résolus sans jamais empêcher la fusion.

Ce qui reste est donc surtout fait d'**étapes humaines** : essayer l'extension en vrai, la
soumettre aux stores, puis mener le pilote `enforce`.

## 1. Ce que fait l'extension, et ce qu'elle ne fait pas

En mode `assist` (celui livré par défaut), elle aide à écrire un commentaire conforme et
affiche des diagnostics, sans jamais bloquer. En `enforce`, elle bloque l'**envoi** d'un
commentaire non conforme dans le navigateur où elle est installée (§5.4). Dans les deux cas,
le bandeau du §5.5 compte les fils bloquants non résolus de la PR.

Elle ne bloque **jamais la fusion** d'une PR, et elle reste contournable par construction
(§2 : l'API, une CLI, un autre navigateur ou un poste sans l'extension y suffisent). Une équipe
qui veut une barrière de fusion s'appuie sur les options natives de sa plateforme, par exemple
la résolution obligatoire des conversations.

Disparu avec le vérificateur : la gouvernance des résolutions de fil, l'exemption de PR, le
périmètre d'activation, la comparaison des empreintes de configuration, et les clés
`formatSeverity`, `overrideLabel`, `resolverOverrideGroup`, `activation` et `docUrl` (§8.2), qui
restent lisibles mais sont ignorées et signalées. `warn` est lu comme `assist` (§7).

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
seule, et la spécification fait passer toute livraison de l'extension par les stores (§10,
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
5. **Mode `enforce`** — avec un fichier `{"version": 1, "mode": "enforce"}` sur la branche
   par défaut d'un dépôt de test, un commentaire sans label ne doit pas partir (bouton et
   clavier) ; repasser le fichier en `assist` doit lever le blocage dès la tentative d'envoi
   suivante (§8.1.3, règle 3).

Deux critères d'acceptation de la spec (§11) ne sont *que partiellement* automatisés et
attendent ce genre de passage manuel — voir `docs/ca-matrix-fr.md`, section « Critères
vérifiés partiellement ».

## 4. Ce qui reste à faire, et par qui

| # | Tâche | Qui |
|---|-------|-----|
| 1 | Essayer l'extension en vrai (§3 ci-dessus) | Vous |
| 2 | Choisir un dépôt pilote et suivre la trajectoire `assist → enforce` (§7) ; écrire avant la bascule la procédure de retour arrière et la liste des dépôts qui écrivent leur propre `mode` — `docs/operations-fr.md` | Vous |
| 2b | **Développement** — rendre calculables les indicateurs du §12 : un événement par commentaire envoyé (conforme ou non, avec ou sans avertissement) pour donner un dénominateur aux taux, et le décompte d'un label quelle que soit la façon dont il a été écrit. Puis leur restitution | Moi |
| 3 | Soumission aux stores (Chrome Web Store, Firefox Add-ons) : **toute livraison de l'extension y passe** (§10, §14), et c'est le seul chemin qui donne la mise à jour automatique. Les zips de release (`docs/release-fr.md`) servent à l'essai et aux postes sans chaîne de build, ils ne s'y substituent pas | Vous |
| 4 | Fournir des captures DOM réelles pour le smoke test de sélecteurs (§9.4) | Vous (ou moi, avec un accès) |
| 5 | Vérifier sur un vrai tenant Azure DevOps ce que le spike n'a pas tranché : type d'éditeur, lisibilité du fichier de config, et **la forme du corps rendu** — quelle balise enveloppe une ligne de Markdown ordinaire, laquelle matérialise une fin de ligne simple (`renderedBodyShape()`, §9.2.3). Replis dégradés déjà en place, documentés dans `spikes/p1-prime/README-fr.md` | Vous (ou moi, avec un accès) |

Une seule ligne est du développement, la 2b : les indicateurs du §12. Les autres sont des
étapes d'**exploitation** ou de **mesure** sur une vraie plateforme.

## 5. Où trouver le reste

- `README.md` — vue d'ensemble, commandes, statut par phase (§14).
- `docs/architecture-fr.md` — la découpe en paquets et ce que `core/` garantit.
- `docs/operations-fr.md` — trajectoire, prérequis avant `enforce`, procédure de retour
  arrière.
- `docs/ca-matrix-fr.md` — chaque critère d'acceptation → le test qui le vérifie.
- `specifications-fr.md` — la référence normative complète (ne se modifie jamais pour
  suivre le code).
