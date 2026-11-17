# DEC0015 | La voie de Slugger suit la machine

*English: [DEC0015-slugger-route-follows-the-machine-en.md](DEC0015-slugger-route-follows-the-machine-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-11-17 | Proposé | Propose de remplacer DEC0014 ; DEC0014 reste la décision en vigueur tant que celle-ci n'est pas acceptée |  |
| 2026-11-17 | Accepté |  |  |

## Contexte

DEC0014, accepté, nomme les sessions de revue de ce dépôt avec Slugger, lancé par l'outil .NET déclaré dans `dotnet-tools.json`, à défaut par une installation globale, à défaut par le binaire natif téléchargé et vérifié contre une empreinte SHA-256 figée, à défaut d'un GUID. Le choix était consigné dans `.claude/skills/review-pull-request/session-id.md`, et `session-id-setup.md` se trouvait à côté du skill pour le consigner ailleurs.

Le skill de revue livré par ce dépôt a été révisé pour relire les pull requests et merge requests de GitHub, GitLab et Azure DevOps. La révision porte le bloc natif de Slugger en ligne, avec la même version, le même asset et le même SHA-256 que DEC0014, et remplace le GUID par un tirage Python dans `code-review.json`, le thème de Slugger livré avec le skill. Elle interdit d'utiliser un binaire ou un manifeste d'outil trouvé dans le dépôt relu.

Un manifeste d'outil dans un dépôt fait partie de ce dépôt. Le skill est installé dans d'autres dépôts que celui-ci.

Mesuré le 2026-11-17 dans un conteneur Linux x64 avec le SDK .NET 10.0.115 :

- installer `Slugger` 1.2.0 par `dotnet tool install --tool-path`, depuis un répertoire temporaire et avec `https://api.nuget.org/v3/index.json` pour seule source, n'a contacté que `api.nuget.org` et a fonctionné ;
- `dotnet nuget verify` montre que le paquet porte la signature de dépôt de NuGet.org ;
- la configuration d'exécution de l'outil cible `net10.0` ;
- le bloc natif a fonctionné, et s'est terminé en erreur sans rien exécuter quand son SHA-256 était altéré ;
- le script Python a fonctionné et a tiré des noms.

DEC0014 a mesuré le téléchargement natif à 0,44 à 0,70 s pour 4,8 Mo, et la vérification de son SHA-256 à 9 ms. Le binaire natif n'existe que pour Linux x64.

## Décision

Les sessions de revue de ce dépôt sont nommées par le binaire natif de Slugger sur Linux x64, à défaut par son outil .NET installé dans un répertoire temporaire quand un SDK .NET 10 est présent, à défaut par un tirage Python dans le thème de Slugger livré avec le skill, et le dépôt n'enregistre aucun choix de nommage à côté du skill et ne déclare pas l'outil.

## Justification

La voie dépend de la machine, que le skill lit en une commande, et non de ce que contient le dépôt relu : rien de ce dépôt n'est exécuté, ce dont a besoin un skill installé dans d'autres dépôts.

Le binaire natif passe en premier sur la plateforme qui l'a parce que c'est la voie dont les octets sont vérifiés contre un SHA-256 figé ; DEC0014 a mesuré son coût à une demi-seconde par revue.

L'outil .NET couvre les machines que le binaire natif ne couvre pas, avec une version figée et la signature de NuGet.org. Lancé depuis un répertoire temporaire avec une source explicite, il ne lit aucune configuration NuGet ou SDK du dépôt relu.

Le tirage Python remplace le GUID parce qu'il lit le même vocabulaire que Slugger, si bien qu'une session garde un nom lisible, et qu'il ne demande aucun réseau.

Le skill ne questionne la personne que lorsqu'une voie adaptée à la machine a échoué : là, un nouvel essai peut changer le résultat. Quand aucune voie ne convient, il n'y a rien à réparer, donc il ne demande pas.

## Alternatives envisagées

### Alternative 1 — L'ordre de DEC0014, avec le tirage Python à la place du GUID

Proposée pendant l'échange. Écartée : elle exécute l'outil que déclare le dépôt relu, ou celui installé sur la machine, avant la voie dont les octets sont vérifiés.

### Alternative 2 — Le binaire natif seul

Le skill révisé tel que reçu. Écartée : sur une machine qui n'est pas Linux x64, chaque revue aboutirait à la question ou au tirage Python.

### Alternative 3 — Garder le GUID en dernier recours

La quatrième voie de DEC0014. Écartée : le tirage Python donne un nom lisible tiré du même vocabulaire, et un GUID n'a pas de mots à décrire.

## Conséquences

### Positives

- La voie est choisie par la machine et rien du dépôt relu n'est exécuté.
- Une machine qui n'est ni Linux x64 ni équipée de .NET nomme quand même ses sessions avec des mots.
- Une seule source des instructions : le skill, sans fichier d'installation pour consigner un choix.

### Négatives

- Une machine Linux x64 qui a .NET installé télécharge le binaire natif à chaque revue, ce que DEC0014 avait écarté.
- La voie .NET n'a pas d'empreinte figée : la confiance repose sur la signature de NuGet.org et la version figée.
- Les voies 1 et 2 sont des blocs bash ; une machine sans shell POSIX arrive au tirage Python.

### Risques

- Le tirage Python reproduit le mode `threeOrTwo` de Slugger tel que le skill le décrit ; il n'a pas été comparé à la sortie de Slugger lui-même.
- On n'a pas mesuré si `dotnet tool install` impose par défaut la vérification de signature des paquets.

### Actions de suivi

- Mettre à jour la version et le SHA-256 du bloc natif, et la version du bloc .NET, à chaque nouvelle version de Slugger adoptée.
- À l'acceptation de cet IDR, ajouter la ligne `Remplacé par DEC0015` au statut de DEC0014 et mettre à jour les deux index dans le même changement.
- `dotnet-tools.json`, `session-id.md` et `session-id-setup.md` sont retirés avec le changement qui propose cet IDR.
