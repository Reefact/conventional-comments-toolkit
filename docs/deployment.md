# Déploiement du composant B — auto-hébergé, chez chaque client

Le composant B se déploie **chez le client**, sur son infrastructure : une instance par
organisation (ou par périmètre de dépôts qu'on lui confie), détenant ses propres jetons.
Il n'existe pas de service central. Une instance peut porter **plusieurs plateformes**
(GitHub et Azure DevOps) ; un client qui préfère un processus par organisation lance
simplement plusieurs instances — c'est une pure affaire de configuration.

Le service est un unique processus Node (≥ 20 ; ≥ 22.13 pour le stockage SQLite), sans
aucune dépendance tierce (§10). Il doit tourner **en continu** : la réconciliation
périodique (§6.4) et la sonde de retour arrière (§6.3.3) vivent dans le processus — un
hébergement « sans serveur » qui endort le processus ne convient pas.

## Démarrage rapide (Docker)

```sh
docker build -t cct-server .

docker run -d --name cct-server \
  -p 8080:8080 \
  -v cct-data:/data \
  -e CCT_ADMIN_TOKEN='un-secret-long' \
  -e CCT_GITHUB_TOKEN='ghp_…' \
  -e CCT_GITHUB_WEBHOOK_SECRET='un-autre-secret' \
  -e CCT_GITHUB_REPOS='mon-org/depot-un,mon-org/depot-deux' \
  cct-server
```

Sans Docker : `npm ci && npm run build`, puis `CCT_… npm run server`.

Le service expose `GET /healthz` (sonde de vitalité pour l'orchestrateur
d'infrastructure) ; l'image Docker embarque le `HEALTHCHECK` correspondant.

## Variables d'environnement

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `CCT_ADMIN_TOKEN` | oui | — | Jeton `Bearer` du point d'entrée d'administration (§6.2.4). |
| `CCT_PORT` | non | `8080` | Port d'écoute HTTP. |
| `CCT_STORAGE` | non | `file` | `memory` (essais), `file` (JSON atomique), `sqlite` (`node:sqlite`, Node ≥ 22.13). |
| `CCT_STORAGE_PATH` | non | `data/storage.json` | Chemin du stockage (`/data/…` dans l'image Docker). |
| `CCT_FLOOR_FILE` | non | — | Fichier JSON du **plancher** (§8.1.1, canal du composant B). Relu à chaque évaluation : le modifier ne demande pas de redémarrage. Illisible au démarrage = refus de démarrer. |
| `CCT_GITHUB_TOKEN` | si GitHub | — | Jeton d'API (GitHub App d'installation ou PAT) — portées : checks, contenu en lecture, étiquettes. |
| `CCT_GITHUB_WEBHOOK_SECRET` | si GitHub | — | Secret HMAC des webhooks (`X-Hub-Signature-256`). |
| `CCT_GITHUB_API_BASE` | non | `https://api.github.com` | `https://{ghes}/api/v3` pour GitHub Enterprise Server. |
| `CCT_GITHUB_HOST` | non | `github.com` | Hôte web (GHES), utilisé pour identifier les dépôts réconciliés. |
| `CCT_GITHUB_REPOS` | non | — | Dépôts réconciliés périodiquement, `owner/repo` séparés par des virgules. |
| `CCT_AZDO_ORG_URL` | si AzDO | — | `https://dev.azure.com/{organisation}` ou URL de collection Server. |
| `CCT_AZDO_PROJECT` | si AzDO | — | Projet Azure DevOps. |
| `CCT_AZDO_TOKEN` | si AzDO | — | PAT, portée `vso.code_write` (§B.6). |
| `CCT_AZDO_WEBHOOK_SECRET` | si AzDO | — | Secret attendu dans l'en-tête `Authorization` des service hooks. |
| `CCT_AZDO_REPOS` | non | — | Noms de dépôts réconciliés, séparés par des virgules. |

Configurer **au moins une** plateforme ; poser le jeton sans le secret de webhook (ou
l'inverse) est refusé au démarrage — jamais un service qui accepte des webhooks non
vérifiés.

## Brancher les plateformes

- **GitHub** : un webhook (dépôt ou organisation) vers
  `https://{votre-hote}/webhook/github`, content type `application/json`, secret =
  `CCT_GITHUB_WEBHOOK_SECRET`, événements : `pull_request`, `pull_request_review`,
  `pull_request_review_comment`, `issue_comment`, `pull_request_review_thread`.
- **Azure DevOps** : des service hooks vers `https://{votre-hote}/webhook/azdo`
  (commentaires de PR, PR créée/mise à jour), avec le secret dans l'en-tête
  `Authorization`. La réconciliation périodique reste **la seule voie de détection** des
  changements de statut de fil sur cette plateforme (§B.7) : en `enforce`, viser
  `server.reconcileIntervalSeconds` ≤ 60 dans la configuration (§8.2).

`CCT_GITHUB_REPOS` / `CCT_AZDO_REPOS` alimentent la réconciliation périodique — le filet
de sécurité contre les événements perdus (§6.4, source 2). Un dépôt absent de ces listes
est tout de même évalué à chaque webhook reçu ; il n'est simplement pas re-balayé entre
deux événements.

La suite (protection de branche, check obligatoire, trajectoire `assist → warn →
enforce`, retour arrière) : voir `docs/operations.md`.

## Stockage : de l'essai à la base réelle

L'interface `Storage` (`packages/server/src/compliance/storage.ts`, treize objets du
§6.4) est **le point d'extension**. Trois implémentations sont livrées et couvertes par
la même suite de conformité (`packages/server/test/storage-contract.test.ts`) :

| `CCT_STORAGE` | Implémentation | Pour quoi |
|---|---|---|
| `memory` | `MemoryStorage` | Essais et démonstrations — tout est perdu à l'arrêt. |
| `file` | `FileStorage` | Déploiement simple mono-processus — JSON à écriture atomique. |
| `sqlite` | `SqliteStorage` | Base réelle en un fichier, sans dépendance (`node:sqlite`). |

Pour une base externe (PostgreSQL, …) : implémenter `Storage`, copier la suite de
conformité comme test, et assembler le service avec un `main.ts` sur mesure —
`assembleFromEnv()` est exporté précisément pour être remplacé ou enveloppé. Dans tous
les cas, **une seule instance écrit dans un stockage donné** : le service suppose qu'il
est seul écrivain (séquences, épinglage « écrit une fois »).

Avec `file`/`sqlite` sous Docker, monter un volume sur `/data` — sans lui, l'état
(épinglages, exemptions, verdicts de première observation) disparaît à chaque
redémarrage du conteneur, ce qui viole leurs garanties « jamais réécrit » du §6.4.

## Sécurité

- L'image tourne **non-root**, n'écrit que dans `/data`, et ne contient aucun paquet
  tiers (§10 : auditable en entier).
- Mettre le service derrière HTTPS (reverse proxy ou terminaison TLS de la plateforme
  d'hébergement) : les webhooks transportent un secret, la page de statut est publique.
- `CCT_ADMIN_TOKEN` protège les routes `/admin/*` ; l'habilitation d'exemption est
  vérifiée **en plus**, via l'appartenance à `resolverOverrideGroup` (§6.2.4) — le jeton
  seul ne suffit pas à accorder une exemption.
