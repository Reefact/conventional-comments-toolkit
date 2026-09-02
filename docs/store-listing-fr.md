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

> Assistant Conventional Comments pour vos revues de code sur GitHub (et Azure DevOps) : labels, validation, aucune donnée qui sort du navigateur.

(144 caractères — **dépasse la limite de 132**, à raccourcir avant
soumission. Variante conforme :)

> Assistant Conventional Comments pour la revue de code GitHub : labels, validation, aucun code ni commentaire ne sort du navigateur.

(131 caractères.)

**Correction (Codex, deuxième passage) :** l'ancienne formulation « rien
ne quitte votre navigateur » était fausse sans nuance — `language` et
`directShortcuts` se synchronisent via `chrome.storage.sync` quand la
synchronisation Chrome est active. Restreint à la garantie sur le
contenu, qui elle tient sans condition.

## Description longue

> **Conventional Comments Toolkit** aide les équipes à écrire des
> commentaires de revue de code clairs et conformes à la convention
> [Conventional Comments](https://conventionalcomments.org/), directement
> dans l'éditeur natif de GitHub (github.com, GitHub Enterprise Server,
> GitHub Enterprise Cloud) — et, en option, Azure DevOps (Services et
> Server auto-hébergé).
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
> hors GitHub (Azure DevOps, configuration d'entreprise) ne sont demandés
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

Ces captures nécessitent une session GitHub réelle et ne peuvent pas être
générées automatiquement ici. Les scénarios à couvrir, dans l'ordre de
priorité pour la fiche store :

1. Barre d'outils Conventional Comments affichée au-dessus d'un éditeur
   de commentaire de revue GitHub, sur une pull request réelle.
2. Un label inséré (ex. `suggestion:`) avec le retour visuel de
   validation (état conforme, en vert/succès).
3. Un commentaire non conforme avec le retour visuel d'erreur.
4. La page de réglages (`options.html`) montrant la sélection de langue
   et l'activation d'un domaine Azure DevOps optionnel.
5. (Optionnel) Vue d'ensemble d'un fil de discussion résolu, si le
   contraste avant/après aide à comprendre la valeur du produit.

Format recommandé par Chrome Web Store : 1280×800 ou 640×400, PNG ou JPEG,
jusqu'à 5 captures.

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
la vérité : l'extension n'a pas pu lire. (GitHub masquant volontiers le
privé en « inexistant », un 404 y est reclassé en lecture impossible dès
que la page indique un dépôt privé ; sans quoi l'extension conclurait
« pas de configuration ».)
