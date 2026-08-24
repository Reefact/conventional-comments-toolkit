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

> Assistant Conventional Comments pour la revue de code sur GitHub : labels, validation, rien ne quitte votre navigateur.

(119 caractères.)

## Description longue

> **Conventional Comments Toolkit** aide les équipes à écrire des
> commentaires de revue de code clairs et conformes à la convention
> [Conventional Comments](https://conventionalcomments.org/), directement
> dans l'éditeur natif de GitHub (github.com) — et, en option, Azure
> DevOps Services.
>
> **⚠️ Pas encore vrai du build actuel — voir la note en fin de fichier :**
> le support de GitHub Enterprise Server et d'Azure DevOps Server
> (auto-hébergé) est conçu mais pas câblé de bout en bout. Ne pas les
> lister à la soumission tant que ce n'est pas corrigé.
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
> Voir la [politique de confidentialité complète](../PRIVACY.md).
>
> **Pour les organisations**
> Un composant serveur optionnel (non requis pour utiliser l'extension)
> permet de faire respecter la convention comme condition de fusion des
> pull requests, avec un mécanisme d'exemption gouverné et traçable.
>
> Code source public sous licence Apache-2.0 :
> https://github.com/reefact/conventional-comments-toolkit

## Écart connu qui bloque la mention « Enterprise Server »

Vérifié dans le code (`content-internal.ts`, `bootstrap()`) : accorder la
permission d'hôte optionnelle sur un domaine GitHub Enterprise Server ou
Azure DevOps Server auto-hébergé injecte bien le script de contenu, mais
`bootstrap()` ne transmet jamais les `extraHosts` accordés à
`GithubClientAdapter` / `AzdoClientAdapter` : `matchesHost()` ne reconnaît
donc toujours que `github.com` / `dev.azure.com`, et aucune interface
n'apparaît sur ces domaines auto-hébergés. Corriger ce câblage (ou
restreindre la fiche à github.com + Azure DevOps Services) avant de
soumettre avec une mention self-hosted.

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
