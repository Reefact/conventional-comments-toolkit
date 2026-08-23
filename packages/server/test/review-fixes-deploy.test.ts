// Non-régression des constats confirmés par la revue adversariale du chantier
// « B déployable » (assemblage, stockage, ingestion, arrêt).

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig, type PrRef } from '@cct/core';
import { assembleFromEnv, resolvePort, BootstrapError } from '../src/bootstrap.js';
import { EvaluationScheduler } from '../src/compliance/scheduler.js';
import { MemoryStorage, FileStorage } from '../src/compliance/storage.js';
import { AdminEntryPoint, AdminError } from '../src/compliance/admin.js';
import { GithubServerAdapter } from '../src/adapters/github/index.js';
import { AzdoServerAdapter } from '../src/adapters/azdo/index.js';
import type { Orchestrator } from '../src/compliance/orchestrator.js';
import { FakeAdapter, fakeState } from './fake-adapter.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cct-deploy-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const BASE_ENV = {
  CCT_ADMIN_TOKEN: 'secret-admin',
  CCT_STORAGE: 'memory',
  CCT_GITHUB_TOKEN: 'ghp_x',
  CCT_GITHUB_WEBHOOK_SECRET: 'wh',
};

function recordingFetch(handler?: (url: string) => Response | undefined) {
  const urls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    return handler?.(url) ?? new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { urls, impl };
}

describe('GHES — une PR n’a qu’UNE identité d’hôte (§6.4)', () => {
  it('l’hôte des dépôts réconciliés dérive de CCT_GITHUB_API_BASE, comme parseEvent', async () => {
    const a = await assembleFromEnv({
      ...BASE_ENV,
      CCT_GITHUB_API_BASE: 'https://ghe.interne.example/api/v3',
      CCT_GITHUB_REPOS: 'acme/demo',
    });
    expect(a.platforms[0]!.repos[0]!.host).toBe('ghe.interne.example');
    const event = (a.platforms[0]!.adapter as GithubServerAdapter).parseEvent({
      repository: { name: 'demo', owner: { login: 'acme' } },
      pull_request: { number: 7, created_at: '2026-10-01T00:00:00Z' },
      sender: { id: 1, login: 'alice' },
    });
    // La clé de stockage (platform:host:scope#number) est identique des deux côtés.
    expect(event.pr.host).toBe(a.platforms[0]!.repos[0]!.host);
  });

  it('CCT_GITHUB_HOST explicite s’applique aux DEUX côtés, jamais à un seul', async () => {
    const a = await assembleFromEnv({
      ...BASE_ENV,
      CCT_GITHUB_API_BASE: 'https://ghe.interne.example/api/v3',
      CCT_GITHUB_HOST: 'web.ghe.example',
      CCT_GITHUB_REPOS: 'acme/demo',
    });
    const event = (a.platforms[0]!.adapter as GithubServerAdapter).parseEvent({
      repository: { name: 'demo', owner: { login: 'acme' } },
      pull_request: { number: 7, created_at: '2026-10-01T00:00:00Z' },
      sender: { id: 1, login: 'alice' },
    });
    expect(a.platforms[0]!.repos[0]!.host).toBe('web.ghe.example');
    expect(event.pr.host).toBe('web.ghe.example');
  });
});

describe('assemblage — une plateforme à moitié configurée est REFUSÉE, jamais ignorée', () => {
  it('CCT_AZDO_WEBHOOK_SECRET seul (« l’inverse » documenté) : erreur nommant la variable manquante', async () => {
    await expect(
      assembleFromEnv({ ...BASE_ENV, CCT_AZDO_WEBHOOK_SECRET: 's' })
    ).rejects.toThrow(/CCT_AZDO_ORG_URL/);
  });

  it('CCT_GITHUB_REPOS seul : erreur, la plateforme ne disparaît pas en silence', async () => {
    await expect(
      assembleFromEnv({ CCT_ADMIN_TOKEN: 'a', CCT_STORAGE: 'memory', CCT_GITHUB_REPOS: 'acme/demo' })
    ).rejects.toThrow(/CCT_GITHUB_TOKEN/);
  });

  it('CCT_AZDO_ORG_URL sans schéma : BootstrapError qui nomme la variable', async () => {
    await expect(
      assembleFromEnv({
        CCT_ADMIN_TOKEN: 'a',
        CCT_STORAGE: 'memory',
        CCT_AZDO_ORG_URL: 'dev.azure.com/acme',
        CCT_AZDO_PROJECT: 'p',
        CCT_AZDO_TOKEN: 't',
        CCT_AZDO_WEBHOOK_SECRET: 's',
      })
    ).rejects.toThrow(/CCT_AZDO_ORG_URL/);
  });

  it('CCT_AZDO_REPOS avec un chemin : refusé (le nom seul est attendu)', async () => {
    await expect(
      assembleFromEnv({
        CCT_ADMIN_TOKEN: 'a',
        CCT_STORAGE: 'memory',
        CCT_AZDO_ORG_URL: 'https://dev.azure.com/acme',
        CCT_AZDO_PROJECT: 'p',
        CCT_AZDO_TOKEN: 't',
        CCT_AZDO_WEBHOOK_SECRET: 's',
        CCT_AZDO_REPOS: 'acme/p/repo',
      })
    ).rejects.toThrow(/name only/);
  });
});

describe('CCT_PORT — jamais un port éphémère silencieux', () => {
  it('vide, blanc, zéro, non numérique : refusés ; absent → 8080 ; valide → valeur', () => {
    expect(resolvePort({})).toBe(8080);
    expect(resolvePort({ CCT_PORT: '9090' })).toBe(9090);
    for (const bad of ['', '   ', '0', 'huit-mille', '70000', '-1']) {
      expect(() => resolvePort({ CCT_PORT: bad })).toThrow(BootstrapError);
    }
  });
});

describe('plancher (§8.1.1) — validé au démarrage, jamais effacé par une corruption', () => {
  it('null, tableau, minimumMode inconnu : refus de démarrer', async () => {
    for (const content of ['null', '[]', '{"minimumMode":"tres-strict"}', '{"floorVersion":"un"}']) {
      const path = join(dir, `floor-${Buffer.from(content).toString('hex').slice(0, 8)}.json`);
      await writeFile(path, content, 'utf8');
      await expect(assembleFromEnv({ ...BASE_ENV, CCT_FLOOR_FILE: path })).rejects.toThrow(
        BootstrapError
      );
    }
  });

  it('relu frais à chaque appel ; corrompu en route → le DERNIER contenu valide s’applique', async () => {
    const path = join(dir, 'floor-live.json');
    await writeFile(path, JSON.stringify({ minimumMode: 'warn' }), 'utf8');
    const a = await assembleFromEnv({ ...BASE_ENV, CCT_FLOOR_FILE: path });
    expect((await a.floorProvider())?.minimumMode).toBe('warn');

    await writeFile(path, JSON.stringify({ minimumMode: 'enforce' }), 'utf8');
    expect((await a.floorProvider())?.minimumMode).toBe('enforce'); // relecture fraîche

    await writeFile(path, '{corrompu', 'utf8');
    expect((await a.floorProvider())?.minimumMode).toBe('enforce'); // jamais effacé
  });
});

describe('stockage — un état illisible ou inaccessible REFUSE de démarrer', () => {
  it('CCT_STORAGE_PATH vide : refus', async () => {
    await expect(
      assembleFromEnv({ ...BASE_ENV, CCT_STORAGE: 'file', CCT_STORAGE_PATH: '  ' })
    ).rejects.toThrow(/CCT_STORAGE_PATH/);
  });

  it('fichier d’état corrompu : refus — jamais un état vide qui écraserait le vrai fichier', async () => {
    const path = join(dir, 'state-corrupt.json');
    await writeFile(path, '{tronqué', 'utf8');
    await expect(
      assembleFromEnv({ ...BASE_ENV, CCT_STORAGE: 'file', CCT_STORAGE_PATH: path })
    ).rejects.toThrow(/invalid JSON/);
  });
});

describe('start()/stop() — le câblage réel, pas seulement le port', () => {
  const PR: PrRef = {
    platform: 'github',
    createdAt: '2026-10-01T00:00:00Z',
    host: 'github.com',
    scope: ['acme', 'demo'],
    number: 42,
  };

  it('start() déclenche le balayage de réconciliation IMMÉDIATEMENT (§6.4 source 2)', async () => {
    const { urls, impl } = recordingFetch();
    const a = await assembleFromEnv(
      { ...BASE_ENV, CCT_GITHUB_REPOS: 'acme/demo' },
      { fetchImpl: impl }
    );
    await a.start(0);
    await new Promise((r) => setTimeout(r, 80));
    expect(urls.some((u) => u.includes('/repos/acme/demo/pulls?state=open'))).toBe(true);
    await a.stop();
  });

  it('flush() attend les évaluations EN VOL — pas seulement les fenêtres en attente', async () => {
    const storage = new MemoryStorage();
    const cfg = defaultConfig();
    cfg.server.coalesceWindowSeconds = 0; // la fenêtre expire immédiatement
    await storage.setLastEffectiveConfig('github:github.com:acme/demo', cfg);
    let completed = 0;
    const orchestrator = {
      evaluatePr: async () => {
        await new Promise((r) => setTimeout(r, 120));
        completed++;
        return { result: null, published: false };
      },
    } as unknown as Orchestrator;
    const scheduler = new EvaluationScheduler(storage, orchestrator);
    void scheduler.trigger(PR, 'webhook').catch(() => {});
    await new Promise((r) => setTimeout(r, 30)); // la fenêtre a expiré : évaluation EN VOL
    await scheduler.flush();
    expect(completed).toBe(1); // flush n'a rendu la main qu'après la fin de l'évaluation
  });

  it('le rejeu d’une livraison signée est acquitté sans réévaluation (§6.4) et un corps démesuré est refusé', async () => {
    // fetch factice : le webhook déclenche une évaluation réelle, qui ne doit jamais
    // sortir sur le réseau dans un test.
    const { impl } = recordingFetch(
      () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const a = await assembleFromEnv(BASE_ENV, { fetchImpl: impl });
    const port = await a.start(0);
    const raw = JSON.stringify({
      repository: { name: 'demo', owner: { login: 'acme' } },
      pull_request: { number: 42, created_at: '2026-10-01T00:00:00Z' },
      sender: { id: 1, login: 'alice' },
    });
    const signature = `sha256=${createHmac('sha256', 'wh').update(raw).digest('hex')}`;
    const post = () =>
      fetch(`http://127.0.0.1:${port}/webhook/github`, {
        method: 'POST',
        headers: {
          'x-hub-signature-256': signature,
          'x-github-delivery': 'delivery-1',
          'content-type': 'application/json',
        },
        body: raw,
      });
    const first = (await (await post()).json()) as { accepted?: boolean };
    expect(first.accepted).toBe(true);
    const second = (await (await post()).json()) as { ignored?: boolean; reason?: string };
    expect(second.reason).toBe('replay');

    const big = await fetch(`http://127.0.0.1:${port}/webhook/github`, {
      method: 'POST',
      body: Buffer.alloc(6 * 1024 * 1024, 0x61),
    }).catch(() => null); // le serveur détruit la connexion : un échec réseau est admis
    if (big !== null) expect(big.status).toBe(413);
    await a.stop();
  });
});

describe('Azure DevOps — vérification du secret et API d’identités', () => {
  const opts = {
    organizationUrl: 'https://dev.azure.com/acme',
    project: 'proj',
    token: async () => 't',
    webhookSecret: 'top-secret',
  };

  it('le nom d’utilisateur Basic est LIBRE — seul le mot de passe est vérifié (à longueur de secret constante)', () => {
    const adapter = new AzdoServerAdapter(opts);
    const basic = (user: string, pass: string) =>
      `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    expect(adapter.verifySignature({}, { authorization: basic('cc', 'top-secret') })).toBe(true);
    expect(adapter.verifySignature({}, { authorization: basic('', 'top-secret') })).toBe(true);
    expect(adapter.verifySignature({}, { authorization: basic('robert', 'top-secret') })).toBe(true);
    expect(adapter.verifySignature({}, { authorization: basic('cc', 'mauvais') })).toBe(false);
    expect(adapter.verifySignature({}, { authorization: '' })).toBe(false);
    expect(adapter.verifySignature({}, {})).toBe(false);
  });

  it('sur Azure DevOps Services, l’API d’identités est interrogée sur vssps.dev.azure.com', async () => {
    const { urls, impl } = recordingFetch(
      () => new Response('{"value":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const adapter = new AzdoServerAdapter({ ...opts, fetchImpl: impl });
    await adapter.isInGroup({ id: 'u1', login: 'a', isServiceAccount: false }, '[acme]\\Leads');
    expect(urls[0]).toMatch(/^https:\/\/vssps\.dev\.azure\.com\/acme\/_apis\/identities/);
  });

  it('sur un Server on-premise, elle reste sur l’hôte de la collection', async () => {
    const { urls, impl } = recordingFetch(
      () => new Response('{"value":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const adapter = new AzdoServerAdapter({
      ...opts,
      organizationUrl: 'https://tfs.corp.example/tfs/DefaultCollection',
      fetchImpl: impl,
    });
    await adapter.isInGroup({ id: 'u1', login: 'a', isServiceAccount: false }, '[acme]\\Leads');
    expect(urls[0]).toMatch(/^https:\/\/tfs\.corp\.example\/tfs\/DefaultCollection\/_apis\/identities/);
  });
});

describe('administration — une panne des groupes est une indisponibilité, jamais un refus', () => {
  it('isInGroup en panne → 503, pas « non habilité » (même règle que §6.4 côté évaluation)', async () => {
    const adapter = new FakeAdapter(
      fakeState({
        repoConfig: {
          status: 'found',
          text: JSON.stringify({ mode: 'enforce', resolverOverrideGroup: ['acme/leads'] }),
        },
      })
    );
    adapter.isInGroup = async () => {
      throw new Error('groups API down');
    };
    const admin = new AdminEntryPoint({
      adapter,
      storage: new MemoryStorage(),
      floorProvider: async () => null,
      facts: { threadStatusEmitsPrUpdated: false, labelProvenanceExposed: false, requiresStatusTargetUrl: true },
    });
    const pr: PrRef = { platform: 'azdo', createdAt: '', host: 'dev.azure.com', scope: ['a', 'p', 'r'], number: 1 };
    const requester = { id: 'u1', login: 'lead', isServiceAccount: false };
    await expect(admin.grantExemption(pr, requester)).rejects.toMatchObject({ status: 503 });
  });
});

describe('journal d’exemptions — conservation §10 (12 mois par défaut, configurable)', () => {
  it('les entrées au-delà de la rétention sont réellement SUPPRIMÉES à l’écriture suivante', async () => {
    const a = await assembleFromEnv({ ...BASE_ENV, CCT_EXEMPTION_LOG_RETENTION_MONTHS: '12' });
    await a.storage.appendExemptionLog({
      prKey: 'p1',
      action: 'granted',
      by: { id: 'u1', login: 'a' },
      at: '2020-01-01T00:00:00Z', // bien au-delà de 12 mois
    });
    await a.storage.appendExemptionLog({
      prKey: 'p2',
      action: 'granted',
      by: { id: 'u2', login: 'b' },
      at: new Date().toISOString(),
    });
    const entries = await a.storage.readExemptionLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.prKey).toBe('p2');
  });

  it('0 = conservation illimitée, sur décision explicite', async () => {
    const a = await assembleFromEnv({ ...BASE_ENV, CCT_EXEMPTION_LOG_RETENTION_MONTHS: '0' });
    await a.storage.appendExemptionLog({
      prKey: 'p1',
      action: 'granted',
      by: { id: 'u1', login: 'a' },
      at: '2020-01-01T00:00:00Z',
    });
    await a.storage.appendExemptionLog({
      prKey: 'p2',
      action: 'granted',
      by: { id: 'u2', login: 'b' },
      at: new Date().toISOString(),
    });
    expect(await a.storage.readExemptionLog()).toHaveLength(2);
  });
});

describe('FileStorage — la sonde d’écriture au démarrage', () => {
  it('verifyWritable réussit sur un chemin sain et échoue net sur un chemin inutilisable', async () => {
    const ok = new FileStorage(join(dir, 'probe', 'storage.json'));
    await ok.load();
    await expect(ok.verifyWritable()).resolves.toBeUndefined();

    // Un chemin qui désigne un répertoire existant : le rename final de l'écriture
    // atomique échoue — même en root, là où les permissions ne suffiraient pas.
    const asDir = join(dir, 'as-dir');
    await mkdir(asDir, { recursive: true });
    const bad = new FileStorage(asDir);
    await expect(bad.verifyWritable()).rejects.toThrow(/not writable/);
  });

  it('un chemin qui traverse un fichier est refusé à load() — jamais un état vide', async () => {
    const blocker = join(dir, 'blocker');
    await writeFile(blocker, 'x', 'utf8');
    const storage = new FileStorage(join(blocker, 'sub', 'storage.json'));
    await expect(storage.load()).rejects.toThrow(/not readable/);
  });
});
