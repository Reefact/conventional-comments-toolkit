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
| CA-02 | Insertion de préfixe : décoration et sujet conservés, curseur en fin de préfixe, sélection restaurée décalée | `extension/test/insertion.test.ts`, `extension/test/editor-controller.test.ts`, `extension/test/review-fixes-extension.test.ts` (§3.4.1 étapes 4-6, changedAt), `extension/test/toolbar-gestures.test.ts` (le critère PAR LE GESTE : c'est un clic sur un label qu'il décrit) |
| CA-03 | `issue (non-blocking)` non compté au critère 2 ni au bandeau ni aux indicateurs — décomptes concordants, décompte publié au bandeau | `core/test/evaluate.test.ts`, `extension/test/banner.test.ts`, `core/test/validator.test.ts`, `extension/test/pr-chrome-navigation.test.ts` (décompte publié adopté même arrivé après un premier rendu déjà affiché) |
| CA-04 | `nitpick (blocking)` → `E-CONFLICT`, pas de fil bloquant ; `issue (blocking, non-blocking)` → `E-CONFLICT` + fil bloquant | `core/test/validator.test.ts`, `core/test/evaluate.test.ts` |
| CA-05 | Complétion d'une PR à fil `issue:` non résolu refusée **par le vérificateur**, extension désinstallée | `core/test/evaluate.test.ts` |
| CA-06 | Parité de verdict — corpus synthétique versionné, deux formes de transport, liste ordonnée (code, sévérité) | `core/test/corpus.test.ts`, `core/test/preprocess.test.ts` |
| CA-07 | Réponse de fil sans label admise avec la configuration par défaut | `core/test/validator.test.ts` |
| CA-08 | Bots de pipeline exemptés (`exemptUsers`, casse insensible) | `core/test/validator.test.ts` |
| CA-09 | Le passage en `warn` n'empêche aucune publication | `core/test/evaluate.test.ts`, `extension/test/editor-controller.test.ts` |
| CA-10 | Exemption attribuée et datée sur la PR elle-même — étiquette, auteur, horodatage — et le statut publié les nomme | *(aucun — critère du vérificateur, retiré ; #56)* |
| CA-11 | Dégradation silencieuse : aucun dialogue, aucune exception, contrôles natifs intacts, échec tracé (télémétrie opt-in) | `extension/test/degradation.test.ts`, `extension/test/replay-residuals.test.ts` (ancre de fil, commentaire édité non reconnu), `extension/test/telemetry.test.ts` (journal local écrit dans tous les cas, remontée télémétrique seulement si armée), `extension/test/changes-view-composer.test.ts` (chaîne `editors` qui ne reconnaît plus le composeur : trace au journal, rien à l'écran), `extension/test/changes-view-thread.test.ts` (corps, auteur et commentaires d'un fil devenus illisibles : trace, et repli jamais silencieux), `extension/test/selector-journal-page.test.ts` (la trace porte l'adresse de la page, relue au moment de la dégradation), `extension/test/options-journal.test.ts` (ce que la page d'options en montre, et son effacement) |
| CA-12 | Parcours clavier : `aria-disabled` et non `disabled` natif — le bouton reste atteignable ; interception du raccourci | `extension/test/editor-controller.test.ts` |
| CA-13 | Résolution par un tiers sans `decision` refusée avec sa cause ; avec `decision` conforme, acceptée | `core/test/evaluate.test.ts` |
| CA-14 | Un dépôt ne peut pas assouplir le mode sous le plancher | `core/test/config.test.ts` |
| CA-15 | PR antérieure à `activatedAt` : aucun statut en échec, extension ne bloque pas même en `enforce` | `core/test/evaluate.test.ts`, `extension/test/guard.test.ts` |
| CA-16 | Décoration mal formée → `E-DECORATION-SYNTAX` ; style → un seul `W-DECORATION-STYLE` énumérant ses écarts, publiable | `core/test/validator.test.ts` |
| CA-17 | Trois messages non interchangeables (`E-NO-LABEL` / `E-UNKNOWN-LABEL` / `W-CASE`) | `core/test/validator.test.ts` |
| CA-18 | Parité sur les fins de ligne (`LF` vs `CRLF`), indentation, blancs de fin | `core/test/preprocess.test.ts`, `core/test/corpus.test.ts`, `extension/test/review-fixes-extension.test.ts` (chemin d'écriture : ligne indentée/BOM) |
| CA-19 | Approbation sans texte : aucun diagnostic, check non en échec | `core/test/validator.test.ts` |
| CA-20 | Message de plateforme exempté sans dépendre de `exemptUsers` | `core/test/validator.test.ts` |
| CA-21 | `issue:` en zone non bloquante : validé, `W-NOT-BLOCKABLE`, ne bloque jamais ; `issue (non-blocking)` ne déclenche pas l'avertissement | `core/test/validator.test.ts` |
| CA-22 | Sévérités distinctes : `formatSeverity: warn` n'échoue pas le check ; fil `issue:` non résolu le fait échouer | `core/test/evaluate.test.ts` |
| CA-23 | Le **vérificateur** lit le mode : `warn` + check obligatoire → PR mergeable, statut vert informatif | `core/test/evaluate.test.ts` |
| CA-24 | `{"mode": "off"}` sous plancher `enforce` ignoré, fait signalé | `core/test/config.test.ts` |
| CA-25 | Sortie exploitable : chaque fil bloquant non résolu et chaque diagnostic de format identifiables en un clic au plus, dans le corps du check run | *(aucun — critère du vérificateur, retiré ; #56)* |
| CA-26 | Exemption habilitée → vert ; non habilitée → refusée, étiquette en place ; fil bloquant dont la racine est **postérieure à la pose** → étiquette retirée, échec | `core/test/evaluate.test.ts` |
| CA-27 | Retour arrière : `enforce` → `warn` au niveau org débloque sans modifier la protection de branche de chaque dépôt | `core/test/live-config.test.ts` |
| CA-28 | Une évaluation ne s'appuie jamais sur le contenu de l'événement : un commentaire corrigé avant l'exécution produit un statut conforme | *(aucun — critère du vérificateur, retiré ; #56)* |
| CA-29 | Activation non datée : aucun niveau ne résout `activation.activatedAt` — fichier absent, ou présent mais muet — → neutre `activation-undated`, quel que soit le mode | `core/test/config.test.ts` |
| CA-30 | Configuration en direct : une modification mergée sur la branche par défaut s'applique **immédiatement**, aux PR déjà ouvertes comprises, dans les deux sens | `core/test/live-config.test.ts` |
| CA-31 | Plancher en direct : durcir `mode` prend effet sur les PR ouvertes ; contre-épreuve dans l'**autre sens** — l'assouplir vaut aussi immédiatement, ce qu'un cliquet raterait | `core/test/live-config.test.ts` |
| CA-32 | Décalage visible : deux générations de **configuration** → écart signalé, blocage désarmé ; contre-épreuve deux `core/` même config → blocage actif | `extension/test/guard.test.ts` |
| CA-33 | Anti-cache sur rejet : le vérificateur n'a pas de cache et accepte le label à la première évaluation (contre-épreuve du §11). Le volet extension — bypass avant rejet, §8.1.3 règle 3 — reste à implémenter | *(aucun — critère du vérificateur, retiré ; #56)* |
| CA-34 | Mesurer avant de contraindre : en `warn`, statut jamais en échec dont le corps liste ce qui échouerait sous `enforce`, avec les liens permanents | *(aucun — critère du vérificateur, retiré ; #56)* |
| CA-35 | Brouillon : statut informatif jamais en échec ; sortie du brouillon → contraignant | `core/test/evaluate.test.ts` |
| CA-36 | Le verdict se lit de l'état courant : éditer `issue:` en `note:` rend le fil non bloquant au tour suivant, et **rien n'est signalé** | `core/test/evaluate.test.ts` |
| CA-37 | Bloc de suggestion + phrase libre : conforme sans label, compté `suggestion`, ni `W-MISSING-DECORATION` ni diagnostic de sujet | `core/test/validator.test.ts` |
| CA-38 | Préfixe mal formé : motif exact, jamais `E-NO-LABEL` ; `Attention :` reste `E-NO-LABEL` | `core/test/validator.test.ts` |
| CA-40 | Commande adressée à un outil exemptée via `toolCommands` (§4.2, §8.2), vide par défaut : sentinel `/*` pour le slash générique, handle exact (insensible à la casse) pour une mention — une interpellation de personne, un handle absent de la liste, ou une liste non configurée restent des remarques de revue | `core/test/validator.test.ts`, `core/test/corpus.test.ts` (parité A/B sur les deux formes) |
| CA-41 | Labels ajoutés désactivés par un dépôt : eux seuls deviennent des mots inconnus, les labels actifs restants sont ceux de Conventional Comments plus `decision` ; empreinte par défaut littérale `c2245ec0`, labels ajoutés désactivés `0c89180f` ; contre-épreuve — aucune entrée n'est omise de la projection ; les labels ajoutés sont ceux des deux tableaux du §3.2 | `core/test/response-labels.test.ts`, `core/test/corpus.test.ts` (cas `response-label-*`, parité LF/CRLF) |
| CA-42 | Vocabulaire actif : mêmes diagnostics que tout label, aucun code nouveau, alias reconnu sans diagnostic, jamais bloquant, mode inchangé ; le type `reply` ne change ni diagnostic ni empreinte | `core/test/response-labels.test.ts`, `core/test/corpus.test.ts` |
| CA-43 | Orthogonalité avec `scope.validateReplies` : réponse de fil non validée, vocabulaire actif ou désactivé ; le barreau de l'étage −2 reste `decision` seul | `core/test/response-labels.test.ts`, `core/test/corpus.test.ts` |
| CA-44 | Le plancher force `enabled` sans rendre bloquant un label livré toujours non bloquant ; contre-épreuves — `issue` planché non désarmable par `alwaysNonBlocking: true`, `decision` planché non bloquant | `core/test/response-labels.test.ts` |
| CA-45 | Le dépôt garde la maîtrise : un seul label désactivé, réactivation contre l'organisation, surcharge partielle, type compris ; ombrage — l'identifiant l'emporte sur l'alias, l'ordre ne décide d'aucun verdict, un alias ne masque pas un `issue` planché, un label désactivé ne retire rien ; migration d'un `done` préexistant | `core/test/response-labels.test.ts` |
| CA-46 | Désactivation et réactivation en direct : `E-UNKNOWN-LABEL` en zone validée, rien dans une réponse non validée ; aucun label de réponse ne peut rendre une racine bloquante | `core/test/response-labels.test.ts` |
| CA-47 | Une abréviation livrée ne se déplie que vers un label actif (`?do`, et le défaut antérieur `?ty`/`?po`/`?qui`) ; une abréviation écrite par une configuration n'est pas concernée | `extension/test/quickinput-response-labels.test.ts` |
| CA-48 | Les réponses sur leur propre ligne, sous un trait : rangée `reply` à part, sous les remarques et au-dessus des décorations ; le type range le bouton, pas l'identifiant ; sans label `reply` actif, ni rangée ni trait simple, sans label `remark`, pas de trait simple ; double trait au-dessus des décorations, absent sans aucun label actif ; mesuré — réponses toujours sous la dernière remarque, trait simple entre les deux, double trait au-dessus des décorations, tous deux sur toute la largeur, à douze largeurs | `extension/test/toolbar-layout.test.ts` (structure), `spikes/composer-layout.mjs` (`npm run check:composer-layout`, mesure dans Chromium) |
| CA-49 | Le type d'un label : `reply` déclaré retenu, `remark` par défaut, type livré conservé à la redéclaration, toute autre valeur rend la configuration invalide | `core/test/response-labels.test.ts` |
| CA-50 | Ordre des boutons : par défaut celui de la configuration ; une préférence personnelle, une seule liste, place des labels en tête de leur groupe ; lecture — virgules, espaces supprimés, casse ignorée, doublon compté une fois, jeton invalide écarté ; inconnu, désactivé ou alias ne place rien ; un label déclaré `reply` reste dans sa zone ; la barre, la liste de complétion et le contrôleur suivent le même ordre | `extension/test/label-order.test.ts`, `extension/test/editor-controller.test.ts` |

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
