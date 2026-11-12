# Modes et adoption

**Langues :** [English](modes-and-adoption-en.md) | Français (ce fichier)

Jusqu'où va l'extension, de silencieuse à bloquante, et comment une équipe y arrive sans
casser sa façon de travailler.

## Les trois modes

| Mode | Barre d'outils et saisie au clavier | Diagnostics affichés | Envoi bloqué |
|---|:---:|:---:|:---:|
| `off` | Non | Non | Non |
| `assist` (par défaut) | Oui | Oui | Non |
| `enforce` | Oui | Oui | Oui, pour un commentaire en erreur |

Un dépôt fixe son mode dans [son fichier de configuration](configuration-fr.md#mode) ; une
organisation peut fixer une valeur par défaut pour tous ses dépôts et un minimum sous lequel
aucun ne peut descendre ([déployer pour une organisation](organization-fr.md)). La page de
réglages de l'extension ne permet pas de changer le mode.

`warn` n'existe plus. Une configuration qui écrit encore `"mode": "warn"` est lue comme
`"assist"`, avec un avis qui demande de la mettre à jour.

## Ce que fait `enforce`

Quand un commentaire a au moins une **erreur**, l'extension grise le bouton d'envoi et
intercepte son activation, à la souris comme au clavier (`Ctrl+Entrée`, `Cmd+Entrée`). Le
motif est annoncé aux lecteurs d'écran, et le bouton reste atteignable avec `Tab`. Les
avertissements ne bloquent jamais.

Le blocage exige deux conditions :

1. le mode effectif est `enforce` ;
2. l'extension a pu **lire** la configuration. Si elle n'a pas pu, elle affiche *Configuration
   non lue* et se comporte comme en `assist` : un envoi n'est jamais refusé au nom d'une règle
   qui n'a pas pu être lue.

Avant de bloquer, l'extension relit la configuration, sans passer par son cache. Si la
configuration relue ne bloque plus le commentaire, l'extension réactive le bouton et un
message vous invite à renvoyer le commentaire.

## Ce que `enforce` ne fait pas

**L'extension est un garde-fou, pas un mur.** Elle s'exécute dans le navigateur où elle est
installée. Un commentaire publié par l'API de la plateforme, un outil en ligne de commande, un
IDE, un autre navigateur ou une machine sans l'extension n'est pas contrôlé, et aucun autre
composant du produit ne le contrôle après coup.

**Elle ne contrôle pas la fusion.** Le bandeau *signale* les fils bloquants non résolus, mais
n'empêche jamais de fusionner
([DEC0010](../idr/DEC0010-the-extension-is-the-whole-product-fr.md)). Une équipe qui veut
conditionner les fusions à la résolution des conversations utilise les réglages de sa
plateforme, comme la résolution obligatoire des conversations.

**Il n'y a pas de bouton de contournement**, et c'est voulu. Un tel bouton ne contrôlerait
rien, puisque l'extension se désactive en deux clics, et la justification du contournement
n'apparaîtrait nulle part dans la revue. Quand un point bloquant ne sera pas traité, dites-le
dans le fil avec une
[`decision`](writing-comments-fr.md#clore-un-fil-bloquant-sans-faire-le-changement-demandé) :
lisible par tous, à l'endroit où la discussion a eu lieu, conservée avec la pull request.

## Trajectoire recommandée

```text
assist  →  enforce sur un dépôt pilote  →  généralisation
```

1. **Commencez en `assist`**, le mode par défaut. Chacun dispose de la barre d'outils, de la
   pastille et des badges ; rien n'est refusé.
2. **Fixez les règles tant que vous êtes en `assist`.** Ajustez les labels, les sévérités,
   les exemptions pour les bots et les commandes. Un changement s'applique aussitôt aux pull
   requests ouvertes : c'est le moment de voir ce que signalent la pastille et le bandeau.
3. **Passez un dépôt pilote en `enforce`**, avec `{ "mode": "enforce" }` dans son fichier.
4. **Généralisez**, dépôt par dépôt ou par la configuration d'organisation.

Avant la bascule, vérifiez ces cas, qui vous surprendraient sinon :

- les commandes adressées aux bots (`@dependabot rebase`, `/retest`) ont besoin de
  `toolCommands`, sans quoi elles sont refusées comme n'importe quel commentaire sans label ;
- les comptes qui commentent automatiquement ont besoin de `exemptUsers` ;
- sur GitLab, le blocage de l'envoi ne s'applique pas encore, et les personnes qui utilisent
  l'éditeur de texte enrichi de GitLab ne reçoivent aucune assistance
  ([plateformes](platforms-fr.md)).

## Retour arrière

Assouplir le mode lève le blocage dès la tentative d'envoi suivante, sans attendre
l'expiration du cache. Assouplissez dans cet ordre : un plancher à `enforce` l'emporte sur tout le reste, et un dépôt
qui écrit son propre `mode` l'emporte sur la configuration d'organisation :

1. le plancher d'entreprise, s'il impose `enforce` ;
2. la configuration d'organisation, qui couvre tous les dépôts qui n'écrivent pas leur propre
   `mode` ;
3. chaque dépôt qui écrit `"mode": "enforce"` dans son propre fichier. Listez-les avant la
   bascule, pas pendant l'incident.

Pour vérifier : sur une pull request de test, envoyez un commentaire sans label. Il doit
partir.

Les procédures d'exploitation complètes : [`operations-fr.md`](../operations-fr.md).
