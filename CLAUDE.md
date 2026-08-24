# Instructions de travail sur ce repository

## Au démarrage de toute session, avant toute modification

1. `git log --oneline -20`, `git status`, `git diff --stat`,
   `git diff --staged --stat` (diff détaillé seulement si utile).
2. Relire les sections de `specifications-fr.md` pertinentes pour la prochaine
   action, et vérifier build/tests (`npm test`, `npm run build`) pour établir
   l'état d'avancement.

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
  `docs/ca-matrix-fr.md`.
- Privilégier la solution la plus simple satisfaisant complètement la spec ;
  pas de sur-ingénierie ni de refactoring sans bénéfice concret. Une phase
  terminée, testée et conforme reste terminée.

## Commandes

```
npm install     # une fois
npm test        # suite complète (vitest)
npm run build   # tsc -b sur tous les paquets
npm run checks  # gardes du repo : matrice CA ↔ tests, caractères invisibles
npm run spike   # spike P1' dans Chromium (§9.3)
```

La CI rejoue ces commandes (`.github/workflows/`) : `ci.yml` (build + tests, Node 20 et
22), `conformance.yml` (les gardes ci-dessus + spécification non modifiée par une PR de
code), `extension-package.yml` (bundle MV3, aucun code distant), `browser-smoke.yml`
(spike quotidien dans Chromium). Les faire passer en local avant de pousser.

Piège récurrent : les caractères invisibles (BOM, NBSP, U+202F, U+FE0F, ZWJ)
s'écrivent TOUJOURS en échappements `\uXXXX` dans les sources et les tests.
