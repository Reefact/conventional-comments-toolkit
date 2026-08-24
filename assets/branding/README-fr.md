# Images sources des icônes

Ce dossier garde les **originaux** en 1254×1254, hors du bundle : `packages/extension/`
ne contient que ce qui est embarqué dans l'extension, et ces fichiers pèsent plus d'un
mégaoctet chacun. Ils ne sont référencés par aucun manifeste et ne partent dans aucun zip
de release ; ils existent pour qu'un rendu puisse être **refait**, jamais agrandi.

## Quelle source donne quel rendu

L'icône n'est pas une seule image déclinée en quatre tailles : le dessin se simplifie à
mesure que la surface diminue, parce que les chevrons et la coche deviennent illisibles
en dessous de 32 pixels.

| Source (1254×1254)      | Rendu produit                                       | Dessin                                             |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------- |
| `cct-icon-16-base.png`  | `icon-16.png`                                        | silhouette pleine — bulle et pastille, sans détail |
| `cct-icon-32-base.png`  | `icon-32.png`                                        | intermédiaire — chevrons et coche simplifiés       |
| `cct-icon-big-base.png` | `icon-48.png`, `icon-128.png`                        | complet — chevrons, lignes de texte, coche cerclée  |

Les rendus vivent dans `packages/extension/src/icons/`, d'où `build.mjs` les copie vers
`dist-ext/icons/` et `dist-ext/firefox/icons/`.

## Refaire un rendu

Réduire depuis la source correspondante, jamais depuis un rendu plus petit ni depuis la
mauvaise source — c'est ce que la table ci-dessus fixe. Avec ImageMagick :

```sh
magick assets/branding/cct-icon-big-base.png -resize 128x128 \
  packages/extension/src/icons/icon-128.png
```

Deux contraintes que `packages/extension/test/icons.test.ts` vérifie ensuite : le fichier
doit être un PNG aux dimensions exactes de son nom, et rester déclaré dans `manifest.json`
— à la fois dans `icons` (identité de l'extension) et dans `action.default_icon` (bouton
de la barre d'outils), qui doivent rester identiques.

## Ajouter une taille

Déclarer la nouvelle taille dans `icons` **et** dans `action.default_icon` du manifeste,
et déposer le fichier dans `packages/extension/src/icons/`. `build.mjs` dérive sa liste
de copie du manifeste : rien d'autre à modifier pour que la taille arrive dans les deux
bundles.
