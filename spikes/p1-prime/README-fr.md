# Spike P1' — écriture programmatique dans les éditeurs, et hypothèses de plateforme

Ce spike répond au risque à lever du §9.3 et du §14 (P1'). Il est mené **en parallèle**
du développement de `core/` ; son volet GitHub conditionne la seule insertion de préfixe
de P2 (`CA-02`), son volet Azure DevOps conditionne P3.

Une hypothèse de plateforme non démontrée ne doit pas être transformée en certitude pour
continuer (consigne du §14). Ce document distingue donc ce que le spike **démontre
réellement** de ce qui **reste à établir** — et, pour chaque hypothèse non tranchée,
nomme le repli normatif déjà implémenté.

## Ce que le spike démontre (exécutable)

`run.mjs` lance Chromium (via `playwright-core`, le binaire pré-installé du bac à sable)
et charge `fixture.html`, une page qui monte un **composant contrôlé par un état
applicatif** — le même patron que les vues React de GitHub (§A.2) et l'hypothèse de
travail pour Azure DevOps (§B.2). La page mémorise, à part du DOM, la « valeur soumise »
que l'application enverrait réellement, et n'accepte une mise à jour que par un événement
`input` **de confiance appliqué au nœud** — exactement ce qu'absorbe l'affectation
directe de `value`.

Le spike vérifie alors, dans un vrai navigateur :

1. **`element.value = …` est absorbé** : le champ paraît modifié, mais la valeur soumise
   ne l'est pas. C'est le mode de défaillance que le §9.3 décrit.
2. **Le setter natif du prototype + un événement `input` qui remonte** met à jour l'état
   applicatif, donc la valeur soumise. C'est la stratégie commune du §9.3, celle
   qu'emploie `writeToTextField()` de `@cct/adapter-shared`.
3. **La commande d'insertion de texte du navigateur** (`document.execCommand('insertText')`)
   met également à jour l'état — le repli mentionné au §9.3.

Le point est la **désynchronisation DOM / état** : la valeur affichée peut sembler correcte
alors que le contenu soumis diverge (§B.2, « Risque à lever »). Le spike la reproduit et
montre que la stratégie retenue l'évite.

Exécuter :

```
npm run spike
```

Le script sort un code non nul si l'une des assertions échoue — il est donc utilisable en
CI comme garde de non-régression de l'hypothèse.

## Ce qui reste à établir (et le repli en place)

Le spike valide la **mécanique d'écriture**, commune aux deux plateformes. Il ne peut pas,
depuis un bac à sable, ouvrir les vraies interfaces authentifiées de GitHub et d'Azure
DevOps. Les points suivants relèvent d'une exécution sur les plateformes réelles ; chacun
a un repli normatif **déjà codé**, si bien que l'implémentation reste correcte tant qu'ils
ne sont pas tranchés :

**Tableau daté : l'état au moment du spike**, conservé comme trace. Plusieurs lignes ont été
tranchées depuis, sur les plateformes réelles — l'adaptateur Azure DevOps déclare par exemple
`suggestionInfoString: 'suggestion'` —, et `CAPTURES.md` de chaque adaptateur fait foi sur ce qui
est mesuré. Trois lignes en sont retirées avec le vérificateur (§2) : l'auteur d'une résolution
(`resolvedBy`), la provenance des étiquettes d'exemption et l'événement de mise à jour d'une PR
ne servaient qu'à lui.

| Hypothèse (spec) | Statut | Repli implémenté |
|---|---|---|
| Type réel de l'éditeur Azure DevOps (§B.2) — `<textarea>` ou éditeur riche | à établir sur la plateforme | `writeToTextField()` couvre les deux ; si l'élément n'est pas un champ texte, la dégradation de sélecteur du §9.4 désactive la zone sans jamais empêcher l'usage de la plateforme |
| Route de lecture du fichier de configuration sur la seule session Azure DevOps (§B.4) | à établir | `getRepoConfig()` renvoie `{ status: 'unreachable' }` en cas d'échec ou de réponse HTML → état dégradé du §5.4, l'extension assiste sans bloquer |
| Info string du bloc de suggestion Azure DevOps (§B.6) | à établir (lecture, pas développement) | `PlatformProfile.suggestionInfoString = null` → pas d'étage 0 ; un `suggestion:` explicite reste accepté |
| Générations de DOM GHE Server à cibler (§A.1, §A.5) | à arrêter avant P2 | chaînes de sélecteurs avec repli + smoke test multi-versions (§9.4) |

Les identités de service, les commandes slash et les marqueurs de message système sont, eux,
**établis** par la spécification (§A.7, §B.6) et implémentés dans les profils de plateforme
et les adaptateurs.
