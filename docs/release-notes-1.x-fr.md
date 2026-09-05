# Notes de version — Conventional Comments Toolkit, 1.x

Ce qui change pour vous, version après version. Pour le relevé complet — chaque contrainte, chaque
cas limite, chaque section de la spécification sur laquelle une entrée s'appuie — voir
[CHANGELOG.md](https://github.com/Reefact/conventional-comments-toolkit/blob/main/CHANGELOG.md).

L'extension démarre en mode `assist` : elle aide et signale, elle ne bloque jamais un envoi. La
source de vérité sur la conformité reste le compagnon serveur (composant B).

## 1.0.0-beta.10 — 5 septembre 2026

_GitHub a réécrit sa vue « Files changed », et l'extension s'y était tue : cette version y ramène tout l'outillage, et fait parler les diagnostics dans la langue que vous avez choisie._

### 🐛 Corrections

- **L'outillage des commentaires fonctionne de nouveau sur la vue « Files changed » réécrite de GitHub.** GitHub sert désormais cette page sous `/pull/N/changes`, où l'extension ne reconnaissait rien : pas de barre de labels, pas de saisie rapide, pas de validation en direct, pas de badges sur les commentaires publiés — précisément là où un `issue:` bloquant compte le plus. Tout est de retour. Et une page qui porte une zone de saisie que l'extension ne reconnaît pas laisse maintenant une entrée de diagnostic, au lieu d'être inerte et muette à la fois.
- **Sous `enforce`, un commentaire non conforme ne peut plus être publié depuis cette vue.** Ni en cliquant sur *Reply* sous une ligne de diff, ni depuis le panneau « Finish your comments » d'une revue groupée, dont les boutons vivent dans la surcouche et non à côté du champ. Seul le chemin clavier était gardé jusqu'ici : un commentaire signalé par l'extension partait quand même à la souris.
- **Modifier le commentaire racine d'un fil y est de nouveau validé.** C'était pris pour une réponse, que la configuration par défaut dispense de validation — une racine `issue:` pouvait donc être réécrite en n'importe quoi sans que l'extension y regarde. Les commentaires publiés retrouvent aussi leurs badges, les fils résolus se lisent comme résolus plutôt qu'en état inconnu, et le bandeau de la pull request affiche les auteurs et les textes qui lui manquaient.
- **Un label bloquant dans le résumé d'une revue est de nouveau signalé.** Dans le corps de « Finish your comments », `issue:` remontait tout sauf le seul avertissement qui compte là : personne ne peut résoudre un résumé de revue, qui ne porte donc aucun état bloquant. Le même texte dans la boîte de conversation l'a toujours dit.
- **L'onglet Preview affiche les badges sur cette vue aussi.** Écrire `issue: …` dans un composeur sur `…/changes` puis basculer sur *Preview* rendait le préfixe en texte brut, là où la même bascule sur la page de conversation affichait le badge.
- **Le composeur ressemble de nouveau à lui-même sur cette vue.** La barre d'outils est au-dessus du champ au lieu d'être repliée en colonne étroite à côté de lui, le trait de conformité autour du champ est visible au lieu d'être rogné par le conteneur qui l'enveloppe, et la barre, le champ et la pastille de verdict ne sont plus serrés contre le cadre qui les entoure. Cet espacement survit aussi à un aller-retour par l'onglet *Preview*, qui le faisait disparaître jusqu'à la fermeture du composeur.
- **Les messages de diagnostic suivent maintenant la langue choisie dans la page d'options.** Une interface en français pouvait afficher *Conforme, avec avertissements* au-dessus de *This comment is blocking but has no discussion* : cette ligne-là prenait sa langue dans la configuration du dépôt plutôt que dans votre propre préférence. Les noms de labels (`issue`, `praise`…) et les codes de diagnostic (`E-NO-LABEL`, `W-NO-DISCUSSION`…) restent non traduits dans les deux langues — ce sont des identifiants, et la sortie du check les nomme de la même façon.

## 1.0.0-beta.9 — 4 septembre 2026

_L'extension ne s'impose plus sur la description d'une pull request, ne s'endort plus sur une page vide au départ, et dit enfin pourquoi quand elle n'arrive pas à lire votre configuration._

### ✨ Nouveautés

- Quand la configuration ne peut pas être lue, la page d'options affiche désormais **pourquoi** — `HTTP 429`, une `TypeError`, un 404 qu'on ne distingue pas d'un refus — avec le niveau d'où vient l'échec, au lieu du seul mot `unreachable`. La raison reste sur votre machine : elle va dans `chrome.storage.local` et nulle part ailleurs.

### 🐛 Corrections

- **La description d'une pull request n'est plus traitée comme un commentaire de revue.** La convention n'en dit rien, et pourtant la barre d'outils des labels s'y affichait — et sous `enforce`, le garde à l'envoi s'appliquait à son bouton Update : une description sans préfixe `label:` ne pouvait tout simplement plus être enregistrée. Les badges en ont disparu aussi. Si un futur rendu de GitHub nomme les choses autrement, la description se comportera comme avant, jamais moins bien.
- **Le bandeau « Configuration non lue » ne s'affiche plus sur tous les dépôts.** Toute lecture de configuration échouait avant même de quitter le navigateur, sur les dépôts publics comme privés, avec fichier de configuration comme sans — l'extension retombait donc toujours dans son état dégradé. La configuration au niveau du dépôt est de nouveau lisible.
- **Une page qui n'avait rien à montrer ne cesse plus de surveiller au bout de cinq secondes.** Sur l'onglet *Files changed* d'une pull request sans encore aucun fil, le premier commentaire publié ensuite ne recevait ni badge ni bandeau avant un rechargement complet — et revenir sur *Conversation* depuis un autre onglet de la même pull request non plus. Une page qui n'a pas bougé est toujours laissée tranquille ; une page qui gagne un commentaire, un fil ou un résultat publié est rendue de nouveau.
- **Une page absente n'est plus lue comme une page cachée pendant que vous êtes connecté.** GitHub masque une ressource privée en la disant absente, et l'extension se fiait à un signal « privé » relevé sur la page, qui pouvait se tromper sur un dépôt public. Deux signaux indépendants doivent maintenant concorder pour qu'un 404 signifie une configuration illisible.
- **Le journal de dégradation des sélecteurs est de nouveau utilisable.** Visiter une seule pull request fermée remplissait ses cinquante lignes d'une même entrée et évinçait toute dégradation réelle, parce que le bouton de fusion qu'il cherche y est légitimement absent. Une ligne par sélecteur désormais — et la télémétrie facultative, qui gonflait pour la même raison, avec lui.

## 1.0.0-beta.8 — 4 septembre 2026

_Un commentaire publié se lit comme un titre — les badges, puis le sujet en gras sur la même ligne — et trois façons de perdre silencieusement ses badges sont refermées._

### ✨ Nouveautés

- Le sujet d'un commentaire publié s'affiche désormais **en gras sur la ligne des badges**, à leur droite, au lieu de commencer à la ligne en dessous. Une ligne vide le sépare de la suite du commentaire. Quand le sujet ne peut pas être borné sans risque — une mise en forme inline qui porte son propre saut de ligne, par exemple — la mise en page précédente est conservée plutôt que de risquer une coupure au mauvais endroit.

### 🐛 Corrections

- Modifier un commentaire ne lui retire plus ses badges. La plateforme réécrit le corps rendu lors d'une mise à jour ; les badges et le préfixe structuré partaient avec, et rien ne les ramenait avant un rechargement de la page.
- Le préfixe structuré est remasqué quand la plateforme le rétablit d'elle-même, ce qui laissait auparavant `issue (blocking):` visible au milieu d'un commentaire par ailleurs décoré.
- Quitter une pull request, ou passer l'extension en `mode: off`, ne laisse plus une partie d'un commentaire invisible. Les badges étaient retirés mais le préfixe restait masqué : une extension qui se déclare inactive continuait donc de cacher du texte que vous aviez écrit.

### 🔧 Changements

- La barre d'outils de rédaction est désormais sur **deux rangées** — les labels, puis les décorations — pour qu'une fenêtre étroite ou un panneau latéral ne puisse plus mettre un bouton de label à côté d'un segment de décoration comme s'il s'agissait d'une même commande.
- Les boutons de label n'affichent plus leur icône ; les badges des commentaires publiés, si. Les boutons se partagent la largeur d'une rangée, où une icône se paie sur tous les autres ; un badge est seul en tête de son commentaire, où elle ne coûte rien.

## 1.0.0-beta.7 — 3 septembre 2026

_Le préfixe structuré disparaît d'un commentaire publié — les badges le disent déjà — sauf partout où le dire deux fois était la réponse la plus sûre._

### ✨ Nouveautés

- `issue (blocking): ` n'apparaît plus dans un commentaire publié : les badges en portent l'information, le texte est donc masqué à l'écran. À l'écran seulement — le commentaire stocké sur la plateforme n'est pas touché, et rouvrir le formulaire d'édition le réaffiche en entier.
- Là où les badges ne diraient pas la même chose, le texte reste : une décoration que vous avez écrite et que la configuration rejette, un défaut de casse ou de ponctuation que l'outil existe pour signaler, des décorations repliées dans un badge `+N`. Les masquer effacerait la seule trace de ce que vous avez réellement tapé.
- Une ligne qui ressemble seulement à un préfixe — dans un bloc de code, une citation, une liste, un titre, un tableau ou un résumé `<details>` — est laissée telle quelle.

### 🔧 Changements

- Chaque label par défaut a désormais une icône et une couleur, dont le contraste est vérifié au regard de WCAG 1.4.11.

## 1.0.0-beta.6 — 3 septembre 2026

_Les décorations ont leurs propres badges, et l'affichage suit un changement de configuration sous vos yeux._

### ✨ Nouveautés

- Chaque décoration d'un commentaire publié reçoit son badge à côté du label : rouge quand elle force le caractère bloquant, vert quand elle force le non-bloquant, en pointillés quand la décoration n'est déclarée nulle part.

### 🐛 Corrections

- Changer la configuration rafraîchit désormais ce qui est déjà à l'écran — y compris sur un onglet resté ouvert sur une pull request. Un label désactivé en cours de revue perd son badge au lieu d'en garder un pour un état qui n'existe plus.
- **Une boîte de commentaire déjà ouverte suit ce changement elle aussi, y compris sur le fait de bloquer votre envoi.** Elle continuait d'appliquer la configuration capturée à son ouverture : une organisation passant d'`enforce` à `off` vous laissait bloqué tant que vous n'aviez pas fermé puis rouvert la boîte.

## 1.0.0-beta.5 — 2 septembre 2026

_La configuration du dépôt redevient lisible sur les dépôts privés._

### 🐛 Corrections

- L'extension relit la configuration de votre dépôt et de votre organisation sur les dépôts privés. La lecture suit une redirection que le navigateur refuse d'authentifier ; les identifiants ne sont désormais retirés que sur ce saut-là, si bien que le fichier reste lisible sans vous demander la moindre permission d'hôte.
- Un fichier de configuration illisible faute de session n'est plus pris pour un fichier absent — ce qui appliquait silencieusement la mauvaise configuration.

## 1.0.0-beta.4 — 1er septembre 2026

_Le sélecteur de décoration dit ce que porte votre commentaire, pas ce que vous avez cliqué en dernier._

### 🐛 Corrections

- Le sélecteur de décoration reflète désormais le commentaire lui-même. Une décoration que vous avez retirée en modifiant le texte, ou partie avec un label que la configuration a désactivé, ne reste plus allumée dans la barre d'outils.

## 1.0.0-beta.3 — 1er septembre 2026

_Deux permissions retirées du manifeste, une télémétrie qui n'existe que si vous la demandez, et de quoi soumettre aux stores._

### 🔧 Changements

- **`activeTab` et la permission d'hôte permanente sur `github.com` sont retirées.** Les hôtes sont accordés à la demande — l'extension demande ce dont elle a besoin, quand elle en a besoin.
- Le bandeau de pull request est un sommaire, pas une barrière au merge. Le verdict appartient au check de la plateforme, déjà rouge et déjà bloquant ; le rejouer ici dévaluait les deux.

### ✨ Nouveautés

- Télémétrie facultative, éteinte tant que vous ne l'activez pas, liée à l'adresse pour laquelle vous avez consenti et configurée par la politique de votre organisation plutôt que par un fichier de dépôt.
- La version affichée dans `chrome://extensions` distingue les pré-versions : `1.0.0-beta.1` et `1.0.0-beta.2` ne s'affichent plus toutes deux comme `1.0.0`.

### 🐛 Corrections

- **Sur GitHub Enterprise Server et Azure DevOps Server auto-hébergé, accorder la permission d'hôte vous donne enfin l'extension.** L'autorisation était accordée et rien n'apparaissait : aucun adaptateur n'était construit pour cet hôte. La plateforme que sert chaque hôte est désormais enregistrée avec lui, ce qui distingue un domaine GHES d'un domaine Azure DevOps Server.
- **Une configuration d'organisation hébergée hors de votre plateforme redevient lisible.** Elle ne l'avait jamais été : la politique CORS de la page la bloquait quelle que soit la permission accordée, laissant l'extension en état dégradé permanent et jugeant sur deux niveaux de configuration là où le serveur en utilise trois.

## 1.0.0-beta.2 — 24 août 2026

_Les commentaires de bots et d'outils cessent d'être signalés, et la barre d'outils cesse d'être collée au bord._

### ✨ Nouveautés

- **Une commande d'outil n'est plus signalée comme un commentaire mal formé.** Une commande slash, ou la mention d'un bot que vous listez dans `toolCommands`, est exemptée de validation — `/rebase` et `@dependabot recreate` passent intacts.

### 🐛 Corrections

- La barre d'outils et le retour visuel s'alignent sur le texte de la boîte de commentaire au lieu d'en toucher la bordure.
- La couleur d'un label peint désormais la bordure du bouton actif plutôt que son fond : cette couleur vient de votre configuration, et l'employer en fond produisait un contraste descendu à 1,54 là où 4,5 est exigé.
- Les boutons de la barre d'outils sont de nouveau espacés — un commentaire CSS fermé un caractère trop tôt avalait silencieusement la règle qui les espaçait.

## 1.0.0-beta.1 — 24 août 2026

_Première version installable._

### ✨ Nouveautés

- L'extension pour GitHub et Azure DevOps : une barre d'outils au-dessus de la boîte de commentaire, une saisie rapide au clavier, un retour visuel pendant la frappe, et un garde d'envoi en mode `enforce`.
- Le compagnon serveur (composant B), auto-hébergeable, qui fait autorité sur la conformité et sur le blocage de la complétion d'une pull request.
- Des archives Chromium et Firefox publiées à chaque tag, chargeables sans Node ni npm.
