# Matrice de couverture des critères d'acceptation (§11)

Chaque critère d'acceptation raisonnablement automatisable est couvert par au moins un
test. Cette matrice fait le lien entre le CA de la spécification, le comportement vérifié,
et le ou les fichiers de test qui le portent. Les identifiants `CA-NN` apparaissent
littéralement dans les tests, ce qui rend le lien vérifiable :

```
grep -rn "CA-13" packages/*/test packages/*/*/test
```

| CA | Objet | Couvert par |
|----|-------|-------------|
| CA-01 | Commentaire sans label non publiable en `enforce`, bouton et clavier ; un écart de `core/` ne lève pas le blocage | `extension/test/guard.test.ts` |
| CA-02 | Insertion de préfixe : décoration et sujet conservés, curseur en fin de préfixe, sélection restaurée décalée | `extension/test/insertion.test.ts`, `extension/test/editor-controller.test.ts`, `extension/test/review-fixes-extension.test.ts` (§3.4.1 étapes 4-6, changedAt) |
| CA-03 | `issue (non-blocking)` non compté au critère 2 ni au bandeau ni aux indicateurs — décomptes concordants, décompte publié au bandeau | `core/test/evaluate.test.ts`, `extension/test/banner.test.ts`, `core/test/validator.test.ts`, `extension/test/pr-chrome-navigation.test.ts` (décompte publié adopté même arrivé après un premier rendu déjà affiché) |
| CA-04 | `nitpick (blocking)` → `E-CONFLICT`, pas de fil bloquant ; `issue (blocking, non-blocking)` → `E-CONFLICT` + fil bloquant | `core/test/validator.test.ts`, `core/test/evaluate.test.ts` |
| CA-05 | Complétion refusée **par le serveur**, extension désinstallée | `core/test/evaluate.test.ts`, `server/test/orchestrator.test.ts` |
| CA-06 | Parité de verdict — corpus synthétique versionné, deux formes de transport, liste ordonnée (code, sévérité) | `core/test/corpus.test.ts`, `core/test/preprocess.test.ts` |
| CA-07 | Réponse de fil sans label admise avec la configuration par défaut | `core/test/validator.test.ts` |
| CA-08 | Bots de pipeline exemptés (`exemptUsers`, casse insensible) | `core/test/validator.test.ts` |
| CA-09 | Le passage en `warn` n'empêche aucune publication | `core/test/evaluate.test.ts`, `extension/test/editor-controller.test.ts` |
| CA-10 | Exemption journalisée avec auteur et horodatage | `server/test/admin.test.ts`, `server/test/http.test.ts` |
| CA-11 | Dégradation silencieuse : aucun dialogue, aucune exception, contrôles natifs intacts, échec tracé (télémétrie opt-in) | `extension/test/degradation.test.ts`, `extension/test/replay-residuals.test.ts` (ancre de fil, commentaire édité non reconnu), `extension/test/telemetry.test.ts` (journal local écrit dans tous les cas, remontée télémétrique seulement si armée) |
| CA-12 | Parcours clavier : `aria-disabled` et non `disabled` natif — le bouton reste atteignable ; interception du raccourci | `extension/test/editor-controller.test.ts` |
| CA-13 | Résolution par un tiers sans `decision` refusée avec sa cause ; avec `decision` conforme, acceptée | `core/test/evaluate.test.ts` |
| CA-14 | Un dépôt ne peut pas assouplir le mode sous le plancher | `core/test/config.test.ts` |
| CA-15 | PR antérieure à `activatedAt` : aucun statut en échec, extension ne bloque pas même en `enforce` | `core/test/evaluate.test.ts`, `extension/test/guard.test.ts`, `server/test/orchestrator.test.ts` |
| CA-16 | Décoration mal formée → `E-DECORATION-SYNTAX` ; style → un seul `W-DECORATION-STYLE` énumérant ses écarts, publiable | `core/test/validator.test.ts` |
| CA-17 | Trois messages non interchangeables (`E-NO-LABEL` / `E-UNKNOWN-LABEL` / `W-CASE`) | `core/test/validator.test.ts` |
| CA-18 | Parité sur les fins de ligne (`LF` vs `CRLF`), indentation, blancs de fin | `core/test/preprocess.test.ts`, `core/test/corpus.test.ts`, `extension/test/review-fixes-extension.test.ts` (chemin d'écriture : ligne indentée/BOM) |
| CA-19 | Approbation sans texte : aucun diagnostic, check non en échec | `core/test/validator.test.ts` |
| CA-20 | Message de plateforme exempté sans dépendre de `exemptUsers` | `core/test/validator.test.ts`, `server/test/adapters.test.ts` |
| CA-21 | `issue:` en zone non bloquante : validé, `W-NOT-BLOCKABLE`, ne bloque jamais ; `issue (non-blocking)` ne déclenche pas l'avertissement | `core/test/validator.test.ts` |
| CA-22 | Sévérités distinctes : `formatSeverity: warn` n'échoue pas le check ; fil `issue:` non résolu le fait échouer | `core/test/evaluate.test.ts`, `server/test/orchestrator.test.ts` |
| CA-23 | Le serveur lit le mode : `warn` + check obligatoire → PR mergeable, statut vert informatif | `core/test/evaluate.test.ts`, `server/test/orchestrator.test.ts` |
| CA-24 | `{"mode": "off"}` sous plancher `enforce` ignoré, fait signalé | `core/test/config.test.ts` |
| CA-25 | Sortie exploitable : cause identifiable en un clic, dans le corps ou derrière la `targetUrl` | `server/test/http.test.ts` (targetUrl) ; corps humain : `adapters/github` `renderHumanOutput` |
| CA-26 | Exemption habilitée → vert et journalisée ; non habilitée → refusée, étiquette en place ; nouveau fil bloquant → étiquette retirée, échec | `core/test/evaluate.test.ts`, `server/test/orchestrator.test.ts` |
| CA-27 | Retour arrière : `enforce` → `warn` au niveau org débloque sans modifier la protection de branche | `core/test/pinning.test.ts`, `server/test/review-fixes-server.test.ts` (sonde §6.3.3, invalidation automatique), `server/test/http.test.ts` (invalidation manuelle) |
| CA-28 | Ordre des événements : un événement de création reçu après l'édition qui le corrige ne réintroduit pas un statut périmé | `server/test/orchestrator.test.ts` |
| CA-29 | Opt-in par dépôt : jamais évalué + sans fichier → aucun statut ; contre-épreuve : fichier retiré d'un dépôt évalué → neutre `config-vanished` | `core/test/config.test.ts`, `server/test/orchestrator.test.ts` |
| CA-30 | Épinglage : retrait d'un label ne bascule au rouge aucune PR ouverte ; une PR ouverte après applique la nouvelle configuration | `core/test/pinning.test.ts`, `server/test/orchestrator.test.ts` |
| CA-31 | Plancher en direct : durcir `mode` prend effet sur les PR ouvertes ; contre-épreuve `activation.activatedAt` épinglé | `core/test/pinning.test.ts` |
| CA-32 | Décalage visible : deux générations de **configuration** → écart signalé, blocage désarmé ; contre-épreuve deux `core/` même config → blocage actif | `extension/test/guard.test.ts` |
| CA-33 | Anti-cache : label ajouté à la config d'org accepté sans attendre l'expiration du cache | `server/test/orchestrator.test.ts` |
| CA-34 | Rapport à blanc : liste ce qui échouerait, aucun statut publié | `server/test/admin.test.ts`, `server/test/http.test.ts` |
| CA-35 | Brouillon : statut informatif jamais en échec ; sortie du brouillon → contraignant | `core/test/evaluate.test.ts`, `server/test/orchestrator.test.ts` |
| CA-36 | Blocage monotone : `issue:` → `note:` reste bloquant, signalé avec son auteur ; contre-épreuve correction d'`E-CONFLICT` non signalée | `core/test/evaluate.test.ts`, `server/test/orchestrator.test.ts` |
| CA-37 | Bloc de suggestion + phrase libre : conforme sans label, compté `suggestion`, ni `W-MISSING-DECORATION` ni diagnostic de sujet | `core/test/validator.test.ts` |
| CA-38 | Préfixe mal formé : motif exact, jamais `E-NO-LABEL` ; `Attention :` reste `E-NO-LABEL` | `core/test/validator.test.ts` |
| CA-39 | Cohérence de l'exemption sur le chemin de repli : pose ratée → aucune exemption ; étiquette retirée d'une exemption confirmée → restaurée, vert | `core/test/evaluate.test.ts`, `server/test/orchestrator.test.ts`, `server/test/admin.test.ts` |
| CA-40 | Commande adressée à un outil exemptée via `toolCommands` (§4.2, §8.2), vide par défaut : sentinel `/*` pour le slash générique, handle exact (insensible à la casse) pour une mention — une interpellation de personne, un handle absent de la liste, ou une liste non configurée restent des remarques de revue | `core/test/validator.test.ts`, `core/test/corpus.test.ts` (parité A/B sur les deux formes) |

## Critères vérifiés partiellement de façon non automatisée

Deux CA comportent une composante d'interface réelle qui ne peut être pleinement vérifiée
que sur les plateformes authentifiées ; leur **logique** est testée automatiquement, la
composante visuelle relève du smoke test Playwright (§9.4) et d'une vérification manuelle.

- **CA-12 (parcours clavier complet).** L'interception clavier, l'usage d'`aria-disabled`
  plutôt que `disabled`, et l'association `aria-describedby` sont testés
  (`editor-controller.test.ts`). Le *rejeu énuméré* complet (focus → complétion →
  sélection → décoration → envoi → lecture du message) sur les vues réelles relève d'un
  test end-to-end Playwright, à brancher sur les captures du smoke test.
- **CA-25 (sortie exploitable des deux côtés).** La `targetUrl` et le décodage de la ligne
  `cc/1` sont testés ; le rendu du **corps** du check run sur GitHub
  (`renderHumanOutput`) produit les liens permanents attendus, vérifié par lecture — son
  affichage exact dépend du rendu Markdown de la plateforme.

## Comment exécuter

```
npm test                 # suite complète (vitest)
npm run check:ca-matrix  # cette matrice est-elle encore vraie ? (CI : conformance.yml)
npm run spike            # spike P1' dans Chromium (§9.3)
npm run build            # build TypeScript de tous les paquets
```

`check:ca-matrix` échoue si un critère du §11 n'apparaît plus dans aucun test, si une
ligne manque, ou si un fichier nommé ici a été renommé — la matrice ne peut donc pas
devenir déclarative sans que la CI le dise.
