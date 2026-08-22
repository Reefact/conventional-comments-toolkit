# État de reprise du chantier

Référence normative : `specifications-fr.md`. Avancement réel : le repository.
Branche de travail : `claude/implement-specification-fr-2a14q6` (pousser dessus, jamais ailleurs).

## Phase en cours et prochaine action

**Phase : revue de conformité finale — volet core/ corrigé.**
Les 9 constats de la revue adversariale de `core/` sont traités : 8 corrigés (dont
`labels.minimum` réaligné sur la sémantique « valeur effective »), 1 réfuté (limite basse
E- : le validateur clampait déjà ; clamp ajouté aussi à la résolution, avec notice).
Tests de non-régression : `packages/core/test/review-fixes.test.ts` (17 tests).

**Prochaine action concrète :** lancer la revue adversariale équivalente sur le
composant serveur (`packages/server/src/compliance/*` vs §6.2-§6.4, §8.1.5) et
l'extension (`packages/extension/src/*` vs §5, §6.5, §9.2.3), corriger les écarts
confirmés, puis pousser et clore.

## Fait

- P1 `core/` complet + 223 tests ; corpus de parité CA-06 versionné dans `core/src/corpus/`.
- P5 serveur complet (orchestrateur 16 étapes, 13 objets de stockage, admin atomique §6.3.2, adaptateurs GitHub/AzDO) + tests.
- P2/P3 extension MV3 + adaptateurs client + garde §5.4 + tests ; P4 indicateurs §12.
- P1' spike réel dans Chromium (`npm run spike`) ; hypothèses restantes et replis : `spikes/p1-prime/README.md`.
- Matrice CA-01..CA-39 → tests : `docs/ca-matrix.md` (grep "CA-NN" dans les tests).
- Docs : `docs/architecture.md`, `docs/operations.md`.

## Décisions structurantes (et pourquoi)

- TypeScript strict, monorepo npm workspaces, zéro dépendance runtime (CSP §10, auditabilité) ; vitest ; happy-dom pour les tests DOM ; playwright-core + Chromium préinstallé pour le spike.
- Toutes les règles dans `@cct/core`, fonctions pures sans I/O ; l'orchestrateur serveur arme `forceState` et exécute `actions` (§9.2.2).
- `PlatformOperationalFacts` (serveur) porte les capacités de plateforme du spike (provenance étiquettes, voie événementielle, targetUrl requise) — hors contrat normatif §9.2.4, injecté à la construction.
- Empreinte = FNV-1a 32 bits (8 hex, format de l'exemple §6.3.1) sur une projection triée du domaine clos §9.2.2 ; exemptUsers minusculisés dans l'empreinte.
- Stockage serveur : interface + MemoryStorage/FileStorage (JSON atomique) ; `setPinnedConfig` refuse silencieusement la réécriture (règle « jamais réécrite » portée par le stockage).
- Exemption chemin de repli : état `pending|confirmed` en stockage ; une `pending` rencontrée par une évaluation est supprimée.
- Étage −1 : une `decision` d'un auteur exempté n'est PAS retenue comme decision de gouvernance (choix documenté dans `evaluate.ts` — analyze() rend 'exempt').
- Décision reply : seuls seuils §6.1.1 ; W-SUBJECT-TOO-LONG non appliqué (« le seul qui s'y applique »).
- `labels.minimum` du plancher : sémantique « valeur effective » (comme les autres clés du plancher) — enabled/blockingByDefault forcés à true pour les ids du minimum, quel que soit le niveau qui portait false (revue adversariale, écart 3).
- Slash GitHub : profil avec `['/azp']` (liste extensible) ; AzDO `[]`.

## Pièges rencontrés

- Caractères invisibles (BOM, NBSP, U+202F, U+FE0F, ZWJ) : toujours en échappements `\uXXXX` dans les sources — des littéraux ont déjà failli se corrompre.
- Le cache de configuration (TTL 3600 s, §8.1.2) retarde l'observation d'un fichier disparu/cassé : les tests doivent faire avancer l'horloge injectée (`env.clock`).
- `tsc` composite : erreurs TS7022 sur variables booléennes auto-référencées → annoter.

## Build / tests

`npm install` puis : `npm test` (317 verts au dernier commit), `npm run build` (OK),
`npm run spike` (6/6). Node 22.

## Cassé / en cours

Rien de cassé. 334 tests verts, build OK. Branche poussée sur origin.
