# Exploitation — activation, retour arrière, prérequis `enforce`

Ce document rassemble les procédures d'exploitation dispersées dans la spécification et
que le §14 désigne comme prérequis à `P6`. Il est le livrable attendu **avant** tout
passage en `enforce` sur un dépôt pilote (§6.3.3, §14).

**Préalable à tout ce qui suit : aucun vérificateur n'est livré.** Le compagnon serveur est
retiré, et son remplacement — un vérificateur qui s'exécute dans la plateforme et ne retient
rien (§6.4, §A.8) — est suivi par
[l'issue #56](https://github.com/Reefact/conventional-comments-toolkit/issues/56). Les
procédures ci-dessous sont donc la cible, pas l'état : elles décrivent ce qui se décidera le
jour où un vérificateur publiera un statut. Ce qui vaut dès aujourd'hui, c'est l'extension,
qui n'a jamais bloqué quoi que ce soit (§2).

## Trajectoire d'adoption (§7)

À partir du mode `assist` livré par défaut :

```
assist (2 semaines) → warn (2 à 4 semaines, suivi du taux de conformité)
                    → enforce sur un dépôt pilote → généralisation
```

`assist` et `warn` sont identiques côté extension (assistance + diagnostics, jamais de
blocage). Ce qui les distingue est côté vérificateur : `assist` ne publie aucun statut,
`warn` publie un statut vert dont le résumé rend la non-conformité visible. `warn` est
l'étape de mesure, et c'est aussi le rapport à blanc : le corps du check liste exactement
ce qui échouerait sous `enforce`, avec un lien permanent par commentaire.

## Prérequis au passage en `enforce` (§14)

1. **`resolverOverrideGroup` est désigné** (§8.2). Sans groupe habilité, les deux soupapes
   du §6.3 sont inertes simultanément — ni `decision`, ni exemption de PR — et un fil dont
   l'auteur est indisponible bloque la PR sans recours. Sur GitHub, c'est une **liste de
   comptes**, des logins séparés par des virgules : un slug d'équipe n'y habilite personne
   (§A.7).
2. **La procédure de retour arrière est écrite et son exécutant désigné** (§6.3.3, ci-dessous).
3. **`activation.activatedAt` est posée** (§6.2.3). Sans elle, le vérificateur publie un
   `neutral` quel que soit le mode — et `neutral` **satisfait** une vérification
   obligatoire : la barrière serait verte et les règles ne s'appliqueraient plus.
4. **Le check est déclaré obligatoire, et l'option interdisant le contournement des règles
   est activée** (§6.2.2, annexes) — sans quoi O3 n'est pas satisfait pour les
   administrateurs : *Require status checks to pass* sur `conventional-comments`, et
   *Do not allow bypassing the above settings*.
5. **Le workflow compagnon des forks est en place**, ou l'autre branche de l'alternative est
   écrite : *les PR de forks et de Dependabot ne sont pas soumises au contrôle*. Sans
   l'un ni l'autre, ces PR portent un statut vert qui cesse d'être rafraîchi dès qu'un
   relecteur écrit (§A.8).
6. **Le dépôt n'emploie pas de merge queue.** Le vérificateur ne se déclenche pas sur un SHA
   de *merge group* : le check n'y arrive jamais, et la file ne se vide plus (§A.8).

**Azure DevOps n'a pas de vérificateur** (§B.7) : rien de ce qui précède ne s'y applique, et
l'extension y reste un composant d'assistance, contournable par construction (§2).

## Procédure de retour arrière (§6.3.3)

Le passage de `enforce` à un mode inférieur doit être réalisable **en quelques minutes sur
l'ensemble des dépôts**, sans intervention par dépôt.

**`warn` est le mode de repli, pas `off`.** En `warn`, le vérificateur continue de publier
un statut jamais en échec, ce qui débloque immédiatement les PR **sans exiger le retrait de
la protection de branche**. `assist` et `off` ne publient aucun statut : y revenir depuis
`enforce` exige de retirer d'abord la protection, sans quoi l'absence de statut bloque
toutes les PR.

**Exécutant désigné :** l'administrateur de l'organisation qui détient l'accès à la
configuration d'organisation (canal du plancher / `configUrl`).

Ordre des opérations pour un retour arrière d'urgence :

1. Passer le `mode` à `warn` dans la **configuration d'organisation** (point de bascule,
   §8.1). Un assouplissement du `mode` est une modification élargissante : il s'applique
   aux PR déjà ouvertes sans attendre leur fermeture (§8.1.3, règle 1).
2. **Rien à invalider côté vérificateur.** Il ne met aucune lecture en cache et relit les
   trois niveaux à chaque exécution : le prochain événement sur une PR applique déjà le
   nouveau mode. Seule l'**extension** cache la configuration, pour
   `configCacheTtlSeconds` (une heure par défaut) — et elle ne bloque jamais rien.
   Précédemment, cette étape décrivait une sonde du document d'organisation et un point
   d'entrée d'invalidation : tous deux appartenaient au service compagnon, et il n'y a plus
   de cache à invalider là où le blocage se décide.
3. Vérifier qu'un statut vert `warn` réapparaît sur une PR témoin. Si rien ne se publie,
   c'est qu'aucun événement n'est survenu depuis : l'exécution planifiée y pourvoit dans
   l'intervalle de son cron, et `workflow_dispatch` force la main immédiatement.

Pour revenir plus bas que `warn` (`assist`/`off`), retirer **d'abord** la protection de
branche, **puis** changer le mode.

## Soupapes d'urgence par PR (§6.3)

- **Fil précis qu'on décide de ne pas traiter** → réponse `decision` dans le fil, par un
  membre de `resolverOverrideGroup`, motif ≥ `minDecisionSubjectLength` (défaut 20). C'est
  une décision de revue, tracée dans la PR (§6.1.1).
- **PR entière en urgence** → exemption au niveau PR (§6.3.2) : poser l'étiquette
  `cc-override`. Le droit de la poser est restreint aux membres de
  `resolverOverrideGroup`, et il est vérifié **a posteriori** — GitHub ne sait pas
  restreindre qui ajoute une étiquette. Une étiquette posée par quelqu'un d'autre est
  refusée et le fait signalé (`exemption-refused`).

  L'exemption **se remet à zéro** dès qu'un commentaire bloquant postérieur à sa pose
  apparaît : le vérificateur retire alors l'étiquette (`exemption-reset`), ce qui exige
  `pull-requests: write` sur le jeton. Ce n'est pas un cas de repli, c'est le
  fonctionnement normal.

Le chemin d'administration qu'une rédaction antérieure décrivait ici — octroi et révocation
d'exemption par un point d'entrée HTTP, pour une plateforme n'exposant pas la provenance des
étiquettes — appartenait au service compagnon. Sur GitHub, la provenance est exposée par
l'API de timeline, et le mécanisme d'étiquette suffit.

## Phases sans dépendance de code, mais qui conditionnent le calendrier (§14)

- **P0 (irrattrapable).** Le « délai total de revue avant » (§12) ne peut être collecté
  qu'avant l'arrivée de l'outil. À lancer en tout premier, indépendamment du code.
- **Revue des stores.** Toute livraison du composant A y passe (§10). Amorcer une
  soumission « coquille » dès `P2` pour découvrir le processus sur un enjeu faible.
- **Déclarer le check obligatoire** est une tâche d'administration d'organisation, à
  coordonner avec les propriétaires des dépôts et à planifier avec `P6`.

## Indicateurs (§12)

**Il n'existe aujourd'hui aucun code qui les produise**, et c'est un choix assumé plutôt
qu'un oubli : ils étaient un point d'entrée du service compagnon, et le §12 pose qu'aucun
d'eux n'exige d'être collecté au fil de l'eau. Chacun est une fonction de ce que la
plateforme conserve — corps et auteurs des commentaires, état de résolution des fils,
horodatages — et se recalcule par lot, rétroactivement, sans rien persister.

Ce qui reste à faire le jour où on les voudra : un script qui lit l'API de la plateforme et
rejoue `validate()` sur l'historique. Les règles à appliquer, elles, sont déjà écrites :
taux de conformité par **commentaire** (comptes de service exclus), taux d'avertissement
suivi séparément, répartition par label, part des comptes de service, nombre de fils clos
par `decision`. Les motifs de `decision` ne sont **jamais** extraits — ils restent lisibles
un par un dans la PR (§10, §12).
