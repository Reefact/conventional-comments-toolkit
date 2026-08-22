# État de reprise du chantier

Référence normative : `specifications-fr.md`. Avancement réel : le repository.
Branche de travail : `claude/implement-specification-fr-2a14q6` (pousser dessus, jamais ailleurs).

## Phase en cours et prochaine action

**Phase : revue de conformité finale (post-implémentation) et corrections.**
Toutes les phases de code (P1, P1', P2, P3, P4, P5) sont implémentées et testées ; voir
le tableau de statut du README.

**Prochaine action concrète :** corriger les écarts confirmés par la revue adversariale
de `core/` contre la spec, puis ajouter un test par écart corrigé. Constats déjà produits
(9, en attente de contre-vérification au moment de l'interruption éventuelle — si la liste
des verdicts n'est plus disponible, re-vérifier chaque constat directement contre la spec
avant de corriger) :

1. **exemption admise n'éteint pas le critère 1** (`core/src/evaluate.ts`, calcul de `state`) —
   §6.3.2 « le statut passe au vert » : `crit1Failed` doit être neutralisé par `appliedExemption`. RÉEL, à corriger.
2. **plancher `severities` impose sa valeur même quand aucun niveau n'écrit** et peut ainsi
   descendre sous le défaut du tableau §3.5.2 (`config/floor.ts`, branche `current === undefined`) — vérifier : le plancher est un minimum, comparer au défaut du code.
3. **plancher `labels.minimum` n'agit que sur les valeurs écrites** (`floor.ts` + `written`) —
   relire §8.1.1 : lecture littérale retenue (« passer à false ») ; l'écart signalé porte sur une valeur héritée d'un niveau précédent — à trancher contre la spec.
4. **`hasNestedQuantifier` compte le `?` de `(?:`/`(?=`/`(?<` comme quantificateur** (`config/schema.ts`) — RÉEL, faux rejets d'allowlist.
5. limite basse E- non appliquée quand floorVersion non supportée (mineur).
6. clés inconnues imbriquées sans avertissement dans shortcuts/telemetry/exemptionLog/labels (mineur).
7. **`resolverOverrideGroup` : intersection épinglée incorrecte** (`config/pinning.ts`) — restriction appliquée en direct au lieu d'épinglée ; relire §8.1.3 tableau (« restriction de l'habilitation : restrictif→épinglé »). RÉEL probable.
8. **mélange `severities` matérialise des entrées égales au défaut → écart d'empreinte fabriqué** (`config/pinning.ts`) — vérifier avec `fingerprint()`.
9. `labels[].icon` en direct vs clause de fermeture (mineur — la clause liste `labels[].color` seulement ; décider et documenter).

Le journal de la revue (verdicts refuted/confirmed) vit hors repo :
`~/.claude/projects/.../workflows/wf_e23cebd6-359/journal.jsonl` — s'il a disparu, re-vérifier à la main.

Ensuite : revue équivalente ciblée serveur/extension (divergences A/B, §6.4), puis pousser.

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
- `labels.minimum` du plancher : lecture littérale — n'annule que les écritures org/repo de `false`, ne force pas un défaut produit à true (documenté dans floor.ts).
- Slash GitHub : profil avec `['/azp']` (liste extensible) ; AzDO `[]`.

## Pièges rencontrés

- Caractères invisibles (BOM, NBSP, U+202F, U+FE0F, ZWJ) : toujours en échappements `\uXXXX` dans les sources — des littéraux ont déjà failli se corrompre.
- Le cache de configuration (TTL 3600 s, §8.1.2) retarde l'observation d'un fichier disparu/cassé : les tests doivent faire avancer l'horloge injectée (`env.clock`).
- `tsc` composite : erreurs TS7022 sur variables booléennes auto-référencées → annoter.

## Build / tests

`npm install` puis : `npm test` (317 verts au dernier commit), `npm run build` (OK),
`npm run spike` (6/6). Node 22.

## Cassé / en cours

Rien de cassé ; working tree propre au moment de l'écriture. Corrections de la revue non
commencées. Le repo n'a pas encore été poussé vers origin depuis le début du chantier.
