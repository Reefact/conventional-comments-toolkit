# Architecture

Découpage conforme au §9.1. `packages/core/` est publié comme paquet et consommé **à
l'identique** par l'extension (composant A) et par le compagnon serveur (composant B) —
aucune règle de validation n'est dupliquée hors de ce paquet.

```
packages/
├── core/                     # @cct/core — aucune dépendance DOM ni plateforme (§9.1)
│   ├── preprocess.ts         #   §3.4.1 prétraitement normatif
│   ├── regex.ts              #   §3.4.2 expression régulière de référence
│   ├── parser.ts             #   §3.2/§3.3 labels, décorations, alias
│   ├── validator.ts          #   §3.5 validation en étages, codes, précédence bloquante
│   ├── evaluate.ts           #   §6 deux critères, gouvernance, monotonie, exemption
│   ├── summary.ts            #   §6.3.1 ligne machine cc/1 (encode/decode)
│   ├── config/               #   §8 défauts, schéma, fusion, plancher, épinglage, empreinte
│   ├── corpus/               #   CA-06 corpus de parité synthétique versionné
│   └── i18n/                 #   fr / en
├── adapters/
│   ├── shared/               # @cct/adapter-shared — contrat §9.2.3, écriture §9.3, sélecteurs §9.4
│   ├── github/               # @cct/adapter-github — sélecteurs, générations DOM, Turbo (§A)
│   └── azdo/                 # @cct/adapter-azdo — MutationObserver, replis P1' (§B)
├── extension/                # @cct/extension — MV3, content/background, barre, pastille, garde
└── server/                   # @cct/server — composant B
    ├── compliance/           #   orchestrateur §6.4, stockage, cache, admin, indicateurs
    └── adapters/
        ├── github/           #   GraphQL fils, check run (§A.6, §A.8)
        └── azdo/             #   PR Status, chemin de repli étiquettes (§B.5-B.7)
```

## Frontière A/B et parité (§2, §8.1.3)

La règle de conception du §2 — « un commentaire jugé conforme par l'extension doit
toujours être jugé conforme par le serveur, et réciproquement » — tient par construction :

1. **Même parseur.** `validate()`, `isBlocking()`, `evaluate()`, `fingerprint()`,
   `resolveConfig()`, `encodeSummary()`/`decodeSummary()` vivent tous dans `core/` et sont
   appelés à l'identique des deux côtés (`packages/core/src/index.ts`).
2. **Même configuration.** Les deux composants résolvent les **trois** mêmes niveaux
   (plancher, organisation, dépôt) via `resolveConfig()`. Le composant A n'épingle pas
   (`pinned: null`, `previouslyEvaluated: false`).
3. **Empreinte comparée.** Le composant B publie `configFingerprint` dans la ligne `cc/1` ;
   l'extension la relit dans le DOM et la compare à la sienne. En cas d'écart, elle cesse
   de bloquer l'envoi et le signale (§8.1.3, règle 2) — jamais un rejet que la source de
   vérité n'aurait pas prononcé.
4. **Exception bornée.** Le temps qu'une modification restrictive se propage, l'extension
   peut être momentanément plus stricte que le serveur ; elle le signale et cesse de
   bloquer (§2, §8.1.3).

`core/` ne fait **aucune** entrée-sortie : tout ce qu'il ne peut pas lire lui-même
(configuration épinglée, fils déjà observés, verdicts de première observation, brouillon,
exemption) entre par `EvaluationInput`/`EvaluationContext`, et les effets à exécuter
sortent par `ComplianceResult.actions`. Un adaptateur traduit et transporte ; il ne juge
jamais (§9.2.4).

## Séquence d'exécution du composant B (§6.4)

La séquence en seize étapes du §6.4 est portée par `compliance/orchestrator.ts` et
`compliance/scheduler.ts` :

- **Étapes 1-4** (scheduler) : trois sources de déclenchement, séquence monotone par PR,
  coalescence sur `coalesceWindowSeconds` — l'évaluation coalescée porte la plus haute des
  séquences.
- **Étapes 5-6** : relecture de l'état courant ; en cas d'incapacité, `degradedSince` puis
  délai de grâce avant un statut neutre `grace-expired`.
- **Étape 7** : `resolveConfig()`.
- **Étape 8** : périmètre d'installation — un dépôt jamais évalué et sans fichier arrête
  le cycle.
- **Étapes 9-12** : `forceState` armé depuis les notices, appartenances pré-résolues,
  `evaluate()`, seconde passe sans cache avant un rejet dépendant de la configuration.
- **Étape 13** : persistance de l'état de calcul (configuration épinglée écrite une seule
  fois, verdicts de première observation, ensemble des fils bloquants).
- **Étapes 14-16** : quatre portes (séquence, mode, SHA relu, idempotence), publication,
  puis persistance du publié et exécution des actions — le drapeau « déjà évalué » posé
  **après** la publication, jamais avant.

## Stockage (§6.4)

`compliance/storage.ts` porte les treize objets persistants du §6.4, avec deux
implémentations : `MemoryStorage` (tests) et `FileStorage` (JSON, écriture atomique). Le
choix de la technologie est libre ; l'existence de ce stockage ne l'est pas.

## Points de plateforme et replis (spike P1')

`PlatformOperationalFacts` (dans `compliance/adapter.ts`) porte les hypothèses de
plateforme que le spike doit établir, chacune avec son repli normatif déjà codé — voir
`spikes/p1-prime/README-fr.md`. `githubFacts` et `azdoFacts` en donnent les valeurs connues.

## Deux niveaux de séparation par plateforme

**Niveau 1 — entre plateformes.** Ce qui DÉCRIT une plateforme vit dans son paquet ; ce qui
décrit le produit est partagé et ne connaît personne. Le critère de partage n'est pas une liste
de fichiers mais la motivation du changement : « GitHub a bougé » va dans `adapters/github/`,
« notre produit doit se comporter autrement » va dans le code partagé.

Trois choses vivent donc par plateforme, et une seule y vivait avant :

| | Où | Comment le partagé y accède |
|---|---|---|
| Sélecteurs DOM | `adapters/<p>/src/selectors.ts` | jamais directement |
| Placement et forme du rendu | idem, via `getEditorChrome()` / `renderedBodyShape()` (§9.2.3) | par le port, qui rend des DONNÉES |
| Couleurs, rayons, longueurs | `adapters/<p>/src/platform.css` | par des variables `--cct-*` |

Le port transporte des **données**, jamais un drapeau nommant une plateforme : une signature
`isGitHubChangesView()` obligerait le code partagé à savoir de qui il parle, et le conditionnel
que le polymorphisme supprime reviendrait sous un autre nom. Le seul `if` de plateforme admis est
le composition root (`content-internal.ts`), qui choisit l'adaptateur — quelqu'un doit le faire.

Le TypeScript dit **quel élément joue quel rôle** ; la feuille de la plateforme dit **combien il
mesure**. Sans cette frontière, une mesure faite sur une plateforme redevient une constante que
toutes subissent — le défaut d'origine, où le retrait de 8 px du composeur était la marge propre
d'un conteneur GitHub.

Trois gardes tiennent l'ensemble, parce que rien de tout cela n'était visible d'un test :
`check:platform-isolation` (vocabulaire dérivé des adaptateurs, pas d'une liste),
`check:style-isolation` (mesuré dans Chromium), `check:extension-css` (toutes les feuilles
livrées).

**Niveau 2 — à l'intérieur d'une plateforme.** Non fait. `/pull/N` et `/pull/N/changes` sont deux
surfaces GitHub VIVANTES EN MÊME TEMPS, et la distinction est aujourd'hui étalée sur les 24
chaînes de `selectors.ts`, chacune portant son « React d'abord, puis hérité ». Une chaîne de repli
modélise la dérive dans le TEMPS, pas deux surfaces simultanées : `queryChainAll` s'arrête au
premier candidat qui rend quelque chose, si bien qu'une page mêlant les deux générations rendait
le second champ invisible (commit 81e07bb). Le port accommode déjà ce niveau — `getEditorChrome`
reçoit l'éditeur, l'adaptateur peut donc résoudre sa surface en interne, sans que le contrat ni le
code partagé en sachent rien.

