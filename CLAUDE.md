# Instructions de travail sur ce repository

## Au démarrage de toute session, avant toute modification

1. Lire `PROGRESS.md` — c'est l'état de reprise du chantier : phase en cours,
   prochaine action concrète, décisions déjà prises, pièges connus. Ne pas
   redécouvrir ce qu'il consigne déjà.
2. Puis : `git log --oneline -20`, `git status`, `git diff --stat`,
   `git diff --staged --stat` (diff détaillé seulement si utile).
3. Relire les sections de `specifications-fr.md` pertinentes pour la prochaine
   action, et vérifier build/tests (`npm test`, `npm run build`) si
   `PROGRESS.md` ne suffit pas à en établir l'état.

## Règles du chantier

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
  `docs/ca-matrix.md`.
- Privilégier la solution la plus simple satisfaisant complètement la spec ;
  pas de sur-ingénierie ni de refactoring sans bénéfice concret. Une phase
  terminée, testée et conforme reste terminée.

## Tenue de `PROGRESS.md`

- Le mettre à jour **dans le même commit** que le code correspondant ; il peut
  aussi être committé **seul**, à tout moment, dès qu'une décision est prise ou
  qu'une direction change.
- Avant une modification longue : y écrire la prochaine action *avant* de
  commencer.
- Commiter à chaque unité de travail cohérente (code compilable, tests
  concernés au vert). Si un point de reprise sain n'est pas atteignable vite,
  ne pas forcer un commit : décrire l'état en cours dans `PROGRESS.md` et
  laisser le working tree parler.
- Critère avant chaque commit : « une autre instance reprenant d'ici
  aurait-elle assez d'informations dans le repository pour poursuivre ? »
- L'élaguer au fur et à mesure (~80 lignes max) ; ne pas y dupliquer la spec ni
  ce qui se déduit du code.

## Commandes

```
npm install     # une fois
npm test        # suite complète (vitest)
npm run build   # tsc -b sur tous les paquets
npm run spike   # spike P1' dans Chromium (§9.3)
```

Piège récurrent : les caractères invisibles (BOM, NBSP, U+202F, U+FE0F, ZWJ)
s'écrivent TOUJOURS en échappements `\uXXXX` dans les sources et les tests.
