# Instructions de travail sur ce repository

## Au démarrage de toute session, avant toute modification

1. `git log --oneline -20`, `git status`, `git diff --stat`,
   `git diff --staged --stat` (diff détaillé seulement si utile).
2. Relire les sections de `specifications-fr.md` pertinentes pour la prochaine
   action, et vérifier build/tests (`npm test`, `npm run build`) pour établir
   l'état d'avancement.

## Règles du chantier

- **Langue.** Les messages de commit s'écrivent en **anglais**, TOUJOURS, et cela ne se
  discute pas. Tout le reste est en **français** : titres et corps de pull request,
  commentaires et réponses de revue, commentaires de code, documents du dépôt. Le critère
  n'est pas la langue de l'interlocuteur du moment ni celle de l'outil qui lit — un robot de
  revue anglophone ne change rien.

  **Un document dont le public est explicitement anglophone reste en anglais**, et son
  contenu doit y être aussi soigné que dans sa version française : `README.md`, tout
  `docs/*-en.md`, la moitié anglaise de `PRIVACY.md`, et les chaînes anglaises des artefacts
  de publication (`INSTALLATION.txt` est bilingue, et `release.yml` renvoie au guide
  anglais). Ce n'est pas une entorse à la règle, c'est sa raison d'être : la langue d'un
  artefact se décide à sa destination, pas à celle de la conversation qui l'a produit — et
  ces documents-là sont écrits pour des gens qui ne lisent pas le français. La première
  version de cette règle les condamnait à être traduits (revue Codex, PR #32).
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
