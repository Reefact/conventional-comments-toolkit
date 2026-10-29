# Architecture

Découpage conforme au §9.1. `packages/core/` est publié comme paquet et consommé **à
l'identique** par l'extension (composant A) et par le vérificateur (composant B) — aucune
règle de validation n'est dupliquée hors de ce paquet.

**Le composant B n'existe pas dans l'arbre.** Le compagnon serveur a été retiré : il
demandait un hébergement, un stockage et des webhooks que le §6.4 ne veut plus, et personne
ne l'avait jamais déployé. Ce qui le remplace sur GitHub — un vérificateur qui s'exécute
dans la plateforme et ne retient rien — est conçu au §6.4 et au §A.8, et suivi par
[l'issue #56](https://github.com/Reefact/conventional-comments-toolkit/issues/56). Tout ce
que ce document dit de la frontière A/B décrit donc un contrat que `core/` tient déjà, et
qu'un futur B consommera tel quel.

```
packages/
├── core/                     # @cct/core — aucune dépendance DOM ni plateforme (§9.1)
│   ├── preprocess.ts         #   §3.4.1 prétraitement normatif
│   ├── regex.ts              #   §3.4.2 expression régulière de référence
│   ├── parser.ts             #   §3.2/§3.3 labels, décorations, alias
│   ├── validator.ts          #   §3.5 validation en étages, codes, précédence bloquante
│   ├── evaluate.ts           #   §6 deux critères, gouvernance, exemption
│   ├── summary.ts            #   §6.3.1 ligne machine cc/1 (encode/decode)
│   ├── config/               #   §8 défauts, schéma, fusion, plancher, empreinte
│   ├── corpus/               #   CA-06 corpus de parité synthétique versionné
│   └── i18n/                 #   fr / en
├── adapters/
│   ├── shared/               # @cct/adapter-shared — contrat §9.2.3, écriture §9.3, sélecteurs §9.4
│   ├── github/               # @cct/adapter-github — sélecteurs, générations DOM, Turbo (§A)
│   └── azdo/                 # @cct/adapter-azdo — MutationObserver, replis P1' (§B)
└── extension/                # @cct/extension — MV3, content/background, barre, pastille, garde
```

## Frontière A/B et parité (§2, §8.1.3)

La règle de conception du §2 — « un commentaire jugé conforme par l'extension doit
toujours être jugé conforme par le vérificateur, et réciproquement » — tient par
construction :

1. **Même parseur.** `validate()`, `isBlocking()`, `evaluate()`, `fingerprint()`,
   `resolveConfig()`, `encodeSummary()`/`decodeSummary()` vivent tous dans `core/` et sont
   appelés à l'identique des deux côtés (`packages/core/src/index.ts`).
2. **Même configuration.** Les deux composants résolvent les **trois** mêmes niveaux
   (plancher, organisation, dépôt) via `resolveConfig()`, qui est pure et ne prend que ces
   trois documents : il n'existe plus de configuration épinglée (§8.1.3, règle 1).
3. **Empreinte comparée.** Le composant B publie `configFingerprint` dans la ligne `cc/1` ;
   l'extension la relit dans le DOM et la compare à la sienne. En cas d'écart, elle cesse
   de bloquer l'envoi et le signale (§8.1.3, règle 2) — jamais un rejet que la source de
   vérité n'aurait pas prononcé.
4. **Exception bornée.** Le temps qu'une modification restrictive se propage, l'extension
   peut être momentanément plus stricte que le vérificateur ; elle le signale et cesse de
   bloquer (§2, §8.1.3).

`core/` ne fait **aucune** entrée-sortie : tout ce qu'il ne peut pas lire lui-même
(brouillon, exemption, appartenances déjà résolues) entre par
`EvaluationInput`/`EvaluationContext`, et les effets à exécuter sortent par
`ComplianceResult.actions`. Un adaptateur traduit et transporte ; il ne juge
jamais (§9.2.4).

## Ce que `core/` attend d'un vérificateur (§6.4, §9.2.4)

Le composant B n'est plus dans l'arbre, mais le contrat qu'il doit honorer, si : c'est lui
que `packages/core/` expose, et il tient en une phrase — **le verdict est une fonction pure
de l'état courant de la PR**.

- `resolveConfig(plancher, organisation, dépôt)` est pure et relit tout à chaque appel. Un
  seul des deux composants met ces lectures en cache, et c'est l'extension.
- `evaluate()` est pure elle aussi : brouillon, exemption et appartenances lui arrivent
  déjà résolus par `EvaluationContext`, et les effets sortent par `ComplianceResult.actions`.
- **Aucun stockage.** Ni séquence par PR, ni fenêtre de coalescence, ni délai de grâce, ni
  réconciliation, ni épinglage, ni monotonie : chacune de ces règles supposait une mémoire
  d'une évaluation à la suivante. Elles ont disparu du §6.4 avec le service qui les portait,
  et `core/` n'en expose plus aucune trace.

Ce que la mémoire rendait — empêcher un vert périmé de décider du merge — devra être rendu
par la plateforme qui héberge le futur vérificateur, et non par lui (§A.8).

## Points de plateforme et replis (spike P1')

Les hypothèses de plateforme que le spike doit établir, chacune avec son repli normatif,
vivent dans `spikes/p1-prime/README-fr.md`. Elles portaient autrefois une structure typée
(`PlatformOperationalFacts`), lue par le service compagnon pour armer ses replis
d'exploitation ; celui-ci est retiré, et les hypothèses qui restent concernent l'extension —
type d'éditeur, écriture programmatique, forme du corps rendu —, que les adaptateurs
tranchent déjà par `getEditorChrome()` et `renderedBodyShape()` (§9.2.3).

## Deux niveaux de séparation par plateforme

**Niveau 1 — entre plateformes.** Ce qui DÉCRIT une plateforme vit dans son paquet ; ce qui
décrit le produit est partagé et ne connaît personne. Le critère de partage n'est pas une liste
de fichiers mais la motivation du changement : « GitHub a bougé » va dans `adapters/github/`,
« notre produit doit se comporter autrement » va dans le code partagé.

Cinq choses vivent donc par plateforme :

| | Où | Comment le partagé y accède |
|---|---|---|
| Sélecteurs DOM | `adapters/<p>/src/selectors.ts` | jamais directement |
| Placement : cadre à parer, point d'insertion, trait rentré | idem, via `getEditorChrome()` (§9.2.3) ; `null` laisse la règle géométrique du partagé | par le port, qui rend des DONNÉES |
| Forme du corps rendu | idem, via `renderedBodyShape()` (§9.2.3) ; `null` fait RENONCER le masquage du préfixe et la mise en avant du sujet — aucune règle ne prend le relais | idem |
| Couleurs, rayons, longueurs | `adapters/<p>/src/platform.css` | par des variables `--cct-*` |
| Fiche d'identité : hôtes, `credentials`, vues, glyphe | `adapters/<p>/src/descriptor.ts`, sous-chemin `/descriptor` | par le registre `extension/src/platforms.ts` |

Le registre est la seule liste du code qui énumère les plateformes. Le service worker, la page
d'options et le routage des hôtes l'itèrent ; ils n'importent que les fiches, jamais un
adaptateur (`check:bundle-isolation`, sur les octets livrés). Ajouter une plateforme : son
paquet, une ligne au registre, son libellé dans les deux catalogues, sa valeur au schéma de
politique — `platform-registry.test.ts` nomme ce qui manque.

Le port transporte des **données**, jamais un drapeau nommant une plateforme : une signature
`isGitHubChangesView()` obligerait le code partagé à savoir de qui il parle, et le conditionnel
que le polymorphisme supprime reviendrait sous un autre nom. Les seuls endroits qui nomment une
plateforme sont le registre (`platforms.ts`) et le composition root (`content.ts`, le point
d'entrée du script de contenu), qui associe à chaque plateforme son adaptateur — quelqu'un doit le
faire. Le cœur (`content-internal.ts`) reçoit cette table et construit l'adaptateur retenu sans le
nommer ; l'absence de fabrique pour une plateforme enregistrée provoque une erreur de compilation.
`check:platform-isolation` refuse un identifiant de plateforme ou un import d'adaptateur partout ailleurs.

Le TypeScript dit **quel élément joue quel rôle** ; la feuille de la plateforme dit **combien il
mesure**. Sans cette frontière, une mesure faite sur une plateforme redevient une constante que
toutes subissent — le défaut d'origine, où le retrait de 8 px du composeur était la marge propre
d'un conteneur GitHub.

Cinq gardes tiennent l'ensemble, parce que rien de tout cela n'était visible d'un test :
`check:platform-isolation` (vocabulaire dérivé des adaptateurs, pas d'une liste ; ni cast vers le
contrat, ni identifiant de plateforme hors du registre), `check:bundle-isolation` (aucun
adaptateur dans le service worker ni la page d'options, lu dans les octets livrés),
`check:style-isolation` (mesuré dans Chromium), `check:extension-css` (toutes les feuilles
livrées, découvertes comme le build les découvre), `check:pr-scope` (une PR touche UNE plateforme,
OU le code partagé : une correction Azure DevOps qui retouche le contrôleur commun modifie GitHub
sans le dire, et doit se présenter pour ce qu'elle est).

**Niveau 2 — à l'intérieur d'une plateforme.** `packages/adapters/github/src/surfaces.ts` déclare
les trois surfaces qui coexistent — React, héritée, vue des fichiers modifiés — chacune portant SES
zones de saisie et SON châssis. Deux mécanismes cessent d'être confondus :

| Question | Mécanisme | Sémantique |
|---|---|---|
| Le nom a-t-il changé depuis l'an dernier ? | chaîne de sélecteurs, à l'intérieur d'une surface | premier candidat qui matche |
| Quelles surfaces la page porte-t-elle ? | liste de surfaces | **union**, dédoublonnée |

Le défaut que ça corrige n'était pas théorique : `/pull/N/changes` affiche des fils hérités à côté
de son propre composeur React, et une chaîne unique rendait les éléments du premier candidat qui
matche — l'autre composeur devenait invisible, sans barre d'outils ni garde d'envoi, sur la seule
zone où un `issue:` bloque réellement (§4.1). Le commit 81e07bb avait vu le cas et n'en avait
corrigé que le silence.

Vingt et une des vingt-quatre chaînes de `selectors.ts` restent des chaînes, et c'est délibéré :
elles répondent à une question qui n'a qu'une bonne réponse par page — quel conteneur de fil, quel
corps rendu, quel bouton de fusion. Seul le composeur se scinde, parce que seul il a montré le
défaut.
