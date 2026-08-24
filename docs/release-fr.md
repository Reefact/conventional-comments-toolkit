# Publier une release de l'extension

But : donner aux postes qui **ne peuvent pas lancer `npm`** (politique d'entreprise, pas
de Node installé, pas de droits) un chemin d'installation en trois gestes — télécharger un
zip, le décompresser, charger le dossier dans le navigateur.

Le workflow [`release.yml`](../.github/workflows/release.yml) s'en charge : sur un tag
`vX.Y.Z`, il construit le bundle MV3, le vérifie, en fait deux archives et crée la Release
GitHub qui les porte.

## Poser une release

1. Mettre à jour `version` dans `packages/extension/src/manifest.json` — c'est cette
   valeur que le navigateur affichera une fois l'extension chargée.
2. Committer et pousser sur `main` (la CI doit être verte).
3. Poser et pousser le tag, identique à la version du manifeste au `v` près :

   ```
   git tag v1.1.0
   git push origin v1.1.0
   ```

Le workflow refuse de publier si le tag et le manifeste divergent : le message d'erreur
dit quoi corriger. Un tag pré-version (`v1.1.0-rc.1`, reconnu au tiret) produit une
Release marquée *pre-release*.

## Ce que la release contient

| Fichier | Pour qui |
|---|---|
| `conventional-comments-toolkit-<version>-chromium.zip` | Chrome, Edge, tout navigateur Chromium |
| `conventional-comments-toolkit-<version>-firefox.zip` | Firefox (event page, identifiant gecko) |
| `SHA256SUMS.txt` | contrôle du téléchargement |

Chaque archive se décompresse en **un** dossier dont la racine porte `manifest.json` —
directement chargeable — et embarque un `INSTALLATION.txt` bilingue ainsi que la licence.

## Ce qui est vérifié avant publication

Le tag se pose parfois sur un commit que la CI n'a jamais vu ; le workflow rejoue donc
lui-même les gardes qui comptent, et n'importe laquelle qui échoue empêche la Release :

- build TypeScript de tous les paquets et suite de tests complète ;
- aucun import distant dans le bundle (§10 — la CSP MV3 l'interdit) ;
- manifestes Chromium et Firefox chargeables, version du bundle conforme au tag ;
- les deux archives se décompressent en un dossier complet, et l'archive Chromium
  n'embarque pas la variante Firefox.

## Répétition à blanc

`workflow_dispatch` sur `release.yml` exécute tout sauf la publication : les archives
sortent en artefacts du run, avec le même contenu et les mêmes vérifications. C'est la
manière d'essayer une modification du workflow, ou de dépanner quelqu'un sans poser de
tag.
