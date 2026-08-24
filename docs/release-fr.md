# Publier une release de l'extension

But : donner aux postes qui **ne peuvent pas lancer `npm`** (politique d'entreprise, pas
de Node installé, pas de droits) un chemin d'installation en trois gestes — télécharger un
zip, le décompresser, charger le dossier dans le navigateur.

Le workflow [`release.yml`](../.github/workflows/release.yml) s'en charge : sur un tag
`vX.Y.Z`, il construit le bundle MV3, le vérifie, en fait deux archives et crée la Release
GitHub qui les porte.

## Poser une release

1. Mettre à jour `version` dans `packages/extension/src/manifest.json` — c'est cette
   valeur que le navigateur affichera une fois l'extension chargée. **Uniquement des
   chiffres** : un à quatre entiers de 0 à 65535 séparés par des points, pas tous nuls
   (`0.1.0` convient, `0.0.0` non). Chromium refuse de charger une extension dont le
   manifeste porte autre chose.
2. Committer et pousser sur `main` (la CI doit être verte).
3. Poser et pousser le tag, identique à la version du manifeste au `v` près :

   ```
   git tag v1.1.0
   git push origin v1.1.0
   ```

Pour vérifier **avant** de poser le tag qu'il passera la garde, la même commande que le
workflow se lance en local :

```
node scripts/release-version.mjs v1.1.0
```

Le workflow refuse de publier si le tag et le manifeste divergent : le message d'erreur
dit quoi corriger.

**Pré-version.** Le tag peut porter une étiquette : `v1.1.0-rc.1`. C'est alors le noyau
numérique (`1.1.0`) qui doit correspondre au manifeste, et l'étiquette vit là où elle est
sans danger — nom des archives, titre de la Release, marquée *pre-release*. Le manifeste,
lui, reste numérique : l'extension chargée affichera donc `1.1.0`. C'est une contrainte de
Chromium, pas un oubli. La résolution complète, ses cas d'erreur et ses tests sont dans
[`scripts/release-version.mjs`](../scripts/release-version.mjs) et
[`tests/release-version.test.ts`](../tests/release-version.test.ts).

## Ce que la release contient

| Fichier | Pour qui |
|---|---|
| `conventional-comments-toolkit-<version>-chromium.zip` | Chrome, Edge, tout navigateur Chromium |
| `conventional-comments-toolkit-<version>-firefox.zip` | Firefox (event page, identifiant gecko) |
| `SHA256SUMS.txt` | contrôle du téléchargement |

Les liens d'installation pointent la **liste** des releases, pas `/releases/latest` : ce
raccourci saute les pré-versions, et rend 404 tant qu'aucune version stable n'est publiée.

Chaque archive se décompresse en **un** dossier dont la racine porte `manifest.json` —
directement chargeable — et embarque un `INSTALLATION.txt` bilingue ainsi que la licence.

## Ce que ces archives ne sont pas

Un canal de déploiement. La spécification est explicite : le déploiement principal du
composant A passe par les stores publics, avec mise à jour automatique depuis le store
d'origine ou depuis un store privé d'entreprise (§10), et **toute livraison du composant A
passe par la revue des stores** (§14, `docs/operations-fr.md`). Une extension chargée
depuis un zip ne se met jamais à jour toute seule : chaque nouvelle version demande de
retélécharger et de recharger à la main.

Ces archives servent donc à **essayer** l'extension, et à la faire tourner sur les postes
où la chaîne de build n'est pas installable. Elles ne remplacent ni la soumission aux
stores, ni l'installation forcée par politique d'entreprise (`ExtensionInstallForcelist`,
`ExtensionSettings` — §10, §8.2).

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
