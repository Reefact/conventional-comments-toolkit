# Fiche Chrome Web Store — contenu (FR)

Brouillon des champs texte de la fiche de soumission. Voir aussi
[`store-listing-en.md`](store-listing-en.md) pour la version anglaise et
[`store-permissions-justification-fr.md`](store-permissions-justification-fr.md)
pour la justification des permissions.

## Catégorie

**Outils de développement** (*Developer Tools*) — catégorie Chrome Web
Store la plus proche : l'extension assiste la rédaction de commentaires
de revue de code, pas de la productivité générale ni des réseaux sociaux.

## Description courte (132 caractères max)

> Conventional Comments pour vos revues GitHub, GitLab et Azure DevOps : labels, validation, aucun contenu ne sort du navigateur.

(127 caractères.)

**Deux contraintes tiennent cette phrase, et elles tirent en sens
inverse.** Les trois plateformes doivent y figurer — l'extension les
couvre toutes les trois (annexes A, B et C), et une description qui n'en
nomme qu'une vend un autre produit. Et la garantie doit rester celle du
**contenu** : « rien ne quitte votre navigateur », écrit ici pendant
plusieurs versions, était faux sans nuance — `language` et
`directShortcuts` se synchronisent via `chrome.storage.sync` quand la
synchronisation Chrome est active. « Aucun contenu » dit ce qui tient
sans condition, et tient dans la limite.

## Description longue

> **Conventional Comments Toolkit** aide les équipes à écrire des
> commentaires de revue de code clairs et conformes à la convention
> [Conventional Comments](https://conventionalcomments.org/), directement
> dans l'éditeur natif de la plateforme : GitHub (github.com, GitHub
> Enterprise Server, GitHub Enterprise Cloud), GitLab (gitlab.com et
> instances auto-hébergées) et Azure DevOps (Services et Server
> auto-hébergé). GitHub est actif d'emblée ; les autres domaines
> s'activent à la demande, avec votre confirmation.
>
> **Ce que l'extension apporte**
> - Une barre d'outils pour insérer les labels standards
>   (`issue`, `suggestion`, `question`, `nitpick`...) sans les retaper.
> - Une validation du format à la saisie, avec retour visuel immédiat si
>   un commentaire ne respecte pas la convention.
> - Une saisie rapide au clavier pour les personnes qui préfèrent ne pas
>   toucher la souris.
> - Un fonctionnement autonome, sans backend requis : l'extension assiste
>   et valide même sans le composant serveur optionnel de gouvernance
>   d'équipe.
>
> **Confidentialité par conception**
> Aucun contenu de commentaire, de code ou de diff ne quitte votre
> navigateur. Aucune télémétrie par défaut. Aucun jeton d'authentification
> stocké. Permissions minimales : pas d'accès à `<all_urls>`, les domaines
> hors GitHub (GitLab, Azure DevOps, configuration d'entreprise) ne sont
> demandés
> qu'à la demande et avec votre confirmation explicite.
> Politique de confidentialité complète :
> https://github.com/reefact/conventional-comments-toolkit/blob/main/PRIVACY.md
>
> **Pour les organisations**
> Un composant serveur optionnel (non requis pour utiliser l'extension)
> permet de faire respecter la convention comme condition de fusion des
> pull requests, avec un mécanisme d'exemption gouverné et traçable.
>
> Code source public sous licence Apache-2.0 :
> https://github.com/reefact/conventional-comments-toolkit

## Écart résolu — reconnaissance de l'interface sur un domaine auto-hébergé

Corrigé et testé (`content-internal.ts`, `packages/extension/test/extra-hosts.test.ts`) :
accorder la permission d'hôte optionnelle sur un domaine GitHub
Enterprise Server ou Azure DevOps Server auto-hébergé, puis lui
associer une plateforme dans la page d'options, active désormais
correctement l'interface — `bootstrap()` transmet les `extraHosts`
accordés au bon adaptateur. La mention « GitHub Enterprise Server /
Azure DevOps Server » peut rester dans la fiche.

## Écart résolu — `configUrl` sur un domaine tiers

Corrigé et testé (`packages/extension/test/org-config-relay.test.ts`) :
`getOrgConfig()` appelait `fetch` depuis le script de contenu, soumis
au CORS de la page hôte — une permission d'hôte n'y change rien, la
requête est émise au nom de l'origine de la page. La lecture d'un
`configUrl` d'organisation hébergé sur un **domaine distinct** de la
plateforme passe désormais par le service worker (`cct-fetch-config`).
Les lectures de même origine que la page — le `.conventional-comments.json`
du dépôt affiché, et un `configUrl` posé sur le domaine de la plateforme
lui-même — restent directes : elles n'ont besoin d'aucun relais.

## Notes de version pour la première soumission

> Première publication. Voir le journal des modifications sur le dépôt
> GitHub pour l'historique de développement.

## Liste des captures d'écran à produire (non fournies dans ce document)

Ces captures demandent une session réelle sur chaque plateforme — et, pour
GitLab et Azure DevOps, la permission d'hôte optionnelle accordée. Elles ne
peuvent pas être produites depuis ce dépôt.

**La contrainte qui dicte la liste** : le Chrome Web Store accepte **cinq**
captures, et l'extension couvre **trois plateformes** (annexes A, B et C).
Chacune doit donc porter deux choses à la fois — une plateforme, et un moment
du produit. La répartition ci-dessous le fait tenir sans rien répéter.

1. **GitHub — écrire.** La barre d'outils (§5.1) au-dessus de l'éditeur natif
   d'une pull request, un label inséré avec sa décoration (`suggestion
   (non-blocking):`) et le retour visuel conforme (§5.3). C'est la **vignette**
   affichée dans les résultats de recherche : cadrer serré sur l'éditeur, pas
   sur la page entière, et vérifier qu'elle reste lisible en petit.
2. **GitHub — lire.** Un fil déjà publié tel que l'extension le rend (§5.5) :
   badges de label et de décoration, préfixe masqué et sujet mis en avant,
   bandeau de tête comptant les fils bloquants non résolus. C'est l'apport que
   rien d'autre ne montre — la revue telle qu'on la relit, pas telle qu'on
   l'écrit.
3. **GitLab — la validation qui refuse.** Un commentaire non conforme dans
   l'éditeur d'une merge request, avec le retour d'erreur (§5.3), et le blocage
   d'envoi (§5.4) si la configuration de la démonstration est en mode
   `enforce`. Double emploi : la troisième plateforme, et l'état d'erreur.
4. **Azure DevOps — la même chose ailleurs.** Barre d'outils et badges sur une
   pull request Azure DevOps, le domaine ayant été activé à la demande. Double
   emploi : la deuxième plateforme, et la preuve que l'activation optionnelle
   fonctionne — ce que la justification des permissions affirme par ailleurs.
5. **La page de réglages** (`options.html`) : langue, domaines accordés et
   plateforme associée à chacun, ordre des labels. La montrer **peuplée** —
   une page vide ne démontre rien.

Deux scènes valent d'être capturées **hors** fiche store, pour le README ou le
site, faute de place ici : la saisie rapide au clavier (§5.2) et le filtre de
fils par label (§5.5).

**Conditions communes, qui valent pour les cinq.**

- Format : PNG, exactement **1280×800** (le store accepte aussi 640×400).
- **Contenu public et inventé.** Ces images sont publiées telles quelles :
  jamais un dépôt privé, un vrai projet client, ni le nom ou l'adresse d'un
  tiers. Des dépôts de démonstration dédiés, dans les trois plateformes.
- **Un seul thème** — clair ou sombre — sur toute la série.
- **Aucun bandeau dégradé** (§5.4) à l'écran : voir la section suivante.
- Chaque capture doit être **reproductible** : consigner l'URL et les gestes
  qui l'ont produite, à côté de l'image.

**Si le bandeau « Configuration non lue » apparaît sur la capture** : le
diagnostic écrit ici pendant plusieurs versions était juste sur son
prémisse et faux sur sa conclusion, et il vaut d'être corrigé plutôt que
remplacé. Juste : un fichier **absent** rend `absent`, `degraded: false`,
et n'affiche aucun bandeau (§10, « un fichier simplement absent est un cas
nominal »). Faux : « ajouter un fichier de configuration ne le fera pas
disparaître ». C'était l'inverse — le bandeau apparaissait **parce qu'il y
avait un fichier**. La route `raw` de github.com redirige vers
`raw.githubusercontent.com` dès que le fichier existe, cette origine
répond `Access-Control-Allow-Origin: *`, et le navigateur refuse ce joker
quand la requête porte des cookies : le `fetch` levait, la lecture rendait
`unreachable`, et le bandeau s'affichait exactement sur les dépôts qui
avaient une configuration à lire.

Corrigé : la lecture part en `credentials: 'same-origin'` — la session
accompagne le premier saut, pas la redirection. Le bandeau disparaît sur
un dépôt **public**, et aussi sur un dépôt **privé** tant qu'une session
est ouverte. Il ne reste que pour un visiteur déconnecté, et il dit alors
la vérité : l'extension n'a pas pu lire.

Cette dernière phrase cachait un second défaut, et il vaut la peine d'en
garder la trace. GitHub masquant volontiers le privé en « inexistant », un
404 était reclassé en lecture impossible **dès que la page indiquait un
dépôt privé** — un signal lu dans la page, donc faillible. Il a
effectivement menti : sur une page de pull request connectée d'un dépôt
**public**, le capteur de visibilité a répondu « privé », le 404 nominal
est devenu `unreachable`, et le bandeau s'affichait sur un dépôt qui
n'avait tout simplement pas de configuration — le cas le plus ordinaire
qui soit. Le reclassement exige désormais l'accord de **deux** signaux
indépendants : aucune session dans la page (`meta[name="user-login"]` vide
ou absent) **et** un dépôt annoncé privé. Le masque n'existant que pour
une requête anonyme, une session ouverte suffit à rendre au 404 son sens
ordinaire, quoi que dise le capteur de visibilité.
