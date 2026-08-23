// Assemblage du composant B en un service auto-hébergeable : lit la configuration
// d'installation dans les variables d'environnement CCT_*, construit un jeu
// adaptateur + orchestrateur + planificateur + réconciliation + sonde §6.3.3 PAR
// plateforme configurée, et rend un serveur HTTP prêt à écouter. Une instance porte une
// ou plusieurs plateformes : le mono-plateforme n'est qu'une configuration où une seule
// est renseignée — un client qui préfère un processus par organisation lance simplement
// plusieurs conteneurs. `main.ts` est le point d'entrée exécutable ; ce module reste une
// fabrique pure, testable sans écouter de port.
//
// Règle d'or : toute configuration invalide, incomplète ou inutilisable REFUSE de
// démarrer avec un message qui nomme la variable — jamais un service qui tourne à
// moitié, ignore une plateforme en silence ou publie sans persister.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { Floor, Mode } from '@cct/core';
import type { ServerPlatformAdapter, PlatformOperationalFacts } from './compliance/adapter.js';
import type { Storage } from './compliance/storage.js';
import { MemoryStorage, FileStorage } from './compliance/storage.js';
import { SqliteStorage } from './compliance/storage-sqlite.js';
import { ConfigCache } from './compliance/cache.js';
import { Orchestrator } from './compliance/orchestrator.js';
import { EvaluationScheduler, OrgModeWatch, Reconciler } from './compliance/scheduler.js';
import { AdminEntryPoint } from './compliance/admin.js';
import { createHttpServer } from './http.js';
import { GithubServerAdapter, githubFacts, webHostFromApiBase } from './adapters/github/index.js';
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
  /** Canal de plancher du composant B (§8.1.1) — exposé pour les tests. */
  floorProvider: () => Promise<Floor | null>;
  /** Écoute, puis démarre réconciliations et sondes. Port 0 accepté (tests). */
  start(port: number): Promise<number>;
  stop(): Promise<void>;
}

export class BootstrapError extends Error {}

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new BootstrapError(`missing required environment variable ${name}`);
  }
  return value;
}

/** Vrai si l'une des variables est posée — MÊME vide : une variable déclarée arme la
 * plateforme, et ses champs obligatoires sont alors tous exigés. Une plateforme à
 * moitié configurée ne doit jamais disparaître en silence. */
function anySet(env: Env, names: string[]): boolean {
  return names.some((n) => env[n] !== undefined);
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Port d'écoute : `CCT_PORT` vide, non numérique, nul ou hors bornes est REFUSÉ —
 * `Number('') === 0` ferait sinon écouter sur un port éphémère aléatoire pendant que le
 * HEALTHCHECK et le mapping documentés pointent sur 8080. */
export function resolvePort(env: Env): number {
  const raw = env['CCT_PORT'];
  if (raw === undefined) return 8080;
  const port = Number(raw.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BootstrapError(`CCT_PORT "${raw}" is not a valid port (expected 1-65535)`);
  }
  return port;
}

const MODES: readonly Mode[] = ['off', 'assist', 'warn', 'enforce'];

/** Validation de forme du plancher : le canal du composant B porte les garanties
 * d'entreprise du §8.1.1 — accepter `null`, un tableau ou un `minimumMode` inconnu
 * effacerait le plancher sans un mot. */
function validateFloorShape(raw: unknown, path: string): Floor {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BootstrapError(`CCT_FLOOR_FILE (${path}) must contain a JSON object`);
  }
  const f = raw as Record<string, unknown>;
  if (f['minimumMode'] !== undefined && !MODES.includes(f['minimumMode'] as Mode)) {
    throw new BootstrapError(
      `CCT_FLOOR_FILE (${path}): unknown minimumMode "${String(f['minimumMode'])}" (expected ${MODES.join(', ')})`
    );
  }
  if (f['floorVersion'] !== undefined && typeof f['floorVersion'] !== 'number') {
    throw new BootstrapError(`CCT_FLOOR_FILE (${path}): floorVersion must be a number`);
  }
  if (
    f['configUrl'] !== undefined &&
    f['configUrl'] !== null &&
    typeof f['configUrl'] !== 'string'
  ) {
    throw new BootstrapError(`CCT_FLOOR_FILE (${path}): configUrl must be a string or null`);
  }
  return raw as Floor;
}

/** Canal de plancher du composant B (§8.1.1) : un fichier JSON de la configuration
 * d'installation, RELU à chaque évaluation — modifier le plancher ne demande pas de
 * redémarrage. Validé au démarrage (illisible ou mal formé = refus de démarrer) ; une
 * corruption EN COURS DE ROUTE est signalée et le DERNIER contenu valide continue de
 * s'appliquer — jamais un plancher qui s'efface sur une écriture partielle. */
async function makeFloorProvider(
  env: Env,
  log: (m: string) => void
): Promise<() => Promise<Floor | null>> {
  const path = env['CCT_FLOOR_FILE'];
  if (path === undefined || path.trim() === '') return async () => null;
  const parse = async (): Promise<Floor> =>
    validateFloorShape(JSON.parse(await readFile(path, 'utf8')), path);
  let lastGood: Floor;
  try {
    lastGood = await parse();
  } catch (e) {
    if (e instanceof BootstrapError) throw e;
    throw new BootstrapError(`CCT_FLOOR_FILE (${path}) is not readable JSON: ${String(e)}`);
  }
  return async () => {
    try {
      lastGood = await parse();
    } catch (e) {
      log(`floor file ${path} became unreadable (${String(e)}): last valid floor still applies`);
    }
    return lastGood;
  };
}

async function makeStorage(env: Env): Promise<Storage> {
  const kind = env['CCT_STORAGE'] ?? 'file';
  const dataDir = env['CCT_DATA_DIR']?.trim() || 'data';
  const explicitPath = env['CCT_STORAGE_PATH'];
  if (explicitPath !== undefined && explicitPath.trim() === '') {
    throw new BootstrapError('CCT_STORAGE_PATH is set but empty');
  }
  switch (kind) {
    case 'memory':
      return new MemoryStorage();
    case 'file': {
      const storage = new FileStorage(explicitPath ?? join(dataDir, 'storage.json'));
      // Illisible ou corrompu = refus de démarrer ; puis sonde d'ÉCRITURE — un volume
      // monté en root:root ferait sinon tourner un service qui publie sans persister.
      await storage.load();
      await storage.verifyWritable();
      return storage;
    }
    case 'sqlite': {
      if (!(await SqliteStorage.available())) {
        throw new BootstrapError(
          'CCT_STORAGE=sqlite requires node:sqlite (Node >= 22.13); use CCT_STORAGE=file on this runtime'
        );
      }
      return SqliteStorage.open(explicitPath ?? join(dataDir, 'storage.sqlite'));
    }
    default:
      // Toute autre valeur : refus explicite — l'interface Storage est le point
      // d'extension pour une base externe, câblée par un main.ts sur mesure.
      throw new BootstrapError(`unknown CCT_STORAGE "${kind}" (expected memory, file or sqlite)`);
  }
}

/** Rétention du journal d'exemptions (§10) : nominatif par nature, conservé 12 mois par
 * défaut (configurable, 0 = illimité sur décision explicite). La purge s'applique au
 * démarrage puis avant chaque écriture au journal. */
function withExemptionLogRetention(storage: Storage, months: number): Storage {
  if (months <= 0) return storage;
  const cutoff = (): string => {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString();
  };
  return new Proxy(storage, {
    get(target, prop, receiver) {
      if (prop === 'appendExemptionLog') {
        return async (entry: Parameters<Storage['appendExemptionLog']>[0]) => {
          await target.purgeExemptionLog(cutoff());
          await target.appendExemptionLog(entry);
        };
      }
      const value = Reflect.get(target, prop, receiver) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

export async function assembleFromEnv(
  env: Env,
  opts: { log?: (m: string) => void; fetchImpl?: typeof fetch } = {}
): Promise<AssembledServer> {
  const log = opts.log ?? (() => {});
  const adminToken = required(env, 'CCT_ADMIN_TOKEN');
  const retentionRaw = env['CCT_EXEMPTION_LOG_RETENTION_MONTHS'];
  const retentionMonths = retentionRaw === undefined ? 12 : Number(retentionRaw.trim());
  if (!Number.isInteger(retentionMonths) || retentionMonths < 0) {
    throw new BootstrapError(
      `CCT_EXEMPTION_LOG_RETENTION_MONTHS "${String(retentionRaw)}" must be a non-negative integer (0 = keep forever)`
    );
  }
  const rawStorage = await makeStorage(env);
  const storage = withExemptionLogRetention(rawStorage, retentionMonths);
  if (retentionMonths > 0) {
    const d = new Date();
    d.setMonth(d.getMonth() - retentionMonths);
    await rawStorage.purgeExemptionLog(d.toISOString());
  }
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

  // ————— GitHub (annexe A) : la présence de N'IMPORTE quelle variable CCT_GITHUB_*
  // arme la plateforme et exige alors jeton ET secret de webhook —————
  const GITHUB_VARS = [
    'CCT_GITHUB_TOKEN',
    'CCT_GITHUB_WEBHOOK_SECRET',
    'CCT_GITHUB_API_BASE',
    'CCT_GITHUB_HOST',
    'CCT_GITHUB_REPOS',
  ];
  if (anySet(env, GITHUB_VARS)) {
    const token = required(env, 'CCT_GITHUB_TOKEN');
    const webhookSecret = required(env, 'CCT_GITHUB_WEBHOOK_SECRET');
    const apiBase = env['CCT_GITHUB_API_BASE'] ?? 'https://api.github.com';
    let derivedHost: string;
    try {
      derivedHost = webHostFromApiBase(apiBase);
    } catch (e) {
      throw new BootstrapError(`CCT_GITHUB_API_BASE "${apiBase}" is not a valid URL: ${String(e)}`);
    }
    // UNE seule identité d'hôte pour la même PR : les clés du stockage §6.4 dérivent de
    // l'hôte, et un webhook qui produirait `ghe.corp` pendant que la réconciliation
    // produit `github.com` scinderait séquences, épinglages et verdicts en deux. L'hôte
    // dérive donc d'apiBase — la même dérivation que parseEvent — et une surcharge
    // explicite est passée à L'ADAPTATEUR AUSSI, jamais aux seuls dépôts réconciliés.
    const host = env['CCT_GITHUB_HOST']?.trim() || derivedHost;
    const adapter = new GithubServerAdapter({
      token: async () => token,
      webhookSecret,
      apiBase,
      webHost: host,
      ...(opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {}),
    });
    const repos = splitList(env['CCT_GITHUB_REPOS']).map((full) => {
      const scope = full.split('/');
      if (scope.length !== 2 || scope.some((s) => s === '')) {
        throw new BootstrapError(`CCT_GITHUB_REPOS entry "${full}" is not of the form owner/repo`);
      }
      return { platform: 'github', host, scope };
    });
    attach('github', adapter, githubFacts, repos);
  }

  // ————— Azure DevOps (annexe B) : même règle d'armement —————
  const AZDO_VARS = [
    'CCT_AZDO_ORG_URL',
    'CCT_AZDO_PROJECT',
    'CCT_AZDO_TOKEN',
    'CCT_AZDO_WEBHOOK_SECRET',
    'CCT_AZDO_REPOS',
  ];
  if (anySet(env, AZDO_VARS)) {
    const organizationUrl = required(env, 'CCT_AZDO_ORG_URL');
    const project = required(env, 'CCT_AZDO_PROJECT');
    const token = required(env, 'CCT_AZDO_TOKEN');
    const webhookSecret = required(env, 'CCT_AZDO_WEBHOOK_SECRET');
    let orgUrl: URL;
    try {
      orgUrl = new URL(organizationUrl);
    } catch {
      throw new BootstrapError(
        `CCT_AZDO_ORG_URL "${organizationUrl}" is not a valid URL (expected https://dev.azure.com/{organization})`
      );
    }
    const adapter = new AzdoServerAdapter({
      organizationUrl,
      project,
      token: async () => token,
      webhookSecret,
      ...(opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {}),
    });
    // Même dérivation hôte/portée que parseEvent : l'organisation vit dans le chemin sur
    // dev.azure.com, dans le sous-domaine sur *.visualstudio.com (§B.1).
    const orgPath = orgUrl.pathname.replace(/^\/|\/$/g, '');
    const repos = splitList(env['CCT_AZDO_REPOS']).map((repo) => {
      if (repo.includes('/')) {
        throw new BootstrapError(
          `CCT_AZDO_REPOS entry "${repo}" must be a repository name only (organization and project come from CCT_AZDO_ORG_URL and CCT_AZDO_PROJECT)`
        );
      }
      return {
        platform: 'azdo',
        host: orgUrl.hostname,
        scope: [orgPath, project, repo].filter((s) => s !== ''),
      };
    });
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

  return {
    server,
    storage,
    cache,
    platforms,
    floorProvider,
    async start(port: number): Promise<number> {
      await new Promise<void>((resolve, reject) => {
        const onError = (e: Error): void => reject(e);
        server.once('error', onError);
        server.listen(port, () => {
          // Le listener d'échec de listen() ne doit pas rester en embuscade : il
          // avalerait la première erreur du serveur en régime nominal.
          server.removeListener('error', onError);
          server.on('error', (e) => log(`http server error: ${String(e)}`));
          resolve();
        });
      });
      for (const p of platforms) {
        await p.reconciler.start(); // §6.4 source 2 — balayage immédiat puis périodique
        p.watch.start(); // §6.3.3 — l'assouplissement du mode observé en minutes
      }
      const address = server.address();
      return typeof address === 'object' && address !== null ? address.port : port;
    },
    async stop(): Promise<void> {
      // Ordre : (1) ne plus rien accepter, (2) éteindre les horloges, (3) vider les
      // évaluations EN VOL — fenêtres en attente comprises —, (4) attendre les requêtes
      // HTTP en cours avec un délai de garde, (5) fermer le stockage EN DERNIER.
      // Le démontage est inconditionnel : après un start() partiellement échoué, les
      // plateformes déjà démarrées doivent être éteintes aussi.
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      for (const p of platforms) {
        p.reconciler.stop();
        p.watch.stop();
      }
      for (const p of platforms) {
        await p.scheduler.flush();
      }
      const graceMs = 10_000;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([closed, new Promise((r) => (graceTimer = setTimeout(r, graceMs)))]);
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      server.closeAllConnections(); // les traînards au-delà du délai de garde
      await closed;
      if (rawStorage instanceof SqliteStorage) rawStorage.close();
    },
  };
}
