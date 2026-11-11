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
| CA-01 | Commentaire sans label non publiable en `enforce`, bouton et clavier, configuration lue sans repli dégradé — sans date d'activation, quel que soit l'âge de la PR | `extension/test/guard.test.ts`, `extension/test/editor-controller.test.ts` |
| CA-02 | Insertion de préfixe : décoration et sujet conservés, curseur en fin de préfixe, sélection restaurée décalée | `extension/test/insertion.test.ts`, `extension/test/editor-controller.test.ts`, `extension/test/review-fixes-extension.test.ts` (§3.4.1 étapes 4-6, changedAt), `extension/test/toolbar-gestures.test.ts` (le critère PAR LE GESTE : c'est un clic sur un label qu'il décrit) |
| CA-03 | `issue (non-blocking)` compté ni par `isBlocking()` ni par le bandeau — les deux décomptes concordent, le bandeau ne lisant que les fils de la page | `core/test/validator.test.ts`, `extension/test/banner.test.ts`, `extension/test/pr-chrome-navigation.test.ts` (fils arrivés après un premier rendu déjà affiché, adoptés) |
| CA-04 | `nitpick (blocking)` → `E-CONFLICT`, pas de fil bloquant ; `issue (blocking, non-blocking)` → `E-CONFLICT` + fil bloquant | `core/test/validator.test.ts` |
| CA-06 | Non-régression du transport — corpus synthétique versionné ; chaque cas entre, sous la forme d'un champ de saisie (`LF`), par les frontières d'adaptateur de SA plateforme (contexte par `observeEditors()` sur une page capturée, corps par `readValue()`, configuration par `getRepoConfig()`/`getOrgConfig()` sur la route mesurée), et le verdict est celui du contrôleur d'éditeur — liste ordonnée (code, sévérité) | `core/test/corpus.test.ts`, `core/test/preprocess.test.ts`, `tests/parity-adapters.test.ts` |
| CA-07 | Réponse de fil sans label admise avec la configuration par défaut | `core/test/validator.test.ts` |
| CA-08 | Bots de pipeline exemptés (`exemptUsers`, casse insensible) | `core/test/validator.test.ts` |
| CA-09 | Le mode `assist` — et `warn`, son alias, lu comme `assist` avec un avis — n'empêche aucune publication | `core/test/config.test.ts`, `extension/test/editor-controller.test.ts` |
| CA-11 | Dégradation silencieuse : aucun dialogue, aucune exception, contrôles natifs intacts, échec tracé (télémétrie opt-in) | `extension/test/degradation.test.ts`, `extension/test/replay-residuals.test.ts` (ancre de fil, commentaire édité non reconnu), `extension/test/telemetry.test.ts` (journal local écrit dans tous les cas, remontée télémétrique seulement si armée), `extension/test/changes-view-composer.test.ts` (chaîne `editors` qui ne reconnaît plus le composeur : trace au journal, rien à l'écran), `extension/test/changes-view-thread.test.ts` (corps, auteur et commentaires d'un fil devenus illisibles : trace, et repli jamais silencieux), `extension/test/selector-journal-page.test.ts` (la trace porte l'adresse de la page, relue au moment de la dégradation), `extension/test/options-journal.test.ts` (ce que la page d'options en montre, la copie d'une ligne, l'archive de diagnostic téléchargée, et son effacement), `extension/test/diagnostic-report.test.ts` (la forme du rapport d'une ligne et du contenu de l'archive), `extension/test/skeletons.test.ts` (le squelette de page tient dans son budget et cède devant le quota, jamais la ligne), `extension/test/zip.test.ts` (l'archive se relit par un outil tiers), `extension/test/journal-problems.test.ts` (chaque identifiant du vocabulaire et chaque contexte d'erreur a sa phrase, dans les deux langues), `extension/test/error-capture.test.ts` (une exception est relevée avec ce que le code faisait, une seule fois, et relancée), `adapters/github/test/journal-problems.test.ts` et `adapters/azdo/test/journal-problems.test.ts` (toute chaîne journalisable déclare à quoi elle sert), `adapters/github/test/guard-entry.test.ts` et `adapters/azdo/test/guard-entry.test.ts` (le balayage des champs passe par l'enrobage injecté, pour relever une exception avec son contexte), `adapters/azdo/test/real-pages.test.ts` (sur les captures : une page saine n’écrit rien au journal, PR abandonnée comprise), `extension/test/submit-controls-journal.test.ts` (un éditeur sans aucun contrôle d’envoi est journalisé par le contrôleur partagé), `extension/test/submit-controls-journal-github.test.ts`, `-azdo.test.ts` et `-gitlab.test.ts` (sur les captures de chaque plateforme : une page saine n’écrit rien, la même privée de ses boutons d’envoi écrit la ligne), `adapters/github/test/editor-zone.test.ts`, `adapters/azdo/test/editor-zone.test.ts` et `adapters/gitlab/test/editor-zone.test.ts` (un champ que le repli de zone classe sans l’avoir reconnu est journalisé, et garde sa zone ; aucune capture saine ne l’écrit) |
| CA-12 | Parcours clavier : `aria-disabled` et non `disabled` natif — le bouton reste atteignable ; interception du raccourci | `extension/test/editor-controller.test.ts` |
| CA-14 | Un dépôt ne peut pas assouplir le mode sous le plancher | `core/test/config.test.ts` |
| CA-16 | Décoration mal formée → `E-DECORATION-SYNTAX` ; style → un seul `W-DECORATION-STYLE` énumérant ses écarts, publiable | `core/test/validator.test.ts` |
| CA-17 | Trois messages non interchangeables (`E-NO-LABEL` / `E-UNKNOWN-LABEL` / `W-CASE`) | `core/test/validator.test.ts` |
| CA-18 | Fins de ligne, au niveau de `core/` (§3.4.1) : le même commentaire sous forme de champ (`LF`) et de corps stocké (`CRLF`) produit le même verdict ; indentation, blancs de fin | `core/test/corpus.test.ts`, `core/test/preprocess.test.ts`, `extension/test/review-fixes-extension.test.ts` (chemin d'écriture : ligne indentée/BOM) |
| CA-19 | Approbation sans texte : aucun diagnostic, donc aucun blocage d'envoi en `enforce` (§5.4 ne bloque que sur erreur) | `core/test/validator.test.ts` |
| CA-20 | Message de plateforme exempté sans dépendre de `exemptUsers` | `core/test/validator.test.ts` |
| CA-21 | `issue:` en zone non bloquante : validé, `W-NOT-BLOCKABLE`, jamais compté au bandeau ; `issue (non-blocking)` ne déclenche pas l'avertissement | `core/test/validator.test.ts`, `extension/test/banner.test.ts` |
| CA-24 | `{"mode": "off"}` sous plancher `enforce` ignoré, fait signalé | `core/test/config.test.ts` |
| CA-27 | Assouplissement sans attente : organisation en cache en `enforce`, passée à `assist` — l'envoi est retenu, la configuration relue sans cache, le contrôle libéré avec un message invitant à renvoyer (second geste, aucun rejeu) ; contre-épreuve, configuration inchangée : reste bloqué ; une seule relecture en vol, aucune à la frappe ; un geste clavier retenu l'est tout entier (relâchement et clic compris), seul un nouveau geste passe ; la relecture écarte aussi le cache HTTP du navigateur (`cache: reload`, mesuré par `npm run check:config-cache-bypass`) | `extension/test/editor-controller.test.ts`, `extension/test/config-bypass-cache.test.ts`, `extension/test/org-config-relay.test.ts` (relais), `extension/test/review-fixes-extension.test.ts` (la relecture contourne le cache et ne rejoint pas une lecture ordinaire en vol), `core/test/live-config.test.ts` (résolution de l'assouplissement) |
| CA-30 | Configuration en direct : une modification mergée sur la branche par défaut s'applique, aux PR déjà ouvertes comprises, dans les deux sens, dès que l'extension la lit | `core/test/live-config.test.ts` |
| CA-31 | Plancher en direct : durcir `mode` prend effet sur les PR ouvertes ; contre-épreuve dans l'**autre sens** — l'assouplir vaut tout aussi bien, ce qu'un cliquet raterait | `core/test/live-config.test.ts` |
| CA-33 | Anti-cache sur rejet : un label ajouté par l'organisation est accepté dès la première saisie qu'il aurait fallu bloquer — relecture sans cache avant le blocage, cache réécrit | `extension/test/editor-controller.test.ts` |
| CA-36 | Le verdict se lit de l'état courant : éditer `issue:` en `note:` rend le fil non bloquant (`isBlocking()`), et **rien n'est signalé** | `core/test/validator.test.ts` |
| CA-37 | Bloc de suggestion + phrase libre : conforme sans label, compté `suggestion`, ni `W-MISSING-DECORATION` ni diagnostic de sujet | `core/test/validator.test.ts` |
| CA-38 | Préfixe mal formé : motif exact, jamais `E-NO-LABEL` ; `Attention :` reste `E-NO-LABEL` | `core/test/validator.test.ts` |
| CA-40 | Commande adressée à un outil exemptée via `toolCommands` (§4.2, §8.2), vide par défaut : sentinel `/*` pour le slash générique, handle exact (insensible à la casse) pour une mention — une interpellation de personne, un handle absent de la liste, ou une liste non configurée restent des remarques de revue | `core/test/validator.test.ts`, `core/test/corpus.test.ts` (les deux formes de transport) |
| CA-41 | Labels ajoutés désactivés par un dépôt : eux seuls deviennent des mots inconnus, les labels actifs restants sont ceux de Conventional Comments plus `decision` ; les labels ajoutés sont ceux des deux tableaux du §3.2 | `core/test/response-labels.test.ts` |
| CA-42 | Vocabulaire actif : mêmes diagnostics que tout label, aucun code nouveau, alias reconnu sans diagnostic, jamais bloquant, mode inchangé ; le type `reply` ne change aucun diagnostic | `core/test/response-labels.test.ts`, `core/test/corpus.test.ts` |
| CA-43 | Orthogonalité avec `scope.validateReplies` : réponse de fil non validée, vocabulaire actif ou désactivé ; le barreau de l'étage −2 reste `decision` seul | `core/test/response-labels.test.ts`, `core/test/corpus.test.ts` |
| CA-44 | Le plancher force `enabled` sans rendre bloquant un label livré toujours non bloquant ; contre-épreuves — `issue` planché non désarmable par `alwaysNonBlocking: true`, `decision` planché non bloquant | `core/test/response-labels.test.ts` |
| CA-45 | Le dépôt garde la maîtrise : un seul label désactivé, réactivation contre l'organisation, surcharge partielle, type compris ; ombrage — l'identifiant l'emporte sur l'alias, l'ordre ne décide d'aucun verdict, un alias ne masque pas un `issue` planché, un label désactivé ne retire rien ; migration d'un `done` préexistant | `core/test/response-labels.test.ts` |
| CA-46 | Désactivation et réactivation en direct : `E-UNKNOWN-LABEL` en zone validée, rien dans une réponse non validée ; avec leurs drapeaux livrés, aucun label de réponse ne peut rendre une racine bloquante — contre-épreuve : un `done` redéclaré bloquant l'est | `core/test/response-labels.test.ts` |
| CA-47 | Une abréviation livrée ne se déplie que vers un label actif (`?do`, et le défaut antérieur `?ty`/`?po`/`?qui`) ; une abréviation écrite par une configuration n'est pas concernée | `extension/test/quickinput-response-labels.test.ts` |
| CA-48 | Les réponses sur leur propre ligne, sous un trait : rangée `reply` à part, sous les remarques et au-dessus des décorations ; le type range le bouton, pas l'identifiant ; sans label `reply` actif, ni rangée ni trait simple, sans label `remark`, pas de trait simple ; double trait au-dessus des décorations, absent sans aucun label actif ; mesuré — réponses toujours sous la dernière remarque, trait simple entre les deux, double trait au-dessus des décorations, tous deux sur toute la largeur, à douze largeurs | `extension/test/toolbar-layout.test.ts` (structure), `spikes/composer-layout.mjs` (`npm run check:composer-layout`, mesure dans Chromium) |
| CA-49 | Le type d'un label : `reply` déclaré retenu, `remark` par défaut, type livré conservé à la redéclaration, toute autre valeur rend la configuration invalide | `core/test/response-labels.test.ts` |
| CA-50 | Ordre des boutons : par défaut celui de la configuration ; une préférence personnelle, une seule liste, place des labels en tête de leur groupe ; lecture — virgules, espaces supprimés, casse ignorée, doublon compté une fois, jeton invalide écarté ; inconnu, désactivé ou alias ne place rien ; un label déclaré `reply` reste dans sa zone ; la barre, la liste de complétion et le contrôleur suivent le même ordre | `extension/test/label-order.test.ts`, `extension/test/editor-controller.test.ts` |
| CA-51 | Marqueur de session reconnu seul sur n'importe quelle ligne — dernière (zéro, une ou plusieurs lignes blanches après), milieu, avant un pied de signature, au-dessus du préfixe —, `LF` ou `CRLF`, valeur libre non vide ; retiré avec sa fin de ligne ; au-dessus du préfixe, même verdict qu'en bas ; non reconnu en ligne, en bloc de code ou en citation, valeur vide, autre forme — texte ordinaire, aucun diagnostic | `core/test/session.test.ts` |
| CA-52 | La métadonnée ne satisfait aucune exigence : `W-NO-DISCUSSION` et `E-EMPTY-SUBJECT` subsistent, corps réduit au marqueur exempté, `allowlistPatterns` sur le corps sans lui ; label, décorations, caractère bloquant, décompte des fils bloquants et `decision` inchangés | `core/test/session.test.ts` |
| CA-53 | Affichage : marqueur masqué là où il est, sans trace (paragraphe entier, ou ligne avec le saut qui la termine ; mesuré dans Chromium au milieu du corps, au milieu d'un paragraphe, au-dessus du préfixe), une mention `🤖 session: <valeur en minuscules>` en bas du corps, sous un pied de signature, icône configurable, corps relu inchangé, idempotent, reposé après réhydratation ou déplacement ; rien sans marqueur ; défait (extension inactive, forme non déclarée, marqueur disparu) ; repli sans projection (mis en forme, liste, code, citation, texte mis en forme sur la ligne) | `extension/test/session-marker.test.ts`, `spikes/session-line.mjs` |
| CA-54 | Marqueur en double : aucune session, toutes les lignes retirées, `W-SESSION-MULTIPLE` en avertissement après les contrôles de contenu, jamais porté à `error` par `severities` (dépôt, plancher), jamais sur un commentaire exempté ou en zone éteinte ; affichage `🤖 session: #ERROR`, message au survol, toutes les lignes masquées ou aucune, défait sans trace, doublon corrigé | `core/test/session.test.ts`, `extension/test/session-marker.test.ts` |

## Critères vérifiés partiellement de façon non automatisée

Un CA comporte une composante d'interface réelle qui ne peut être pleinement vérifiée
que sur les plateformes authentifiées ; sa **logique** est testée automatiquement, la
composante visuelle relève du smoke test Playwright (§9.4) et d'une vérification manuelle.

- **CA-12 (parcours clavier complet).** L'interception clavier, l'usage d'`aria-disabled`
  plutôt que `disabled`, et l'association `aria-describedby` sont testés
  (`editor-controller.test.ts`). Le *rejeu énuméré* complet (focus → complétion →
  sélection → décoration → envoi → lecture du message) sur les vues réelles relève d'un
  test end-to-end Playwright, à brancher sur les captures du smoke test.

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
