# Instructions de travail sur ce repository

## Au démarrage de toute session, avant toute modification

1. `git log --oneline -20`, `git status`, `git diff --stat`,
   `git diff --staged --stat` (diff détaillé seulement si utile).
2. Relire les sections de `specifications-fr.md` pertinentes pour la prochaine
   action, et vérifier build/tests (`npm test`, `npm run build`) pour établir
   l'état d'avancement.

## Règles du chantier

- **Langue — anglais d'abord.** Le critère est UNIQUE, et c'est *qui lit ?* : ce qui est lu
  hors de l'équipe s'écrit en **anglais**, ce qui ne l'est pas suit la langue de l'équipe, le
  **français**. Deux rédactions successives de cette règle ont énuméré des fichiers plutôt
  que d'énoncer ce critère, et se sont fait prendre les deux fois, sur les documents
  anglophones puis sur les catalogues de traduction (revues Codex, PR #32 et #33). Une liste
  vieillit ; le critère, non.

  - **Messages de commit : anglais, toujours.** Ils vivent dans l'historique du dépôt, que
    lit quiconque le clone.
  - **Contenu des pull requests : anglais** — titre, corps, commentaires et réponses de
    revue. Le fil d'une PR est ce qu'un contributeur lit en premier.
  - **Documents du dépôt : anglais, et français EN PLUS quand c'est possible**, la paire
    portant les suffixes `-en.md` / `-fr.md` (`docs/extension-setup-en.md` et son jumeau).
    Qu'un document n'existe que dans une langue n'est pas une faute : le doublement est un
    objectif, pas un préalable.
  - **Chaînes de l'interface : chacune dans SA langue.** `packages/core/src/i18n/en.ts` et
    `fr.ts`, les catalogues de `packages/extension/src/ui/strings.ts` — l'interface est
    bilingue par exigence normative (§10), et franciser le catalogue anglais casserait le
    produit. Cela devrait aller sans dire ; la première version de cette règle disait
    pourtant le contraire.
  - **Fichiers d'outillage interne : français**, et exemptés du doublement — ce fichier,
    `specifications-fr.md`. Ils s'adressent à l'équipe, pas à un lecteur du dépôt.
  - **Commentaires de code : français**, même critère : ils expliquent à l'équipe pourquoi
    le code est ce qu'il est.

- `specifications-fr.md` est la référence fonctionnelle **normative**. Ne jamais
  la modifier pour la faire correspondre à l'implémentation. L'état du
  repository est la source de vérité sur l'avancement.
- Branche de travail : `claude/implement-specification-fr-2a14q6` — développer
  et pousser dessus, jamais ailleurs.
- Les choix purement techniques appartiennent à l'agent ; l'absence d'une
  décision technique dans la spec est un espace de conception, pas une
  ambiguïté à remonter.
- Tout critère d'acceptation (`CA-NN`, §11) raisonnablement automatisable est
  couvert par un test qui cite son identifiant ; la correspondance vit dans
  `docs/ca-matrix-fr.md`.
- Privilégier la solution la plus simple satisfaisant complètement la spec ;
  pas de sur-ingénierie ni de refactoring sans bénéfice concret. Une phase
  terminée, testée et conforme reste terminée.

## Écrire sur une plateforme qu'on ne contrôle pas

Ces trois règles viennent d'une série de défauts livrés sur la PR #29 — quatre
rounds de revue, chacun trouvant un défaut réel dans le correctif du round
précédent. Aucun n'était une inattention : tous suivaient le même mécanisme.

**1. Une affirmation sur le navigateur se vérifie, elle ne se rappelle pas.**
Trois faussetés ont été écrites en commentaire, présentées comme des règles
établies : « `*.ghe.com` ne couvre pas le domaine nu — sémantique des motifs
Chrome » (faux), « les hôtes par défaut ne dépendent d'aucune permission
optionnelle » (faux, et démenti par `manifest.json`, ouvert plus tôt dans la même
session), « `chrome.permissions` est disponible ici » (faux dans un script de
contenu). Le signal d'alarme est la forme du texte : quand une **justification
élaborée** apparaît sous la plume — « c'est la sémantique de X », « ne dépend
d'aucun Y » —, c'est là qu'on fabrique. Un fait vérifié s'énonce platement ; un
fait inventé se plaide. Ouvrir le fichier ou la doc à cet instant précis, ou
écrire « à vérifier » plutôt qu'une certitude.

**2. Un faux de test est une affirmation sur l'environnement, à réviser comme du
code.** Un faux `chrome` exposant `permissions` à un script de contenu ; un
stockage synchrone incapable d'exprimer la course qu'il testait ; un faux
notifiant `onChanged` sans avoir écrit. Chacun construisait un monde où le code
marche, puis constatait qu'il marchait. Avant d'écrire un faux : qu'est-ce que le
vrai environnement fait, et comment je le sais ?

**3. Un correctif de bug se vérifie en le RETIRANT.** Le test doit échouer sans
lui, avec le symptôme visé — pas un symptôme voisin. Deux pièges rencontrés :
un paquet consommé compilé (`@cct/adapter-*`) exige `npm run build` avant que le
retrait soit visible, sinon la vérification est verte pour rien ; et un test peut
passer avec ET sans le correctif (faux trop pauvre pour exprimer le défaut) — il
ne prouve alors rien du tout.

Deux gardes mécanisent la part mécanisable :

- `npm run check:context-apis` — le bundle livré ne référence aucune API absente
  de son contexte d'exécution. C'est ce garde qui aurait attrapé
  `chrome.permissions` dans `content.js` en une seconde. Sa liste d'API interdites
  est elle-même une affirmation sur le navigateur : `smoke:mv3` la contrôle.
- `npm run smoke:mv3` — l'extension **empaquetée** chargée dans un vrai Chromium,
  qui vérifie les prémisses de l'architecture (le service worker voit bien
  `chrome.permissions`, il publie bien la répartition, la page d'options n'impose
  aucune plateforme par défaut). Ce que ce test ne peut PAS voir est écrit dans
  son en-tête, et doit y rester : le monde isolé d'un script de contenu n'est pas
  atteignable sans permission d'hôte, que le manifeste ne déclare plus.

## Commandes

```
npm install                     # une fois
npm test                        # suite complète (vitest)
npm run build                   # tsc -b sur tous les paquets
npm run checks                  # gardes du repo (matrice CA, invisibles, CSS, API/contexte)
npm run spike                   # spike P1' dans Chromium (§9.3)
npm run smoke:mv3               # extension empaquetée dans un vrai Chromium (prémisses MV3)
npm run check:github-theme-vars # variables Primer de styles.css toujours présentes sur github.com
```

`spike`, `smoke:mv3` et `check:github-theme-vars` pilotent un vrai Chromium via
`playwright-core`, qui ne le télécharge pas à l'install : une fois par machine, `npx
playwright-core install chromium` (comme le fait la CI avant ces commandes). `smoke:mv3`
charge `packages/extension/dist-ext/` : lancer `npm run build:extension` d'abord.

La CI rejoue ces commandes (`.github/workflows/`) : `ci.yml` (build + tests, Node 20 et
22), `conformance.yml` (les gardes ci-dessus + spécification non modifiée par une PR de
code), `extension-package.yml` (bundle MV3, aucun code distant), `browser-smoke.yml`
(spike + fumée MV3 dans Chromium, quotidiennement et sur toute PR touchant
`packages/extension/` ou `packages/adapters/`), `theme-vars-canary.yml` (variables de
thème GitHub hebdomadaire, ouvre une issue en cas d'échec). Les faire passer en local
avant de pousser.

Piège récurrent : les caractères invisibles (BOM, NBSP, U+202F, U+FE0F, ZWJ)
s'écrivent TOUJOURS en échappements `\uXXXX` dans les sources et les tests.
