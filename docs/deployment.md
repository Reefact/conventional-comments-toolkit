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

Toute configuration invalide ou incomplète **refuse de démarrer** avec un message qui
nomme la variable fautive — une plateforme à moitié configurée, un port vide, un
stockage inaccessible en écriture ou un plancher mal formé ne donnent jamais un service
qui tourne à moitié.

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

Le service expose `GET /healthz` (sonde de vitalité) ; l'image embarque le
`HEALTHCHECK` correspondant, aligné sur `CCT_PORT`.

**Persistance.** L'image déclare `VOLUME /data`. Précisions d'exploitation :

- **Volume nommé** (`-v cct-data:/data`, recommandé) : l'état appartient au volume et
  survit à tout, y compris la recréation du conteneur lors d'une montée de version.
- **Bind mount** (`-v /srv/cct:/data`) : le répertoire hôte doit être inscriptible par
  l'utilisateur du conteneur, dont l'UID est **figé à 10001** — `chown -R 10001 /srv/cct`
  avant le premier démarrage. Sans cela le service **refuse de démarrer** (sonde
  d'écriture au boot), il ne tourne jamais sans persister.
- **Sans `-v`** : Docker crée un volume **anonyme** par conteneur — l'état survit aux
  redémarrages du conteneur mais est perdu (et laissé orphelin) à sa recréation,
  c'est-à-dire à chaque mise à jour d'image. À réserver aux essais.

## Variables d'environnement

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `CCT_ADMIN_TOKEN` | oui | — | Jeton `Bearer` du point d'entrée d'administration (§6.2.4). |
| `CCT_PORT` | non | `8080` | Port d'écoute (1-65535 ; toute autre valeur refuse de démarrer). |
| `CCT_STORAGE` | non | `file` | `memory` (essais), `file` (JSON atomique), `sqlite` (`node:sqlite`, Node ≥ 22.13). |
| `CCT_DATA_DIR` | non | `data` (`/data` dans l'image) | Répertoire des stockages `file`/`sqlite`. |
| `CCT_STORAGE_PATH` | non | `{CCT_DATA_DIR}/storage.json` ou `.sqlite` selon `CCT_STORAGE` | Chemin exact, si le défaut ne convient pas. |
| `CCT_EXEMPTION_LOG_RETENTION_MONTHS` | non | `12` | Conservation du journal nominatif d'exemptions (§10) ; `0` = illimitée, sur décision explicite. |
| `CCT_FLOOR_FILE` | non | — | Fichier JSON du **plancher** (§8.1.1, canal du composant B). Relu à chaque évaluation ; forme validée au démarrage (illisible = refus) ; corrompu en cours de route = le dernier contenu valide continue de s'appliquer. |
| `CCT_GITHUB_TOKEN` | si GitHub | — | Jeton d'API — voir « Portées » ci-dessous. |
| `CCT_GITHUB_WEBHOOK_SECRET` | si GitHub | — | Secret HMAC des webhooks (`X-Hub-Signature-256`). |
| `CCT_GITHUB_API_BASE` | non | `https://api.github.com` | `https://{ghes}/api/v3` pour GitHub Enterprise Server. |
| `CCT_GITHUB_HOST` | non | **dérivé de `CCT_GITHUB_API_BASE`** | Surcharge rare. L'identité des PR (clés de stockage, §6.4) dérive de l'hôte d'API — webhooks et réconciliation produisent la même ; ne poser cette variable que si l'hôte web diffère d'une manière que la dérivation (`api.` retiré, `/api/v3` ignoré) ne couvre pas. |
| `CCT_GITHUB_REPOS` | non | — | Dépôts réconciliés périodiquement, `owner/repo` séparés par des virgules. |
| `CCT_AZDO_ORG_URL` | si AzDO | — | `https://dev.azure.com/{organisation}` ou URL de collection Server. |
| `CCT_AZDO_PROJECT` | si AzDO | — | Projet Azure DevOps. |
| `CCT_AZDO_TOKEN` | si AzDO | — | PAT — voir « Portées » ci-dessous. |
| `CCT_AZDO_WEBHOOK_SECRET` | si AzDO | — | Secret des service hooks (mot de passe Basic — voir ci-dessous). |
| `CCT_AZDO_REPOS` | non | — | Noms de dépôts réconciliés (nom seul, sans organisation ni projet). |

Configurer **au moins une** plateforme. Poser n'importe quelle variable `CCT_GITHUB_*`
(resp. `CCT_AZDO_*`) arme la plateforme et exige alors toutes ses variables
obligatoires — un secret sans jeton, un jeton sans secret, un `CCT_AZDO_REPOS` orphelin
sont refusés au démarrage.

## Portées des jetons

- **GitHub** (GitHub App recommandée, PAT possible) : *Checks* écriture (publier le
  check), *Contents* lecture (fichier de configuration), *Pull requests* lecture
  (fils, commentaires, revues), *Issues* écriture (étiquette `cc-override`), et
  **Members / Organization lecture** (`read:org` en PAT) — sans cette dernière,
  `resolverOverrideGroup` est illisible et les exemptions basculent en indisponibilité.
- **Azure DevOps** (PAT) : *Code* lecture-écriture (`vso.code_write` — étiquettes,
  fichier, fils), **Code (status)** (`vso.code_status` — publier le PR Status, la seule
  sortie visible du composant B sur cette plateforme), et **Identity (read)**
  (`vso.identity` — appartenance à `resolverOverrideGroup` ; sur Azure DevOps Services
  cette API est servie par `vssps.dev.azure.com`, ce que le service gère seul).

## Brancher les plateformes

- **GitHub** : un webhook (dépôt ou organisation) vers
  `https://{votre-hote}/webhook/github`, content type `application/json`, secret =
  `CCT_GITHUB_WEBHOOK_SECRET`, événements : `pull_request`, `pull_request_review`,
  `pull_request_review_comment`, `issue_comment`, `pull_request_review_thread`.
- **Azure DevOps** : des service hooks vers `https://{votre-hote}/webhook/azdo`
  (commentaires de PR, PR créée/mise à jour). Dans l'écran du service hook, renseigner
  le champ **« Basic authentication password »** avec `CCT_AZDO_WEBHOOK_SECRET` — le
  nom d'utilisateur est libre, seul le mot de passe est vérifié. La réconciliation
  périodique reste **la seule voie de détection** des changements de statut de fil sur
  cette plateforme (§B.7) : en `enforce`, viser `server.reconcileIntervalSeconds` ≤ 60
  dans la configuration (§8.2).

L'ingestion applique le §6.4 : signature vérifiée, charges non signées rejetées,
**rejeu** d'une livraison déjà vue acquitté sans réévaluation, corps borné à 5 Mio.

`CCT_GITHUB_REPOS` / `CCT_AZDO_REPOS` alimentent la réconciliation périodique — le filet
de sécurité contre les événements perdus (§6.4, source 2), avec un **premier balayage
immédiat au démarrage** (c'est le moment où les événements manqués attendent d'être
rattrapés). Un dépôt absent de ces listes est tout de même évalué à chaque webhook reçu.

**Le plancher a DEUX canaux (§8.1.1).** `CCT_FLOOR_FILE` n'est que le canal du
composant B. Le même document doit être poussé côté navigateur par la politique
d'entreprise (`chrome.storage.managed`, nœud `3rdparty` — schéma :
`packages/extension/src/managed-schema.json`), sans quoi l'extension et le serveur
résolvent des configurations différentes et l'empreinte publiée (§8.1.3, règle 2)
désarme le blocage d'envoi côté extension.

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

`file` et `sqlite` utilisent des **chemins par défaut distincts** (`storage.json` /
`storage.sqlite` sous `CCT_DATA_DIR`) : basculer de l'un à l'autre sur le même volume ne
fait jamais lire un JSON comme une base SQLite. Un fichier d'état corrompu ou illisible
**refuse de démarrer** — repartir d'un état vide écraserait épinglages, exemptions et
verdicts « jamais réécrits » du §6.4.

Pour une base externe (PostgreSQL, …) : implémenter `Storage`, copier la suite de
conformité comme test, et assembler le service avec un `main.ts` sur mesure —
`assembleFromEnv()` est exporté précisément pour être remplacé ou enveloppé. Dans tous
les cas, **une seule instance écrit dans un stockage donné** : le service suppose qu'il
est seul écrivain (séquences, épinglage « écrit une fois »).

## Sécurité

- L'image tourne **non-root (UID 10001)**, n'écrit que dans `/data`, et ne contient
  aucun paquet tiers (§10 : auditable en entier).
- Mettre le service derrière HTTPS (reverse proxy ou terminaison TLS de la plateforme
  d'hébergement) : les webhooks transportent un secret, la page de statut est publique.
- `CCT_ADMIN_TOKEN` protège les routes `/admin/*` (comparaison à temps constant) ;
  l'habilitation d'exemption est vérifiée **en plus**, via l'appartenance du demandeur à
  `resolverOverrideGroup` (§6.2.4). **Limite à connaître** : l'identité du demandeur
  (`requester`) est déclarée par l'appelant — le service vérifie qu'elle appartient au
  groupe habilité, mais ne peut pas prouver que l'appelant EST cette personne. Le jeton
  d'administration doit donc être traité comme un secret d'infrastructure, remis aux
  seules personnes de confiance, ou le point d'entrée placé derrière une authentification
  d'infrastructure (reverse proxy SSO) qui impose l'identité. Chaque octroi, refus et
  révocation est journalisé nominativement (§10).
- L'arrêt (`SIGTERM`) draine les évaluations en vol avant de fermer le stockage ; un
  second signal force la sortie immédiate.
