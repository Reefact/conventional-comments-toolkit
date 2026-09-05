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
- Branche de travail : **celle que la session en cours désigne** — développer et
  pousser dessus, jamais sur `main`, jamais sur une autre. Ce point a nommé une
  branche ; elle n'existe plus sur `origin`, et la consigne est restée là, fausse,
  sans que rien ne le signale. Un nom de branche est une liste d'un seul élément :
  il vieillit comme les autres.
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

Des gardes mécanisent la part mécanisable. Ceux qui suivent sont ici parce que chacun
porte une LEÇON, pas pour faire l'inventaire — `package.json` fait foi sur ce qui existe :

- `npm run check:context-apis` — le bundle livré ne référence aucune API absente
  de son contexte d'exécution. C'est ce garde qui aurait attrapé
  `chrome.permissions` dans `content.js` en une seconde. Sa liste d'API interdites
  est elle-même une affirmation sur le navigateur : `smoke:mv3` la contrôle.
- `npm run check:content-script-cors` — ce qu'un script de contenu a le droit de **lire**.
  Trois documents de ce dépôt ont affirmé que la lecture de configuration était « une requête
  same-origin », donc sans frontière CORS. Vrai de la REQUÊTE, faux de la REDIRECTION : la
  route `raw` de github.com redirige vers `raw.githubusercontent.com`, qui répond `ACAO: *`,
  et le joker est refusé dès que la requête porte des cookies. Le niveau « dépôt » du §8.2
  n'a donc jamais fonctionné sur GitHub, et le bandeau dégradé s'affichait exactement sur les
  dépôts qui avaient une configuration à lire. Trois affirmations successives, aucune mesurée.
  La suite de l'histoire dit pourquoi il faut mesurer JUSQU'AU BOUT : `credentials:
  'same-origin'` traverse cette redirection — premier saut authentifié, redirection anonyme —
  et rend les dépôts privés lisibles sans aucune permission d'hôte. Le `'omit'` écrit d'abord
  était un renoncement inutile, faute d'avoir posé la question complète.
- `npm run check:relay-cors` — la même question dans l'AUTRE contexte. « Le service worker
  échappe au CORS quand il a la permission d'hôte » : vrai de l'URL demandée, faux de la CIBLE
  d'une redirection, qu'aucune permission ne couvre. Le relais `cct-fetch-config` prenait donc
  le mur du script de contenu, dans le contexte même qui était censé y échapper.
- `npm run check:subject-line` — une affirmation de MISE EN PAGE, que happy-dom ne peut pas
  trancher : il sait dire de quel élément un nœud est enfant, jamais sur quelle ligne il tombe.
  Le même commentaire y est rendu des DEUX façons — badges dans le paragraphe du sujet, badges
  au-dessus de lui — pour que la géométrie distingue réellement les deux, plutôt que de constater
  qu'une page s'affiche.
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
npm run checks                  # les gardes sans navigateur, build compris — package.json fait foi
npm run spike                   # spike P1' dans Chromium (§9.3)
npm run smoke:mv3               # extension empaquetée dans un vrai Chromium (prémisses MV3)
npm run check:github-theme-vars # variables Primer de styles.css toujours présentes sur github.com
npm run check:beacon            # un POST no-cors cross-origin part et arrive, sans referer ni cookie
npm run check:content-script-cors # ce qu'un script de contenu a le droit de LIRE (redirections, cookies)
npm run check:relay-cors        # la même question pour le service worker du relais
npm run check:subject-line      # badges et sujet sur UNE seule ligne, mesuré (§5.5)
npm run check:composer-layout   # trait d'état, gouttière du texte, pastille — mesurés (§5.1, §5.3)
```

Toute commande qui interroge le NAVIGATEUR plutôt que le code pilote un vrai Chromium via
`playwright-core` — c'est ce qui distingue une mesure d'une affirmation, et c'est pourquoi
ces commandes existent séparément de `npm test`. `playwright-core` ne télécharge pas le
navigateur à l'installation : une fois par machine, `npx playwright-core install chromium`
(comme le fait la CI avant ces commandes). `smoke:mv3` charge
`packages/extension/dist-ext/` : lancer `npm run build:extension` d'abord.

La CI rejoue ces commandes : `.github/workflows/` fait foi sur qui lance quoi, quand, et
sur quels chemins. Trois propriétés valent d'être sues parce qu'aucune ne se lit dans une
commande : la suite tourne sur DEUX versions de Node, une PR qui modifie
`specifications-fr.md` en même temps que du code est refusée, et ce qui exige un vrai
navigateur tourne aussi la nuit — un canari, pour que la pourriture d'un sélecteur se
découvre sans PR. Les faire passer en local avant de pousser.

Piège récurrent : les caractères invisibles (BOM, NBSP, U+202F, U+FE0F, ZWJ)
s'écrivent TOUJOURS en échappements `\uXXXX` dans les sources et les tests.
