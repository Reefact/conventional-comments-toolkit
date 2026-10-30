# Notes de version — Conventional Comments Toolkit, 1.x

Ce qui change pour vous, version après version. Pour le relevé complet — chaque contrainte, chaque
cas limite, chaque section de la spécification sur laquelle une entrée s'appuie — voir
[CHANGELOG.md](https://github.com/Reefact/conventional-comments-toolkit/blob/main/CHANGELOG.md).

L'extension démarre en mode `assist` : elle aide et signale, elle ne bloque jamais un envoi. Aucun
vérificateur (composant B) n'est encore livré : un commentaire n'est contrôlé que dans le
navigateur des personnes ayant installé l'extension.

## 1.0.0-beta.18 — 30 octobre 2026

_Le journal de la page de réglages dit en une phrase ce qui s'est mal passé, enregistre les erreurs de l'extension et se copie pour un rapport de bug ; le filtre des fils par label fonctionne de nouveau sur GitHub._

### ✨ Nouveautés

- **Le journal de la page de réglages se copie pour un rapport de bug.** Chaque ligne a une icône de copie, et un bouton copie tout le journal. Ce que vous collez dans une issue porte la version de l'extension, votre navigateur et ce dont un développeur a besoin pour rouvrir le problème, mais aucun contenu des pages que vous relisiez. L'adresse de la page en fait partie : relisez-la avant de coller dans une issue publique.

- **Chaque ligne du journal dit en une phrase ce qui s'est mal passé.** « Bouton de fusion introuvable : impossible de le griser » au lieu de `merge-button`, avec un niveau, `WARN` ou `ERROR`. Le nom technique reste dans la copie.

- **L'extension enregistre maintenant ses propres erreurs.** Un plantage ne laissait aucune trace. Il apparaît désormais comme une ligne `ERROR` qui dit ce que l'extension faisait, et le détail est dans la copie. Elles restent sur votre appareil.

### 🐛 Corrections

- **Le filtre des fils par label les masque de nouveau sur GitHub.** GitHub forçait chaque fil à rester visible : un fil filtré restait à l'écran. Choisir `praise` ne laisse plus un fil `issue` affiché.

- **Effacer le filtre rend à un fil son affichage d'origine.** Un fil qui avait déjà un réglage d'affichage forcé le perdait une fois le filtre effacé, et le style propre à GitHub pouvait de nouveau l'écraser.

## 1.0.0-beta.17 — 29 octobre 2026

_Deux champs de la page de réglages ne s'affichent plus en blanc dans le thème sombre._

### 🐛 Corrections

- **Le champ « Ordre des boutons » et le bloc de configuration des labels ajoutés suivent maintenant le thème sombre.** Tous deux restaient blancs sur une page de réglages sombre, ce qui les rendait pénibles à lire et détonnait à côté des autres champs. Ils ressemblent maintenant au reste de la page.

## 1.0.0-beta.16 — 29 octobre 2026

_La page de réglages dit quelle version tourne, et l'adaptateur GitHub lit de nouveau correctement le bouton de fusion et les conversations résolues d'une PR._

### ✨ Nouveautés

- **La page de réglages affiche la version de l'extension à côté de son titre.** Une version de test se lit `v1.0.0-beta.16`, là où `chrome://extensions` affiche `1.0.0` pour toutes les bêtas : vous savez quelle build tourne avant de signaler un problème. Firefox affiche son propre numéro de version.

### 🐛 Corrections

- **Le bandeau ne compte plus les conversations résolues comme non résolues.** Sur une PR dont GitHub replie les conversations résolues, le bandeau les rangeait parmi les non résolues, fils `issue (blocking)` compris. Il s'accorde maintenant avec la vue « Files changed » de la même PR.

- **L'extension retrouve le bouton de fusion d'une PR ouverte sur github.com.** GitHub a changé la construction du bouton et l'extension ne le reconnaissait plus. Rien ne change encore à l'écran : l'extension ne grise le bouton que lorsqu'un vérificateur publie un état en échec, et aucun n'est livré.

- **La page de réglages ne signale plus de problèmes de sélecteurs qui n'en étaient pas.** Sa section État signalait des recherches infructueuses alors que l'élément recherché était normalement absent, comme le bouton de fusion d'une PR déjà fusionnée. Elles ne sont plus consignées.

## 1.0.0-beta.15 — 29 octobre 2026

_Le badge d'un label dit désormais au lecteur ce que signifie un commentaire, et son bouton dit au rédacteur quand l'employer._

### 🔧 Changements

- **Le badge et le bouton n'affichent plus la même infobulle.** Au survol du badge de label d'un commentaire publié, vous lisez ce que le commentaire signifie, sans exemple : `issue` affiche « Un problème repéré dans ce code ; le commentaire explique lequel. » Au survol du bouton du label dans la barre d'outils, vous lisez quand l'employer, suivi d'un exemple : « Signaler un problème à corriger, idéalement avec une piste. » Chaque label livré a ses deux textes, en français et en anglais. Le texte d'un badge n'affirme jamais plus que ce que dit le label : le caractère bloquant d'un point reste indiqué par le badge de décoration voisin.

- **Le skill relecteur affiche les priorités en badges colorés.** Un agent qui suit `skills/review-pull-request` marque désormais chaque remarque d'un badge P0 à P3 ; là où l'image ne s'affiche pas, le lecteur voit `[P1]` comme avant.

### ✨ Nouveautés

- **Une équipe peut écrire chaque texte : `labels[].usage` pour le bouton.** Dans `.conventional-comments.json`, `description` va désormais au badge et `usage` au bouton. Écrit, chacun remplace le texte livré ; écrit vide (`""`), il retire l'infobulle correspondante. Sans `usage`, le bouton affiche `description` : une configuration écrite pour la 1.0.0-beta.14 continue d'afficher le même texte sur les deux.

## 1.0.0-beta.14 — 29 octobre 2026

_Les labels s'expliquent là où on les lit : le survol d'un badge affiche sa définition, et une équipe peut écrire la sienne. `quibble` s'efface devant `nitpick`, et deux skills permettent à des agents IA de relire à la façon de l'outil._

### ✨ Nouveautés

- **Un badge dit ce que son label signifie.** Au survol du badge de label d'un commentaire publié, vous obtenez la même infobulle que sur son bouton de la barre d'outils : la définition et un exemple, dans la langue de l'interface. Le badge garde aussi le curseur flèche plutôt que la barre de sélection de texte.

- **Votre équipe peut définir ses labels : `labels[].description`.** Écrivez une description pour un label que vous créez, ou pour un label livré comme `issue`, dans `.conventional-comments.json`, et l'infobulle du bouton et du badge l'affiche. Écrite, elle remplace la définition livrée et son exemple ; écrite vide (`""`), elle retire l'infobulle ; absente, un label livré garde sa définition. Elle s'affiche telle qu'écrite, quelle que soit la langue de l'interface.

- **Deux skills de revue pour les agents IA.** `skills/review-pull-request` et `skills/respond-to-review` indiquent à un agent comment relire une pull request, ou répondre à sa revue, avec les labels de l'outil : remarques suivies jusqu'à vérification, `reviewed:` quand plus rien ne reste, labels de réponse pour l'auteur, et jamais d'approbation ni de fusion. Voir le [README](https://github.com/Reefact/conventional-comments-toolkit/blob/main/README.md#review-skills-for-ai-agents).

### 🔧 Changements

- **`quibble` est désactivé par défaut.** Conventional Comments le décrit lui-même comme « très proche de nitpick », si bien que la barre affichait deux boutons pour un même sens. Utilisez `nitpick`, ou réactivez `quibble` avec `{ "id": "quibble", "enabled": true }` dans `.conventional-comments.json`. D'ici là, un commentaire `quibble:` est un label inconnu là où les commentaires sont validés.

- **`reviewed` dit désormais quand l'employer.** Son infobulle disait « vous avez fini de relire » ; elle dit maintenant « vos points sont traités, vous n'avez plus rien à ajouter ». Publiez-le quand chacun de vos points est corrigé et vérifié, ou écarté par une réponse que vous acceptez. Toute modification ultérieure rouvre votre revue. Il n'approuve toujours rien.

- **La description de l'extension ne mentionne plus le compagnon serveur**, retiré en 1.0.0-beta.13, ni dans `chrome://extensions` ni sur les pages de Release.

### 🐛 Corrections

- **Un label personnalisé n'affiche plus sa clé interne en infobulle.** Le survol du bouton d'un label créé par votre dépôt, comme `risk`, affichait « label.risk ». Il affiche maintenant sa `description` s'il en a une, et rien sinon.

## 1.0.0-beta.13 — 29 octobre 2026

_Des labels pour répondre à une revue, tous les labels livrés activés par défaut, la zone de commentaire de GitHub de nouveau reconnue sur ses pages actuelles — et le compagnon serveur retiré, sans vérificateur pour le remplacer à ce jour._

### ✨ Nouveautés

- **Des labels pour répondre à une revue.** `thanks`, `done`, `ack` et `disagree` répondent à un point ; `reviewed` clôt votre propre revue et n'approuve rien. Ils sont un ajout de l'outil, pas de Conventional Comments, et ne bloquent jamais. `fixed` est accepté pour `done`, `acknowledged` pour `ack` et `thx` pour `thanks` ; `?thx` se déplie en `thanks: ` et `?r` en `reviewed: `. Ils ne rendent pas le label obligatoire dans les réponses. Un dépôt qui veut s'en tenir à Conventional Comments les désactive chacun par une entrée `labels[]` : la page d'options affiche ce bloc et le copie pour vous.

- **La barre d'outils met les réponses sur une ligne à part.** Les labels qui soulèvent un point viennent d'abord ; sous un trait fin suivent ceux qui y répondent — `thanks`, `done`, `ack`, `decision`, `disagree`, du plus chaleureux au plus ferme. Un double trait fin sépare les labels des décorations.

- **Vous choisissez l'ordre des boutons de labels.** « Ordre des boutons », dans les options, prend une liste séparée par des virgules : les labels cités passent en tête, les autres suivent dans l'ordre par défaut, et la liste de complétion suit le même ordre. C'est une préférence personnelle.

- **Un label peut dire s'il soulève un point ou y répond**, avec `labels[].kind` (`"remark"` ou `"reply"`). Un label que vous déclarez est `"remark"` sauf mention contraire. Cela ne change aucun verdict.

- **Chaque ligne du journal dit de quelle page elle vient.** Il indiquait quel sélecteur avait échoué et quand, jamais où : devant quatre lignes horodatées à la même seconde, rien ne permettait de savoir si elles venaient d'une seule page ou de quatre. Chaque ligne commence désormais par une marque de six caractères : une même page produit la même marque. Un clic ouvre l'adresse exacte relevée dans un nouvel onglet. Cette adresse reste sur votre appareil : si vous avez autorisé la télémétrie, celle-ci ne transmet toujours que le nom du sélecteur. La mise à jour conserve toutefois les lignes déjà présentes : comme leur adresse n'était pas enregistrée, elles affichent une marque neutre jusqu'à ce que le sélecteur correspondant échoue de nouveau ou que vous effaciez le journal.

- **Le journal s'efface depuis la page d'options.** Un bouton le vide ; les onglets déjà ouverts recommencent aussitôt à mesurer, et la section se met à jour d'elle-même quand l'un d'eux y écrit, sans rechargement.

- **La page d'options porte l'icône de l'extension**, devant son titre. Le bouton de la visite guidée s'appelle désormais « Visite guidée », son intitulé complet passant en infobulle.

### 🔧 Changements

- **Tous les labels livrés par l'outil sont activés par défaut**, `typo`, `polish` et `quibble` de Conventional Comments compris. Un dépôt désactive ceux dont il ne veut pas.

- **Si votre configuration définit déjà `thanks`, `done`, `ack`, `disagree` ou `reviewed`, il lui faut une propriété pour fonctionner comme avant.** Votre label fusionne désormais avec celui de l'outil et devient toujours non bloquant, si bien que `done (blocking):` est refusé. Ajoutez `"alwaysNonBlocking": false` pour le rétablir.

- **Nouvelles icônes :** `praise` devient 👏, `decision` ⚖️, et 🎉 passe à `reviewed`.

- **Le contrôle renvoie par défaut à la page des labels de l'outil**, https://conventionalcomments.io/docs/labels/, au lieu de conventionalcomments.org, qui ne documente aucun des labels ajoutés. Un `docUrl` que vous avez fixé est conservé.

- **Deux labels actifs ne peuvent plus porter le même nom.** Un alias qui reprend le nom d'un autre label actif est retiré, et ce retrait est signalé. Auparavant, l'ordre de la liste des labels décidait duquel parlait un commentaire.

- **Un plancher d'entreprise ne rend plus `decision` bloquant.** Le citer sous `labels.minimum` le forçait bloquant : un simple `decision:` ouvrait un fil bloquant, tandis que `decision (blocking):` était refusé. Le plancher ne fait plus que le garder activé.

- **Une abréviation livrée ne se déplie plus que vers un label activé.** `?ty`, `?po` et `?qui` inséraient le préfixe d'un label désactivé, que la validation refusait ensuite. Une abréviation définie par votre dépôt n'est pas concernée.

- **Sur Azure DevOps, le préfixe du label n'est plus masqué ni le sujet mis en valeur.** Personne n'a encore mesuré comment Azure DevOps rend le corps d'un commentaire, et l'extension a cessé de supposer qu'il le rend comme GitHub. Les badges restent, et le corps s'affiche entier.

- **Le compagnon serveur est retiré, et aucun vérificateur n'est livré à sa place.** Il n'a jamais été déployé. La spécification demande désormais un vérificateur qui s'exécute dans la plateforme et ne garde aucun état, et [l'issue #56](https://github.com/Reefact/conventional-comments-toolkit/issues/56) suit sa construction pour GitHub. D'ici là, rien ne vérifie les commentaires après coup et aucun statut n'est publié : `enforce` bloque toujours un envoi dans l'extension, ce que contourne quiconque ne l'a pas. Les blocs de configuration `server` et `exemptionLog` sont désormais ignorés, avec un avertissement.

### 🐛 Corrections

- **La vue « Files changed » de GitHub est de nouveau reconnue.** Sur les pages telles que github.com les sert aujourd'hui, l'extension ne trouvait aucun bouton de publication, si bien qu'en mode `enforce` un commentaire non conforme pouvait y être publié quand même. Elle prenait aussi la modification d'un commentaire pour l'écriture d'un nouveau, traitait le résumé de revue comme un commentaire en ligne susceptible de bloquer la pull request, et n'affichait aucun badge sur les fils. Sur l'onglet « Conversation », modifier un commentaire publié était aussi traité comme un commentaire en ligne susceptible de bloquer la pull request. « Cancel » n'est toujours jamais intercepté.

- **GitHub : la date de création de la pull request est lue sur la pull request elle-même.** Cette date décide si une pull request est antérieure à `activatedAt`, donc si l'extension peut bloquer dessus. C'était la première date de la page — sur une pull request fusionnée, la date de fusion, si bien que la même pull request pouvait afficher deux dates selon l'onglet. Quand la date ne peut pas être lue, l'extension ne bloque pas.

- **La politique de confidentialité décrivait un historique que l'extension ne garde pas.** Elle annonçait « les 50 dernières fois » où un élément n'a pas été reconnu, alors que le journal ne conserve qu'une ligne par règle de sélection — cinquante au plus, chacune avec son dernier relevé. Elle décrit maintenant ce qui est réellement conservé, adresse de la page comprise.

## 1.0.0-beta.12 — 8 septembre 2026

_La visite guidée est enfin lisible — la page derrière elle s'assombrit vraiment, et sa fiche se détache au lieu de se fondre dans le décor — et la section « État » dit ce qu'elle a constaté plutôt que ce que cela pourrait vouloir dire._

### ✨ Nouveautés

- **La section « État » dit à quoi elle sert.** C'était la seule section de la page d'options dont le titre n'était suivi de rien : il fallait lire les deux lignes qu'elle affiche pour comprendre à quoi elle servait.

### 🐛 Corrections

- **La visite guidée assombrit désormais la page autour de ce qu'elle montre.** En thème sombre, elle ne l'assombrissait pratiquement pas — un voile sombre sur une page déjà sombre ne change presque rien —, si bien que la visite semblait ne rien mettre en avant ; et sa fiche se confondait avec les panneaux derrière elle au lieu de s'en détacher. Le reste de la page s'assombrit maintenant franchement dans les deux thèmes, et la fiche porte une ombre réellement visible ; en thème sombre, elle est aussi plus claire que les panneaux derrière elle.
- **La section « État » ne laisse plus croire que l'extension a modifié vos pages.** Elle annonçait « les pages dont la structure a changé sous elle », ce qui se lit comme une accusation et, dans tous les cas, affirme plus que ce que l'extension sait : ce qu'elle enregistre, c'est qu'un de ses sélecteurs n'a rien trouvé sur la page. Cela peut vouloir dire que la page a changé — ou simplement que l'élément est légitimement absent, comme le bouton de fusion sur une PR fermée. La section et l'étape de la visite guidée rapportent maintenant ce qui a réellement été constaté.

## 1.0.0-beta.11 — 8 septembre 2026

_Vous autorisez désormais l'accès à toutes les plateformes de la même façon — `github.com` compris — et pouvez le révoquer à tout moment._

### ✨ Nouveautés

- **Vous choisissez où l'extension travaille, et vous pouvez revenir sur ce choix.** `github.com` était jusqu'ici intégré à l'extension : actif dès l'installation, sans aucun moyen de révoquer cet accès depuis l'extension elle-même. Il passe maintenant par la même autorisation en un clic que toutes les autres plateformes, et chaque domaine autorisé porte un bouton « Retirer ». Les domaines imposés par la politique de votre organisation restent en place — ce n'est pas à cet écran d'en décider.
- **La page d'options s'ouvre automatiquement la première fois et vous propose une visite guidée.** Celle-ci présente chaque section et explique à quoi elle sert ; vous pouvez l'interrompre à tout moment, la fermer avec `Échap`, et elle ne revient jamais d'elle-même. Un bouton « Revoir la visite guidée » en haut de page la rejoue quand vous voulez.
- **La page d'options parle enfin français ou anglais, comme le reste de l'extension.** Elle restait en français quel que soit votre choix : quelqu'un ayant réglé l'interface en anglais voyait de l'anglais partout, sauf sur la page de réglages où il venait de faire ce choix. Le changement de langue prend désormais effet immédiatement, et non au prochain rechargement.

### 🐛 Corrections

- **GitHub Enterprise Cloud avec résidence des données fonctionne, tout simplement.** Un domaine autorisé sous la forme `*.ghe.com` était enregistré sous un nom déformé, si bien que l'extension ne reconnaissait jamais les pages pour lesquelles elle était autorisée. Le défaut est plus ancien que cette version, et aucun test ne pouvait le voir : il n'apparaît que dans un navigateur, et les tests tournaient là où il n'existe pas.
- **Il n'est plus nécessaire de recharger l'onglet d'où vous venez.** Autoriser un domaine depuis la page d'options laissait cet onglet inerte — précisément celui que vous alliez utiliser. L'extension y est désormais active immédiatement.
- **Un retrait refusé par le navigateur n'est plus présenté comme réussi.** L'écran affichait ensuite le domaine parmi les non configurés — une anomalie qu'il venait de créer lui-même, alors que l'accès était toujours accordé. Il ne change plus rien et dit pourquoi.
- **Retirer l'autorisation depuis `chrome://extensions` efface désormais aussi la plateforme enregistrée.** Elle restait auparavant en place, si bien que réautoriser le domaine de la même façon rétablissait silencieusement l'ancien choix au lieu de vous le redemander.
- **L'extension ne se charge plus sur des pages qu'elle ne prend pas en charge.** Si vous aviez accordé l'accès à tous les sites depuis les contrôles du navigateur, son code était injecté sur toutes les pages `https`, où il ne pouvait de toute façon rien faire. Un motif qui ne désigne aucun hôte concret n'apparaît plus non plus dans votre liste comme un domaine à configurer.
- **L'interface n'apparaît plus en double sur une page couverte par deux de vos autorisations**, et un onglet laissé ouvert longtemps n'accumule plus une copie de la feuille de style de l'extension.

### 🔧 Modifications

- **Après cette mise à jour, l'extension se tait sur `github.com` jusqu'à ce que vous l'autorisiez.** Un clic sur « Activer » dans la page d'options suffit. Cette étape ne peut pas être automatisée : le navigateur n'accorde cette permission qu'à la suite d'une action explicite de votre part. La page s'ouvre d'elle-même pour le dire — mais seulement si la mise à jour ne vous laisse aucun domaine en service ; si vous en aviez déjà un autre configuré, l'extension continue d'y fonctionner et rien ne signale qu'elle n'est plus active sur `github.com`.
- **L'écran des options est refait autour des états réels d'un accès** : les domaines que l'extension connaît déjà, où un clic autorise et classe à la fois ; tout autre domaine, où vous indiquez à quelle plateforme il correspond avant d'accorder l'accès ; la liste de ce qui est configuré ; et, seulement quand elle n'est pas vide, les domaines autorisés depuis le navigateur plutôt que depuis cet écran, où l'extension n'est donc pas encore active.
- **Chaque organisation `visualstudio.com` est désormais autorisée individuellement** via le champ de saisie, avec Azure DevOps pré-rempli. L'entrée de catalogue qu'elle remplace demandait d'un coup toutes les organisations sur ces adresses historiques, quand un poste en utilise une.

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
