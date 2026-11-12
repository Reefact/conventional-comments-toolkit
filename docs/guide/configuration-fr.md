# Configuration

**Langues :** [English](configuration-en.md) | Français (ce fichier)

L'extension fonctionne sans aucune configuration. Un dépôt qui veut ses propres labels, ses
propres règles ou son propre mode ajoute un fichier.

## Le fichier du dépôt

Placez un fichier `.conventional-comments.json` à la racine de la **branche par défaut** du
dépôt :

```json
{
  "version": 1,
  "mode": "assist"
}
```

Toutes les clés sont facultatives : une clé que vous omettez garde la valeur par défaut du
produit. L'extension de chaque relecteur lit ce fichier depuis la page de la pull request,
avec sa propre session, sans aucun jeton.

[`.conventional-comments.example.json`](../../.conventional-comments.example.json) montre la
forme de chaque clé. C'est un exemple, **pas** les valeurs par défaut du produit : il ne liste
qu'une poignée de labels et désactive un avertissement pour illustrer une surcharge.

> Sur GitLab, l'extension ne lit pas encore le fichier du dépôt : les valeurs par défaut du
> produit s'y appliquent ([plateformes](platforms-fr.md)).

## D'où viennent les valeurs

Trois niveaux, le premier qui renseigne une clé l'emporte :

1. le fichier du dépôt, `.conventional-comments.json` ;
2. la configuration d'organisation, un document JSON de même forme servi par une URL ;
3. les valeurs par défaut du produit.

Au-dessus d'eux, une organisation peut fixer un **plancher** par la politique d'entreprise du
navigateur : un mode minimum et des règles qu'aucun dépôt ne peut assouplir. L'URL de la
configuration d'organisation vient elle aussi de cette politique, jamais d'un fichier de dépôt
([déployer pour une organisation](organization-fr.md)).

Vos propres [réglages](settings-fr.md) ne couvrent que la langue de l'interface, vos
raccourcis et l'ordre des boutons. Ils ne changent jamais le mode ni la liste des labels.

### Comment les niveaux se combinent

| Clé | Un niveau inférieur… |
|---|---|
| `labels`, `decorations.known` | surcharge les propriétés d'une entrée de même `id`, et peut ajouter des entrées. Il n'en retire jamais : pour retirer un label, écrivez `"enabled": false`. |
| `severities`, `shortcuts.abbreviations` | surcharge ou ajoute des entrées une à une, sans effacer les autres. |
| `exemptUsers`, `allowlistPatterns`, `toolCommands` | ajoute à la liste. Il ne peut pas retirer ce qu'un niveau supérieur y a mis. |
| `mode`, `rules.*`, `scope.*` et les autres valeurs simples | remplace la valeur. |

Un dépôt qui déclare deux labels dispose donc toujours de tous les labels livrés, auxquels ces
deux-là s'ajoutent ou qu'ils surchargent.

### Quand un changement prend effet

Un changement s'applique aux pull requests **déjà ouvertes**, dès que l'extension le lit.
L'extension garde en cache ce qu'elle a lu pendant `configCacheTtlSeconds` (une heure par
défaut), à une exception près : avant de bloquer un envoi, elle relit toujours la
configuration. Un commentaire n'est jamais bloqué sur une règle périmée, et assouplir le mode
lève le blocage dès la tentative suivante.

Durcir une règle peut donc rendre des commentaires non conformes, ou des fils bloquants, sur
toutes les pull requests ouvertes à la fois. Durcissez en `assist`, regardez ce que signalent
la pastille et le bandeau, puis passez en `enforce`
([modes et adoption](modes-and-adoption-fr.md)).

## Clés

### `mode`

`"off"`, `"assist"` (par défaut) ou `"enforce"`. Voir
[modes et adoption](modes-and-adoption-fr.md).

### `labels`

Une liste de labels, fusionnée par `id` avec les [labels livrés](labels-fr.md).

| Propriété | Sens | Valeur par défaut pour un label que vous créez |
|---|---|---|
| `id` | Le mot tapé avant les deux-points. Des lettres seulement : `followup`, pas `follow-up`. | obligatoire |
| `enabled` | `false` retire le label : il n'est plus proposé, et le taper donne `E-UNKNOWN-LABEL`. | `true` |
| `blockingByDefault` | Indique si le label bloque quand aucune décoration ne dit le contraire. | `false` |
| `alwaysNonBlocking` | `true` interdit `(blocking)` sur ce label. | `false` |
| `kind` | `"remark"` soulève un point, `"reply"` y répond, `"status"` dit où en est la revue. Il place le bouton dans la barre d'outils et ne change aucun verdict. | `"remark"` |
| `aliases` | D'autres graphies acceptées à la saisie, comme `["bug"]`. | aucun |
| `icon` | Affichée sur le badge. | aucune |
| `color` | Couleur du bouton et du badge, comme `"#C2410C"`. Vérifiez son contraste en thème clair et en thème sombre. | aucune |
| `description` | Infobulle du **badge** : ce que le commentaire signifie pour la personne qui le lit. | texte livré, s'il existe |
| `usage` | Infobulle du **bouton** : quand utiliser le label. Sans elle, le bouton affiche `description`. | texte livré, s'il existe |

`description` et `usage` s'affichent tels qu'ils sont écrits, quelle que soit la langue de
l'interface. Écrits vides (`""`), ils suppriment l'infobulle.

**Ajouter un label :**

```json
{ "labels": [ { "id": "risk", "blockingByDefault": true, "icon": "⚠️", "color": "#C2410C",
                "description": "Un risque de régression soulevé par le relecteur.",
                "usage": "Signaler un risque de régression à évaluer avant la fusion." } ] }
```

**Modifier un label livré :**

```json
{ "labels": [ { "id": "issue", "aliases": ["bug"] },
              { "id": "todo", "blockingByDefault": false },
              { "id": "quibble", "enabled": true },
              { "id": "typo", "enabled": false } ] }
```

Deux labels actifs ne peuvent pas porter le même nom. Un alias qui reprend l'`id` d'un autre
label actif est écarté, un alias porté par deux labels est écarté des deux, et chaque retrait
est signalé par un avis de configuration.

### `decorations`

```json
{ "decorations": {
    "allowFree": false,
    "known": [ { "id": "security", "forces": null },
               { "id": "must-fix", "forces": "blocking" } ] } }
```

- `allowFree` (`true` par défaut) : indique si une décoration absente de `known` est acceptée.
  À `false`, une décoration inconnue donne `E-UNKNOWN-DECORATION`.
- `known` : les décorations, par `id`. `forces` vaut `"blocking"`, `"non-blocking"` ou `null`
  pour une décoration purement descriptive. Livrées : `blocking`, `non-blocking`, `if-minor`.
  Une décoration dont `forces` n'est pas `null` reçoit un segment dans la barre d'outils.

### `severities`

La sévérité d'un [code de diagnostic](diagnostics-fr.md) : `"off"`, `"warn"` ou `"error"`.
Par défaut : vide, chaque code garde sa sévérité livrée.

```json
{ "severities": { "W-MISSING-DECORATION": "off" } }
```

Un code `E-` ne peut pas descendre en dessous de `"warn"`.

### `scope`

| Clé | Sens | Valeur par défaut |
|---|---|---|
| `validateReplies` | Valider les réponses dans un fil. À `false`, une réponse ne reçoit aucun diagnostic, sauf une `decision`. | `false` |
| `validateReviewSummary` | Valider le corps d'une revue soumise en bloc. Ignorée sur Azure DevOps, où ce corps n'existe pas. | `true` |

Activer `validateReplies` s'applique aussitôt aux pull requests ouvertes : toute réponse
écrite sans préfixe devient non conforme. Laissez d'abord l'équipe adopter les
[labels de réponse](labels-fr.md#répondre-à-un-point), exigez-les ensuite.

### `rules`

| Clé | Sens | Valeur par défaut |
|---|---|---|
| `minSubjectLength` | En dessous, `W-SUBJECT-TOO-SHORT`. | `5` |
| `maxSubjectLength` | Au-dessus, `W-SUBJECT-TOO-LONG`. | `120` |
| `minDecisionSubjectLength` | Longueur minimale du motif d'une `decision`. | `20` |

### `exemptUsers`, `allowlistPatterns`, `toolCommands`

Trois façons de laisser des commentaires hors de la validation. Les trois sont **vides par
défaut**.

| Clé | Exempte | Exemple |
|---|---|---|
| `exemptUsers` | Les commentaires écrits par ces comptes, comparés par identifiant de connexion, sans tenir compte de la casse. | `["dependabot[bot]", "github-actions[bot]"]` |
| `allowlistPatterns` | Les commentaires dont le corps **entier**, espaces de bordure retirés, correspond à l'une de ces expressions régulières. | `["^LGTM$"]` |
| `toolCommands` | Les commentaires qui **commencent** par une commande adressée à un outil. | `["/*", "@dependabot", "@codex"]` |

`toolCommands` accepte deux sortes d'entrées, comparées comme des chaînes exactes :

- `"/*"` reconnaît toute commande slash en tête de corps : `/rebase`, `/retest`,
  `/azp run`… Un chemin comme `/etc/hosts is wrong` n'est pas pris pour une commande.
- un handle exact comme `"@dependabot"` reconnaît une mention de ce compte en premier mot.
  Il n'existe pas de joker pour les mentions : `@alice can you look at this?` est un
  commentaire de revue.

On ne peut pas simplement donner un label à une commande : la plupart des outils ne lisent
qu'une commande placée tout au début du commentaire.

`allowlistPatterns` est limitée à 50 motifs de 256 caractères, sans quantificateur imbriqué ;
un motif hors de ces bornes est ignoré et signalé. Ancrez les motifs aux deux extrémités :
`^bors retry` exempterait aussi `bors retry is broken since yesterday`.

Un commentaire exempté n'a pas de label pour l'extension. Une remarque bloquante écrite par un
compte de `exemptUsers` n'est donc **pas comptée** parmi les fils bloquants. Pour un relecteur
automatisé, soit vous le laissez exempté et vous tenez ses remarques pour consultatives, soit
vous lui apprenez la convention ([skills de revue](review-skills-fr.md)).

### `shortcuts.abbreviations`

Les abréviations développées par `Tab`, chacune associée au texte inséré. Voir
[saisie au clavier](keyboard-input-fr.md#abréviations).

### Affichage

| Clé | Sens | Valeur par défaut |
|---|---|---|
| `language` | Langue de l'interface, `"en"` ou `"fr"`, pour ceux qui n'en choisissent aucune dans leurs réglages. Sans elle, l'extension suit la langue de la plateforme. | `null` |
| `badgeStyle` | `"pill"` ou `"flat"`. | `"pill"` |
| `sessionIcon` | Icône de la mention de session de revue. | `"🤖"` |

### Compatibilité et cache

| Clé | Sens | Valeur par défaut |
|---|---|---|
| `version` | Version du format de configuration. Un fichier dont la version n'est pas prise en charge par l'extension la fait se replier sur `assist`. | `1` |
| `coreMinVersion` | Version majeure minimale du moteur de règles de l'extension dont ce fichier a besoin. Même repli. | `"1.0.0"` |
| `configCacheTtlSeconds` | Durée pendant laquelle l'extension garde ce qu'elle a lu. | `3600` |

### Les clés sans effet dans un fichier de dépôt

- `configUrl` est ignorée et signalée : l'adresse de la configuration d'organisation ne vient
  que de la politique d'entreprise. Sinon, un dépôt pourrait désigner lui-même le document
  censé le contraindre.
- `telemetry` ne peut pas activer la télémétrie : seuls la politique d'entreprise et le
  consentement de chaque personne le peuvent
  ([politique de confidentialité](../../PRIVACY.md)).

## Quand le fichier est absent ou incorrect

| Situation | Ce que fait l'extension |
|---|---|
| Aucun fichier | Utilise la configuration d'organisation, puis les valeurs par défaut du produit. C'est normal, ce n'est pas un incident. |
| JSON invalide, ou valeur inutilisable pour une clé connue (`"mode": "banana"`) | Se replie sur le dernier niveau valide et affiche un avis *configuration invalide* avec la ligne fautive. |
| Une clé inconnue | Ignore cette clé, la signale, applique le reste. |
| Le fichier est inaccessible | Se replie sur le niveau inférieur et affiche *Configuration non lue* : elle assiste et ne bloque plus. |
| Une `version` ou une `coreMinVersion` plus récente que ce que l'extension prend en charge | Se replie sur `assist`, ou sur le plancher d'entreprise s'il est plus strict, et le signale. |

Un fichier cassé ne retire jamais un plancher d'entreprise en silence.

## Recettes

**S'en tenir à Conventional Comments.** Désactivez les six
[labels ajoutés](labels-fr.md#sen-tenir-à-conventional-comments).

**Laisser passer les bots et les commandes sur GitHub :**

```json
{
  "exemptUsers": ["dependabot[bot]", "github-actions[bot]"],
  "toolCommands": ["/*", "@dependabot", "@copilot", "@coderabbitai", "@codex", "@claude",
                   "@mergifyio", "@renovate", "@rustbot", "@bors"]
}
```

Sur un GitHub Enterprise Server où l'un de ces handles est le compte d'une personne,
omettez-le.

**Exiger des labels sur les réponses aussi :**

```json
{ "scope": { "validateReplies": true } }
```

**Bloquer les commentaires non conformes dans ce dépôt :**

```json
{ "mode": "enforce" }
```

Lisez d'abord [modes et adoption](modes-and-adoption-fr.md).

## Mise à niveau

**Depuis une version sans `toolCommands`.** Les commandes slash étaient auparavant exemptées
par une liste intégrée à l'adaptateur GitHub (`/azp`, `/rebase`). Cette liste a disparu et
`toolCommands` est vide par défaut : en mode `enforce`, un `/rebase` est désormais refusé tant
que le dépôt ne le déclare pas. Ajouter `"/*"` à `toolCommands` rétablit l'exemption et
l'étend à toutes les commandes slash.

**Clés retirées.** `formatSeverity`, `overrideLabel`, `resolverOverrideGroup`, `activation` et
`docUrl` servaient un composant qui n'existe plus
([DEC0010](../idr/DEC0010-the-extension-is-the-whole-product-fr.md)). Un fichier qui les
porte encore reste lisible : chacune est ignorée et signalée. `"mode": "warn"` est lu comme
`"assist"`, avec un avis. Retirez-les pour faire disparaître les avis.

**Un label à vous nommé `thanks`, `done`, `ack`, `disagree`, `summary` ou `reviewed`.**
Votre entrée fusionne désormais avec le label livré de même nom et hérite de
`alwaysNonBlocking: true`, si bien que `done (blocking):` devient `E-CONFLICT`. Rétablissez
votre label avec :

```json
{ "labels": [ { "id": "done", "alwaysNonBlocking": false } ] }
```

Un label à vous nommé `fixed`, `acknowledged` ou `thx` garde son nom : l'alias livré de même
nom s'efface, et le retrait est signalé par un avis.

**Les règles vivent dans l'extension, pas dans le fichier.** Deux personnes qui utilisent des
versions différentes de l'extension peuvent appliquer des règles différentes au même fichier.
`coreMinVersion` est le levier pour exiger une version.
