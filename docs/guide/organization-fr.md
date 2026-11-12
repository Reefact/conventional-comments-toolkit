# Déployer pour une organisation

**Langues :** [English](organization-en.md) | Français (ce fichier)

Ce qu'un administrateur peut fixer pour tous les postes de travail : une configuration commune
à tous les dépôts, un plancher sous lequel aucun dépôt ne peut descendre, les hôtes que
l'extension sert, et la télémétrie. Tout ce que décrit cette page est facultatif ; une équipe
peut utiliser l'extension avec un simple fichier de dépôt, ou sans aucune configuration.

## Le canal : la politique d'entreprise du navigateur

L'extension lit une politique gérée que le navigateur lui transmet
(`chrome.storage.managed`, le nœud de politique `3rdparty` sur les navigateurs Chromium).
Cette politique s'applique à tout le poste de travail. Elle a trois clés de premier niveau :

```json
{
  "floor": {
    "floorVersion": 1,
    "configUrl": "https://intranet.example/cc/organisation.json",
    "minimumMode": "assist"
  },
  "allowedHosts": [
    { "host": "ghes.example.corp", "platform": "github" },
    { "host": "intranet.example", "platform": "config" }
  ],
  "telemetry": { "enabled": false, "endpoint": "https://metrics.example/cc" }
}
```

Sans politique, rien n'est imposé : les dépôts et les valeurs par défaut du produit décident
seuls.

## La configuration d'organisation

`floor.configUrl` est l'adresse d'un document JSON qui porte les
[mêmes clés qu'un fichier de dépôt](configuration-fr.md#clés). Ce document se place entre le
fichier du dépôt et les valeurs par défaut du produit : il fixe la valeur par défaut de chaque
clé pour tout dépôt qui ne l'écrit pas lui-même.

- L'adresse ne vient **que** de la politique. Une `configUrl` écrite dans un fichier de dépôt
  est ignorée et signalée.
- L'extension doit pouvoir accéder à l'hôte qui sert ce document. Déclarez cet hôte dans
  `allowedHosts` avec `"platform": "config"` quand ce n'est pas un domaine de plateforme.
- Un fichier de dépôt l'emporte sur ce document. Pour imposer une valeur, utilisez le
  plancher.

## Le plancher

Le plancher fixe des limites que la configuration d'organisation et les fichiers de dépôt ne
peuvent pas franchir. Ce n'est pas une configuration : il ne fixe aucune valeur par défaut, et
une clé qu'il omet n'est pas limitée.

```json
{
  "floor": {
    "floorVersion": 1,
    "configUrl": "https://intranet.example/cc/organisation.json",
    "minimumMode": "enforce",
    "severities": { "E-NO-LABEL": "error", "E-UNKNOWN-LABEL": "error" },
    "labels": { "minimum": ["issue", "todo"] },
    "rules": { "minDecisionSubjectLength": 20 },
    "exemptUsers": { "minimum": ["build-service"], "closed": false },
    "allowlistPatterns": { "minimum": [], "closed": true },
    "toolCommands": { "minimum": [], "closed": false },
    "configCacheTtlSeconds": 3600
  }
}
```

| Clé | Ce que l'organisation ou un dépôt ne peut plus faire |
|---|---|
| `minimumMode` | Fixer un mode en dessous. L'échelle est `off` < `assist` < `enforce`. |
| `severities` | Abaisser la sévérité des codes listés. |
| `labels.minimum` | Désactiver ces labels, les rendre non bloquants par défaut, ou y interdire `(blocking)`. |
| `rules.minDecisionSubjectLength` | Accepter un motif plus court pour une `decision`. |
| `exemptUsers`, `allowlistPatterns`, `toolCommands` | Retirer une entrée de `minimum`. Avec `closed: true`, ajouter la moindre entrée. |
| `configCacheTtlSeconds` | Garder une configuration en cache **plus longtemps** que cette durée. |

Durcir est toujours permis sous le plancher ; assouplir ne l'est pas. Un dépôt qui écrit
`{"mode": "off"}` sous un plancher à `enforce` garde `enforce`, et tout le monde voit un avis
indiquant que la clé a été ignorée.

`labels.minimum` compte plus qu'il n'y paraît : sans lui, un dépôt peut désactiver `issue`,
`todo` et `chore`, après quoi plus aucun fil n'est bloquant.

Un plancher dont la `floorVersion` est plus récente que ce que l'extension prend en charge
n'est jamais abandonné en silence : l'extension se replie sur `assist`, ou sur le plancher
qu'elle connaissait auparavant si celui-ci était plus strict, et le signale.

## Les hôtes

`allowedHosts` indique à l'extension quelle plateforme sert chacun de vos hôtes, pour que
personne n'ait à l'associer à la main à une plateforme dans la page de réglages :

| `platform` | Pour |
|---|---|
| `"github"` | GitHub Enterprise Server, un sous-domaine de `ghe.com` |
| `"azdo"` | Azure DevOps Server |
| `"gitlab"` | GitLab Self-Managed |
| `"config"` | Un hôte qui ne sert que la configuration d'organisation |

Chaque entrée doit nommer sa plateforme ; une entrée sans plateforme n'active rien. Un
joker de sous-domaine est accepté dans `host` (`*.ghe.com`).

L'accès aux sites, que chaque personne autorise sinon elle-même dans la page de réglages,
relève d'une autre politique : celle de gestion des extensions de votre navigateur. Un hôte
que la politique d'entreprise associe à une plateforme apparaît dans la page de réglages avec
la mention *politique d’entreprise*.

## Télémétrie

Désactivée par défaut. Elle ne s'active que si **les deux** conditions sont réunies : la
politique déclare `"enabled": true` avec un `endpoint` en `https:`, **et** la personne coche
la case dans sa page de réglages. Un dépôt ne peut ni l'activer ni en choisir la destination.

Elle envoie des compteurs agrégés : un label inséré par l'extension et son type (`kind` :
remarque, réponse ou état de la revue), un code de diagnostic affiché, un sélecteur qui n'a
rien trouvé, avec le mode et le dépôt. Jamais le texte d'un commentaire, de code ou d'un
diff, ni l'adresse de la page.

Ces compteurs ne permettent pas encore de calculer un taux de conformité : aucun événement ne
compte les commentaires écrits ou envoyés. La liste complète de ce qui est collecté figure
dans la [politique de confidentialité](../../PRIVACY.md).

## Installer l'extension sur tous les postes de travail

Les navigateurs peuvent forcer l'installation d'une extension par politique :
`ExtensionInstallForcelist` sur Chrome et Edge, `ExtensionSettings` avec
`"installation_mode": "force_installed"` sur Firefox. Dans les deux cas, le navigateur
installe l'extension depuis une boutique d'extensions ou depuis votre propre serveur de mise
à jour, qui lui apporte aussi les mises à jour automatiques. Les archives de la
[page des releases](https://github.com/reefact/conventional-comments-toolkit/releases) sont
faites pour essayer l'extension : chargées à la main, elles ne se mettent jamais à jour.
