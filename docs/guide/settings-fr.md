# La page de réglages

**Langues :** [English](settings-en.md) | Français (ce fichier)

La page de réglages de l'extension s'ouvre d'elle-même après l'installation. Ensuite, cliquez
sur l'icône de l'extension dans la barre d'outils du navigateur (épinglez-la depuis le menu en
forme de pièce de puzzle si elle est masquée). Un bouton **Visite guidée**, en haut, rejoue
l'introduction.

La page règle ce qui **vous** appartient : les sites sur lesquels l'extension peut agir, et
quelques préférences personnelles. Le mode et la liste des labels ne s'y règlent pas : ils
appartiennent à l'équipe et se trouvent dans la [configuration](configuration-fr.md) du dépôt.

## Domaines autorisés

L'extension fonctionne sur les domaines listés ici, et sur eux seulement. Tant qu'aucun n'est
autorisé, elle est inactive partout.

| Panneau | Ce qu'il fait |
|---|---|
| **Domaines connus** | GitHub.com, Azure DevOps Services, GitLab.com. Un clic autorise l'accès ; le navigateur vous demande de confirmer. |
| **Autres domaines** | Pour un hôte qui vous est propre. Saisissez le domaine, choisissez la plateforme qui le sert, puis **Autoriser**. Choisissez *Autre (hôte de configuration d’organisation uniquement)* pour un hôte qui ne sert que la configuration de votre organisation. |
| **Domaines configurés** | Ce que vous avez autorisé. **Retirer** supprime l'accès. Un domaine marqué *politique d’entreprise* a été fixé par votre organisation et ne peut pas être retiré ici. |
| **Domaines non configurés** | Des domaines autorisés directement depuis le menu *Accès au site* du navigateur, sans plateforme associée. L'extension n'y fait rien : associez-leur une plateforme pour l'activer, ou retirez l'accès. |

[Quel domaine pour quelle plateforme](platforms-fr.md#domaines).

## Préférences locales

| Préférence | Ce qu'elle fait |
|---|---|
| **Langue de l’interface** | Anglais ou français. Par défaut, l'extension suit la clé `language` de la configuration (fichier du dépôt, puis configuration d'organisation), puis la langue de la plateforme ; ce réglage passe devant, pour vous seul. |
| **Raccourcis directs** | Des combinaisons `Alt` + lettre qui insèrent un label. Une par ligne, par exemple `Alt+R=reviewed` ; `Alt+D=` désactive un raccourci livré. Voir la [saisie au clavier](keyboard-input-fr.md#raccourcis-directs). |
| **Ordre des boutons** | Les labels à placer en tête dans la barre d'outils, séparés par des virgules : `suggestion,nitpick,disagree`. Les labels que vous listez passent en tête de leur groupe (remarques, labels d'état comme `summary`, réponses) ; les autres suivent dans l'ordre par défaut. La liste de complétion suit le même ordre. |

Ces préférences vous suivent d'un poste à l'autre si la synchronisation du navigateur est
activée. Les raccourcis et l'ordre des boutons s'appliquent au prochain champ de commentaire
qui s'ouvre.

## Labels ajoutés

Les six labels que l'extension ajoute à Conventional Comments (`thanks`, `done`, `ack`,
`disagree`, `summary`, `reviewed`) sont activés par défaut. Cette section affiche le bloc de
configuration qui les désactive, et **Copier la configuration** le place dans votre
presse-papiers.

Le bouton ne désactive rien par lui-même : le bloc va dans le fichier
`.conventional-comments.json` du dépôt, que toute l'équipe partage. Sans fichier existant, le
bloc peut constituer le fichier entier ; sinon, ajoutez ses six entrées à la liste `labels`
existante
([pourquoi ces labels existent](labels-fr.md#les-labels-qui-ne-font-pas-partie-de-conventional-comments)).

## Télémétrie

Désactivée par défaut. La case est sans effet tant que votre organisation n'a pas déclaré de
point de collecte dans sa politique d'entreprise. La page affiche ce point de collecte avant
que vous ne donniez votre accord. Seuls des compteurs agrégés sont envoyés, jamais le texte
d'un commentaire, d'un code ou d'un diff, ni l'adresse de la page
([politique de confidentialité](../../PRIVACY.md)).

## État

C'est ici qu'il faut regarder quand quelque chose ne se comporte pas comme prévu.

- **Configuration :** indique si la dernière lecture de la configuration a réussi, et liste
  les avis de cette lecture, avec le dépôt qu'ils concernent.
- **Journal :** ce que l'extension a cherché dans une page sans le trouver (un champ de
  commentaire, un bouton d'envoi, l'ancre d'un fil…) et les erreurs qu'elle a interceptées.
  Une entrée dit ce qui était cherché, pas pourquoi cela manquait : un bouton absent sur une
  pull request fermée est normal.
- **Télécharger le diagnostic (.zip) :** une archive à joindre à un rapport de bug. Elle
  contient le journal et, pour chaque élément non trouvé, un squelette de la page : des
  balises et une courte liste d'attributs d'interface, jamais le texte d'un commentaire, d'un
  code ou d'un champ. **Relisez `report.json` avant de la partager :** les adresses de page
  nomment des dépôts et des pull requests, et un libellé d'interface peut nommer un compte.
- **Effacer le journal** vide le journal.
