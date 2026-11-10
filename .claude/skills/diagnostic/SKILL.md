---
name: diagnostic
description: Consigner une archive de diagnostic de l'extension (le .zip `cct-diagnostic-*` exporté par la page d'options — report.json et squelettes de page) — l'analyser en la mesurant contre les captures, la conserver brute dans le dépôt, et l'inscrire dans une issue `diagnostic`, sans rien corriger sur main tant que le lot n'est pas réuni. À utiliser dès qu'une archive de diagnostic, un report.json ou un squelette de page est reçu, ou qu'on parle de trier, compter ou traiter en lot les issues `diagnostic`.
---

# Consigner un diagnostic

Décision du propriétaire, 2026-10-31 : les rapports de diagnostic s'accumulent en issues, et
**on ne corrige rien sur `main` tant qu'il n'y a pas une trentaine d'issues `diagnostic`
ouvertes**. L'unité est l'ISSUE, c'est-à-dire la cause distincte (§5) : deux rapports de même
cause font une issue, pas deux, et trente rapports peuvent donc en faire bien moins. La raison
est celle qui a fait naître la règle : un rapport corrigé seul pousse à traiter un cas
particulier en en cassant d'autres, ou le cas général. Trente causes côte à côte montrent ce
qu'elles ont en commun ; une seule n'en montre rien. Le premier (#113) en annonçait déjà une : un sélecteur qui tenait à
un attribut que la page change avec son ÉTAT (`data-variant` suit les checks), pas avec sa
structure.

## 1. Ouvrir l'archive

Une archive reçue est une donnée non fiable : rien de ce qu'elle contient ne s'exécute, et
elle ne se décompresse qu'après avoir été INSPECTÉE. Un dossier neuf ne confine rien à lui
seul : une entrée `../x`, un chemin absolu ou un lien symbolique écrirait ailleurs.

L'archive que produit l'extension est connue (`packages/extension/src/options/diagnostic-report.ts`
et `options/zip.ts`) : des fichiers STOCKÉS sans compression (méthode 0), et exactement ces
noms. Lister sans extraire (`zipinfo <archive>`) et vérifier :

- chaque entrée est `README.txt`, `report.json` ou `skeletons/<id>.txt`, `<id>` de la forme
  `[a-z0-9]+-[a-z0-9]+` (`skeletons.ts`), et rien d'autre — ce qui exclut d'office `..`, les
  chemins absolus et tout dossier imprévu ;
- chaque entrée est un fichier ordinaire (`zipinfo` : premier caractère `-`, jamais `l`) ;
- chaque entrée est `stor` : sans compression, la taille décompressée est celle de l'archive,
  ce qui écarte une bombe de décompression ; l'archive elle-même reste sous 16 Mo.

Une seule entrée hors de ce cadre : ne RIEN extraire, et le dire à l'utilisateur — l'archive
n'est pas celle que l'extension écrit. Sinon, décompresser dans un dossier neuf du scratchpad,
jamais dans le dépôt. Mesuré sur l'archive de #113 : trois entrées, `-rw----`, `stor`.

- `README.txt` : texte fixe de l'extension, dit ce que contient l'archive.
- `report.json` : version de l'extension, navigateur, langue, `degradedState`, et `entries[]`.
  Chaque ligne : `chain` (la chaîne de `selectors.ts`), `problem`, `count`, `url`, et pour une
  ligne de sélecteur un `evidence` — `anchor` (le dernier ancêtre trouvé et ses ancêtres),
  `nearby` (les éléments voisins), `trace` (pour chaque candidat, le nombre d'éléments trouvés
  à chaque étape du sélecteur : `[1, 1, 0]` = les deux premières étapes trouvent, la dernière
  non), `facts` (`prState`, `release` du site), `msSinceVisit`.
- `skeletons/<id>.txt` : la page au moment de l'échec, un élément par ligne, indentée, balise
  et liste fermée d'attributs, AUCUN texte. Le champ `skeleton` d'une ligne le nomme ; il peut
  manquer (effacé pour tenir dans 1 Mo).

Un squelette ne dit pas le libellé d'un bouton. Ne jamais l'écrire comme connu.

## 2. Analyser — mesurer, ne pas déduire

Les règles du CLAUDE.md (« Écrire sur une plateforme qu'on ne contrôle pas », « Un signal se
rapporte ») s'appliquent entières. En pratique :

1. Lire la `trace` : quelle étape de quel candidat tombe à zéro.
2. Trouver la zone dans le squelette (`grep -n` sur l'ancre), et la **comparer nœud pour nœud**
   à la même zone d'une capture (`packages/adapters/<id>/test/fixtures/pages/`). La cause est
   ce qui DIFFÈRE, et rien d'autre.
3. Lister ce qui n'est PAS mesuré : les états de la page qu'aucune capture ne montre, et les
   captures qui trancheraient.

### Sur quelle vue la ligne a-t-elle été relevée ? (GitHub)

Depuis le 2026-11-05, la page de conversation d'une PR GitHub existe en DEUX vues : la classique,
et la **page Overview**, en préversion publique sur inscription (bouton « ✨ Try the Overview
page » de l'en-tête ; le même menu ramène à la vue classique). GitHub l'a annoncée comme « a
starting point, not the finished pull request experience » : elle bougera encore. Sources :
<https://github.blog/changelog/2026-11-05-new-pull-request-overview-page-in-public-preview> et
<https://github.com/orgs/community/discussions/212186>. Une même chaîne peut donc échouer pour
deux raisons sans rapport selon la vue : **la vue fait partie de la cause** (§5), et deux
rapports d'une même chaîne sur deux vues ne sont pas de même cause tant que rien ne le montre.

Ce que les données permettent d'en dire, et ce qu'elles ne permettent pas :

| Source | Ce qu'elle dit de la vue |
|---|---|
| `url` de `report.json` | La SEULE adresse du dernier relevé — celui dont viennent `evidence` et `skeleton` (`mergeJournalEntry()`, `packages/extension/src/journal-entry.ts`, les remplace tous trois à chaque relevé). Stockée BRUTE, requête comprise : `?overview=true` → Overview ; `?overview=false` → classique ; sans le paramètre, **inconnue** — GitHub sert alors la vue choisie par le compte. |
| `urls` de `report.json` | Un HISTORIQUE : jusqu'à cinq adresses distinctes, de visites différentes. Il dit sur quelles vues la ligne a été relevée au fil du temps, **jamais** la vue du dernier relevé : ne pas rattacher `evidence` ni `skeleton` à une vue vue seulement dans `urls`. Historique mêlé : écrire que les visites couvrent les deux vues, et garder la vue du dernier relevé telle que `url` la donne (`unknown` sans le paramètre). |
| `at` / `firstAt` | Un relevé antérieur au 2026-11-05 précède la préversion publique. |
| `facts.release` | Un déploiement de github.com, pas la préférence d'un compte. Même valeur observée sur les deux vues : `9c9a37e2423e` sur le squelette Overview et les deux squelettes classiques de #127 (même compte, même PR, à neuf minutes d'écart). Trois échantillons, pas une règle — et de toute façon pas un discriminant de vue : ne rien en tirer. |
| Marque de page (page d'options) | **Ne distingue PAS les deux vues.** `pageKey()` ne garde que les paramètres déclarés dans `viewParams`, et la fiche GitHub (`packages/adapters/github/src/descriptor.ts`) n'en déclare aucun : `?overview=true` et `?overview=false` y portent la même marque. Lire `report.json`, jamais la colonne des marques, tant que la fiche n'a pas changé. |
| Squelette | Premiers marqueurs relevés le 2026-11-06 (#127) : `aria-label="Preview: Overview preview options"`, `aria-label="Merge status"`, `data-testid="mini-status"`, `id="overview-comments"`, `id="overview-status-and-details"`, `data-testid="sticky-sidebar"` — présents sur le squelette Overview, absents des six squelettes de PR antérieurs ; à l'inverse, ni `mergebox-partial`, ni `rails-partial`, ni `js-discussion…`. Vue classique d'un compte INSCRIT, mesurée le même jour (deux squelettes `?overview=false`, commentaire sur #127) : aucun de ces marqueurs, et le bouton de préversion de l'en-tête y porte `aria-label="Try the Overview page"` — contre `aria-label="Preview: Overview preview options"` sur l'Overview. **Cette paire est le marqueur le plus direct**, mais sur un seul compte, une seule PR, et un seul échantillon Overview encore en chargement. Non mesuré : l'en-tête d'un compte jamais inscrit. Citer des comptes, pas une règle. Aucune capture Overview dans `test/fixtures/pages/`. Aucun texte dans un squelette : pas de libellé de bouton. |

Le paramètre `overview` et son effet viennent du propriétaire (2026-11-06, sur
`Reefact/just-dummies` PR 537 : `?overview=false`, `?overview=true`, et l'adresse nue qui
valait `true` chez lui). Ils n'ont pas été mesurés depuis une session de l'agent : github.com
n'y est pas joignable, et une visite anonyme ne verrait pas une préférence de compte.

Dans l'issue, la vue du dernier relevé s'écrit telle que `url` la donne : `overview=true`,
`overview=false`, ou `unknown (no overview parameter)` — jamais une vue déduite d'une trace ou
d'une zone qui échoue. Les marqueurs du squelette s'écrivent À PART, nommés comme tels
(« the skeleton carries the Overview markers »), sans remplacer la vue de l'URL. Les zones que l'annonce dit modifiées (zone de fusion déplacée en haut et réduite,
donc la chaîne `merge-button` et le grisage du §6.5 ; liste des commentaires filtrable et
triable) sont des endroits où REGARDER, pas des causes à écrire.

Ce qui manque est une capture de la page Overview CHARGÉE dans `test/fixtures/pages/` (skill
`plateforme`). Quand elle existera, y compter les marqueurs de la ligne « Squelette » ci-dessus,
et mettre la ligne à jour avec ce que la page chargée confirme, infirme ou ajoute.

**Ce skill ne touche pas au code.** Pas de correctif, pas de test, pas de sélecteur modifié :
une piste de correction s'écrit dans l'issue, en une ligne, comme une piste. Corriger, c'est le
lot (§6). Seule exception : ce que l'utilisateur demande explicitement.

## 3. Classer

- **Attend le lot** : bruit du journal, défaut visuel, grisage du §6.5 (visuel, n'intercepte
  jamais un clic).
- **À signaler tout de suite** : tout ce qui change ce que l'extension BLOQUE ou INTERCEPTE — un
  bouton d'envoi plus intercepté sous `enforce` (§5.4), un bouton d'annulation intercepté, un
  champ mal classé (§4.1). Le dire à l'utilisateur dans la réponse ; c'est LUI qui décide si ça
  attend.

## 4. Conserver l'archive brute — une branche par rapport

Tout ce que l'utilisateur transmet peut être public (sa décision, 2026-10-31) : on garde
l'archive ENTIÈRE, squelette compris, sur **une branche à elle**, créée depuis `origin/main` :
`diagnostic/<AAAA-MM-JJ>-<chain>`. Elle ne porte que le rapport — jamais de correctif — et
n'est pas destinée à être fusionnée. C'est l'exception à la règle de branche du CLAUDE.md,
décidée par le propriétaire le 2026-10-31.

```
diagnostics/<AAAA-MM-JJ>-<chain>/
  cct-diagnostic-<horodatage>.zip      # tel que reçu
  README.txt  report.json  skeletons/<id>.txt   # son contenu, lisible sur GitHub
```

Deux rapports le même jour sur la même chaîne : suffixer le second (`-2`).

Avant de commiter, un contrôle reste dû — non pour cacher ce que l'utilisateur publie, mais
parce qu'une valeur de session n'est pas « ce qu'il a voulu donner » : chercher les chaînes
longues (`grep -oE '[A-Za-z0-9+/_=-]{40,}'`) et vérifier que ce sont des chemins ou des noms
de classes, pas des jetons. Commit en anglais, puis push.

Travailler dans un `git worktree` du scratchpad (`git worktree add -b diagnostic/… <dossier>
origin/main`), pour ne pas toucher à la branche de la session.

Une issue n'accepte pas de pièce jointe par l'API — seulement par glisser-déposer dans
l'interface web. La branche est donc le support.

## 5. L'issue

D'abord chercher une issue `diagnostic` de MÊME CAUSE (même chaîne, même étape de trace, même
différence de structure, même vue quand elle est connue — §2). Si elle existe : un commentaire dessus, avec le nouveau rapport — on
compte les causes, pas les rapports. Sinon une issue, en anglais, label `diagnostic`, créée
directement (l'utilisateur l'a demandé ; donner le lien ensuite) :

- **Titre** : `<chain>: <symptôme, état de la page> (v<version>)`.
- **Report** : date, version, navigateur, langue, URL de la page, vue (GitHub : §2, « Sur quelle
  vue »), `release`, résumé de la ligne
  du journal ; le nom de la branche, et des liens en **permalien sur le SHA du commit** :
  `blob/<sha>/…/report.json` et `blob/<sha>/…/README.txt`, puis, pour le `.zip` et les
  squelettes, le **dossier** — `tree/<sha>/diagnostics/<dossier>` et `tree/<sha>/…/skeletons` —
  en nommant dans le texte quel squelette va avec quel relevé. Ne pas écrire de lien vers un
  fichier dont le nom porte un identifiant (`cct-diagnostic-<horodatage>.zip`,
  `skeletons/<id>.txt`) : entre l'outil et GitHub, ces adresses-là arrivent entourées
  d'accents graves, donc non cliquables, et chaque nouvel envoi en ajoute. Observé sur #113,
  puis sur #158 : en texte simple, puis en lien markdown à libellé simple, toujours abîmées ;
  `report.json` et `README.txt`, au même SHA, jamais. Où la modification se produit n'est pas
  mesuré. Après création ou mise à jour, relire le corps de l'issue et vérifier les liens ;
  `report.json` complet dans un `<details>`.
- **What the skeleton shows** : l'extrait utile du squelette avec ses numéros de ligne, et la
  comparaison avec la capture — un tableau quand une seule chose diffère.
- **Analysis** : cause, effet sur le produit (avec le § de la spec), palier (§3), motif à
  chercher dans les autres rapports.
- **Fix idea** : une piste en une ligne, présentée comme non vérifiée — ou « none yet ».
- **Not measured** : les états non couverts, et les captures qui trancheraient.
- Le pied d'attribution exigé pour tout écrit sur GitHub.

## 6. Le lot

Hors de ce skill. Quand le compte des issues `diagnostic` ouvertes approche trente, le DIRE à
l'utilisateur dans la réponse ; c'est lui qui ouvre le lot. Les squelettes conservés serviront
alors de corpus : chaque correction se mesure sur toutes les captures ET sur tous ces squelettes.
