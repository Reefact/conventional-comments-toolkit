# État de reprise du chantier

Référence normative : `specifications-fr.md`. Avancement réel : le repository.
Branche de travail : `claude/implement-specification-fr-2a14q6` (pousser dessus, jamais ailleurs).

## Phase en cours et prochaine action

**Phase : chantier terminé — P0…P6 implémentés, revues adversariales closes.**
Revue core/ : 11 écarts corrigés (`packages/core/test/review-fixes.test.ts`).
Revue serveur/extension : tous les constats confirmés corrigés — lots serveur
(dry-run, page de statut, isInGroup/fetchHeadSha, pagination, parseEvent, AzDO
isInGroup) et extension (§3.4.1 insertion, cache/unreachable, badges/filtre,
racines en édition), puis dernier écart §6.3.3 : sonde `OrgModeWatch` +
`Orchestrator.probeOrgModeSoftening()` — l'assouplissement du mode org est
observé en ≤ 60 s et invalide tout le cache, sans attendre le TTL (CA-27,
`server/test/review-fixes-server.test.ts`).

Les 10 résidus du rejeu des 19 refutes (wf_341acd57-803) sont corrigés (lots
A-G : §3.4.1 étapes 4-6 sur le chemin d'écriture + changedAt ; repli niveau
inférieur sur unreachable §8.1.5 + degradedState options ; raccourcis §5.2
configurables ; filtre §5.5 sur les fils rendus ; GitHub ancre/commentId/
threadId/candidat cohérent ; AzDO editForm sans collision, *.visualstudio.com,
DefaultCollection, /tfs/ ; pagination listOpenPrs AzDO). Non-régression :
`extension/test/replay-residuals.test.ts` + ajouts dans review-fixes-*.

PR ouverte : #2 (`claude/implement-specification-fr-2a14q6` → `main`), sous
surveillance (événements GitHub + check-in horaire). CI ajoutée sur la branche :
`ci.yml`, `conformance.yml`, `extension-package.yml`, `browser-smoke.yml`.

Chantier « B déployable » livré : `bootstrap.ts` (`assembleFromEnv`, variables
CCT_*, multi-plateformes dans une instance) + `main.ts` (SIGTERM propre),
`SqliteStorage` (`node:sqlite` via `process.getBuiltinModule` — les bundlers ne
résolvent pas ce builtin ; tests skip sur Node 20), suite de conformité Storage
commune aux trois implémentations, `/healthz`, Dockerfile multi-étages non-root
(runtime = liens de workspaces seuls, zéro paquet tiers) + job CI de sonde du
conteneur, `docs/deployment-fr.md`. Choix utilisateur consignés : auto-hébergé par
client (jamais de service central multi-clients), stockage sélectionnable
derrière l'interface `Storage` (point d'extension documenté).

Revue adversariale du chantier (43 constats → 38 confirmés) : tous corrigés —
identité d'hôte GHES unique (webHostFromApiBase, adaptateur + bootstrap), arrêt
qui draine les évaluations EN VOL (scheduler.#inFlight) puis ferme le stockage
en dernier, addFirstVerdicts SQLite sans await entre lecture et écriture,
FileStorage strict (corrompu/EACCES = refus, sonde verifyWritable), plateformes
à moitié configurées refusées, CCT_PORT/paths/floor validés (plancher : dernier
contenu valide sur corruption), balayage de réconciliation immédiat, rejeu de
webhooks acquitté (ReplayCache), corps borné 5 Mio, comparaisons à temps
constant (admin + AzDO Basic à utilisateur libre), identités AzDO sur vssps,
panne isInGroup = 503 côté admin, rétention du journal §10 (12 mois, env),
page de statut HTML lisible (JSON sur Accept), clones défensifs MemoryStorage,
Dockerfile uid 10001 + CCT_DATA_DIR + HEALTHCHECK sur CCT_PORT + COPY en
couches, job CI en configuration livrée (volume, verdict HEALTHCHECK, logs
if:always), deployment.md corrigé (portées de jetons, Basic AzDO, VOLUME,
deux canaux du plancher, limite admin/requester documentée).

**Prochaine action concrète :** aucune — déploiement chez le client (A-FAIRE-fr.md).
Sur toute reprise : relire ce fichier, `git log`, et n'ouvrir un chantier que
sur demande explicite.

## Fait

- P1 `core/` complet ; corpus de parité CA-06 versionné dans `core/src/corpus/`.
- P5 serveur complet (orchestrateur 16 étapes, 13 objets de stockage, admin atomique
  §6.3.2, sonde §6.3.3, adaptateurs GitHub/AzDO) + tests.
- P2/P3 extension MV3 + adaptateurs client + garde §5.4 + tests ; P4 indicateurs §12.
- P1' spike réel dans Chromium (`npm run spike`) ; hypothèses restantes et replis :
  `spikes/p1-prime/README-fr.md`.
- Matrice CA-01..CA-39 → tests : `docs/ca-matrix-fr.md` (grep "CA-NN" dans les tests).
- Docs : `docs/architecture-fr.md`, `docs/operations-fr.md`.

## Décisions structurantes (et pourquoi)

- TypeScript strict, monorepo npm workspaces, zéro dépendance runtime (CSP §10,
  auditabilité) ; vitest ; happy-dom pour les tests DOM ; playwright-core + Chromium
  préinstallé pour le spike.
- Toutes les règles dans `@cct/core`, fonctions pures sans I/O ; l'orchestrateur serveur
  arme `forceState` et exécute `actions` (§9.2.2).
- `PlatformOperationalFacts` (serveur) porte les capacités de plateforme du spike
  (provenance étiquettes, voie événementielle, targetUrl requise) — hors contrat
  normatif §9.2.4, injecté à la construction.
- Empreinte = FNV-1a 32 bits (8 hex, format de l'exemple §6.3.1) sur une projection
  triée du domaine clos §9.2.2 ; exemptUsers minusculisés dans l'empreinte.
- Stockage serveur : interface + MemoryStorage/FileStorage (JSON atomique) ;
  `setPinnedConfig` refuse silencieusement la réécriture.
- Exemption chemin de repli : état `pending|confirmed` en stockage ; une `pending`
  rencontrée par une évaluation est supprimée.
- Étage −1 : une `decision` d'un auteur exempté n'est PAS retenue comme decision de
  gouvernance (documenté dans `evaluate.ts` — analyze() rend 'exempt').
- Décision reply : seuls seuils §6.1.1 ; W-SUBJECT-TOO-LONG non appliqué.
- `labels.minimum` du plancher : sémantique « valeur effective » — enabled/
  blockingByDefault forcés à true pour les ids du minimum (revue core, écart 3).
- Slash GitHub : profil `['/azp', '/rebase']` (liste extensible) ; AzDO `[]`.
- §6.3.3 : la détection automatique de l'assouplissement est une SONDE dédiée du
  document d'org (60 s, bornée par le §10), pas un bypass systématique en évaluation —
  « deux situations, et deux seulement » (§8.1.3 règle 3) reste vrai.

## Pièges rencontrés

- Caractères invisibles (BOM, NBSP, U+202F, U+FE0F, ZWJ) : toujours en échappements
  `\uXXXX` dans les sources — des littéraux ont déjà failli se corrompre.
- Le cache de configuration (TTL 3600 s, §8.1.2) retarde l'observation d'un fichier
  disparu/cassé : les tests doivent faire avancer l'horloge injectée (`env.clock`).
- `tsc` composite : erreurs TS7022 sur variables booléennes auto-référencées → annoter.

## Build / tests

`npm install` puis : `npm test` (436 verts), `npm run build` (OK),
`npm run build:extension` (OK), `npm run spike` (6/6). Node 22.

## Cassé / en cours

Rien de cassé, rien en cours. Branche poussée sur origin.
