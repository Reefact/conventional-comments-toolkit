# Exploitation — activation, retour arrière, prérequis `enforce`

Ce document rassemble les procédures d'exploitation dispersées dans la spécification et
que le §14 désigne comme prérequis à `P6`. Il est le livrable attendu **avant** tout
passage en `enforce` sur un dépôt pilote (§6.3.3, §14).

## Trajectoire d'adoption (§7)

À partir du mode `assist` livré par défaut :

```
assist (2 semaines) → warn (2 à 4 semaines, suivi du taux de conformité)
                    → enforce sur un dépôt pilote → généralisation
```

`assist` et `warn` sont identiques côté extension (assistance + diagnostics, jamais de
blocage). Ce qui les distingue est côté serveur : `assist` ne publie aucun statut, `warn`
publie un statut vert dont le résumé rend la non-conformité visible. `warn` est l'étape de
mesure.

## Prérequis au passage en `enforce` (§14)

Les trois premiers valent partout :

1. **`resolverOverrideGroup` est désigné** (§8.2). Sans groupe habilité, les deux soupapes
   du §6.3 sont inertes simultanément — ni `decision`, ni exemption de PR — et un fil dont
   l'auteur est indisponible bloque la PR sans recours. Le composant B émet un
   `config-warning` à chaque évaluation d'un dépôt en `enforce` dont le groupe résolu est
   vide (implémenté : `orchestrator.ts`, testé : CA — « enforce avec resolverOverrideGroup
   vide »).
2. **La procédure de retour arrière est écrite et son exécutant désigné** (§6.3.3, ci-dessous).
3. **Le check est déclaré obligatoire, et l'option interdisant le contournement des règles
   est activée** (§6.2.2, annexes) — sans quoi O3 n'est pas satisfait pour les
   administrateurs.
   - GitHub : *Require status checks to pass* sur le check `conventional-comments`, et
     *Do not allow bypassing the above settings*.
   - Azure DevOps : policy de branche *Status checks*, référençant le statut par son couple
     `genre/name` (`conventional-comments/compliance`), et *Block* plutôt que *Warn*.

Sur **Azure DevOps**, deux prérequis s'ajoutent, tous deux tranchés par le spike `P1'` :

4. **La provenance des étiquettes est établie, ou le repli du §6.3.2 est en place** (§B.6).
   Le repli est implémenté de bout en bout : point d'entrée d'administration
   (`admin.ts`), persistance de l'exemption active (`storage.ts`), pose de l'étiquette
   par le composant B (`AzdoServerAdapter.addLabel`). `azdoFacts.labelProvenanceExposed`
   vaut `false` tant que le spike n'établit pas une source de provenance.
5. **La latence de détection respecte la NFR de 60 s** (§B.7) : voie événementielle
   établie, ou `server.reconcileIntervalSeconds` ≤ 60. Tant que
   `azdoFacts.threadStatusEmitsPrUpdated` vaut `false`, un `config-warning` est émis si
   l'intervalle dépasse 60 s en `enforce`.

## Procédure de retour arrière (§6.3.3)

Le passage de `enforce` à un mode inférieur doit être réalisable **en quelques minutes sur
l'ensemble des dépôts**, sans intervention par dépôt.

**`warn` est le mode de repli, pas `off`.** En `warn`, le composant B continue de publier
un statut jamais en échec, ce qui débloque immédiatement les PR **sans exiger le retrait de
la protection de branche**. `assist` et `off` ne publient aucun statut : y revenir depuis
`enforce` exige de retirer d'abord la protection, sans quoi l'absence de statut bloque
toutes les PR.

**Exécutant désigné :** l'administrateur de l'organisation qui détient l'accès à la
configuration d'organisation (canal du plancher / `configUrl`) et au point d'entrée
d'administration du composant B.

Ordre des opérations pour un retour arrière d'urgence :

1. Passer le `mode` à `warn` dans la **configuration d'organisation** (point de bascule,
   §8.1). Un assouplissement du `mode` est une modification élargissante : il s'applique
   aux PR déjà ouvertes sans attendre leur fermeture (§8.1.3, règle 1).
2. **Invalider le cache** immédiatement — `POST /admin/cache/invalidate` — au lieu
   d'attendre `configCacheTtlSeconds` (une heure par défaut). Sans cette invalidation,
   « quelques minutes » deviendrait « jusqu'au TTL » et le retour arrière cesserait d'être
   une soupape (§6.3.3). L'orchestrateur invalide aussi le cache de lui-même dès qu'il
   observe un assouplissement du mode.
3. Vérifier qu'un statut vert `warn` réapparaît sur une PR témoin.

Pour revenir plus bas que `warn` (`assist`/`off`), retirer **d'abord** la protection de
branche, **puis** changer le mode.

## Soupapes d'urgence par PR (§6.3)

- **Fil précis qu'on décide de ne pas traiter** → réponse `decision` dans le fil, par un
  membre de `resolverOverrideGroup`, motif ≥ `minDecisionSubjectLength` (défaut 20). C'est
  une décision de revue, tracée dans la PR (§6.1.1).
- **PR entière en urgence** → exemption au niveau PR (§6.3.2). Selon la plateforme :
  - provenance exposée (GitHub) : poser l'étiquette `cc-override` — le droit est restreint
    aux membres de `resolverOverrideGroup`, vérifié a posteriori ;
  - provenance non exposée (Azure DevOps) : `POST /admin/exemptions/grant` — l'habilitation
    est vérifiée, l'exemption persistée, l'étiquette posée par le composant B ;
    `POST /admin/exemptions/revoke` pour révoquer.

## Rapport à blanc avant activation (§6.2.4)

Avant toute activation, exécuter le rapport à blanc pour connaître l'ampleur du chantier :

```
POST /admin/dry-run
{ "platform": "github", "repo": { "platform": "github", "host": "github.com",
  "scope": ["org", "repo"] }, "activatedAt": "2026-09-01T00:00:00Z" }
```

Il restitue les commentaires non conformes et les fils bloquants non résolus avec leurs
liens permanents, **sans publier aucun statut**. Il sert aussi à calibrer `activatedAt`.
Pour un dépôt dont le fichier ne porte pas la date, la poser avec
`POST /admin/activated-at`.

## Phases sans dépendance de code, mais qui conditionnent le calendrier (§14)

- **P0 (irrattrapable).** Le « délai total de revue avant » (§12) ne peut être collecté
  qu'avant l'arrivée de l'outil. À lancer en tout premier, indépendamment du code.
- **Revue des stores.** Toute livraison du composant A y passe (§10). Amorcer une
  soumission « coquille » dès `P2` pour découvrir le processus sur un enjeu faible.
- **Déclarer le check obligatoire** est une tâche d'administration d'organisation, à
  coordonner avec les propriétaires des dépôts et à planifier avec `P6`.

## Indicateurs (§12)

Exposés par `GET /admin/indicators/{repoKey}` : taux de conformité (par commentaire,
comptes de service exclus), taux d'avertissement (séparé), répartition par label, part des
comptes de service, nombre de fils clos par `decision`. Les motifs de `decision` ne sont
**jamais** extraits — ils restent lisibles un par un dans la PR (§10, §12).
