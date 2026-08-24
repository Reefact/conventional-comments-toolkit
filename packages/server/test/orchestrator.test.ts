import { describe, expect, it } from 'vitest';
import type { CommentInfo, EffectiveConfig, Floor, PrRef, ThreadInfo, UserInfo } from '@cct/core';
import { Orchestrator } from '../src/compliance/orchestrator.js';
import { MemoryStorage } from '../src/compliance/storage.js';
import { ConfigCache } from '../src/compliance/cache.js';
import { prKey, repoKey } from '../src/compliance/keys.js';
import { FakeAdapter, fakeState, type FakePlatformState } from './fake-adapter.js';
import type { PlatformOperationalFacts } from '../src/compliance/adapter.js';

const alice: UserInfo = { id: 'u-alice', login: 'alice', isServiceAccount: false };
const bob: UserInfo = { id: 'u-bob', login: 'bob', isServiceAccount: false };
const lead: UserInfo = { id: 'u-lead', login: 'lead', isServiceAccount: false };

const PR: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};
const P_KEY = prKey(PR);
const R_KEY = repoKey(PR);

let seq = 0;
const nextSeq = () => ++seq;

function comment(body: string, opts: Partial<CommentInfo> = {}): CommentInfo {
  return {
    id: opts.id ?? `c-${Math.abs(hash(body))}`,
    author: alice,
    body,
    createdAt: '2026-10-02T00:00:00Z',
    permalink: `https://example.test/${opts.id ?? 'c'}`,
    isSystemGenerated: false,
    canCarryBlockingState: true,
    ...opts,
  };
}
function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

function thread(root: CommentInfo, opts: Partial<ThreadInfo> = {}): ThreadInfo {
  return {
    id: opts.id ?? `t-${root.id}`,
    pr: PR,
    root,
    replies: [],
    resolution: 'unresolved',
    canCarryBlockingState: true,
    ...opts,
  };
}

interface Env {
  adapter: FakeAdapter;
  storage: MemoryStorage;
  orchestrator: Orchestrator;
  clock: { now: Date };
}

function makeEnv(
  state: Partial<FakePlatformState>,
  opts: { floor?: Floor | null; facts?: Partial<PlatformOperationalFacts> } = {}
): Env {
  const adapter = new FakeAdapter(fakeState(state));
  const storage = new MemoryStorage();
  const clock = { now: new Date('2026-10-05T12:00:00Z') };
  const orchestrator = new Orchestrator({
    adapter,
    storage,
    cache: new ConfigCache(() => clock.now.getTime()),
    floorProvider: async () => opts.floor ?? null,
    facts: {
      threadStatusEmitsPrUpdated: true,
      labelProvenanceExposed: true,
      requiresStatusTargetUrl: false,
      ...opts.facts,
    },
    now: () => clock.now,
  });
  return { adapter, storage, orchestrator, clock };
}

const enforceConfig = (extra: object = {}) => ({
  status: 'found' as const,
  text: JSON.stringify({
    mode: 'enforce',
    activation: { activatedAt: '2026-09-01T00:00:00Z' },
    resolverOverrideGroup: ['acme/leads'],
    ...extra,
  }),
});

describe('§6.4 — cycle d’évaluation', () => {
  it('CA-05/CA-22 : fil bloquant non résolu → statut en échec publié', async () => {
    const env = makeEnv({
      repoConfig: enforceConfig(),
      threads: [thread(comment('issue: fuite mémoire\n\nd'))],
      groupMembers: { 'acme/leads': [lead.id] },
    });
    const outcome = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(outcome.published).toBe(true);
    expect(env.adapter.published[0]!.state).toBe('failure');
    expect(env.adapter.published[0]!.headSha).toBe('sha-1');
  });

  it('CA-29 : dépôt jamais évalué sans fichier → aucun statut, rien persisté (étape 8)', async () => {
    const env = makeEnv({ repoConfig: { status: 'absent' } });
    const outcome = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(outcome.skipped).toBe('not-activated');
    expect(env.adapter.published).toHaveLength(0);
    expect(await env.storage.getPinnedConfig(P_KEY)).toBeNull();
    expect((await env.storage.getRepoEvaluated(R_KEY)).evaluated).toBe(false);
  });

  it('CA-29 contre-épreuve : fichier retiré d’un dépôt déjà évalué → neutre config-vanished, jamais un silence', async () => {
    const env = makeEnv({ repoConfig: enforceConfig() });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(env.adapter.published).toHaveLength(1);
    // Le fichier disparaît ; le mode résiduel est assist (défauts) — publie quand même.
    // La disparition n'est observée qu'à l'expiration du cache de configuration (§8.1.2).
    env.adapter.state.repoConfig = { status: 'absent' };
    env.adapter.state.headSha = 'sha-2';
    env.clock.now = new Date(env.clock.now.getTime() + 3601 * 1000);
    const outcome = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(outcome.published).toBe(true);
    const status = env.adapter.published[1]!;
    expect(status.state).toBe('neutral');
    expect(status.notices.some((n) => n.kind === 'config-vanished')).toBe(true);
  });

  it('mode assist : aucun statut publié (§6.2.2)', async () => {
    const env = makeEnv({
      repoConfig: { status: 'found', text: '{}' }, // mode par défaut : assist
      threads: [thread(comment('issue: fuite mémoire\n\nd'))],
    });
    const outcome = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(outcome.skipped).toBe('mode');
    expect(env.adapter.published).toHaveLength(0);
  });

  it('CA-23 : warn + check obligatoire → statut vert publié avec résumé informatif', async () => {
    const env = makeEnv({
      repoConfig: enforceConfig({ mode: 'warn' }),
      threads: [thread(comment('issue: fuite mémoire\n\nd'))],
    });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    const status = env.adapter.published[0]!;
    expect(status.state).toBe('success');
    expect(status.counts.unresolvedThreads).toBe(1);
  });

  it('CA-35 : brouillon — statut informatif ; sortie de brouillon — contraignant', async () => {
    const env = makeEnv({
      repoConfig: enforceConfig(),
      threads: [thread(comment('issue: fuite mémoire\n\nd'))],
      isDraft: true,
    });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(env.adapter.published[0]!.state).toBe('success');
    env.adapter.state.isDraft = false;
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(env.adapter.published[1]!.state).toBe('failure');
  });

  it('idempotence : résultat identique, SHA compris → pas de republication (§6.4)', async () => {
    const env = makeEnv({
      repoConfig: enforceConfig(),
      threads: [thread(comment('issue: fuite mémoire\n\nd'))],
    });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    const second = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(second.skipped).toBe('identical');
    expect(env.adapter.published).toHaveLength(1);
    // Un push change le SHA : tout le reste identique, il FAUT republier (§6.4).
    env.adapter.state.headSha = 'sha-2';
    const third = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(third.published).toBe(true);
    expect(env.adapter.published).toHaveLength(2);
  });

  it('CA-28 : une séquence périmée ne réécrit jamais un résultat plus récent (porte 14.a)', async () => {
    const env = makeEnv({
      repoConfig: enforceConfig(),
      threads: [thread(comment('issue: fuite mémoire\n\nd'))],
    });
    const oldSeq = nextSeq();
    const newSeq = nextSeq();
    await env.orchestrator.evaluatePr(PR, newSeq); // le récent publie
    env.adapter.state.headSha = 'sha-2';
    const stale = await env.orchestrator.evaluatePr(PR, oldSeq); // l'ancien arrive après
    expect(stale.skipped).toBe('stale-sequence');
    expect(env.adapter.published).toHaveLength(1);
  });

  it('CA-33 : E-UNKNOWN-LABEL déclenche la seconde passe sans cache, seul son verdict compte', async () => {
    const env = makeEnv({
      repoConfig: enforceConfig({ formatSeverity: 'error' }),
      threads: [thread(comment('perfo: gros gain possible\n\nd'))],
    });
    // Premier tour : label inconnu → le fichier est relu sans cache. Entre les deux
    // passes, l'organisation a ajouté le label — la seconde passe le voit.
    const original = env.adapter.state.repoConfig;
    let bypassed = false;
    const adapterAny = env.adapter;
    const originalFetch = adapterAny.fetchConfigFile.bind(adapterAny);
    adapterAny.fetchConfigFile = async (pr, opts) => {
      if (opts?.bypassCache) {
        bypassed = true;
        return {
          status: 'found',
          text: JSON.stringify({
            ...(JSON.parse((original as { text: string }).text) as object),
            labels: [{ id: 'perfo', enabled: true }],
          }),
        };
      }
      return originalFetch(pr, opts);
    };
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(bypassed).toBe(true);
    const status = env.adapter.published[0]!;
    expect(status.formatDiagnostics.some((d) => d.code === 'E-UNKNOWN-LABEL')).toBe(false);
    expect(status.state).toBe('success');
    // Et c'est le second verdict qui est épinglé (§8.1.3, règle 3).
    const pinned = await env.storage.getPinnedConfig(P_KEY);
    expect(pinned!.labels.some((l) => l.id === 'perfo')).toBe(true);
  });

  it('CA-40 : un E-NO-LABEL sur une commande déclenche aussi la seconde passe (§8.1.3 r.3)', async () => {
    const env = makeEnv({
      repoConfig: enforceConfig({ formatSeverity: 'error' }),
      threads: [thread(comment('@codex review'))],
    });
    // Le dépôt vient d'ajouter `@codex` à toolCommands ; le serveur a encore l'ancienne
    // configuration en cache. Sans le troisième déclencheur, la commande resterait rejetée
    // pendant tout le TTL alors que l'extension, elle, l'exempte déjà.
    const original = env.adapter.state.repoConfig;
    let bypassed = false;
    const adapterAny = env.adapter;
    const originalFetch = adapterAny.fetchConfigFile.bind(adapterAny);
    adapterAny.fetchConfigFile = async (pr, opts) => {
      if (opts?.bypassCache) {
        bypassed = true;
        return {
          status: 'found',
          text: JSON.stringify({
            ...(JSON.parse((original as { text: string }).text) as object),
            toolCommands: ['@codex'],
          }),
        };
      }
      return originalFetch(pr, opts);
    };
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(bypassed).toBe(true);
    const status = env.adapter.published[0]!;
    expect(status.formatDiagnostics.some((d) => d.code === 'E-NO-LABEL')).toBe(false);
    expect(status.state).toBe('success');
  });

  it('CA-40 : un contournement stérile ne se répète pas à chaque réévaluation (§8.1.3 r.3)', async () => {
    // `@alice peux-tu regarder ça ?` a la forme d'une commande sans en être une : le rejet
    // ne disparaîtra jamais. Sans étranglement, chaque webhook et chaque réconciliation
    // — 60 s sur Azure DevOps — relanceraient la double lecture, annulant le TTL pour ce
    // dépôt aussi longtemps que le commentaire y reste.
    const env = makeEnv({
      repoConfig: enforceConfig({ formatSeverity: 'error' }),
      threads: [thread(comment('@alice peux-tu regarder ça ?'))],
    });
    let bypasses = 0;
    const adapterAny = env.adapter;
    const originalFetch = adapterAny.fetchConfigFile.bind(adapterAny);
    adapterAny.fetchConfigFile = async (pr, opts) => {
      if (opts?.bypassCache) bypasses += 1;
      return originalFetch(pr, opts);
    };

    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(bypasses).toBe(1); // le premier contournement est légitime : on ne sait pas encore

    // Réévaluations suivantes : le contournement précédent n'avait rien changé.
    env.adapter.state.headSha = 'sha-2';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    env.adapter.state.headSha = 'sha-3';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(bypasses).toBe(1);

    // Passé le TTL, une nouvelle tentative est de nouveau permise : l'étranglement borne
    // la répétition, il ne ferme jamais la porte.
    env.clock.now = new Date(env.clock.now.getTime() + 3601 * 1000);
    env.adapter.state.headSha = 'sha-4';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(bypasses).toBe(2);
  });

  it('CA-40 : un contournement FRUCTUEUX n’est jamais étranglé (§8.1.3 r.3)', async () => {
    // Contre-épreuve : l'étranglement ne doit mordre que sur les contournements stériles.
    const env = makeEnv({
      repoConfig: enforceConfig({ formatSeverity: 'error' }),
      threads: [thread(comment('@alice peux-tu regarder ça ?'))],
    });
    let bypasses = 0;
    const original = env.adapter.state.repoConfig;
    const adapterAny = env.adapter;
    const originalFetch = adapterAny.fetchConfigFile.bind(adapterAny);
    adapterAny.fetchConfigFile = async (pr, opts) => {
      if (opts?.bypassCache) {
        bypasses += 1;
        return {
          status: 'found',
          text: JSON.stringify({
            ...(JSON.parse((original as { text: string }).text) as object),
            allowlistPatterns: [`^ignore-${bypasses}$`], // la configuration change à chaque fois
          }),
        };
      }
      return originalFetch(pr, opts);
    };

    await env.orchestrator.evaluatePr(PR, nextSeq());
    env.adapter.state.headSha = 'sha-2';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(bypasses).toBe(2); // jamais étranglé tant qu'il apprend quelque chose
  });

  it('CA-40 : un E-NO-LABEL ordinaire ne déclenche RIEN — le discriminant borne le coût', async () => {
    // Contre-épreuve indispensable : sans qualification, le déclencheur contournerait le
    // cache sur la quasi-totalité des commentaires non conformes.
    const env = makeEnv({
      repoConfig: enforceConfig({ formatSeverity: 'error' }),
      threads: [thread(comment('il faudrait renommer ça'))],
    });
    let bypassed = false;
    const adapterAny = env.adapter;
    const originalFetch = adapterAny.fetchConfigFile.bind(adapterAny);
    adapterAny.fetchConfigFile = async (pr, opts) => {
      if (opts?.bypassCache) bypassed = true;
      return originalFetch(pr, opts);
    };
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(bypassed).toBe(false);
    expect(env.adapter.published[0]!.formatDiagnostics.some((d) => d.code === 'E-NO-LABEL')).toBe(true);
  });

  it('CA-30 : l’épinglage se fait à la première évaluation et n’est jamais réécrit', async () => {
    const env = makeEnv({ repoConfig: enforceConfig() });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    const pinned1 = await env.storage.getPinnedConfig(P_KEY);
    expect(pinned1).not.toBeNull();
    env.adapter.state.repoConfig = enforceConfig({ labels: [{ id: 'chore', enabled: false }] });
    env.adapter.state.headSha = 'sha-2';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    const pinned2 = await env.storage.getPinnedConfig(P_KEY);
    expect(pinned2).toEqual(pinned1);
  });

  it('monotonie persistée : déjà observés ∪ bloquants du tour − corrigés (§6.1)', async () => {
    const root = comment('issue: fuite mémoire\n\nd', { id: 'root-1' });
    const env = makeEnv({ repoConfig: enforceConfig(), threads: [thread(root, { id: 'th-1' })] });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(await env.storage.getKnownBlockingThreads(P_KEY)).toEqual(['th-1']);
    expect(await env.storage.getFirstVerdicts(P_KEY)).toEqual({
      'th-1': { blocking: true, hadConflict: false },
    });
    // Édition affaiblissante par un tiers : le fil reste dans l'ensemble et compté.
    env.adapter.state.threads = [
      thread(comment('note: finalement non\n\nd', { id: 'root-1', lastEditedBy: bob }), { id: 'th-1' }),
    ];
    env.adapter.state.headSha = 'sha-2';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    const status = env.adapter.published[1]!;
    expect(status.state).toBe('failure');
    expect(status.notices.some((n) => n.kind === 'weakening-edit' && n.actor?.login === 'bob')).toBe(true);
    expect(await env.storage.getKnownBlockingThreads(P_KEY)).toEqual(['th-1']);
  });

  it('CA-36 contre-épreuve persistée : correction d’un E-CONFLICT retirée définitivement de l’ensemble', async () => {
    const conflicted = comment('issue (blocking, non-blocking): fuite\n\nd', { id: 'root-1' });
    const env = makeEnv({ repoConfig: enforceConfig(), threads: [thread(conflicted, { id: 'th-1' })] });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(await env.storage.getFirstVerdicts(P_KEY)).toEqual({
      'th-1': { blocking: true, hadConflict: true },
    });
    // L'auteur corrige vers (non-blocking) : exception de correction (§6.1).
    env.adapter.state.threads = [
      thread(comment('issue (non-blocking): fuite\n\nd', { id: 'root-1', lastEditedBy: alice }), { id: 'th-1' }),
    ];
    env.adapter.state.headSha = 'sha-2';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(env.adapter.published[1]!.state).toBe('success');
    expect(await env.storage.getKnownBlockingThreads(P_KEY)).toEqual([]);
  });

  it('délai de grâce : abandon silencieux, puis neutre grace-expired sur un dépôt déjà évalué (§6.4)', async () => {
    const env = makeEnv({ repoConfig: enforceConfig() });
    await env.orchestrator.evaluatePr(PR, nextSeq()); // active le dépôt
    env.adapter.state.unreachable = true;
    const during = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(during.skipped).toBe('grace'); // rien publié, statut précédent en place
    expect(env.adapter.published).toHaveLength(1);
    // Le délai (900 s par défaut) expire.
    env.clock.now = new Date(env.clock.now.getTime() + 901 * 1000);
    const after = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(after.published).toBe(true);
    const status = env.adapter.published[1]!;
    expect(status.state).toBe('neutral');
    expect(status.notices.some((n) => n.kind === 'grace-expired')).toBe(true);
    // Aucun root-deleted malgré les listes vides : un verdict imposé ne dérive aucun fait.
    expect(status.notices.some((n) => n.kind === 'root-deleted')).toBe(false);
  });

  it('CA-40 : le chemin dégradé survit à une dernière configuration effective héritée (§6.4)', async () => {
    // Le second document persisté du §6.4 — la dernière configuration effective connue du
    // dépôt — part DIRECTEMENT dans evaluate() sur ce chemin, sans passer par le mélange
    // du §8.1.3. Une clé ajoutée depuis son écriture y serait donc lue `undefined`, et
    // `fingerprint()` lèverait sur son `.map()` : le statut neutre attendu ne serait jamais
    // publié, et le dépôt resterait bloqué sur un statut périmé.
    const env = makeEnv({ repoConfig: enforceConfig() });
    await env.orchestrator.evaluatePr(PR, nextSeq()); // active le dépôt et persiste la config

    // Rétrograde l'enregistrement persisté à ce qu'une version antérieure aurait écrit.
    const stored = await env.storage.getLastEffectiveConfig(R_KEY);
    const legacy = stored as EffectiveConfig & { toolCommands?: string[] };
    delete legacy.toolCommands;
    await env.storage.setLastEffectiveConfig(R_KEY, legacy as EffectiveConfig);

    env.adapter.state.unreachable = true;
    await env.orchestrator.evaluatePr(PR, nextSeq());
    env.clock.now = new Date(env.clock.now.getTime() + 901 * 1000);
    const after = await env.orchestrator.evaluatePr(PR, nextSeq());

    expect(after.published).toBe(true);
    const status = env.adapter.published[1]!;
    expect(status.state).toBe('neutral');
    expect(status.notices.some((n) => n.kind === 'grace-expired')).toBe(true);
  });

  it('panne sur un dépôt jamais évalué : le silence continue (§8.1.5)', async () => {
    const env = makeEnv({ repoConfig: enforceConfig(), unreachable: true });
    env.adapter.state.unreachable = true;
    await env.orchestrator.evaluatePr(PR, nextSeq());
    env.clock.now = new Date(env.clock.now.getTime() + 10_000 * 1000);
    const after = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(after.skipped).toBe('grace');
    expect(env.adapter.published).toHaveLength(0);
  });

  it('configuration invalide sur un dépôt déjà évalué : échec sous enforce, quel que soit le mode résiduel (§8.1.5)', async () => {
    const env = makeEnv({ repoConfig: enforceConfig() }, { floor: { minimumMode: 'enforce' } });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    env.adapter.state.repoConfig = { status: 'found', text: '{ broken' };
    env.adapter.state.headSha = 'sha-2';
    env.clock.now = new Date(env.clock.now.getTime() + 3601 * 1000); // expiration du cache (§8.1.2)
    const outcome = await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(outcome.published).toBe(true);
    const status = env.adapter.published[1]!;
    expect(status.state).toBe('failure'); // enforce vient du plancher, le fichier étant cassé
    expect(status.notices.some((n) => n.kind === 'invalid-config')).toBe(true);
  });

  it('CA-15 : PR antérieure à l’activation → statut vert publié, jamais le silence (§6.2.3)', async () => {
    const oldPr: PrRef = { ...PR, createdAt: '2026-08-01T00:00:00Z', number: 7 };
    const env = makeEnv({
      repoConfig: enforceConfig(),
      threads: [thread(comment('issue: fuite mémoire\n\nd'))],
    });
    const outcome = await env.orchestrator.evaluatePr(oldPr, nextSeq());
    expect(outcome.published).toBe(true);
    expect(env.adapter.published[0]!.state).toBe('success');
    expect(env.adapter.published[0]!.headline).toMatch(/activation/i);
  });

  it('activatedAt posée par l’administration quand le fichier ne la porte pas (§6.4)', async () => {
    const env = makeEnv({
      repoConfig: { status: 'found', text: JSON.stringify({ mode: 'enforce' }) },
      threads: [thread(comment('issue: fuite mémoire\n\nd'))],
    });
    await env.storage.setStoredActivatedAt(R_KEY, '2026-09-01T00:00:00Z');
    await env.orchestrator.evaluatePr(PR, nextSeq());
    const status = env.adapter.published[0]!;
    expect(status.state).toBe('failure'); // la PR du 2026-10-01 est dans le périmètre
    expect(status.activatedAt).toBe('2026-09-01T00:00:00Z'); // republiée (PublishedSummary)
  });

  it('enforce avec resolverOverrideGroup vide → config-warning à chaque évaluation (§8.2)', async () => {
    const env = makeEnv({
      repoConfig: { status: 'found', text: JSON.stringify({ mode: 'enforce', activation: { activatedAt: '2026-09-01T00:00:00Z' } }) },
    });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(
      env.adapter.published[0]!.notices.some(
        (n) => n.kind === 'config-warning' && n.ref === 'resolverOverrideGroup'
      )
    ).toBe(true);
  });
});

describe('§6.3.2 — exemption via l’étiquette (provenance exposée)', () => {
  it('CA-26 : étiquette posée par un membre habilité → vert ; nouveau fil bloquant → retrait + échec', async () => {
    const root = comment('issue: fuite mémoire\n\nd', { id: 'root-1' });
    const env = makeEnv({
      repoConfig: enforceConfig(),
      threads: [thread(root, { id: 'th-1' })],
      groupMembers: { 'acme/leads': [lead.id] },
    });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(env.adapter.published[0]!.state).toBe('failure');

    // L'étiquette est posée par lead : la chaîne se relit de l'état courant de la PR.
    env.adapter.state.labels = [{ name: 'cc-override', by: lead, at: '2026-10-05T00:00:00Z' }];
    env.adapter.state.headSha = 'sha-2';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(env.adapter.published[1]!.state).toBe('success');
    expect(env.adapter.published[1]!.exemption?.by.login).toBe('lead');

    // Un NOUVEAU fil bloquant remet l'exemption à zéro : étiquette retirée, échec.
    env.adapter.state.threads.push(thread(comment('todo: corriger aussi ceci\n\nd', { id: 'root-2' }), { id: 'th-2' }));
    env.adapter.state.headSha = 'sha-3';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    const status = env.adapter.published[2]!;
    expect(status.state).toBe('failure');
    expect(env.adapter.labelCalls).toContainEqual({ action: 'remove', name: 'cc-override' });
    expect(status.notices.some((n) => n.kind === 'exemption-reset')).toBe(true);
  });

  it('CA-26 : étiquette posée par un non-habilité → refusée, laissée en place', async () => {
    const env = makeEnv({
      repoConfig: enforceConfig(),
      threads: [thread(comment('issue: fuite mémoire\n\nd'))],
      labels: [{ name: 'cc-override', by: bob, at: '2026-10-05T00:00:00Z' }],
      groupMembers: { 'acme/leads': [lead.id] },
    });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    const status = env.adapter.published[0]!;
    expect(status.state).toBe('failure');
    expect(status.notices.some((n) => n.kind === 'exemption-refused' && n.actor?.login === 'bob')).toBe(true);
    expect(env.adapter.labelCalls).toHaveLength(0); // étiquette laissée en place
  });
});

describe('§6.3.2 — chemin de repli (provenance non exposée, ex. Azure DevOps)', () => {
  const fallbackFacts = { labelProvenanceExposed: false, threadStatusEmitsPrUpdated: false, requiresStatusTargetUrl: true };

  it('l’étiquette seule n’accorde jamais l’exemption ; l’exemption confirmée persiste et restaure', async () => {
    const root = comment('issue: fuite mémoire\n\nd', { id: 'root-1' });
    const env = makeEnv(
      {
        repoConfig: enforceConfig(),
        threads: [thread(root, { id: 'th-1' })],
        labels: [{ name: 'cc-override' }], // sans by/at
        groupMembers: { 'acme/leads': [lead.id] },
      },
      { facts: fallbackFacts }
    );
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(env.adapter.published[0]!.state).toBe('failure'); // étiquette sans provenance : rien

    // Exemption accordée par le point d'entrée : persistée confirmée.
    await env.storage.setActiveExemption(P_KEY, { by: lead, at: '2026-10-05T00:00:00Z', state: 'confirmed' });
    env.adapter.state.headSha = 'sha-2';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(env.adapter.published[1]!.state).toBe('success');

    // CA-39 : quelqu'un retire l'étiquette à la main → restaurée au tour suivant, vert.
    env.adapter.state.labels = [];
    env.adapter.state.headSha = 'sha-3';
    await env.orchestrator.evaluatePr(PR, nextSeq());
    const status = env.adapter.published[2]!;
    expect(status.state).toBe('success');
    expect(status.notices.some((n) => n.kind === 'exemption-label-restored')).toBe(true);
    expect(env.adapter.labelCalls).toContainEqual({ action: 'add', name: 'cc-override' });
  });

  it('une exemption en attente rencontrée par une évaluation est supprimée, jamais retenue (§6.4)', async () => {
    const env = makeEnv(
      {
        repoConfig: enforceConfig(),
        threads: [thread(comment('issue: fuite mémoire\n\nd'))],
        groupMembers: { 'acme/leads': [lead.id] },
      },
      { facts: fallbackFacts }
    );
    await env.storage.setActiveExemption(P_KEY, { by: lead, at: '2026-10-05T00:00:00Z', state: 'pending' });
    await env.orchestrator.evaluatePr(PR, nextSeq());
    expect(env.adapter.published[0]!.state).toBe('failure');
    expect(await env.storage.getActiveExemption(P_KEY)).toBeNull();
  });
});
