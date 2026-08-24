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
> **⚠️ Une limite reste vraie du build actuel — voir la note en fin de
> fichier :** quand une organisation référence un fichier de
> configuration hébergé sur un domaine distinct de la plateforme
> (`configUrl`), sa lecture échoue encore. La reconnaissance de
> l'interface elle-même sur un domaine auto-hébergé, en revanche, est
> corrigée et testée.
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

## Écart restant, plus étroit : `configUrl` sur un domaine tiers

`getRepoConfig()`/`getOrgConfig()` des deux adaptateurs appellent
`fetch` directement depuis le script de contenu, soumis au CORS de la
page hôte. Cela ne bloque pas la lecture du fichier `.conventional-comments.json`
du dépôt affiché (même origine que la page) : seule la lecture d'un
`configUrl` d'organisation hébergé sur un **domaine distinct** de la
plateforme échoue encore. Le message `cct-fetch-config`, que
`background.ts` sait déjà traiter pour ce cas, n'est envoyé par aucun
adaptateur.

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

**Si le bandeau « Configuration non lue » apparaît sur la capture**, ce
n'est **pas** parce que le dépôt n'a pas de `.conventional-comments.json`.
`ClientConfigResolver` ne passe en état dégradé (§5.4) que lorsqu'une
lecture rend `unreachable` ; un fichier **absent** rend `absent`, avec
`degraded: false`, et n'affiche aucun bandeau — conformément au §10
(« un fichier simplement absent est un cas nominal, pas une
dégradation »). Le bandeau signale donc un `fetch` réellement en échec
sur `https://{hôte}/{owner}/{repo}/raw/HEAD/.conventional-comments.json`
(erreur réseau, ou statut HTTP autre que 404) : c'est cette requête qu'il
faut inspecter dans l'onglet réseau, et **ajouter un fichier de
configuration ne le fera pas disparaître**.
