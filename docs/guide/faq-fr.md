# FAQ et dépannage

**Langues :** [English](faq-en.md) | Français (ce fichier)

## Rien ne s'affiche

### Aucune barre d'outils n'apparaît sur la pull request

Vérifiez, dans cet ordre :

1. **Le domaine est autorisé.** Ouvrez la [page de réglages](settings-fr.md) : le domaine
   doit figurer sous *Domaines configurés*. S'il figure sous *Domaines non configurés*,
   associez-lui une plateforme.
2. **La page a été rechargée** après l'autorisation du domaine.
3. **Vous êtes dans un champ de commentaire d'une pull request.** La description de la pull
   request, les issues et les work items sont hors périmètre.
4. **Sur GitLab, vous êtes dans l'éditeur Markdown.** L'éditeur de texte enrichi n'est pas
   géré ; revenez à l'éditeur Markdown depuis le lien sous le champ
   ([plateformes](platforms-fr.md#gitlab)).
5. **Le dépôt n'est pas en mode `off`.** Un dépôt peut désactiver l'extension pour lui-même.

Si rien de tout cela ne l'explique, consultez la section *État* de la page de réglages : le
journal liste ce que l'extension a cherché sans le trouver. Téléchargez le diagnostic,
relisez-le, puis joignez-le à une
[issue](https://github.com/reefact/conventional-comments-toolkit/issues).

### La pastille ne dit rien dans une réponse

Les réponses dans un fil ne sont pas validées par défaut ; seule une réponse `decision` l'est.
La barre d'outils y fonctionne quand même. Un dépôt active la validation des réponses avec
`scope.validateReplies` ([configuration](configuration-fr.md#scope)).

### Un commentaire publié affiche un badge mais son préfixe est toujours dans le texte

C'est attendu. Le préfixe n'est masqué que si tout ce qu'il dit peut être montré par des
badges et si la structure de la page est de celles que l'extension connaît. Sinon,
l'extension préfère en montrer moins que de risquer d'afficher quelque chose de faux : les
badges se placent au-dessus du commentaire et le texte reste entier.

### Un collègue ne voit pas les badges

Les badges sont dessinés par l'extension, et seulement dans le navigateur des personnes qui
l'ont installée. Le commentaire enregistré est du texte brut, `issue (blocking): …`, lisible
par tout le monde.

## Messages

### La pastille indique une configuration non lue

L'extension n'a pas pu lire la configuration du dépôt ou de l'organisation. Elle continue
d'assister avec les règles dont elle dispose et **ne bloque pas**, quel que soit le mode.

- Sur **GitLab**, c'est l'état normal pour l'instant : le fichier du dépôt n'y est pas lu.
- Sur GitHub et Azure DevOps, vérifiez que vous êtes connecté et que le réseau atteint la
  plateforme. Pour une configuration d'organisation placée sur un autre hôte, cet hôte doit
  être autorisé.

Un dépôt **sans** fichier de configuration ne provoque pas ce message : un fichier absent est
normal.

### *Label inconnu* sur un label que j'ai toujours utilisé

La configuration du dépôt l'a désactivé, ou ne l'a jamais déclaré. Le message liste les
labels disponibles. Les alias comptent : `bug:` ne fonctionne que si le dépôt déclare `bug`
comme alias.

### Le bouton d'envoi est grisé

Le dépôt est en mode `enforce` et le commentaire comporte une erreur. La pastille la nomme,
en général avec une correction en un clic. Si la configuration vient d'être assouplie,
réessayez : avant de bloquer, l'extension relit la configuration et réactive le bouton.

### J'ai modifié le fichier de configuration et rien n'a changé

L'extension garde en cache ce qu'elle a lu, une heure par défaut. Elle relit toutefois la
configuration avant de bloquer un envoi, si bien qu'une règle périmée n'est jamais imposée ;
seul l'affichage peut être en retard, jusqu'à l'expiration du cache.

### Un raccourci direct ne fait rien

- Le label est désactivé dans ce dépôt.
- Vous avez changé vos raccourcis après l'ouverture du champ : ils s'appliquent au champ
  suivant.
- Sur macOS, `Option` + lettre peut produire un caractère spécial à la place
  ([limite connue](keyboard-input-fr.md#limite-connue-sur-macos)).

## Ce que l'extension est et n'est pas

### Peut-on contourner `enforce` ?

Oui, et le produit ne le cache pas. L'extension n'agit que dans le navigateur où elle est
installée : un commentaire publié par l'API de la plateforme, depuis un autre navigateur ou
avec l'extension désactivée échappe au contrôle.
`enforce` empêche l'erreur d'inattention, qui est le cas courant
([modes](modes-and-adoption-fr.md#ce-que-enforce-ne-fait-pas)).

### Empêche-t-elle une fusion tant que des fils bloquants sont ouverts ?

Non. Le bandeau les signale. Pour conditionner les fusions, utilisez le réglage de votre
plateforme, comme la résolution obligatoire des conversations.

### `reviewed` approuve-t-il la pull request ?

Non. Il dit que votre revue est terminée. L'approbation reste gérée par la plateforme,
et l'extension ne compte pas les `reviewed`.

### `done`, `ack`, `thanks`… font-ils partie de Conventional Comments ?

Non. Ce sont des ajouts de cette extension, activés par défaut, qu'un dépôt peut désactiver
([labels](labels-fr.md#les-labels-qui-ne-font-pas-partie-de-conventional-comments)).

### Qu'est-ce qui sort de mon navigateur ?

Aucun contenu de commentaire, de code ou de diff, jamais. L'extension lit le fichier de
configuration du dépôt que vous consultez, avec votre propre session ; elle ne stocke aucun
jeton. Votre langue et vos raccourcis passent par la synchronisation du navigateur, si elle
est activée. La télémétrie est désactivée, sauf si votre organisation déclare
un point de collecte **et** que vous donnez votre accord. Le détail est dans la
[politique de confidentialité](../../PRIVACY.md).

### Vérifie-t-elle les messages de commit, ou la qualité de mon commentaire ?

Ni l'un ni l'autre. Les messages de commit relèvent d'une autre convention (Conventional
Commits). Et l'extension vérifie la **forme** d'un commentaire, jamais s'il est juste ou
bienveillant.

## La désactiver

- **Pour vous, sur une plateforme :** cliquez sur **Retirer** à côté du domaine dans la page
  de réglages.
- **Pour un dépôt :** écrivez `{ "mode": "off" }` dans son `.conventional-comments.json`, si le
  plancher de votre organisation le permet.
- **Entièrement :** désactivez ou supprimez l'extension depuis la page des extensions de
  votre navigateur.
