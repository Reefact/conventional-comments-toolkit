// Assemblage du composant B en un service auto-hébergeable : lit la configuration
// d'installation dans les variables d'environnement CCT_*, construit un jeu
// adaptateur + orchestrateur + planificateur + réconciliation + sonde §6.3.3 PAR
// plateforme configurée, et rend un serveur HTTP prêt à écouter. Une instance porte une
// ou plusieurs plateformes : le mono-plateforme n'est qu'une configuration où une seule
// est renseignée — un client qui préfère un processus par organisation lance simplement
// plusieurs conteneurs. `main.ts` est le point d'entrée exécutable ; ce module reste une
// fabrique pure, testable sans écouter de port.

import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { Floor } from '@cct/core';
import type { ServerPlatformAdapter, PlatformOperationalFacts } from './compliance/adapter.js';
import type { Storage } from './compliance/storage.js';
import { MemoryStorage, FileStorage } from './compliance/storage.js';
import { SqliteStorage } from './compliance/storage-sqlite.js';
import { ConfigCache } from './compliance/cache.js';
import { Orchestrator } from './compliance/orchestrator.js';
import { EvaluationScheduler, OrgModeWatch, Reconciler } from './compliance/scheduler.js';
import { AdminEntryPoint } from './compliance/admin.js';
import { createHttpServer } from './http.js';
import { GithubServerAdapter, githubFacts } from './adapters/github/index.js';
import { AzdoServerAdapter, azdoFacts } from './adapters/azdo/index.js';

export type Env = Record<string, string | undefined>;

export interface AssembledPlatform {
  id: string;
  adapter: ServerPlatformAdapter;
  facts: PlatformOperationalFacts;
  scheduler: EvaluationScheduler;
  reconciler: Reconciler;
  watch: OrgModeWatch;
  /** Dépôts réconciliés périodiquement (§6.4, source 2). */
  repos: { platform: string; host: string; scope: string[] }[];
}

export interface AssembledServer {
  server: Server;
  storage: Storage;
  cache: ConfigCache;
  platforms: AssembledPlatform[];
  /** Écoute, puis démarre réconciliations et sondes. Port 0 accepté (tests). */
  start(port: number): Promise<number>;
  stop(): Promise<void>;
}

export class BootstrapError extends Error {}

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new BootstrapError(`missing required environment variable ${name}`);
  }
  return value;
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Canal de plancher du composant B (§8.1.1) : un fichier JSON de la configuration
 * d'installation, RELU à chaque évaluation — modifier le plancher ne demande pas de
 * redémarrage. Validé une fois au démarrage : un fichier illisible fait échouer
 * l'assemblage plutôt que de laisser tourner un service qui croit n'avoir pas de
 * plancher. Une corruption en cours de route est signalée et traitée comme l'absence. */
async function makeFloorProvider(
  env: Env,
  log: (m: string) => void
): Promise<() => Promise<Floor | null>> {
  const path = env['CCT_FLOOR_FILE'];
  if (path === undefined || path === '') return async () => null;
  const parse = async (): Promise<Floor> => JSON.parse(await readFile(path, 'utf8')) as Floor;
  await parse().catch((e) => {
    throw new BootstrapError(`CCT_FLOOR_FILE (${path}) is not readable JSON: ${String(e)}`);
  });
  return async () => {
    try {
      return await parse();
    } catch (e) {
      log(`floor file ${path} became unreadable (${String(e)}): treated as absent until fixed`);
      return null;
    }
  };
}

async function makeStorage(env: Env): Promise<Storage> {
  const kind = env['CCT_STORAGE'] ?? 'file';
  switch (kind) {
    case 'memory':
      return new MemoryStorage();
    case 'file': {
      const storage = new FileStorage(env['CCT_STORAGE_PATH'] ?? 'data/storage.json');
      await storage.load();
      return storage;
    }
    case 'sqlite': {
      if (!(await SqliteStorage.available())) {
        throw new BootstrapError(
          'CCT_STORAGE=sqlite requires node:sqlite (Node >= 22.13); use CCT_STORAGE=file on this runtime'
        );
      }
      return SqliteStorage.open(env['CCT_STORAGE_PATH'] ?? 'data/storage.sqlite');
    }
    default:
      // Toute autre valeur : refus explicite — l'interface Storage est le point
      // d'extension pour une base externe, câblée par un main.ts sur mesure.
      throw new BootstrapError(`unknown CCT_STORAGE "${kind}" (expected memory, file or sqlite)`);
  }
}

export async function assembleFromEnv(
  env: Env,
  opts: { log?: (m: string) => void; fetchImpl?: typeof fetch } = {}
): Promise<AssembledServer> {
  const log = opts.log ?? (() => {});
  const adminToken = required(env, 'CCT_ADMIN_TOKEN');
  const storage = await makeStorage(env);
  const cache = new ConfigCache();
  const floorProvider = await makeFloorProvider(env, log);

  const platforms: AssembledPlatform[] = [];
  const admin = new Map<string, AdminEntryPoint>();

  const attach = (
    id: string,
    adapter: ServerPlatformAdapter,
    facts: PlatformOperationalFacts,
    repos: { platform: string; host: string; scope: string[] }[]
  ) => {
    const orchestrator = new Orchestrator({ adapter, storage, cache, floorProvider, facts, log });
    const scheduler = new EvaluationScheduler(storage, orchestrator, log);
    const reconciler = new Reconciler(repos, (r) => adapter.listOpenPrs(r), scheduler, storage, log);
    const watch = new OrgModeWatch(orchestrator, 60, log); // §6.3.3 — cadence de la borne §10
    admin.set(id, new AdminEntryPoint({ adapter, storage, floorProvider, facts }));
    platforms.push({ id, adapter, facts, scheduler, reconciler, watch, repos });
  };

  // ————— GitHub (annexe A) : configuré dès que l'une de ses variables est posée —————
  if (env['CCT_GITHUB_TOKEN'] !== undefined || env['CCT_GITHUB_WEBHOOK_SECRET'] !== undefined) {
    const token = required(env, 'CCT_GITHUB_TOKEN');
    const webhookSecret = required(env, 'CCT_GITHUB_WEBHOOK_SECRET');
    const host = env['CCT_GITHUB_HOST'] ?? 'github.com';
    const adapter = new GithubServerAdapter({
      token: async () => token,
      webhookSecret,
      ...(env['CCT_GITHUB_API_BASE'] !== undefined ? { apiBase: env['CCT_GITHUB_API_BASE'] } : {}),
      ...(opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {}),
    });
    const repos = splitList(env['CCT_GITHUB_REPOS']).map((full) => {
      const scope = full.split('/');
      if (scope.length !== 2) {
        throw new BootstrapError(`CCT_GITHUB_REPOS entry "${full}" is not of the form owner/repo`);
      }
      return { platform: 'github', host, scope };
    });
    attach('github', adapter, githubFacts, repos);
  }

  // ————— Azure DevOps (annexe B) —————
  if (env['CCT_AZDO_ORG_URL'] !== undefined || env['CCT_AZDO_TOKEN'] !== undefined) {
    const organizationUrl = required(env, 'CCT_AZDO_ORG_URL');
    const project = required(env, 'CCT_AZDO_PROJECT');
    const token = required(env, 'CCT_AZDO_TOKEN');
    const webhookSecret = required(env, 'CCT_AZDO_WEBHOOK_SECRET');
    const adapter = new AzdoServerAdapter({
      organizationUrl,
      project,
      token: async () => token,
      webhookSecret,
      ...(opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {}),
    });
    // Même dérivation hôte/portée que parseEvent : l'organisation vit dans le chemin sur
    // dev.azure.com, dans le sous-domaine sur *.visualstudio.com (§B.1).
    const orgUrl = new URL(organizationUrl);
    const orgPath = orgUrl.pathname.replace(/^\/|\/$/g, '');
    const repos = splitList(env['CCT_AZDO_REPOS']).map((repo) => ({
      platform: 'azdo',
      host: orgUrl.hostname,
      scope: [orgPath, project, repo].filter((s) => s !== ''),
    }));
    attach('azdo', adapter, azdoFacts, repos);
  }

  if (platforms.length === 0) {
    throw new BootstrapError(
      'no platform configured: set CCT_GITHUB_TOKEN/CCT_GITHUB_WEBHOOK_SECRET and/or CCT_AZDO_* variables'
    );
  }

  const server = createHttpServer({
    platforms: platforms.map((p) => ({ id: p.id, adapter: p.adapter, scheduler: p.scheduler })),
    admin,
    storage,
    cache,
    adminToken,
    log,
  });

  let started = false;
  return {
    server,
    storage,
    cache,
    platforms,
    async start(port: number): Promise<number> {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => resolve());
      });
      for (const p of platforms) {
        await p.reconciler.start(); // §6.4 source 2 — filet contre les événements perdus
        p.watch.start(); // §6.3.3 — l'assouplissement du mode observé en minutes
      }
      started = true;
      const address = server.address();
      return typeof address === 'object' && address !== null ? address.port : port;
    },
    async stop(): Promise<void> {
      if (started) {
        for (const p of platforms) {
          p.reconciler.stop();
          p.watch.stop();
          await p.scheduler.flush();
        }
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (storage instanceof SqliteStorage) storage.close();
    },
  };
}
