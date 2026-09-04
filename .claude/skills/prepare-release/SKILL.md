---
name: prepare-release
description: Prépare une release de l'extension — entrée CHANGELOG.md et notes de version bilingues pour une version donnée, écrites avant que le tag ne soit posé. À utiliser quand on demande de préparer, rédiger ou mettre à jour un changelog ou des notes de version, et avant tout tag.
---

# Préparer une release

Trois artefacts, **trois questions différentes**. Les confondre est le défaut que cette
procédure existe pour éviter :

| Fichier | Question |
|---|---|
| l'historique Git | qu'est-ce que ce diff change ? — pour un relecteur |
| `CHANGELOG.md` | qu'est-ce qui a changé, en détail ? — relevé technique cumulatif |
| `docs/release-notes-<majeure>.x-en.md` et `-fr.md` | qu'est-ce que ça change POUR MOI ? — pour quelqu'un qui décide s'il met à jour |

Un sujet de commit explique un diff. Une note de version explique une version. Ne jamais
dériver la seconde de la première : `fix(extension): widen the textless-writes guard` ne dit
rien à un lecteur qui décide d'installer.

## La procédure

1. **Lire la plage.** `git log --format='%s' <dernier tag>..HEAD`, et le corps des commits dont
   le sujet ne suffit pas. Le dernier tag : `git tag --sort=-creatordate | head -1`.

2. **Regrouper par HISTOIRE, pas par fichier.** Une version porte une ou deux histoires, pas
   trente commits. Une fonctionnalité affinée sur treize rondes de revue donne UNE entrée : ce
   dont le lecteur a besoin, c'est le comportement, pas les treize.

   Le piège inverse, déjà tombé une fois : replier une plage sur sa fonctionnalité principale
   et laisser tomber ce qui l'accompagne. Une correction qui rend un hôte d'entreprise
   utilisable, ou qui débloque la lecture d'une configuration, est user-facing même si elle
   n'est pas le titre de la version. Parcourir la plage ENTIÈRE avant de conclure.

3. **Écrire l'entrée `CHANGELOG.md`** en tête, format Keep a Changelog (`### Added`,
   `### Fixed`, `### Changed`). Une puce ouvre sur une phrase d'issue en gras, puis explique.
   Citer la section de `specifications-fr.md` sur laquelle elle s'appuie quand il y en a une.

4. **Écrire la note de version**, dans les DEUX fichiers, à partir de l'entrée du changelog —
   jamais l'inverse, et sans jamais y ajouter ce que le changelog ne dit pas.

5. **Vérifier** : `node scripts/release-notes.mjs <version>` doit afficher la section. Puis
   `npm test` (le garde bilingue et le garde de repli y sont).

6. **S'arrêter là.** Poser le tag est l'affaire d'un humain. `release.yml` refuse de publier si
   la section manque — c'est voulu, et c'est ce qui rend l'étape 4 non facultative.

## Format d'une note

```
## <version> — <Mois> <jour>, <année>

_<une ligne : ce dont cette version parle, comme on le résumerait à quelqu'un qui hésite>_

### ✨ Features
### 🐛 Bug fixes
### 🔧 Changed
```

Ne garder que les rubriques qui ont du contenu ; ne jamais imprimer un titre vide. Versions les
plus récentes en premier. Toute section porte un NUMÉRO DE VERSION — jamais `[Unreleased]`, jamais
un titre d'attente. Celle de la version qu'on prépare s'écrit à l'étape 4, donc AVANT le tag :
c'est précisément elle que `release.yml` ira lire, et son absence est ce qui fait refuser.

## Les règles qui ne se devinent pas

* **Une seule ligne physique par puce et par paragraphe. Jamais de repli à la main.** Une note
  est collée telle quelle dans un corps de Release, qui est du « user content » comme un
  commentaire : GitHub y rend une simple fin de ligne en SAUT DE LIGNE littéral. Une puce
  repliée, qui se lit comme de la prose dans le dépôt, arrive hachée en plein milieu d'une
  phrase sur la page publiée. Huit releases ont été publiées ainsi avant que la règle ne soit
  écrite. `tests/release-notes.test.ts` la tient désormais.
* **Tout lien est une URL `https://github.com/Reefact/conventional-comments-toolkit/...`
  complète.** Un lien relatif marche dans le dépôt et ne résout rien dans un corps de Release,
  qui n'a pas de répertoire.
* **Un fichier par version MAJEURE.** Une 2.0.0 ouvre `docs/release-notes-2.x-en.md` et son
  jumeau ; on n'ajoute pas à la 1.x fermée. `release.yml` dérive la majeure, il ne la connaît
  pas d'avance.
* **Les deux langues portent EXACTEMENT les mêmes versions.** Le garde ne lit que l'anglais :
  rien d'autre ne verrait le français dériver. Un test compare les deux listes.
* **Ne rien traduire de ce qui est un nom** : `mode: off`, `.cct-subject`, `toolCommands`,
  `enforce` traversent le français inchangés.
* **Calme, pas promotionnel.** Une annonce de produit, pas un communiqué.
