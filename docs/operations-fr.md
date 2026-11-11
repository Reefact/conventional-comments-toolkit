# Exploitation — trajectoire, prérequis `enforce`, retour arrière

Ce document rassemble les procédures d'exploitation que le §14 désigne comme prérequis à
`P6` : le passage en `enforce` sur un dépôt pilote, puis sa généralisation. **`P6` dépend de
`P4`** (§14), et `P4` n'est pas terminée : les indicateurs du §12 ne sont pas encore
calculables (voir « Indicateurs » ci-dessous). Choisir le pilote et écrire la procédure de
retour arrière peuvent se faire dès maintenant ; le passage en `enforce`, non.

**Ce que `enforce` contrôle, et ce qu'il ne contrôle pas.** Le produit est l'extension, et
elle seule (§2). En `enforce`, elle bloque l'**envoi** d'un commentaire non conforme dans le
navigateur où elle est installée (§5.4) ; elle ne contrôle **pas** la complétion d'une PR. Les
fils bloquants non résolus sont signalés par le bandeau du §5.5, jamais empêchés de fusionner
(DEC0010). Aucun statut n'est publié, aucune protection de branche
n'est à configurer pour l'extension, et `enforce` reste contournable par construction : l'API,
une CLI, un autre navigateur ou un poste sans l'extension y suffisent (§2).

*Sans valeur normative : une équipe qui veut empêcher la fusion d'une PR dont des
conversations restent ouvertes s'appuie sur les options natives de sa plateforme, par exemple
la résolution obligatoire des conversations.*

## Trajectoire d'adoption (§7)

À partir du mode `assist` livré par défaut :

```
assist → enforce sur un dépôt pilote → généralisation
```

L'échelle a trois modes : `off`, `assist`, `enforce`. **`warn` est retiré** : il était
identique à `assist` côté extension. Une configuration ou un plancher qui écrit encore
`"warn"` est lu comme `"assist"`, et la lecture produit un avis `config-warning` (valeur
obsolète) — le remplacer par `"assist"`.

Durcir la configuration (labels, sévérités, `blockingByDefault`) vaut **en direct** pour les
PR déjà ouvertes (§8.1.3, règle 1) : le faire en `assist`, observer ce que la pastille et le
bandeau signalent, puis passer en `enforce`.

## Prérequis au passage en `enforce` (§14)

**La procédure de retour arrière est écrite et son exécutant désigné** (ci-dessous), y compris
l'ordre des opérations et la **liste des dépôts** qui écrivent eux-mêmes `"mode": "enforce"`
dans leur fichier `.conventional-comments.json` : la configuration d'organisation ne
l'emporte pas sur eux (§8.1.2). Cette liste se dresse avant la bascule, pas pendant l'incident.

C'est le seul prérequis d'exploitation que le §14 retient, en plus de la dépendance de `P6`
à `P4`. Ceux qu'une rédaction antérieure énumérait — un
groupe habilité à résoudre ou à exempter, une date d'activation, un check déclaré obligatoire,
la couverture des forks, l'absence de merge queue — n'existaient que pour le vérificateur,
retiré (§2).

## Procédure de retour arrière (§8.1.3, règle 3)

Le passage de `enforce` à un mode inférieur doit être réalisable **en quelques minutes**, sans
intervention sur les dépôts qui n'écrivent pas eux-mêmes leur `mode`.

**Exécutant désigné :** l'administrateur de l'organisation qui détient l'accès à la
configuration d'organisation (`configUrl` du plancher) et, le cas échéant, à la stratégie
d'entreprise qui porte le plancher.

Ordre des opérations :

1. **Le plancher**, s'il impose `minimumMode: "enforce"` (§8.1.1) : l'assouplir dans la
   stratégie d'entreprise. Aucun des deux niveaux suivants ne peut le faire à sa place.
2. **La configuration d'organisation** (point de bascule, §8.1) : passer son `mode` à
   `assist`. Cela vaut pour tous les dépôts qui n'écrivent pas leur propre `mode`.
3. **Chaque dépôt de la liste préparée** qui écrit `"mode": "enforce"` : modifier son fichier.

**Rien à attendre ni à invalider.** Avant de bloquer un envoi, l'extension relit sa
configuration en contournant son cache (§8.1.3, règle 3) : un assouplissement lève donc tout
blocage dès la tentative d'envoi suivante. Cette tentative est retenue le temps de la
relecture, puis le contrôle d'envoi est libéré et un message invite à renvoyer — l'extension
ne rejoue pas l'envoi. L'affichage (pastille, diagnostics) peut garder l'ancien mode jusqu'à
l'expiration de `configCacheTtlSeconds` (une heure par défaut), ce qui ne bloque rien.

**Vérification :** sur une PR témoin, envoyer un commentaire sans label ; il doit partir.

## Clore un fil bloquant sans faire le changement demandé (§6.1.1)

La réponse qui acte ce choix porte le label `decision`, dans le fil qu'elle clôt, avec un
motif d'au moins `rules.minDecisionSubjectLength` caractères (20 par défaut) — en deçà,
`E-DECISION-SUBJECT`. C'est une **convention de revue outillée**, rien de plus : `decision`
ne résout pas le fil, et la résolution reste un geste de la plateforme, fait par qui elle y
autorise. Aucun groupe habilité n'est requis, et aucune étiquette n'exempte une PR.

Un fil est compté résolu **tel que la page l'affiche, quel que soit l'auteur de la
résolution** (§6.1).

## Clés de configuration retirées (§8.2)

`formatSeverity`, `overrideLabel`, `resolverOverrideGroup`, `activation` et `docUrl` ne
servaient qu'au vérificateur et ont quitté le schéma. Une configuration — de dépôt,
d'organisation ou de plancher — qui les porte encore reste lisible : chacune y est une clé
inconnue, ignorée et signalée (`config-warning`, §8.1.5), sans repli. Les retirer fait
disparaître l'avis.

## Revue des stores (§14)

Toute livraison de l'extension y passe (§10), avec un résultat incertain sur les permissions
d'hôte : un délai subi, à intégrer au calendrier de `P6`.

## Indicateurs (§12)

Le §12 les limite à ce que la télémétrie de l'extension compte — désactivée par défaut,
opt-in explicite, compteurs agrégés sans texte libre (§10) : taux de conformité à la saisie,
taux d'avertissement suivi séparément, répartition par label (labels de réponse comptés à
part). L'extension ne relit pas l'historique des PR : délais de résolution ou de revue, fils
clos par une `decision` et part des comptes de service n'en font pas partie.

**Ces indicateurs ne sont pas encore calculables.** La télémétrie livrée émet trois compteurs
(`TelemetryEvent`, `packages/extension/src/telemetry.ts`) : un label posé **par l'extension**
(barre d'outils, saisie rapide), un code de diagnostic apparu, une dégradation de sélecteur.
Aucun événement ne compte les commentaires saisis ou envoyés, ni leur issue conforme ou non :
les deux taux n'ont donc pas de dénominateur, et un label tapé ou collé à la main manque à la
répartition. Le suivi de la phase `assist` se fait, en attendant, à l'œil — pastille et
bandeau —, pas sur un taux.
