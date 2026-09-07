# Fiche Microsoft Edge Add-ons — contenu (FR)

Brouillon des champs texte pour la soumission sur le **Partner Center**
Microsoft Edge Add-ons. Edge étant basé sur Chromium et acceptant le même
Manifest V3, ce document **réutilise tel quel** le contenu déjà validé de
[`store-listing-fr.md`](store-listing-fr.md) (Chrome Web Store) et ne
détaille que ce qui diffère réellement entre les deux formulaires de
soumission.

Voir aussi [`store-listing-edge-en.md`](store-listing-edge-en.md) pour la
version anglaise.

## Ce qui est strictement identique à la fiche Chrome Web Store

- **Paquet soumis** : la même archive Chromium que pour le Chrome Web
  Store (`conventional-comments-toolkit-<version>-chromium.zip`,
  `docs/release-fr.md`) — aucune variante de build n'est nécessaire pour
  Edge, contrairement à Firefox.
- **Description courte** (voir `store-listing-fr.md`) :
  > Assistant Conventional Comments pour la revue de code GitHub : labels, validation, aucun code ni commentaire ne sort du navigateur.
- **Description longue** : identique à celle de `store-listing-fr.md`.
- **Captures d'écran** : les cinq images de `assets/branding/ext-*.png`
  (1280×800) conviennent directement — Partner Center accepte le même
  format (1280×800 ou 640×400) et jusqu'à **10** images (contre 5 sur
  Chrome Web Store) ; il n'y a donc pas besoin d'en retirer, mais on
  pourrait en ajouter si de nouvelles captures sont produites plus tard.
- **Politique de confidentialité** : même URL,
  https://github.com/reefact/conventional-comments-toolkit/blob/main/PRIVACY.md
- **Icône de fiche** : `packages/extension/src/icons/icon-128.png`.

## Ce qui diffère du formulaire Chrome Web Store

- **Catégorie.** Partner Center utilise sa propre taxonomie ; l'entrée la
  plus proche est **Outils de productivité pour développeurs**
  (*Developer tools*), à confirmer dans la liste déroulante au moment de
  la soumission — elle peut avoir un libellé légèrement différent de
  celui de Chrome Web Store.
- **Limite de la description courte.** Non revérifiée dans ce document
  contre le formulaire actuel de Partner Center (l'équipe n'y a pas
  accès depuis cet environnement) — la description ci-dessus (131
  caractères) passe sous la limite Chrome Web Store, ce qui est un bon
  point de départ, mais **à confirmer contre la limite affichée par
  Partner Center avant de soumettre**, plutôt qu'à supposer identique.
- **Pas de formulaire de « justification des permissions » par
  permission**, contrairement à Chrome Web Store. Partner Center demande
  en revanche une déclaration plus généraliste sur les données
  collectées et l'usage prévu de l'extension. Le contenu de
  [`store-permissions-justification-fr.md`](store-permissions-justification-fr.md)
  reste la meilleure source pour répondre à ces questions (aucune
  collecte de contenu, télémétrie désactivée par défaut et triple
  verrouillée, aucun jeton stocké) — à reformuler dans le champ libre
  que propose le formulaire plutôt qu'à coller tel quel.
- **Champs de contact obligatoires.** Partner Center exige un **email de
  support** et, en option, un **site web**. Ni l'un ni l'autre n'est
  encore décidé dans ce dépôt (même lacune identifiée pour Chrome Web
  Store) — à trancher avant la soumission : adresse de contact dédiée,
  ou lien vers les issues GitHub du dépôt.
- **Compte développeur.** Un compte Partner Center distinct du compte
  développeur Chrome Web Store est nécessaire (identifiants Microsoft),
  sans frais d'inscription contrairement à Google (5$ à l'inscription
  côté Chrome Web Store).
- **Délai et nature de la revue.** La revue Edge peut inclure une analyse
  automatisée complémentaire à celle de Chrome ; aucune donnée sur le
  délai type n'est disponible ici — à observer lors de la première
  soumission « coquille » évoquée dans `docs/operations-fr.md` (« Revue
  des stores », qui recommande de l'amorcer tôt, indépendamment du
  store visé).

## Notes de version pour la première soumission

Identiques à celles de `store-listing-fr.md` :

> Première publication. Voir le journal des modifications sur le dépôt
> GitHub pour l'historique de développement.
