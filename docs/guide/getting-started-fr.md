# Premiers pas

**Langues :** [English](getting-started-en.md) | Français (ce fichier)

Dix minutes pour passer de rien d'installé à un premier commentaire de revue écrit avec la
barre d'outils.

## Ce qu'il vous faut

- Chrome, Edge ou un autre navigateur Chromium, ou Firefox 128 ou plus récent.
- Une pull request que vous pouvez commenter, sur GitHub, Azure DevOps ou GitLab
  ([ce qui fonctionne sur quelle plateforme](platforms-fr.md)).

Rien d'autre : ni compte, ni jeton, ni serveur.

## 1. Installer l'extension

Chaque release fournit l'extension sous forme d'archive prête à charger, une pour les
navigateurs Chromium et une pour Firefox.

1. Ouvrez la [page des releases](https://github.com/reefact/conventional-comments-toolkit/releases)
   et téléchargez `conventional-comments-toolkit-<version>-chromium.zip` (ou `-firefox.zip`).
2. Décompressez-la dans un dossier que vous garderez. Le navigateur relit ce dossier à chaque
   démarrage : le supprimer désactive l'extension.
3. Chargez-la :
   - **Chrome, Edge :** ouvrez `chrome://extensions`, activez le **Mode développeur**, cliquez
     sur **Charger l'extension non empaquetée** et choisissez le dossier décompressé, celui
     qui contient directement `manifest.json`.
   - **Firefox :** ouvrez `about:debugging#/runtime/this-firefox`, cliquez sur **Charger un
     module temporaire** et choisissez le `manifest.json` du dossier décompressé. Firefox
     retire un module temporaire à sa fermeture.

Une extension chargée de cette façon ne se met pas à jour toute seule : pour une nouvelle
version, il faut la télécharger et la charger à nouveau. Pour construire l'extension depuis
les sources, suivez plutôt le [guide de construction pas à pas](../extension-setup-fr.md).

## 2. Autoriser votre plateforme

La page de réglages de l'extension s'ouvre d'elle-même après l'installation, avec une courte
visite guidée. Vous pouvez la rouvrir à tout moment en cliquant sur l'icône de l'extension
dans la barre d'outils du navigateur.

**L'extension est inactive partout tant que vous n'avez pas autorisé un domaine.** Elle ne
demande aucun accès aux sites à l'installation ; vous l'accordez un domaine à la fois.

- Sous **Domaines connus**, cliquez sur la plateforme que vous utilisez : GitHub.com, Azure
  DevOps Services (`dev.azure.com`) ou GitLab.com. Le navigateur vous demande de confirmer.
- Pour un hôte qui vous est propre (GitHub Enterprise Server, Azure DevOps Server, une
  organisation `visualstudio.com`, GitLab Self-Managed), saisissez son domaine sous **Autres
  domaines** et choisissez la plateforme qui le sert **avant** de cliquer sur **Autoriser**.

Le domaine apparaît alors sous **Domaines configurés**, où vous pouvez retirer l'accès à tout
moment. Le guide de la [page de réglages](settings-fr.md) décrit le reste de cet écran.

## 3. Écrire votre premier commentaire

Ouvrez une pull request sur le domaine que vous avez autorisé, rechargez la page si elle
était déjà ouverte, et cliquez dans le champ d'un **nouveau** commentaire. Les réponses dans
un fil ne sont pas validées par défaut : la pastille y reste donc muette.

1. Une **barre d'outils** apparaît, avec un bouton par label : `praise`, `nitpick`,
   `suggestion`, `issue`…
2. Saisissez votre remarque, par exemple `ce nom ne dit pas ce que contient la variable`.
3. Une **pastille de validation**, sous le champ, indique que le commentaire est non
   conforme : il n'a pas encore de label.
4. Cliquez sur **nitpick** dans la barre d'outils. Le commentaire devient :

   ```text
   nitpick: ce nom ne dit pas ce que contient la variable
   ```

   La pastille passe à *Conforme*.
5. Publiez le commentaire comme d'habitude. Une fois publié, son label s'affiche sous la
   forme d'un badge coloré.

Voilà toute la boucle : écrire, choisir un label, publier.

## Ce que l'extension fait par défaut

- Elle **assiste et ne bloque jamais**. Le mode par défaut est `assist` : un commentaire non
  conforme est signalé et part quand même. Bloquer est un choix qu'une équipe fait pour un
  dépôt ([modes et adoption](modes-and-adoption-fr.md)).
- Elle fonctionne **sans aucun fichier de configuration**. Un dépôt qui veut ses propres
  labels ou ses propres règles ajoute un fichier `.conventional-comments.json`
  ([configuration](configuration-fr.md)).
- **Aucun contenu de commentaire, de code ou de diff ne quitte votre navigateur**
  ([politique de confidentialité](../../PRIVACY.md)).

## Pour aller plus loin

| Pour… | Lisez |
|---|---|
| connaître chaque partie de la barre d'outils, de la pastille, des badges et du bandeau | [Écrire des commentaires de revue](writing-comments-fr.md) |
| écrire les labels sans la souris | [Saisie au clavier](keyboard-input-fr.md) |
| choisir le bon label | [Labels et décorations](labels-fr.md) |
| comprendre un message de la pastille | [Diagnostics](diagnostics-fr.md) |
| fixer les règles de votre dépôt | [Configuration](configuration-fr.md) |
| comprendre pourquoi quelque chose ne s'affiche pas | [FAQ et dépannage](faq-fr.md) |
