// Serveur HTTP du composant B : réception des webhooks/service hooks, point d'entrée
// d'administration (§6.2.4), page de statut servie derrière la `targetUrl` (§6.3.1),
// et réévaluation manuelle (§6.4, source 3). Node natif, aucune dépendance.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
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

const WEBHOOK_BODY_LIMIT = 5 * 1024 * 1024; // 5 Mio — GitHub borne ses livraisons à 25 Mo

class BodyTooLargeError extends Error {}

/** Livraisons déjà vues (protection contre le rejeu, §6.4) : TTL glissant, taille
 * bornée. En mémoire : un redémarrage rouvre la fenêtre, mais une évaluation rejouée
 * relit l'état courant et republie l'identique (porte 14.d) — le rejeu ne peut altérer
 * aucun verdict, la protection vise le coût, pas l'intégrité. */
class ReplayCache {
  #seen = new Map<string, number>();
  constructor(
    private readonly ttlMs = 15 * 60 * 1000,
    private readonly maxEntries = 10_000
  ) {}
  seen(id: string): boolean {
    const now = Date.now();
    const at = this.#seen.get(id);
    if (at !== undefined && now - at < this.ttlMs) return true;
    this.#seen.set(id, now);
    if (this.#seen.size > this.maxEntries) {
      for (const [k, v] of this.#seen) {
        if (this.#seen.size <= this.maxEntries && now - v < this.ttlMs) break;
        this.#seen.delete(k);
      }
    }
    return false;
  }
}

function hashBody(raw: Buffer): string {
  return createHash('sha256').update(raw).digest('hex');
}

type RouteDeps = HttpDeps & { seenDeliveries: ReplayCache };

export function createHttpServer(deps: HttpDeps): Server {
  const log = deps.log ?? (() => {});
  const routeDeps: RouteDeps = { ...deps, seenDeliveries: new ReplayCache() };
  return createServer((req, res) => {
    void route(routeDeps, req, res).catch((e) => {
      log(`http error: ${String(e)}`);
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
    });
  });
}

async function route(deps: RouteDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
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
    // Le corps DOIT être lu avant la vérification (HMAC sur le corps brut), mais jamais
    // sans borne : cette route est la seule à lire un corps non authentifié, et une
    // charge arbitraire ferait tuer le processus par l'OOM killer. GitHub borne ses
    // livraisons à 25 Mo ; la limite couvre large.
    let raw: Buffer;
    try {
      raw = await readBody(req, WEBHOOK_BODY_LIMIT);
    } catch (e) {
      if (e instanceof BodyTooLargeError) return send(res, 413, { error: 'payload too large' });
      throw e;
    }
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
    // Sécurité d'ingestion (§6.4) : protection contre le REJEU — une livraison déjà vue
    // (identifiant de livraison quand la plateforme en émet un, empreinte du corps
    // sinon) est acquittée sans déclencher d'évaluation. Rejouer une charge signée
    // capturée ne coûte alors plus rien au service.
    const deliveryId = headers['x-github-delivery'] || hashBody(raw);
    if (deps.seenDeliveries.seen(`${platformId}:${deliveryId}`)) {
      return send(res, 202, { ignored: true, reason: 'replay' });
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
    // Comparaison à temps constant — la même exigence que pour la signature de webhook :
    // c'est la seule barrière devant l'octroi d'exemption et le journal nominatif.
    const presented = Buffer.from(auth);
    const expected = Buffer.from(`Bearer ${deps.adminToken}`);
    const authorized =
      deps.adminToken !== '' &&
      presented.length === expected.length &&
      timingSafeEqual(presented, expected);
    if (!authorized) {
      return send(res, 401, { error: 'admin token required' });
    }
    const body = req.method === 'POST' ? parseJson(await readBody(req, WEBHOOK_BODY_LIMIT)) : {};
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
  // Une PAGE lisible, pas un document JSON : sur une plateforme sans corps de statut
  // (Azure DevOps, §B.7), cette page est la SEULE explication d'un check rouge — un
  // littéral JSON aux sauts de ligne échappés n'explique rien. Le JSON reste servi sur
  // demande (Accept: application/json), pour l'outillage.
  const wantsJson = (String(res.req?.headers.accept ?? '')).includes('application/json');
  if (wantsJson) {
    return send(res, 200, {
      prKey: key,
      machineLine: record.machineLine ?? null,
      headline: record.headline ?? null,
      humanOutput: record.humanOutput ?? null,
      lastPublished: record,
    });
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>conventional-comments — ${esc(alias)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:52em;margin:2em auto;padding:0 1em}
h1{font-size:1.2em}code,pre{background:#f4f4f4;padding:.15em .3em;border-radius:3px}
pre{padding:.8em;overflow-x:auto;white-space:pre-wrap}
.state-failure{color:#b3261e}.state-success{color:#1e7f37}.state-neutral{color:#555}</style></head>
<body>
<h1>conventional-comments — <code>${esc(alias)}</code></h1>
<p class="state-${esc(record.state)}"><strong>${esc(record.headline ?? record.state)}</strong></p>
<pre>${esc(record.humanOutput ?? '')}</pre>
<p><small><code>${esc(record.machineLine ?? '')}</code><br>published ${esc(record.at)} — head <code>${esc(record.headSha)}</code></small></p>
</body></html>`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
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

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        reject(new BodyTooLargeError(`body exceeds ${limit} bytes`));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
