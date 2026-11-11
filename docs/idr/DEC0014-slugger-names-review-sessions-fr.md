# DEC0014 | Slugger pour nommer les sessions de revue

*English: [DEC0014-slugger-names-review-sessions-en.md](DEC0014-slugger-names-review-sessions-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-11-11 | Accepté | Reprise de la décision consignée dans la PR #188 et ses fils de revue, le 2026-11-11 |  |

## Contexte

Le skill de revue marque chaque commentaire d'un identifiant de session, tiré par une source aléatoire. Ce dépôt a choisi de les nommer avec Slugger, enregistré dans `.claude/skills/review-pull-request/session-id.md`, et `dotnet-tools.json` déclare l'outil .NET `slugger.cli`.

Les agents qui relisent ce dépôt hors de Claude Code ne lisaient pas ce choix, et leur environnement n'a pas le SDK .NET. Depuis `cli-v1.1.0`, Slugger publie un binaire natif `slugger-linux-x64`, attesté par son workflow de release.

Mesuré : télécharger ce binaire prend 0,44 à 0,70 s pour 4,8 Mo, et vérifier son SHA-256 prend 9 ms. Un relecteur a d'abord demandé de faire passer le binaire natif avant l'outil installé, avec un cache versionné ; il n'a pas pu mesurer qu'une tâche d'agent retrouve le cache d'une précédente, et a retiré ces deux demandes.

NuGet garde les paquets restaurés dans son propre cache. Le binaire natif n'existe que pour Linux x64.

## Décision

Les sessions de revue de ce dépôt sont nommées par Slugger, lancé par l'outil .NET déclaré, à défaut par une installation globale, à défaut par le binaire natif téléchargé et vérifié contre une empreinte SHA-256 figée, et à défaut d'un GUID tiré par une commande.

## Justification

Un outil installé et en cache ne demande aucun téléchargement ; le faire passer après le binaire natif imposerait, sans cache, un téléchargement et un accès à GitHub à chaque revue. Le manifeste est le choix explicite du dépôt, et l'outil .NET tourne sur toutes les plateformes, quand le binaire natif ne couvre que Linux x64.

Le binaire natif est le chemin des machines sans .NET, les conteneurs d'agents. L'empreinte figée dans le texte du skill garantit qu'un fichier remplacé n'est jamais exécuté, et la commande est enchaînée pour qu'un téléchargement ou une vérification échoués l'arrêtent dans tout shell.

Un cache ne ferait gagner qu'une demi-seconde, et seulement si le conteneur survit d'une revue à l'autre, ce qui n'est pas mesuré ; il ajouterait des étapes de shell et des états d'échec propres.

## Alternatives envisagées

### Alternative 1 — Le binaire natif en premier, même avec .NET

Proposé en revue. Écarté : sans cache, il impose un téléchargement à chaque revue là où un outil installé tourne déjà.

### Alternative 2 — Un cache versionné du binaire natif

Proposé en revue. Écarté : aucun gain mesuré dans un conteneur d'agent, et une logique de shell plus longue.

### Alternative 3 — Un GUID

L'option de repli du skill. Écarté comme choix du dépôt : Slugger donne des noms lisibles.

## Conséquences

### Positives

- Un agent sans .NET nomme ses sessions avec Slugger.
- Un binaire remplacé n'est jamais exécuté.

### Négatives

- Une machine sans .NET télécharge le binaire à chaque revue.

### Risques

- Aucun relevé au moment de la décision.

### Actions de suivi

- Mettre à jour la version et l'empreinte du binaire à chaque nouvelle release de Slugger retenue.
- Passer le manifeste de `slugger.cli` 1.0.0 à 1.1.0 relève d'une décision de version séparée.
