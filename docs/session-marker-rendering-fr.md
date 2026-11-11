# Rendu d'un marqueur de session en dernière ligne d'un commentaire publié

Relevé du 2026-11-11, dans Chrome (Windows, fenêtre de 1600 px), extension Conventional Comments
**désactivée**. Sur chaque page relevée, `document.querySelectorAll('[class*="cct-"]').length`
valait 0 au moment du relevé. Ce document décrit ce qui a été observé. Il ne choisit pas de syntaxe.

## Écritures testées

Chaque commentaire a pour corps `note: test de rendu`, une ligne blanche, puis l'une des lignes
suivantes, sans saut de ligne final :

| | Dernière ligne envoyée |
|---|---|
| A | `[session:riveting-normalized-return-value — The return value had been normalized, and it was riveting.]` |
| B | `[session:riveting-normalized-return-value — *The return value had been normalized, and it was riveting.*]` |
| C | `[session:riveting-normalized-return-value — _The return value had been normalized, and it was riveting._]` |
| D | `[session:riveting-normalized-return-value — <em>The return value had been normalized, and it was riveting.</em>]` |
| E | `[session:riveting-normalized-return-value(The return value had been normalized, and it was riveting.)]` |
| F | `[session:riveting-normalized-return-value<!--The return value had been normalized, and it was riveting.-->]` |
| G | `[session:riveting-normalized-return-value <abbr title="The return value had been normalized, and it was riveting.">…</abbr>]` |

Les textes ont été construits par échappements (`—`, `…`). Avant l'envoi, les trois
points de code autour du tiret de A–D valaient `U+0020 U+2014 U+0020`. Après l'envoi, sur les
trois plateformes, le corps stocké que renvoie l'API était identique, caractère pour caractère,
au texte envoyé, avec des fins de ligne LF.

## Où, et comment

| Plateforme | PR | Envoi | Identifiants |
|---|---|---|---|
| GitHub | `Reefact/just-dummies` #557 (fermée) | formulaire de la page : valeur posée dans la `textarea`, puis clic sur *Comment* | généraux : `issuecomment-` 6804690751 (A), 6804696517 (B), 6804697635 (C), 6804698752 (D), 6804699936 (E), 6804700994 (F), 6804702101 (G) ; ligne 1 de `cct-test/session-marker.md` : `r4542099561` (A), `r4542103735` (B) |
| GitLab | `Reefact/testing-conventional-comments` !1 | `POST /api/v4/projects/:id/merge_requests/1/notes` | notes 4213246001 (A), 4213246060 (B), 4213246088 (C), 4213246108 (D), 4213246172 (E), 4213246208 (F), 4213246244 (G) |
| Azure DevOps | `sylva-cct-test/cct-test` PR 1 | `POST …/pullRequests/1/threads` (`api-version=7.1`) | fils 13 (A) à 19 (G) |

Sur GitHub, la valeur a été posée par programme : les fins de ligne sont des LF. Un texte tapé
dans le même formulaire est stocké en CRLF (`packages/adapters/github/CAPTURES.md`, PR 557).

Les relevés ont été faits après rechargement de la page :
- GitHub : vue *Overview* (`/pull/557`) pour les commentaires généraux, vue *Files changed*
  (`/pull/557/changes`) pour les commentaires de ligne. La vue classique n'a pas été relevée.
- GitLab : onglet *Overview* de la MR.
- Azure DevOps : onglet *Overview* de la PR. Le fil d'activité y est virtualisé : chaque fil a été
  amené à l'écran avant d'être relevé.

## Corps rendu : comment il a été trouvé

| Plateforme | Chaîne `commentBody` de `selectors.ts` | Élément relevé |
|---|---|---|
| GitLab | `div.note-text, div.md` trouve le corps | `div.md` de `#note_<id>`, enfants `p,p` |
| Azure DevOps | `.markdown-content` trouve le corps | `div.markdown-content.markdown-editor-preview.repos-comment-editor-max-width.markdown-preview-checkbox-indent` de la rangée du fil, enfants `p,p` |
| GitHub, *Overview* | **aucun des quatre candidats ne trouve d'élément** sur la page rechargée (0, 0, 0, 0) | `div.markdown-body.safe-html-box__Uwc6Al.f5`, dans `article#issuecomment-<id>`, enfants `p,p` |
| GitHub, *Files changed* | `[class*="SafeHTMLBox__"]` trouve 2 éléments ; les trois premiers candidats, 0 | `div.markdown-body.safe-html-box__Uwc6Al.SafeHTMLBox__N9Ecgv.SafeHTMLBoxWrapped__qUULz2`, enfants `p,p` |

Sur toutes les plateformes et pour toutes les écritures, le corps a deux enfants `p` : la ligne
`note: test de rendu`, puis la ligne du marqueur. Le bloc relevé ci-dessous est le second `p`.

## Tableau

Légende des colonnes :
- « tiret » : les trois caractères autour de `—` dans le `textContent` du bloc ;
- « balise » : sort de `<em>` (D) ou de `<abbr>` (G) ;
- « commentaire HTML » : nœuds `Comment` trouvés dans le corps (F).

| | GitHub (général) | GitHub (ligne) | GitLab | Azure DevOps |
|---|---|---|---|---|
| A | texte seul ; tiret ` — ` | texte seul ; tiret ` — ` | texte seul ; tiret ` — ` | texte seul ; tiret ` — ` |
| B | `<em>` ; tiret ` — ` | `<em aria-hidden="true">` ; tiret ` — ` | `<em data-sourcepos>` ; tiret ` — ` | `<em>` ; tiret ` — ` |
| C | `<em>` ; tiret ` — ` | non posté | `<em data-sourcepos>` ; tiret ` — ` | `<em>` ; tiret ` — ` |
| D | balise gardée : `<em>` ; tiret ` — ` | non posté | balise gardée : `<em>` sans attribut ; tiret ` — ` | balise gardée : `<em>` ; tiret ` — ` |
| E | texte seul, parenthèses visibles | non posté | texte seul, parenthèses visibles | texte seul, parenthèses visibles |
| F | texte `[session:riveting-normalized-return-value]` ; 0 nœud `Comment` | non posté | idem ; 0 nœud `Comment` | idem ; 0 nœud `Comment` |
| G | balise **retirée** : texte seul `… …]` ; aucun `title` dans le DOM du bloc | non posté | balise **gardée** : `<abbr title="…">` ; `title` intact | balise **gardée** : `<abbr title="…">` ; `title` intact |

Aucune balise n'a été rendue échappée, c'est-à-dire visible en toutes lettres, sur aucune plateforme.

## Extraits, point par point

Les caractères hors ASCII imprimable sont écrits `\uXXXX`. « texte » est un nœud `Text`,
« élément » un nœud `Element`, « commentaire » un nœud `Comment`.

### GitHub — commentaires généraux (vue *Overview*)

**A**
```
outerHTML : <p dir="auto">[session:riveting-normalized-return-value — The return value had been normalized, and it was riveting.]</p>
texte    "[session:riveting-normalized-return-value — The return value had been normalized, and it was riveting.]"
```

**B, C, D** — `outerHTML` et nœuds identiques pour les trois :
```
outerHTML : <p dir="auto">[session:riveting-normalized-return-value — <em>The return value had been normalized, and it was riveting.</em>]</p>
texte    "[session:riveting-normalized-return-value — "
élément  <em> "The return value had been normalized, and it was riveting."
texte    "]"
```

**E**
```
outerHTML : <p dir="auto">[session:riveting-normalized-return-value(The return value had been normalized, and it was riveting.)]</p>
texte    "[session:riveting-normalized-return-value(The return value had been normalized, and it was riveting.)]"
```

**F**
```
outerHTML : <p dir="auto">[session:riveting-normalized-return-value]</p>
texte    "[session:riveting-normalized-return-value]"
nœuds Comment dans le corps : aucun
```

**G**
```
outerHTML : <p dir="auto">[session:riveting-normalized-return-value …]</p>
texte    "[session:riveting-normalized-return-value …]"
```

### GitHub — commentaires de ligne (vue *Files changed*)

**A**
```
outerHTML : <p dir="auto" aria-hidden="true">[session:riveting-normalized-return-value — The return value had been normalized, and it was riveting.]</p>
texte    "[session:riveting-normalized-return-value — The return value had been normalized, and it was riveting.]"
```

**B**
```
outerHTML : <p dir="auto" aria-hidden="true">[session:riveting-normalized-return-value — <em aria-hidden="true">The return value had been normalized, and it was riveting.</em>]</p>
texte    "[session:riveting-normalized-return-value — "
élément  <em aria-hidden="true"> "The return value had been normalized, and it was riveting."
texte    "]"
```

Dans cette vue, `aria-hidden="true"` est porté :
- par le premier `p` (`note: test de rendu`) ;
- par le corps `div.markdown-body` ;
- par ses trois ancêtres relevés, jusqu'à `div.ReviewThreadWrapper__vspFQB`.

Sur les commentaires généraux de la vue *Overview*, aucun `aria-hidden` n'apparaît dans les
`outerHTML` relevés.

### GitLab

**A**
```
outerHTML : <p data-sourcepos="3:1-3:105" dir="auto">[session:riveting-normalized-return-value — The return value had been normalized, and it was riveting.]</p>
texte    "[session:riveting-normalized-return-value — The return value had been normalized, and it was riveting.]"
```

**B, C** — identiques :
```
outerHTML : <p data-sourcepos="3:1-3:107" dir="auto">[session:riveting-normalized-return-value — <em data-sourcepos="3:47-3:106">The return value had been normalized, and it was riveting.</em>]</p>
texte    "[session:riveting-normalized-return-value — "
élément  <em data-sourcepos="3:47-3:106"> "The return value had been normalized, and it was riveting."
texte    "]"
```

**D**
```
outerHTML : <p data-sourcepos="3:1-3:114" dir="auto">[session:riveting-normalized-return-value — <em>The return value had been normalized, and it was riveting.</em>]</p>
texte    "[session:riveting-normalized-return-value — "
élément  <em> "The return value had been normalized, and it was riveting."
texte    "]"
```

**E**
```
outerHTML : <p data-sourcepos="3:1-3:102" dir="auto">[session:riveting-normalized-return-value(The return value had been normalized, and it was riveting.)]</p>
texte    "[session:riveting-normalized-return-value(The return value had been normalized, and it was riveting.)]"
```

**F**
```
outerHTML : <p data-sourcepos="3:1-3:107" dir="auto">[session:riveting-normalized-return-value]</p>
texte    "[session:riveting-normalized-return-value]"
nœuds Comment dans le corps : aucun
```

**G**
```
outerHTML : <p data-sourcepos="3:1-3:126" dir="auto">[session:riveting-normalized-return-value <abbr title="The return value had been normalized, and it was riveting.">…</abbr>]</p>
texte    "[session:riveting-normalized-return-value "
élément  <abbr title="The return value had been normalized, and it was riveting."> "…"
texte    "]"
```
Style calculé de l'`abbr` : `text-decoration-line: underline`, `cursor: help`.

### Azure DevOps

**A**
```
outerHTML : <p>[session:riveting-normalized-return-value — The return value had been normalized, and it was riveting.]</p>
texte    "[session:riveting-normalized-return-value — The return value had been normalized, and it was riveting.]"
```

**B, C, D** — identiques :
```
outerHTML : <p>[session:riveting-normalized-return-value — <em>The return value had been normalized, and it was riveting.</em>]</p>
texte    "[session:riveting-normalized-return-value — "
élément  <em> "The return value had been normalized, and it was riveting."
texte    "]"
```

**E**
```
outerHTML : <p>[session:riveting-normalized-return-value(The return value had been normalized, and it was riveting.)]</p>
texte    "[session:riveting-normalized-return-value(The return value had been normalized, and it was riveting.)]"
```

**F**
```
outerHTML : <p>[session:riveting-normalized-return-value]</p>
texte    "[session:riveting-normalized-return-value]"
nœuds Comment dans le corps : aucun
```

**G**
```
outerHTML : <p>[session:riveting-normalized-return-value <abbr title="The return value had been normalized, and it was riveting.">…</abbr>]</p>
texte    "[session:riveting-normalized-return-value "
élément  <abbr title="The return value had been normalized, and it was riveting."> "…"
texte    "]"
```
Style calculé de l'`abbr` : `text-decoration-line: underline`, `cursor: auto`.

## Ce qu'un humain voit

Les captures d'écran montrent une page connectée (nom et avatar du compte) : elles ne sont pas
versionnées (skill `plateforme`, validation). Elles ont montré :

- **A** : la ligne telle qu'écrite, tiret cadratin compris, sur les trois plateformes et dans les
  deux vues GitHub.
- **B, C, D** : la phrase en italique après le tiret, crochets et tiret en romain, sur les trois
  plateformes.
- **E** : la ligne telle qu'écrite, parenthèses comprises.
- **F** : `[session:riveting-normalized-return-value]` ; la phrase n'est pas affichée.
- **G** :
  - GitHub : `[session:riveting-normalized-return-value …]`, points de suspension sans soulignement ;
  - GitLab : points de suspension soulignés en pointillé ;
  - Azure DevOps : points de suspension soulignés.

  L'infobulle du `title` n'a pas été affichée ni capturée.

## Non mesuré

- GitHub, vue classique de la conversation : non relevée.
- GitHub, commentaires de ligne C à G : non postés, comme demandé (A et B seulement).
- GitLab et Azure DevOps, commentaires de ligne : non postés (non demandés).
- Le texte affiché par l'infobulle de `abbr` (G) au survol.
- Le rendu de commentaires dont les fins de ligne sont CRLF : tous les corps de ce relevé sont en LF.
