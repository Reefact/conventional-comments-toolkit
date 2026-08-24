# Justification des permissions — soumission Chrome Web Store

Ce document est le brouillon à copier/coller dans le formulaire de soumission
du Chrome Web Store (section *Permission justification* de la fiche de
l'extension). Il couvre les permissions déclarées dans
`packages/extension/src/manifest.json` et s'appuie sur les garanties du
§10 de `specifications-fr.md` ("Sécurité", "Confidentialité").

À tenir à jour si `manifest.json` change ; sinon la revue Google et ce
document divergent silencieusement.

## Single purpose (description de la finalité unique)

> Conventional Comments Toolkit aide les personnes qui font des revues de
> code sur GitHub (et, en option, Azure DevOps) à rédiger des commentaires
> conformes à la convention Conventional Comments : barre d'outils
> d'insertion des labels, validation du format à la saisie, retour visuel
> dans l'éditeur de commentaire natif de la plateforme. L'extension
> n'effectue aucune autre fonction.

## Permissions déclarées

### `storage`

**Usage :** conserver les réglages de l'utilisateur (langue, dépôts
autorisés, configuration de plancher reçue par politique d'entreprise) et
le résultat en cache de la lecture de `.conventional-comments.json`, en
local, dans `chrome.storage`.

**Justification :** ces réglages doivent survivre à la fermeture de
l'onglet et du navigateur ; c'est la seule permission qui le permet en
MV3. Aucune donnée n'est envoyée à un service distant via cette
permission — le stockage reste local à l'appareil (§10, "Confidentialité").

### `scripting`

**Usage :** injecter la barre d'outils Conventional Comments et le script
de validation dans l'éditeur de commentaire natif de la page (GitHub, ou
Azure DevOps si l'hôte a été autorisé).

**Justification :** c'est le mécanisme MV3 standard pour ajouter une
interface dans une page existante sans en réécrire le DOM par un
`content_script` statique trop large ; il est utilisé uniquement sur les
pages qui correspondent aux hôtes déjà autorisés (`host_permissions` /
`optional_host_permissions` ci-dessous), jamais de façon globale.

### `activeTab`

**Usage :** obtenir, sur clic explicite de l'utilisateur sur l'action de
l'extension (icône de la barre d'outils), un accès temporaire à l'onglet
actif pour les diagnostics et réglages contextuels de la page ouverte.

**Justification :** évite de demander un accès permanent à tous les
onglets pour une action que l'utilisateur déclenche lui-même ; c'est la
permission la plus restrictive disponible pour ce besoin.

### `host_permissions`: `https://github.com/*`

**Usage :** lire et modifier le DOM des pages GitHub pour y injecter la
barre d'outils, valider les commentaires en cours de rédaction et lire
l'état des fils de discussion affiché par la page.

**Justification :** GitHub est la plateforme cible principale de
l'extension (§1 de la spécification fonctionnelle) ; la permission est
statique parce que l'usage est systématique dès l'installation, sans
étape de consentement supplémentaire à chaque session.

### `optional_host_permissions`: `https://*/*`

**Usage :** cette permission n'est **jamais active par défaut**. Elle est
demandée à l'exécution, domaine par domaine et avec confirmation explicite
de l'utilisateur, dans deux cas précis :

1. l'organisation utilise Azure DevOps (`dev.azure.com`,
   `*.visualstudio.com`, ou un domaine Azure DevOps Server auto-hébergé) ;
2. l'organisation référence un fichier de configuration
   (`configUrl`, §8.1.3 de la spécification) hébergé sur un domaine
   interne distinct des domaines de plateforme ci-dessus.

**Justification :** l'univers des domaines Azure DevOps Server
auto-hébergés et des domaines internes d'entreprise n'est pas énumérable
à l'avance — c'est le cas d'usage documenté d'`optional_host_permissions`
dans la documentation Chrome pour une extension qui doit rester utilisable
en environnement d'entreprise sans publier une version par domaine
d'organisation. Sans cette permission optionnelle, l'extension serait
soit inutilisable sur Azure DevOps auto-hébergé, soit contrainte de
demander `<all_urls>` en permission statique — un scope strictement plus
large que celui demandé ici. L'utilisateur reste maître de l'octroi :
aucun domaine n'est activé sans son geste explicite dans les options de
l'extension.

## Ce que l'extension ne fait pas (à rappeler en cas de question du reviewer)

- Aucun contenu de commentaire, de code ou de diff ne quitte le
  navigateur (§10, "Confidentialité").
- Aucune télémétrie par défaut ; si activée, elle est opt-in et limitée à
  des compteurs agrégés, jamais de texte libre.
- Aucun jeton d'authentification (PAT) ni secret n'est stocké par
  l'extension ; elle ne s'authentifie à aucune API à jeton — elle lit
  uniquement le DOM des pages déjà chargées par la session de
  l'utilisateur.
- Aucun code distant : `content_security_policy` interdit tout script qui
  ne soit pas empaqueté dans l'extension, aucune dépendance CDN.
- Code source public et auditable (dépôt Apache-2.0).
