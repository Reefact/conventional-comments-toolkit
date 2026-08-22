# Spécification — Extension « Conventional Comments »

**Cibles :** GitHub Enterprise (Server / Cloud EMU) et Azure DevOps (Services / Server)
**Statut :** Draft v0.1 — à valider par l'équipe
**Type de document :** spécifications communes (indépendantes de la plateforme)

---

## 1. Contexte et objectif

L'équipe a adopté [Conventional Comments](https://conventionalcomments.org/) pour les commentaires de revue de code, actuellement sans contrainte technique. L'objectif est de passer d'une convention *encouragée* à une convention *outillée*, puis *appliquée*, sur les deux plateformes utilisées en parallèle.

### Objectifs

| # | Objectif | Priorité |
|---|----------|----------|
| O1 | Tout commentaire de revue respecte le format Conventional Comments | Must |
| O2 | L'écriture au format conventionnel est plus rapide que l'écriture libre | Must |
| O3 | Une PR ne peut pas être complétée tant qu'un commentaire bloquant n'est pas résolu | Must |
| O4 | Expérience identique et cohérente entre GitHub Enterprise et Azure DevOps | Must |
| O5 | Adoption progressive, sans blocage brutal du flux de travail existant | Should |
| O6 | Mesure de l'adoption (taux de conformité, répartition des labels) | Could |

### Non-objectifs

- Ne concerne **pas** les messages de commit (voir Conventional Commits, sujet distinct).
- Ne remplace **pas** les linters, analyseurs statiques ou revues automatisées par IA.
- Ne juge **pas** la qualité ou la pertinence du contenu d'un commentaire, uniquement sa **forme**.
- Ne gère pas GitLab, Bitbucket ou Gerrit (extensibilité prévue, implémentation hors périmètre).

---

## 2. Avertissement d'architecture : périmètre du navigateur

> **Point structurant.** Une extension navigateur agit **côté client uniquement**. Elle peut empêcher un utilisateur de cliquer sur un bouton, mais elle ne peut pas empêcher la publication d'un commentaire via l'API REST, la CLI (`gh`, `az repos`), un IDE (extension VS Code, JetBrains), un autre navigateur, ou un poste sans l'extension.

La solution complète comporte donc **deux composants**. La présente spécification couvre les deux, avec une répartition explicite des responsabilités.

| Composant | Rôle | Garantie |
|-----------|------|----------|
| **A — Extension navigateur** | Assistance à la rédaction, validation en temps réel, blocage de l'envoi | Confort et prévention. Contournable. |
| **B — Compagnon serveur** (webhook / GitHub App / Azure Function) | Vérification a posteriori de tous les commentaires, calcul du statut « commentaires bloquants résolus », publication d'un *status check* | Vérité de référence. Non contournable. |

**Règle de conception :** les deux composants partagent **le même fichier de configuration** et **la même bibliothèque de parsing** (voir §8). Un commentaire jugé conforme par l'extension doit toujours être jugé conforme par le serveur, et réciproquement.

L'exigence O3 (blocage de la complétion de PR) est **techniquement portée par le composant B**. L'extension ne fait qu'en refléter l'état dans l'interface.

---

## 3. Format cible

### 3.1 Grammaire

```
<label> [(<decoration>[, <decoration>]*)]: <subject>

[<discussion>]
```

- `label` — obligatoire, un seul, issu de la liste configurée (§3.2).
- `decoration` — optionnelle, entre parenthèses, séparées par des virgules.
- `:` — séparateur obligatoire, suivi d'au moins une espace.
- `subject` — obligatoire, résumé sur une ligne.
- `discussion` — optionnelle, séparée du sujet par une ligne vide, format Markdown libre.

### 3.2 Labels

Liste par défaut (configurable — voir §8). La colonne « Bloquant par défaut » détermine le comportement décrit au §6.

| Label | Description | Bloquant par défaut |
|-------|-------------|:---:|
| `praise` | Souligne un point positif. À utiliser au moins une fois par revue. | Non |
| `nitpick` | Préférence triviale, sans enjeu réel. Toujours non bloquant. | Non |
| `suggestion` | Proposition d'amélioration argumentée. | Non |
| `issue` | Problème identifié. Idéalement accompagné d'une suggestion. | **Oui** |
| `todo` | Changement petit mais nécessaire. | **Oui** |
| `question` | Demande de clarification sur un point incertain. | Non |
| `thought` | Idée surgie pendant la revue, sans demande d'action. | Non |
| `chore` | Tâche annexe à réaliser avant acceptation (relancer un job, MAJ d'un doc...). | **Oui** |
| `note` | Information à porter à connaissance. Toujours non bloquant. | Non |

Labels optionnels activables par configuration : `typo`, `polish`, `quibble`.

### 3.3 Décorations

| Décoration | Effet |
|------------|-------|
| `(blocking)` | Force le caractère bloquant, quel que soit le label. |
| `(non-blocking)` | Force le caractère non bloquant, quel que soit le label. |
| `(if-minor)` | À traiter uniquement si l'effort est faible. Non bloquant. |

Décorations libres additionnelles (ex. `(security)`, `(perf)`, `(a11y)`) : autorisées si `allowFreeDecorations: true`, sans incidence sur le caractère bloquant.

**Précédence pour déterminer si un commentaire est bloquant :**

1. Décoration explicite `(blocking)` ou `(non-blocking)` → l'emporte toujours.
2. Sinon, valeur `blockingByDefault` du label.
3. Les labels marqués `alwaysNonBlocking` (`nitpick`, `note`, `thought`) rejettent la décoration `(blocking)` — erreur de validation `E-CONFLICT`.

### 3.4 Expression régulière de référence

```regex
^(?<emoji>\p{Extended_Pictographic}\uFE0F?\s+)?(?<label>[a-z]+)(?:\s*\((?<decorations>[^)]*)\))?\s*:\s+(?<subject>\S.*)$
```

Appliquée à la **première ligne non vide** du commentaire, en mode Unicode. Le préfixe emoji est toléré en entrée mais ignoré pour l'analyse.

### 3.5 Règles de validation

| Code | Règle | Sévérité |
|------|-------|----------|
| `E-NO-LABEL` | Aucun label reconnu en tête de commentaire | Erreur |
| `E-UNKNOWN-LABEL` | Label absent de la liste configurée | Erreur |
| `E-UNKNOWN-DECORATION` | Décoration inconnue et `allowFreeDecorations: false` | Erreur |
| `E-CONFLICT` | Décoration incompatible avec le label (§3.3) | Erreur |
| `E-EMPTY-SUBJECT` | Sujet vide ou réduit à une ponctuation | Erreur |
| `E-SUBJECT-TOO-SHORT` | Sujet < `minSubjectLength` (défaut : 10 caractères) | Erreur |
| `W-SUBJECT-TOO-LONG` | Sujet > `maxSubjectLength` (défaut : 120 caractères) | Avertissement |
| `W-MISSING-DECORATION` | Label `suggestion` ou `question` sans décoration explicite | Avertissement |
| `W-NO-DISCUSSION` | Label bloquant sans corps de discussion | Avertissement |
| `W-CASE` | Label saisi avec une majuscule (`Issue:`) | Avertissement + correction auto |

Les **avertissements ne bloquent jamais** l'envoi. Seules les erreurs le font, et uniquement en mode `enforce` (§7).

---

## 4. Périmètre d'application

### 4.1 Zones soumises à validation

| Zone | Validé | Justification |
|------|:---:|---|
| Commentaire inline sur une ligne de diff | ✅ | Cœur de la revue |
| Commentaire de fil de discussion racine (thread parent) | ✅ | Idem |
| Commentaire général sur la PR (« overview » / « conversation ») | ✅ | Idem |
| Corps d'une revue soumise en lot (GitHub *review summary*) | ✅ | Idem |
| **Réponse dans un fil existant** | ⚙️ configurable, **désactivé par défaut** | « Corrigé, merci » ne doit pas exiger un label |
| Description de la PR | ❌ | Hors périmètre Conventional Comments |
| Commentaires de bots et comptes de service | ❌ | Liste blanche par identifiant (§8) |
| Commentaires sur les work items / issues | ❌ | Hors périmètre |

### 4.2 Exclusions de contenu

Un commentaire est **exempté** de validation si :

- il est intégralement constitué d'une citation Markdown (`>`), d'un bloc de code, ou d'un bloc `suggestion` de GitHub ;
- il commence par une commande slash (`/rebase`, `/azp run`, `/lgtm`...) ;
- il correspond à un motif de la liste blanche configurée (regex, ex. `^LGTM$`) ;
- son auteur figure dans `exemptUsers`.

### 4.3 Actions couvertes

La validation doit s'appliquer **à chaque point de sortie**, y compris :

- création d'un commentaire ;
- **édition** d'un commentaire existant ;
- soumission d'une revue en lot (GitHub : plusieurs commentaires *pending* validés en une action → chacun doit être conforme, l'erreur doit indiquer lequel) ;
- envoi par raccourci clavier (`Ctrl+Entrée` / `Cmd+Entrée`) ;
- Azure DevOps : boutons « Comment » **et** « Comment & resolve ».

---

## 5. Assistance à la rédaction (composant A)

### 5.1 Barre d'outils

Injectée au-dessus ou en dessous de chaque zone de saisie concernée.

- Un bouton par label, avec icône, libellé et couleur distincts.
- Sélecteur de décoration (segmenté : *aucune* / *blocking* / *non-blocking* / *if-minor*).
- Le clic sur un label **insère ou remplace** le préfixe existant sans détruire le texte déjà saisi, et repositionne le curseur en fin de préfixe.
- Un second clic sur un label déjà actif le retire (toggle).
- Infobulle au survol : définition du label + exemple, dans la langue de l'interface.

### 5.2 Saisie rapide au clavier

- Déclencheur de complétion : `/` ou `:` en début de zone, ouvrant une liste filtrable au fil de la frappe.
- Navigation `↑` `↓`, validation `Entrée` ou `Tab`, annulation `Échap`.
- Abréviations extensibles par `Tab` : `?i` → `issue: `, `?ib` → `issue (blocking): `, `?s`, `?sn`, `?n`, `?p`, `?q`, `?t`, `?c` (table complète configurable).
- Raccourcis directs configurables (ex. `Alt+I` pour `issue`).

### 5.3 Retour visuel temps réel

- Indicateur d'état permanent sous la zone de saisie : ✅ conforme / ⚠️ avertissement / ❌ non conforme.
- En cas d'erreur : message explicite en français, avec le code (§3.5) et une proposition de correction actionnable en un clic.
- Bordure de la zone de saisie colorée selon l'état.
- Aucun clignotement ni déplacement de contenu (pas de *layout shift*) pendant la frappe. Validation débattue (*debounce*) à 150 ms.

### 5.4 Blocage de l'envoi (mode `enforce`)

- Le bouton d'envoi est désactivé (`disabled`, `aria-disabled="true"`) tant que le commentaire est en erreur.
- Le motif du blocage est annoncé dans une zone `aria-live="polite"`.
- L'interception doit également couvrir la soumission au clavier.
- **Échappatoire** : un bouton « Publier sans label » reste accessible si `allowBypass: true`. Son usage exige la saisie d'un motif libre et est journalisé (§10). Objectif : ne jamais bloquer totalement une personne en situation d'urgence.

### 5.5 Affichage des commentaires publiés

- Les labels des commentaires déjà publiés sont rendus sous forme de badges colorés (option `badgeStyle`), sans modifier le contenu stocké côté serveur.
- Un bandeau en tête de PR récapitule : *N commentaires bloquants non résolus*, avec liens d'ancrage vers chacun.
- Filtre local par label dans la liste des fils de discussion.

---

## 6. Blocage de la complétion de la PR (O3)

### 6.1 Définitions

Un fil de discussion est **bloquant** si son **commentaire racine** est bloquant au sens du §3.3.

Un fil bloquant est considéré **résolu** selon la plateforme :

| Plateforme | États considérés comme résolus |
|------------|-------------------------------|
| GitHub | Conversation marquée *Resolved* |
| Azure DevOps | Statut de thread `Fixed`, `WontFix`, `Closed` ou `ByDesign` (`Active` et `Pending` = non résolu) |

**Règle de gouvernance :** un fil bloquant ne peut être résolu que par **l'auteur du commentaire** ou par un membre du groupe `resolverOverrideGroup`. L'auteur de la PR ne peut pas clore lui-même un fil bloquant ouvert par un relecteur.
*Note : GitHub autorise nativement l'auteur de la PR à résoudre les conversations. Cette règle est donc vérifiée et signalée par le composant B, non empêchée à la source.*

### 6.2 Mise en œuvre serveur (composant B — source de vérité)

**GitHub Enterprise**
- GitHub App ou Action abonnée aux événements `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`, `pull_request_review_thread`.
- Publie un *commit status* / *check run* nommé `conventional-comments` avec deux critères : (1) tous les commentaires sont conformes, (2) aucun fil bloquant non résolu.
- Ce check est déclaré **required** dans la protection de branche → le bouton *Merge* est désactivé nativement.
- Activer en complément *Require conversation resolution before merging* si l'équipe souhaite l'exigence sur **tous** les fils.

**Azure DevOps**
- Service Hook sur `Pull request created`, `Pull request updated`, `Pull request commented on` → Azure Function.
- La fonction publie un **PR Status** (`POST /pullrequests/{id}/statuses`) `succeeded` / `failed`.
- Ce statut est déclaré comme **policy de branche obligatoire** (*Status checks*) → complétion bloquée nativement.
- Alternative sans code : policy native *Check for comment resolution*, mais elle ne sait pas distinguer bloquant / non bloquant.

### 6.3 Rôle de l'extension

L'extension **reflète** l'état, elle ne le crée pas :

- désactive visuellement le bouton *Complete* / *Merge* et affiche le motif ;
- liste les fils bloquants non résolus avec liens directs ;
- ne doit **jamais** être la seule barrière — si l'extension est absente, la policy serveur s'applique quand même.

---

## 7. Modes de fonctionnement (adoption progressive)

Configurables globalement et surchargeables par dépôt.

| Mode | Assistance | Validation | Envoi bloqué | PR bloquée |
|------|:---:|:---:|:---:|:---:|
| `off` | ❌ | ❌ | ❌ | ❌ |
| `assist` | ✅ | ❌ | ❌ | ❌ |
| `warn` *(défaut initial)* | ✅ | ✅ | ❌ | ❌ |
| `enforce` | ✅ | ✅ | ✅ | ✅ |

**Trajectoire recommandée :** `assist` (2 semaines) → `warn` (2 à 4 semaines, avec suivi du taux de conformité) → `enforce` sur un dépôt pilote → généralisation.

---

## 8. Configuration

### 8.1 Emplacement et précédence

Par ordre de priorité décroissant :

1. `.conventional-comments.json` à la racine de la branche par défaut du dépôt.
2. Configuration d'organisation, servie par une URL interne (`configUrl`), mise en cache 1 h.
3. Politique d'entreprise poussée par le navigateur (`managed_storage` / `3rdparty`).
4. Préférences locales de l'utilisateur — **limitées** : langue, thème, raccourcis, style de badge. L'utilisateur ne peut ni assouplir le mode ni modifier la liste des labels.

### 8.2 Schéma

```json
{
  "$schema": "https://<interne>/cc-schema-v1.json",
  "version": 1,
  "mode": "warn",
  "labels": [
    { "id": "issue", "blockingByDefault": true,  "icon": "🔨", "aliases": ["bug"] },
    { "id": "nitpick", "blockingByDefault": false, "alwaysNonBlocking": true }
  ],
  "decorations": { "allowFree": true, "known": ["blocking", "non-blocking", "if-minor"] },
  "scope": {
    "validateReplies": false,
    "validateReviewSummary": true,
    "validatePrDescription": false
  },
  "rules": {
    "minSubjectLength": 10,
    "maxSubjectLength": 120,
    "requireDiscussionOnBlocking": "warn"
  },
  "allowBypass": true,
  "exemptUsers": ["azure-pipelines[bot]", "dependabot[bot]"],
  "allowlistPatterns": ["^LGTM$", "^/[a-z]+"],
  "resolverOverrideGroup": "tech-leads",
  "language": "fr",
  "telemetry": { "enabled": false, "endpoint": null }
}
```

Le schéma est **versionné**. Une configuration de version supérieure à celle supportée par l'extension déclenche un repli en mode `assist` accompagné d'un avertissement, jamais un blocage.

---

## 9. Architecture technique

### 9.1 Découpage

```
packages/
├── core/            # Aucune dépendance DOM ni plateforme
│   ├── parser       # Analyse d'un commentaire → AST
│   ├── validator    # AST + config → diagnostics
│   ├── config       # Chargement, fusion, validation du schéma
│   └── i18n         # fr / en
├── adapters/
│   ├── github/      # Sélecteurs DOM, cycle de vie SPA, API GHE
│   └── azdo/        # Idem Azure DevOps
├── extension/       # Manifest V3, content scripts, service worker, options
└── server/          # Composant B — réutilise core/ tel quel
```

`core/` est publié comme paquet interne et consommé à l'identique par l'extension et par le compagnon serveur. **Aucune règle de validation ne doit être dupliquée.**

### 9.2 Interface d'adaptateur

Chaque plateforme implémente le même contrat :

```ts
interface PlatformAdapter {
  matches(url: URL): boolean;
  observeEditors(cb: (editor: EditorHandle) => void): Disposable;
  getSubmitControls(editor: EditorHandle): SubmitControl[];
  readValue(editor: EditorHandle): string;
  writeValue(editor: EditorHandle, text: string, caret?: number): void;
  getThreads(): Promise<ThreadInfo[]>;
  getCompletionControl(): SubmitControl | null;
  getCurrentUser(): Promise<UserInfo>;
}
```

### 9.3 Contraintes d'implémentation connues

| Sujet | GitHub Enterprise | Azure DevOps |
|-------|-------------------|--------------|
| Éditeur | `<textarea>` Markdown | `contenteditable` piloté par un état applicatif |
| Écriture programmatique | Affectation de `value` + `input` event | Manipulation DOM + `beforeinput`/`input` synthétiques ; **risque de désynchronisation de l'état interne — à valider par prototype** |
| Navigation | SPA (Turbo) — écouter les événements de navigation | SPA — `MutationObserver` sur le conteneur racine |
| Domaine | Domaine interne variable → `optional_host_permissions` + saisie du domaine dans les options | `dev.azure.com`, `*.visualstudio.com`, ou domaine on-premise |

**Risque majeur identifié :** l'écriture dans l'éditeur Azure DevOps. Un *spike* technique de validation est requis **avant** l'engagement sur le reste du développement.

### 9.4 Résilience

- Les sélecteurs DOM sont centralisés dans un fichier unique par adaptateur, versionné et documenté.
- En cas d'échec de détection : **dégradation silencieuse** vers le mode `off` pour la zone concernée, avec journalisation. L'extension ne doit **jamais** empêcher l'utilisation normale de la plateforme.
- Test de fumée automatisé (Playwright) sur les deux plateformes, exécuté quotidiennement, pour détecter les ruptures de sélecteurs après une mise à jour éditeur.

---

## 10. Exigences non fonctionnelles

**Performance**
- Injection de la barre d'outils < 100 ms après apparition de l'éditeur.
- Validation < 5 ms par commentaire (parsing pur, sans appel réseau).
- Aucun impact mesurable sur le temps de chargement de la page (< 50 ms).

**Confidentialité**
- Aucun contenu de commentaire, de code ou de diff ne quitte le navigateur.
- Télémétrie **désactivée par défaut**, opt-in explicite, et limitée à des compteurs agrégés (label utilisé, code d'erreur, mode, dépôt) — jamais de texte libre.
- Journalisation des contournements : identifiant de PR, auteur, horodatage, motif. Destination configurable et interne.

**Sécurité**
- Manifest V3, permissions minimales (`storage`, `scripting`, `activeTab`), pas de `<all_urls>`.
- Aucun stockage de PAT ni de secret dans l'extension. Les appels API éventuels utilisent la session du navigateur.
- Content Security Policy stricte, aucun code distant, aucune dépendance chargée depuis un CDN.
- Code source auditable en interne.

**Accessibilité**
- Conformité RGAA / WCAG 2.1 AA : navigation clavier complète, contrastes suffisants, rôles ARIA, messages d'erreur associés au champ (`aria-describedby`).
- L'information ne repose jamais uniquement sur la couleur (icône + texte systématiques).
- Respect des thèmes clair / sombre et des réglages `prefers-reduced-motion`.

**Internationalisation**
- Interface disponible en français et en anglais, suivant la langue de la plateforme.
- Les **identifiants de labels restent en anglais** (`issue`, `suggestion`...) pour garantir l'interopérabilité, la parsabilité côté serveur et la compatibilité avec l'écosystème existant. Seules les descriptions et infobulles sont traduites.

**Compatibilité**
- Chrome et Edge (Chromium ≥ 3 dernières versions majeures), Firefox ESR.
- Déploiement par politique d'entreprise (`ExtensionInstallForcelist`) plutôt que par installation volontaire.
- Mise à jour automatique depuis un dépôt interne ou le store privé de l'organisation.

---

## 11. Critères d'acceptation

- `CA-01` Un commentaire sans label ne peut pas être publié en mode `enforce`, ni par bouton ni par raccourci clavier.
- `CA-02` Le clic sur un bouton de label insère le préfixe correct sans perdre le texte déjà saisi, sur les deux plateformes.
- `CA-03` Un `issue (non-blocking):` n'est pas comptabilisé comme bloquant.
- `CA-04` Un `nitpick (blocking):` produit l'erreur `E-CONFLICT`.
- `CA-05` La complétion d'une PR comportant un fil `issue:` non résolu est refusée **par le serveur**, extension désinstallée.
- `CA-06` Un même commentaire produit un verdict identique côté extension et côté serveur (test de parité sur un corpus de 200 commentaires réels).
- `CA-07` Une réponse dans un fil existant n'exige pas de label avec la configuration par défaut.
- `CA-08` Les commentaires des bots de pipeline ne déclenchent aucune erreur.
- `CA-09` Le passage en mode `warn` n'empêche aucune publication.
- `CA-10` Un contournement est journalisé avec son motif.
- `CA-11` Une modification de la structure DOM de la plateforme dégrade l'extension silencieusement, sans empêcher la revue.
- `CA-12` Parcours complet réalisable au clavier seul.

---

## 12. Indicateurs de suivi

À produire par le composant B, sur la base des API des deux plateformes :

- Taux de conformité des commentaires (cible : > 95 % à 3 mois).
- Répartition par label — surveiller un ratio `praise` durablement nul, signe d'un déséquilibre de la culture de revue.
- Nombre de contournements par semaine — un chiffre élevé indique une règle mal calibrée, pas une équipe indisciplinée.
- Délai moyen de résolution des fils bloquants.
- Délai total de revue avant / après mise en œuvre.

---

## 13. Points à trancher

| # | Question | Décision |
|---|----------|----------|
| Q1 | Les réponses dans un fil doivent-elles être validées ? | *à trancher* |
| Q2 | Autorise-t-on le contournement en mode `enforce` ? | *à trancher* |
| Q3 | `chore` doit-il rester bloquant par défaut ? | *à trancher* |
| Q4 | L'auteur de la PR peut-il résoudre un fil bloquant qu'il n'a pas ouvert ? | *à trancher* |
| Q5 | Configuration centralisée org ou par dépôt ? | *à trancher* |
| Q6 | Style badge activé par défaut, ou texte brut ? | *à trancher* |
| Q7 | Étend-on la convention aux commentaires de work items / issues ? | *à trancher* |
| Q8 | Extension complète ou userscript pour la phase 1 ? | *à trancher* |

---

## 14. Phasage proposé

| Phase | Contenu | Dépendance |
|-------|---------|------------|
| **P0** | Spike technique : écriture programmatique dans l'éditeur Azure DevOps | — |
| **P1** | `core/` (parser, validator, config) + tests unitaires | — |
| **P2** | Extension mode `assist` sur GitHub Enterprise | P1 |
| **P3** | Adaptateur Azure DevOps | P0, P2 |
| **P4** | Mode `warn` + tableau de bord de conformité | P2, P3 |
| **P5** | Composant serveur + status checks | P1 |
| **P6** | Mode `enforce` sur dépôt pilote, puis généralisation | P4, P5 |
