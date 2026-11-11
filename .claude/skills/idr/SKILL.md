---
name: idr
description: Vérifier une pull request contre le registre des décisions (`docs/idr/`), et mener avec le propriétaire l'échange puis la rédaction d'un Important Decision Record quand une décision importante est en jeu. À utiliser avant de finaliser une pull request, dès qu'un changement touche un choix durable — contrat entre composants, périmètre du produit, plateforme ou hôte supporté, règle de travail du dépôt, politique de sécurité ou de données —, ou quand on parle d'écrire, de remplacer ou de consulter un IDR.
---

# Les décisions du dépôt

Le registre est `docs/idr/` (DEC0001). Ses règles sont dans [`README-fr.md`](../../../docs/idr/README-fr.md) ;
elles reprennent le guide IDR du propriétaire, qui fait référence. **La vérification est
l'habitude ; l'IDR est l'exception** : la plupart des pull requests ne portent aucune décision.
La vérification est **consultative** et ne bloque jamais rien.

Tu **proposes**, tu n'acceptes pas : un IDR que tu écris est au statut **Proposé**, et tu ne
changes jamais un statut sans que le propriétaire te le demande — comme aucun agent ne fusionne
une pull request.

## 1. Choisir, ne pas tout lire

1. Lire seulement l'index : `grep '^| \[DEC' docs/idr/README-fr.md`.
2. Retenir les **2 à 5** décisions dont le titre peut toucher ce changement. Rapprocher sur le
   **sujet** que le changement touche, pas sur les mots du diff.
3. Lire celles-là, et seulement celles-là. N'élargir que si l'une en cite une autre.
4. Une décision dont le statut dit « Remplacé par DECxxxx » est de l'histoire : lire son
   remplaçant.

## 2. Décider de l'issue

Une décision mérite un IDR si c'est un **vrai choix, durable** : une décision dont un futur
mainteneur demanderait « pourquoi a-t-on fait comme ça ? ». Le test : **si l'implémentation
changeait mais que la décision tenait, l'IDR n'aurait pas à changer.**

**N'en méritent pas** : une correction de bug, un refactoring sans changement de contrat, la
mise en forme, une valeur qui suit une règle existante, les tests, la documentation, les
traductions, une montée de dépendance de routine, un réglage d'outillage sans changement de
règle — et ce qui relève de la spécification, qui dit le *quoi* et reste normative.

**Pencher fortement vers le silence.** Une fausse alerte sur un changement de routine apprend au
propriétaire à ignorer la vérification.

Quatre issues ; écrire le résultat dans la description de la pull request :

| Issue | Ce que tu fais |
|---|---|
| **Aucune décision** | Le dire en une ligne. S'arrêter. |
| **Nouvelle décision** | Ouvrir l'échange (§3) avec le propriétaire. |
| **Remplacement** | La pull request change une décision consignée : ouvrir l'échange sur le **remplaçant**. Ne jamais modifier l'IDR existant. |
| **Contradiction** | La pull request contredit un IDR accepté : ne pas continuer en silence. Le signaler — `⚠️ Contredit DECnnnn (<titre>)` et la contradiction précise — et laisser le propriétaire trancher : un remplacement, ou un changement du code. |

## 3. L'échange — le mode par défaut

Tant que le propriétaire n'a pas **explicitement** demandé la rédaction, on est en échange, pas
en rédaction. Ne pas transformer le format en questionnaire : analyser ce qui est déjà connu,
puis ne poser que les questions utiles, regroupées.

- distinguer les **faits** des **arguments** ;
- détecter incohérences, ambiguïtés et informations manquantes ;
- challenger les vrais enjeux et les angles morts plausibles — ni approbation automatique, ni
  contradiction de principe ;
- proposer des alternatives crédibles **dans ce contexte**, jamais improbables ;
- explorer conséquences, risques et actions de suivi.

Le propriétaire peut **arbitrer** un point à tout moment : il n'est plus rouvert spontanément,
mais ses effets sur le reste continuent d'être analysés. Une décision qui en contient plusieurs
indépendantes se signale, et sa séparation en plusieurs IDR se propose.

**Ne rien inventer** : une hypothèse, une alternative, une conséquence ou un risque n'entre dans
l'IDR qu'une fois validé par le propriétaire.

## 4. La rédaction — sur demande explicite seulement

- Ne plus challenger, ne rouvrir aucun arbitrage, n'ajouter aucune information : n'utiliser que
  ce que l'échange a validé.
- Prendre le **numéro libre suivant**. Écrire **deux fichiers** liés l'un à l'autre,
  `DECnnnn-<titre-anglais>-en.md` et `DECnnnn-<titre-anglais>-fr.md` (DEC0002), sur le modèle des
  IDR existants.
- **Le titre** dit la décision en quelques mots, pas la question.
- **Statut** : une ligne `Proposé`, datée du jour, dans un tableau
  `Date | Statut | Note | Compte rendu lié`. Ne jamais inventer une date, une note ou un lien.
- **Contexte** : des faits seulement. **Décision** : exactement une phrase, au présent, sans
  justification. **Justification** : des arguments, chacun appuyé sur un fait du Contexte.
  **Alternatives envisagées** : chacune avec la raison de son rejet. **Conséquences** :
  Positives, Négatives, Risques, Actions de suivi.
- Ajouter la ligne de l'IDR à l'index des **deux** README.
- Pour un **remplacement** : le nouvel IDR dit lequel il remplace ; l'ancien ne gagne qu'une
  ligne de statut, `Remplacé par DECnnnn` — c'est la seule modification permise d'un IDR accepté.
- Citer l'IDR là où la règle qu'il produit est écrite (`CLAUDE.md`, la spécification, un skill),
  plutôt que d'y recopier son *pourquoi*.

## 5. Contrôle de cohérence final

Avant de considérer une rédaction comme terminée :

- chaque argument de la Justification repose sur un fait du Contexte ;
- les alternatives sont crédibles dans ce contexte, le statu quo est envisagé quand il est
  pertinent, et chacune a une raison claire de rejet ;
- les conséquences négatives et les risques ne rendent pas une alternative rejetée préférable ;
- une information découverte pendant ces vérifications est remise à sa place, en général dans
  le Contexte ;
- rien de non validé n'est présenté comme acquis ;
- aucun détail de spécification ou de documentation vivante ne s'est glissé dans l'IDR ;
- la Décision tient en une seule phrase, et ne contient que la décision.
