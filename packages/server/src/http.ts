// Serveur HTTP du composant B : réception des webhooks/service hooks, point d'entrée
// d'administration (§6.2.4), page de statut servie derrière la `targetUrl` (§6.3.1),
// et réévaluation manuelle (§6.4, source 3). Node natif, aucune dépendance.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { PrRef, UserInfo } from '@cct/core';
import type { ServerPlatformAdapter } from './compliance/adapter.js';
import type { EvaluationScheduler } from './compliance/scheduler.js';
import type { AdminEntryPoint } from './compliance/admin.js';
import { AdminError } from './compliance/admin.js';
import type { Storage } from './compliance/storage.js';
import type { ConfigCache } from './compliance/cache.js';
import { computeIndicators } from './compliance/indicators.js';
import { prKey } from './compliance/keys.js';

export interface PlatformRegistration {
  id: string;
  adapter: ServerPlatformAdapter;
  scheduler: EvaluationScheduler;
}

export interface HttpDeps {
  platforms: PlatformRegistration[];
  admin: Map<string, AdminEntryPoint>; // par plateforme
  storage: Storage;
  cache: ConfigCache;
  /** Jeton d'accès au point d'entrée d'administration — l'accès est réservé aux personnes
   * habilitées à activer l'outil (§6.2.4) ; l'habilitation d'exemption est vérifiée en
   * plus, via isInGroup (les deux habilitations sont distinctes). */
  adminToken: string;
  log?: (m: string) => void;
}

export function createHttpServer(deps: HttpDeps): Server {
  const log = deps.log ?? (() => {});
  return createServer((req, res) => {
    void route(deps, req, res).catch((e) => {
      log(`http error: ${String(e)}`);
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
    });
  });
}

async function route(deps: HttpDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  // ————— Vitalité — pour l'orchestrateur d'infrastructure du client (liveness probe) ;
  // ne dit rien de la conformité, ne touche ni stockage ni plateforme —————
  if (req.method === 'GET' && path === '/healthz') {
    return send(res, 200, { ok: true });
  }

  // ————— Webhooks (§6.4, source 1) : matchesWebhook → verifySignature → parseEvent —————
  if (req.method === 'POST' && path.startsWith('/webhook/')) {
    const platformId = path.slice('/webhook/'.length);
    const registration = deps.platforms.find((p) => p.id === platformId);
    if (!registration) return send(res, 404, { error: 'unknown platform' });
    const raw = await readBody(req);
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return send(res, 400, { error: 'invalid JSON payload' });
    }
    const headers = flattenHeaders(req, raw);
    if (!registration.adapter.matchesWebhook(payload)) return send(res, 202, { ignored: true });
    // Sécurité d'ingestion (§6.4) : rejet des charges non signées.
    if (!registration.adapter.verifySignature(payload, headers)) {
      return send(res, 401, { error: 'invalid signature' });
    }
    let event;
    try {
      event = registration.adapter.parseEvent(payload);
    } catch {
      // Charge signée mais hors périmètre (ex. commentaire d'une issue simple, qui n'est
      // pas une PR) : ignorée, jamais une erreur serveur.
      return send(res, 202, { ignored: true });
    }
    // Seuls `pr` (et la séquence attribuée par B) sont consommés : l'évaluation relit
    // l'état courant, jamais le contenu de l'événement (§6.4, §9.2.1).
    void registration.scheduler.trigger(event.pr, 'webhook').catch(() => {});
    return send(res, 202, { accepted: true });
  }

  // ————— Page de statut (targetUrl, §6.3.1) — lisible sans authentification —————
  if (req.method === 'GET' && path.startsWith('/status/pr/')) {
    return statusPage(deps, path, res);
  }

  // ————— Administration (§6.2.4) —————
  if (path.startsWith('/admin/')) {
    const auth = req.headers.authorization ?? '';
    if (deps.adminToken === '' || auth !== `Bearer ${deps.adminToken}`) {
      return send(res, 401, { error: 'admin token required' });
    }
    const body = req.method === 'POST' ? parseJson(await readBody(req)) : {};
    try {
      return await adminRoute(deps, path, body, res);
    } catch (e) {
      if (e instanceof AdminError) return send(res, e.status, { error: e.message });
      throw e;
    }
  }

  send(res, 404, { error: 'not found' });
}

async function adminRoute(
  deps: HttpDeps,
  path: string,
  body: Record<string, unknown>,
  res: ServerResponse
): Promise<void> {
  const platformOf = (id: unknown) => {
    const admin = deps.admin.get(String(id));
    if (!admin) throw new AdminError(404, `unknown platform "${String(id)}"`);
    return admin;
  };

  switch (path) {
    case '/admin/dry-run': {
      // Rapport à blanc (§6.2.4, CA-34) : ne publie rien, n'écrit rien.
      const admin = platformOf(body['platform']);
      const report = await admin.dryRun(
        body['repo'] as { platform: string; host: string; scope: string[] },
        String(body['activatedAt'])
      );
      return send(res, 200, { report });
    }
    case '/admin/activated-at': {
      const admin = platformOf(body['platform']);
      await admin.setActivatedAt(body['repo'] as { platform: string; host: string; scope: string[] }, String(body['activatedAt']));
      return send(res, 200, { ok: true });
    }
    case '/admin/exemptions/grant': {
      const admin = platformOf(body['platform']);
      await admin.grantExemption(body['pr'] as PrRef, body['requester'] as UserInfo, body['reason'] as string | undefined);
      return send(res, 200, { granted: true });
    }
    case '/admin/exemptions/revoke': {
      const admin = platformOf(body['platform']);
      await admin.revokeExemption(body['pr'] as PrRef, body['requester'] as UserInfo, body['reason'] as string | undefined);
      return send(res, 200, { revoked: true });
    }
    case '/admin/reevaluate': {
      // Déclenchement manuel (§6.4, source 3).
      const registration = deps.platforms.find((p) => p.id === String(body['platform']));
      if (!registration) throw new AdminError(404, 'unknown platform');
      void registration.scheduler.trigger(body['pr'] as PrRef, 'manual').catch(() => {});
      return send(res, 202, { triggered: true });
    }
    case '/admin/cache/invalidate': {
      // §6.3.3 — un assouplissement du mode invalide immédiatement le cache : c'est
      // l'opération que la procédure de retour arrière appelle.
      deps.cache.invalidateAll();
      return send(res, 200, { invalidated: true });
    }
    case '/admin/exemption-log': {
      return send(res, 200, { entries: await deps.storage.readExemptionLog() });
    }
    default:
      if (path.startsWith('/admin/indicators/')) {
        const repoKeyParam = decodeURIComponent(path.slice('/admin/indicators/'.length));
        const samples = await deps.storage.readIndicatorSamples(repoKeyParam);
        return send(res, 200, { indicators: computeIndicators(samples), samples });
      }
      throw new AdminError(404, 'unknown admin route');
  }
}

/** Page portant la même sortie que le statut (§6.3.1) : la ligne machine cc/1, le
 * résumé humain et la sortie complète — sur toute plateforme sans corps de statut, un
 * check rouge serait sans elle un mur sans explication. */
async function statusPage(deps: HttpDeps, path: string, res: ServerResponse): Promise<void> {
  // /status/pr/{platform}/{...scope}/{number}
  const parts = path.slice('/status/pr/'.length).split('/').map(decodeURIComponent);
  if (parts.length < 3) return send(res, 404, { error: 'not found' });
  const platform = parts[0]!;
  const number = parts[parts.length - 1]!;
  const scope = parts.slice(1, -1);
  // L'URL ne porte pas l'hôte : l'index chemin → clé de PR, écrit à la publication,
  // fait la correspondance quelle que soit l'instance (github.com, GHES, Server…).
  const alias = `${platform}/${scope.join('/')}#${number}`;
  const key = await deps.storage.getPrPathAlias(alias);
  if (!key) return send(res, 404, { error: 'no published result for this PR' });
  const record = await deps.storage.getLastPublished(key);
  if (!record) return send(res, 404, { error: 'no published result for this PR' });
  return send(res, 200, {
    prKey: key,
    machineLine: record.machineLine ?? null,
    headline: record.headline ?? null,
    humanOutput: record.humanOutput ?? null,
    lastPublished: record,
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

function parseJson(raw: Buffer): Record<string, unknown> {
  try {
    return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function flattenHeaders(req: IncomingMessage, raw: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    out[k.toLowerCase()] = Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  }
  // Le corps brut est nécessaire à la vérification HMAC : transmis hors bande.
  out['x-raw-body'] = raw.toString('utf8');
  return out;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
