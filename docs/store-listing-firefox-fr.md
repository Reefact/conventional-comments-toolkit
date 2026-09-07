# Fiche Firefox Add-ons (AMO) — contenu (FR)

Brouillon des champs texte pour la soumission sur **addons.mozilla.org**
(AMO). Le formulaire AMO diffère plus nettement de celui de Chrome Web
Store que celui d'Edge — vocabulaire différent (« Summary » plutôt que
« Short description »), champs de licence et de collecte de données
propres à Mozilla, et un paquet Firefox distinct (event page,
`browser_specific_settings`). Ce document réutilise le contenu déjà
validé de [`store-listing-fr.md`](store-listing-fr.md) et détaille ce
qui est spécifique à AMO.

Voir aussi [`store-listing-firefox-en.md`](store-listing-firefox-en.md)
pour la version anglaise.

## Prérequis techniques — vérifiés avant la rédaction de cette fiche

- **Identifiant Gecko.** Celui déclaré dans `packages/extension/build.mjs`
  (`browser_specific_settings.gecko.id`) portait un domaine d'exemple
  (`@example.org`) — un placeholder qui n'a pas sa place dans une
  soumission réelle, même si Mozilla n'exige pas la possession du domaine
  utilisé dans l'identifiant. Corrigé : il pointe désormais vers
  `conventional-comments-toolkit@conventionalcomments.io`, le domaine
  réel du projet.
- **Déclaration de collecte de données dans le manifeste.** Depuis le 3
  novembre 2025, Mozilla exige que toute **nouvelle** extension soumise à
  AMO déclare ses pratiques de collecte directement dans
  `browser_specific_settings.gecko.data_collection_permissions` — un
  formulaire de soumission ne suffit plus (Extension Workshop, « Firefox
  built-in consent for data collection and transmission »). Corrigé :
  `build.mjs` déclare désormais `required: ["none"]` (rien n'est transmis
  par défaut) et `optional: ["technicalAndInteraction"]` pour la
  télémétrie du §10 — `technicalAndInteraction` est la seule catégorie
  que Mozilla autorise à déclarer en optionnelle plutôt qu'obligatoire,
  ce qui correspond exactement à une télémétrie désactivée par défaut et
  soumise à consentement.

Un `npm run build:extension` régénère
`packages/extension/dist-ext/firefox/manifest.json` avec ces deux
correctifs — c'est ce fichier, une fois zippé, qui se soumet à AMO.

## Ce qui est repris tel quel

- **Summary** (équivalent AMO de la description courte — limite de
  **250 caractères**, à confirmer contre le formulaire au moment de la
  soumission, plus large que les 132 caractères de Chrome Web Store) :
  > Assistant Conventional Comments pour la revue de code GitHub : labels, validation, aucun code ni commentaire ne sort du navigateur.

  (131 caractères — passe largement sous la limite AMO.)
- **Description longue** : identique à celle de `store-listing-fr.md`.
- **Captures d'écran** : les cinq images de `assets/branding/ext-*.png`
  (1280×800) conviennent — AMO n'impose pas de format strict pour les
  captures, contrairement à Chrome Web Store, mais recommande un format
  proche de 16:10 comme celui déjà produit.
- **Politique de confidentialité** : même URL que pour les autres
  stores, https://github.com/reefact/conventional-comments-toolkit/blob/main/PRIVACY.md
- **Licence** : Apache-2.0 — AMO demande explicitement de déclarer la
  licence du code source dans un champ dédié, contrairement à Chrome Web
  Store qui ne le demande pas.

## Ce qui est propre à AMO

- **Catégorie.** La taxonomie AMO est différente de celle de Chrome ; la
  catégorie la plus proche est **Développement web** (*Web Development*)
  — à confirmer dans la liste déroulante du formulaire.
- **Paquet soumis.** L'archive **Firefox**, pas l'archive Chromium :
  `conventional-comments-toolkit-<version>-firefox.zip`
  (`docs/release-fr.md`), qui embarque
  `browser_specific_settings.gecko` plutôt qu'un `service_worker`.
- **Déclaration de collecte de données.** AMO demande de cocher, dans un
  formulaire structuré (pas un champ libre comme la « Permission
  justification » de Chrome Web Store), les catégories de données
  traitées. D'après
  [`store-permissions-justification-fr.md`](store-permissions-justification-fr.md) :
  aucune donnée personnelle ni contenu de navigation n'est collecté par
  défaut ; seule la télémétrie optionnelle, désactivée par défaut et
  soumise à un triple verrou (politique d'entreprise **et** consentement
  explicite), transmet des compteurs agrégés non nominatifs (labels
  utilisés, codes de diagnostic) — jamais de texte de commentaire, de
  code ou de diff. Cocher les catégories AMO correspondantes en
  conséquence (probablement : aucune case à cocher pour les catégories
  de données personnelles listées par Mozilla, la télémétrie optionnelle
  n'étant ni activée par défaut ni liée à une identité).
- **Code source à téléverser, pas seulement à référencer.** Contrairement
  à Chrome Web Store, AMO **exige** le code source quand le bundle
  soumis est produit par un outil qui le rend difficile à relire —
  minification, ou bundler comme `esbuild` (celui utilisé ici, voir
  `packages/extension/build.mjs`) ou webpack (Extension Workshop,
  « Source code submission »). Une URL de dépôt public **ne suffit
  pas** : il faut téléverser, à **chaque version**, une archive du code
  source correspondant accompagnée d'un `README` qui donne la marche à
  suivre pour reproduire le bundle à l'identique — environnement
  (OS, version des outils), commandes d'installation des dépendances,
  commande de build, et le lockfile (`package-lock.json`, déjà présent
  à la racine du dépôt) pour figer les versions exactes. Le dépôt étant
  public sous Apache-2.0, préparer cette archive revient à zipper le
  dépôt à l'état du tag concerné plutôt qu'à écrire quoi que ce soit de
  nouveau — mais l'archive doit être jointe à la soumission, l'URL du
  dépôt seule ne remplace pas ce téléversement.
- **Champs de contact.** AMO demande une **adresse de support** et,
  optionnellement, une **page d'accueil** (« Homepage »). Ni l'une ni
  l'autre ne sont encore décidées dans ce dépôt (même lacune que pour
  Chrome Web Store et Edge) — à trancher avant la soumission.
- **Compte développeur.** Un compte Mozilla (gratuit, pas de frais
  d'inscription contrairement à Chrome Web Store) est nécessaire, séparé
  des comptes Google/Microsoft utilisés pour les deux autres stores.
- **Délai de revue.** AMO annonce une revue automatisée quasi immédiate
  pour la mise en ligne initiale (« listed » mais non « recommended »),
  suivie d'une revue manuelle a posteriori qui peut suspendre l'extension
  si elle échoue — contrairement à Chrome Web Store et Edge où la revue
  précède la publication. À vérifier contre la documentation AMO au
  moment de la soumission plutôt qu'à supposer, ce point n'ayant pas été
  mesuré ici.

## Notes de version pour la première soumission

Identiques à celles de `store-listing-fr.md` :

> Première publication. Voir le journal des modifications sur le dépôt
> GitHub pour l'historique de développement.
