# Architecture

Découpage conforme au §9.1. **Le produit est l'extension, et elle seule** (§2).
`packages/core/` porte toutes les règles de validation, sans dépendance au DOM ni à une
plateforme ; les adaptateurs et l'extension le consomment, et aucune règle n'est dupliquée
hors de ce paquet.

Une rédaction antérieure de la spécification décrivait un second composant, un vérificateur
exécuté dans l'intégration continue de la plateforme, avec lequel `core/` était partagé à
l'identique. Il est retiré (DEC0010), et avec lui ce qui
n'existait que pour lui : l'évaluation de conformité d'une PR (`evaluate()`), la gouvernance
des résolutions, l'exemption de PR, le périmètre d'activation, l'empreinte de configuration et
la ligne machine `cc/1`, encodeur comme décodeur. Le contrat d'adaptateur a perdu de même ce qui
ne servait qu'à lui : la date de création de la PR, l'auteur d'une résolution, la sonde du bouton
de fusion et la lecture de la ligne publiée (§9.2).

```
packages/
├── core/                     # @cct/core — aucune dépendance DOM ni plateforme (§9.1)
│   ├── preprocess.ts         #   §3.4.1 prétraitement normatif
│   ├── regex.ts              #   §3.4.2 expression régulière de référence
│   ├── parser.ts             #   §3.2/§3.3 labels, décorations, alias
│   ├── validator.ts          #   §3.5 validation en étages, codes, précédence bloquante
│   ├── session.ts            #   §3.6 marqueur de session, retiré du corps avant analyse
│   ├── config/               #   §8 défauts, schéma, fusion, plancher, résolution
│   ├── corpus/               #   CA-06 corpus synthétique versionné (non-régression)
│   └── i18n/                 #   fr / en
├── adapters/
│   ├── shared/               # @cct/adapter-shared — contrat §9.2.3, écriture §9.3, sélecteurs §9.4
│   ├── github/               # @cct/adapter-github — sélecteurs, générations DOM, Turbo (§A)
│   ├── azdo/                 # @cct/adapter-azdo — MutationObserver, replis P1' (§B)
│   └── gitlab/               # @cct/adapter-gitlab — gitlab.com (§C)
└── extension/                # @cct/extension — MV3, content/background, barre, pastille, garde
```

## Ce que `core/` garantit (§8.1.3, §9.2.4)

- **Pureté.** `validate()`, `isBlocking()` et `resolveConfig()` ne font aucune
  entrée-sortie : `resolveConfig(plancher, organisation, dépôt)` ne prend que ces trois
  documents et relit tout à chaque appel. Il n'existe pas de configuration épinglée (§8.1.3,
  règle 1) ; le seul cache est celui de l'extension (§8.1.3, règle 4).
- **Un adaptateur traduit et transporte ; il ne juge jamais** (§9.2.4). Ce qu'il lit de la
  page — fils, résolution, auteur — entre dans `core/` déjà normalisé.
- **Compatibilité de version.** Une configuration qui exige un `coreMinVersion` supérieur à
  celui de l'extension déclenche le repli du §8.1.5 (§8.1.3, règle 5).

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

La plupart des chaînes de `selectors.ts` restent des chaînes, et c'est délibéré : elles répondent
à une question qui n'a qu'une bonne réponse par page — quel conteneur de fil, quel corps rendu.
Seul le composeur se scinde, parce que seul il a montré le
défaut.
