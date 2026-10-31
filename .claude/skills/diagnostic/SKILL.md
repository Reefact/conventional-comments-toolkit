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
différence de structure). Si elle existe : un commentaire dessus, avec le nouveau rapport — on
compte les causes, pas les rapports. Sinon une issue, en anglais, label `diagnostic`, créée
directement (l'utilisateur l'a demandé ; donner le lien ensuite) :

- **Titre** : `<chain>: <symptôme, état de la page> (v<version>)`.
- **Report** : date, version, navigateur, langue, URL de la page, `release`, résumé de la ligne
  du journal ; le nom de la branche, et des liens vers le `.zip` et chacun de ses fichiers en
  **permalien sur le SHA du commit**. Écrire ces liens en texte simple : un lien dont le
  libellé est entre accents graves est arrivé abîmé sur #113 ;
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
