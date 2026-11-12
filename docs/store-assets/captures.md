# Captures d'écran de la fiche Chrome Web Store

Produites le 2026-11-12, d'après la section « Liste des captures d'écran à produire » de
`docs/store-listing-fr.md`, qui fait foi. Extension chargée non empaquetée depuis
`packages/extension/dist-ext` (build du commit `d66a83c`), domaines `github.com`, `gitlab.com` et
`dev.azure.com` autorisés depuis le panneau « Domaines connus » de la page de réglages.

Conditions communes :

- PNG, exactement 1280×800, thème **sombre** sur toute la série.
- Fenêtre Chrome restaurée (non agrandie) et redimensionnée pour que la page mesure
  **1280×801 pixels CSS**, zoom du navigateur à **100 %** (`devicePixelRatio` 1,5 sur la machine de
  capture). Le zoom ne sert à rien : l'outil de capture de Claude in Chrome rend des pixels CSS,
  si bien qu'un zoom réduit le contenu capturé sans grossir le texte.
- Correcteur orthographique de Chrome désactivé : il soulignait l'anglais en rouge dans les champs.
- Pointeur de la souris placé dans le coin inférieur droit, hors du contenu.
- Captures 1 et 4 : prises par Claude in Chrome (JPEG à la taille de la page), converties en PNG
  sans mise à l'échelle par un script Chromium (`playwright-core`) : recadrage depuis le coin
  haut-gauche, marges de la couleur du fond si la source est plus petite. Capture 5 : PNG natif
  des DevTools.
- Langue de l'interface de l'extension réglée sur **English** dans la page de réglages (voir
  « Défauts constatés », point 3).

## 1 — GitHub, écrire — `01-github-ecrire.png`

- **URL** : <https://github.com/Reefact/deskmate/pull/2/changes>
- **Démontre** : la barre d'outils au-dessus de l'éditeur natif d'un commentaire de ligne, le label
  `suggestion` et la décoration `(non-blocking)` sélectionnés, le préfixe inséré
  (`suggestion (non-blocking): honor Retry-After when the server sends one`), la pastille
  « Compliant » (§5.1, §5.3). Vignette des résultats de recherche.
- **Gestes** :
  1. Onglet *Files changed*, arborescence des fichiers masquée (*Hide file tree*).
  2. Survoler la ligne 13 de `src/Http/RetryPolicy.cs`, cliquer le `+` de la gouttière.
  3. Dans la barre d'outils : `suggestion`, puis `(non-blocking)`.
  4. Placer le curseur en fin de champ, taper `honor Retry-After when the server sends one`.
  5. Ôter le focus du champ, faire défiler pour que le haut du champ de saisie soit à 488 px du
     haut de la page (en-tête « Add a comment on line R13 » à 230 px).
  6. Capturer ; conversion : `x=0 y=0`, hauteur utile 786 px (la barre de défilement horizontale
     de GitHub en bas est exclue), marges `rgb(13,17,23)`.
- **Rien n'est envoyé** : le texte reste tapé dans le champ.
- **Lisibilité en vignette** : réduite à 440 px de large, la barre d'outils et le label surligné se
  reconnaissent ; la ligne de texte du champ se lit mal. Accepté en l'état par le propriétaire.

## 2 — GitHub, lire — NON PRODUITE

En attente : le filtre de fils (§5.5) se place à l'intérieur du premier fil au lieu d'être au-dessus
de la liste (« Défauts constatés », point 1). Contenu prêt sur
<https://github.com/Reefact/deskmate/pull/2> : fil `issue (blocking)` non résolu sur
`RetryPolicy.cs:18`, `question (non-blocking)` sur `ResilientHttpClient.cs:12`, `praise` général ;
bandeau de tête « 1 unresolved blocking thread(s) ». Sur l'*Overview*, le filtre GitHub *Mine*
masque la revue de Codex, mais la colonne de droite affiche encore
« Reviewers : chatgpt-codex-connector[bot] » (une revue soumise ne se supprime pas) ; *Files changed*
n'a pas cette colonne.

## 3 — GitLab, la validation qui refuse — NON PRODUITE

Impossible en l'état : sur GitLab, `getRepoConfig()` renvoie toujours `unreachable` (§C.4,
`packages/adapters/gitlab/src/index.ts:91`), si bien que tout éditeur affiche « Configuration
unread » et qu'aucun envoi n'est bloqué. Contenu prêt sur
<https://gitlab.com/Reefact/testing-conventional-comments/-/merge_requests/3> (projet **privé**) :
fil `issue (blocking)` non résolu sur `RetryPolicy.cs:18`, `.conventional-comments.json` en mode
`enforce` sur `main`.

## 4 — Azure DevOps, la même chose ailleurs — `04-azure-devops.png`

- **URL** : <https://dev.azure.com/sylva-cct-test/cct-test/_git/cct-test/pullrequest/4>
  (organisation de test personnelle, projet privé : Azure DevOps ne crée plus de projet public).
- **Démontre** : sur un domaine activé à la demande, le fil publié rendu avec ses badges `issue` et
  `blocking`, préfixe masqué et sujet en gras ; la barre d'outils dans le champ de réponse, le label
  de réponse `ack` inséré, l'aperçu de son badge et la pastille « Compliant ».
- **Gestes** :
  1. Onglet *Overview*, faire défiler jusqu'au fil de `RetryPolicy.cs`.
  2. Cliquer « Write a reply... » sous le fil `issue (blocking)`.
  3. Dans la barre d'outils : `ack` ; taper en fin de champ `clamping to MaxDelay in the next push`.
  4. Faire défiler jusqu'en bas du fil d'activité (dernière ligne : « … created the pull request »).
  5. Capturer ; conversion : `x=0 y=0`, 1280×800.
- **Rien n'est envoyé** : la réponse reste tapée dans le champ.

## 5 — La page de réglages — `05-reglages.png`

- **URL** : `chrome-extension://<id>/options.html` (identifiant propre à l'installation non
  empaquetée).
- **Démontre** : les trois domaines configurés et la plateforme associée à chacun, la langue de
  l'interface, les champs de raccourcis et d'ordre des boutons.
- **Gestes** (manuels : Claude in Chrome refuse les pages `chrome-extension://`) :
  1. Ouvrir la page de réglages, F12, Ctrl + Maj + M.
  2. Barre d'émulation : *Responsive*, 1280 × 800, DPR 1.
  3. Faire défiler pour que « Configured domains » soit en haut du cadre.
  4. DevTools focalisé : Ctrl + Maj + P, `screenshot`, *Capture screenshot*.
- **Limites acceptées par le propriétaire** : les libellés de plateforme des domaines sont ceux des
  installations auto-hébergées (« Défauts constatés », point 2) ; *Button order* et *Direct
  shortcuts* sont vides (texte d'exemple grisé).

## Défauts constatés pendant la production — rapportés, non corrigés

1. **GitHub — filtre de fils mal placé.** Sur `deskmate#2` (*Overview* et *Files changed*),
   `.cct-thread-filter` est inséré dans l'`article` du premier fil, après son extrait de code ;
   `[data-testid="timeline-item"]` n'y trouve aucun élément. `getThreadFilterMount()`
   (`packages/adapters/github/src/index.ts:632`) retombe alors sur le fil lui-même.
2. **Page de réglages — libellés de plateforme.** `github.com`, `gitlab.com` et `dev.azure.com`
   affichent « GitHub Enterprise Server / GHE Cloud », « GitLab Self-Managed » et « Azure DevOps
   Server or visualstudio.com organisation » (clés `options.platform.*` de `strings.ts`).
   Mécanisme de choix du libellé non lu.
3. **Azure DevOps — langue de l'interface.** Interface d'Azure DevOps affichée en anglais,
   `document.documentElement.lang` vaut `fr-FR` : l'extension, qui lit cet attribut
   (`content-internal.ts:824`, `:1722`), s'affichait en français. Contourné pour les captures par
   la préférence de langue locale.
4. **GitLab — lecture de configuration non implémentée** (§C.4) : état dégradé permanent ; voir
   capture 3.

## Contenu de démonstration créé (à nettoyer après validation)

- GitHub `Reefact/deskmate` : branches `demo/store-base`, `demo/http-retry`, PR #2 ouverte ;
  commentaires de Codex supprimés.
- GitHub `Reefact/just-dummies` : PR #558 **fermée**, branches `demo/store-base` et
  `demo/http-retry` supprimées le 2026-11-12.
- GitLab `Reefact/testing-conventional-comments` : commit `.conventional-comments.json` sur `main`,
  branche `demo/http-retry`, MR !3 ouverte.
- Azure DevOps `sylva-cct-test/cct-test` : commit sur `main` (clé `activation` retirée de la
  configuration), branche `demo/http-retry`, PR 4 active.
