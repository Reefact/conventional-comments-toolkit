import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/resolve.js';
import type { ConfigRead, EffectiveConfig } from '../src/types.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });

function pin(repo: object, floor: Parameters<typeof resolveConfig>[0] = null): EffectiveConfig {
  // La configuration rendue sur une première évaluation EST celle à épingler (§9.2.2).
  return resolveConfig(floor, absent, found(repo), null, false).config;
}

describe('§8.1.3 règle 1 — épinglage monotone', () => {
  it('CA-30 : retirer un label est restrictif — la PR déjà ouverte garde le label', () => {
    const pinned = pin({ mode: 'enforce' }); // chore actif à l’ouverture
    const { config } = resolveConfig(
      null,
      absent,
      found({ mode: 'enforce', labels: [{ id: 'chore', enabled: false }] }),
      pinned,
      true
    );
    expect(config.labels.find((l) => l.id === 'chore')!.enabled).toBe(true);
    // Une PR ouverte après le merge applique la nouvelle configuration.
    const fresh = resolveConfig(null, absent, found({ mode: 'enforce', labels: [{ id: 'chore', enabled: false }] }), null, false);
    expect(fresh.config.labels.find((l) => l.id === 'chore')!.enabled).toBe(false);
  });

  it('ajout d’un label : élargissant, en direct sur les PR ouvertes', () => {
    const pinned = pin({});
    const { config } = resolveConfig(
      null,
      absent,
      found({ labels: [{ id: 'typo', enabled: true }] }),
      pinned,
      true
    );
    expect(config.labels.find((l) => l.id === 'typo')!.enabled).toBe(true);
  });

  it('durcissement du mode : épinglé ; assouplissement : en direct (§6.3.3, CA-27)', () => {
    const pinnedWarn = pin({ mode: 'warn' });
    expect(resolveConfig(null, absent, found({ mode: 'enforce' }), pinnedWarn, true).config.mode).toBe('warn');
    const pinnedEnforce = pin({ mode: 'enforce' });
    expect(resolveConfig(null, absent, found({ mode: 'warn' }), pinnedEnforce, true).config.mode).toBe('warn');
  });

  it('durcissement d’une sévérité : épinglé ; abaissement : en direct', () => {
    const pinned = pin({});
    expect(
      resolveConfig(null, absent, found({ severities: { 'W-CASE': 'error' } }), pinned, true).config
        .severities['W-CASE'] ?? 'warn'
    ).toBe('warn');
    const pinnedStrict = pin({ severities: { 'W-CASE': 'error' } });
    expect(
      resolveConfig(null, absent, found({}), pinnedStrict, true).config.severities['W-CASE'] ?? 'warn'
    ).toBe('warn');
  });

  it('allongement de minSubjectLength épinglé, raccourcissement en direct', () => {
    const pinned = pin({ rules: { minSubjectLength: 5 } });
    expect(
      resolveConfig(null, absent, found({ rules: { minSubjectLength: 30 } }), pinned, true).config.rules
        .minSubjectLength
    ).toBe(5);
    expect(
      resolveConfig(null, absent, found({ rules: { minSubjectLength: 2 } }), pinned, true).config.rules
        .minSubjectLength
    ).toBe(2);
  });

  it('retrait d’un compte exemptUsers épinglé, ajout en direct — par entrée (§8.1.3)', () => {
    const pinned = pin({ exemptUsers: ['bot-a', 'bot-b'] });
    const { config } = resolveConfig(null, absent, found({ exemptUsers: ['bot-b', 'bot-c'] }), pinned, true);
    expect(config.exemptUsers.sort()).toEqual(['bot-a', 'bot-b', 'bot-c']);
  });

  it('un même commit peut retirer un label et en ajouter un autre : entrée par entrée', () => {
    const pinned = pin({});
    const { config } = resolveConfig(
      null,
      absent,
      found({ labels: [{ id: 'chore', enabled: false }, { id: 'quibble', enabled: true }] }),
      pinned,
      true
    );
    expect(config.labels.find((l) => l.id === 'chore')!.enabled).toBe(true); // retrait épinglé
    expect(config.labels.find((l) => l.id === 'quibble')!.enabled).toBe(true); // ajout en direct
  });

  it('scope.validateReplies : passage à true épinglé, retour à false en direct', () => {
    const pinned = pin({});
    expect(
      resolveConfig(null, absent, found({ scope: { validateReplies: true } }), pinned, true).config.scope
        .validateReplies
    ).toBe(false);
  });

  it('decorations.allowFree : true→false épinglé', () => {
    const pinned = pin({});
    expect(
      resolveConfig(null, absent, found({ decorations: { allowFree: false } }), pinned, true).config
        .decorations.allowFree
    ).toBe(true);
  });

  it('forces : null→blocking épinglé ; blocking→null en direct', () => {
    const pinned = pin({ decorations: { known: [{ id: 'urgent', forces: null }] } });
    expect(
      resolveConfig(
        null,
        absent,
        found({ decorations: { known: [{ id: 'urgent', forces: 'blocking' }] } }),
        pinned,
        true
      ).config.decorations.known.find((d) => d.id === 'urgent')!.forces
    ).toBeNull();
    const pinnedBlocking = pin({ decorations: { known: [{ id: 'urgent', forces: 'blocking' }] } });
    expect(
      resolveConfig(
        null,
        absent,
        found({ decorations: { known: [{ id: 'urgent', forces: null }] } }),
        pinnedBlocking,
        true
      ).config.decorations.known.find((d) => d.id === 'urgent')!.forces
    ).toBeNull();
  });

  it('activatedAt : avancer la date (durcir) épinglé ; la repousser (assouplir) en direct', () => {
    const pinned = pin({ activation: { activatedAt: '2026-09-01T00:00:00Z' } });
    expect(
      resolveConfig(null, absent, found({ activation: { activatedAt: '2026-06-01T00:00:00Z' } }), pinned, true)
        .config.activation.activatedAt
    ).toBe('2026-09-01T00:00:00Z');
    expect(
      resolveConfig(null, absent, found({ activation: { activatedAt: '2026-12-01T00:00:00Z' } }), pinned, true)
        .config.activation.activatedAt
    ).toBe('2026-12-01T00:00:00Z');
  });
});

describe('§8.1.3 — document épinglé écrit par une version antérieure de core/', () => {
  it('CA-40 : une clé absente du document persisté est complétée, pas lue undefined', () => {
    // Reproduit une PR épinglée AVANT l'ajout de `toolCommands` : le stockage relit le
    // JSON tel quel (§6.4), sans normalisation, sur les deux backends. Sans complétion,
    // l'union du §8.1.4 lèverait et la PR cesserait d'être évaluée après mise à jour.
    const legacy = pin({ mode: 'enforce' }) as EffectiveConfig & { toolCommands?: string[] };
    delete legacy.toolCommands;

    const { config } = resolveConfig(
      null,
      absent,
      found({ mode: 'enforce', toolCommands: ['@codex'] }),
      legacy as EffectiveConfig,
      true
    );
    // L'ajout est élargissant : il s'applique en direct, sur la valeur par défaut (vide)
    // que la PR portait implicitement jusque-là.
    expect(config.toolCommands).toEqual(['@codex']);
  });

  it('CA-40 : le cas symétrique — clé absente des deux côtés — reste la liste vide', () => {
    const legacy = pin({ mode: 'enforce' }) as EffectiveConfig & { toolCommands?: string[] };
    delete legacy.toolCommands;
    const { config } = resolveConfig(null, absent, found({ mode: 'enforce' }), legacy as EffectiveConfig, true);
    expect(config.toolCommands).toEqual([]);
  });
});

describe('§8.1.3 — bornes d’entreprise en direct dans les deux sens (CA-31)', () => {
  it('durcir le plancher sur mode prend effet sur les PR déjà ouvertes, malgré l’épinglage', () => {
    const pinned = pin({ mode: 'warn' });
    const { config } = resolveConfig({ minimumMode: 'enforce' }, absent, found({ mode: 'warn' }), pinned, true);
    expect(config.mode).toBe('enforce');
  });

  it('assouplir le plancher prend effet en direct aussi', () => {
    const pinned = pin({ mode: 'warn' }, { minimumMode: 'enforce' });
    expect(pinned.mode).toBe('enforce');
    const { config } = resolveConfig({ minimumMode: 'off' }, absent, found({ mode: 'warn' }), pinned, true);
    expect(config.mode).toBe('warn');
  });

  it('contre-épreuve CA-31 : durcir le plancher sur activation.activatedAt ne change rien aux PR ouvertes', () => {
    const pinned = pin({ activation: { activatedAt: '2026-09-01T00:00:00Z' } });
    const { config } = resolveConfig(
      { minimumMode: 'off', activation: { activatedAt: '2026-01-01T00:00:00Z' } },
      absent,
      found({ activation: { activatedAt: '2026-09-01T00:00:00Z' } }),
      pinned,
      true
    );
    expect(config.activation.activatedAt).toBe('2026-09-01T00:00:00Z'); // épinglé
    // Une PR nouvelle reçoit bien la date durcie.
    const fresh = resolveConfig(
      { minimumMode: 'off', activation: { activatedAt: '2026-01-01T00:00:00Z' } },
      absent,
      found({ activation: { activatedAt: '2026-09-01T00:00:00Z' } }),
      null,
      false
    );
    expect(fresh.config.activation.activatedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('clause de fermeture : overrideLabel est épinglée', () => {
    const pinned = pin({ overrideLabel: 'cc-override' });
    const { config } = resolveConfig(null, absent, found({ overrideLabel: 'nouvelle-etiquette' }), pinned, true);
    expect(config.overrideLabel).toBe('cc-override');
  });

  it('clés opérationnelles en direct : server.*, configCacheTtlSeconds, docUrl', () => {
    const pinned = pin({ server: { gracePeriodSeconds: 900 }, configCacheTtlSeconds: 3600 });
    const { config } = resolveConfig(
      null,
      absent,
      found({ server: { gracePeriodSeconds: 60 }, configCacheTtlSeconds: 60, docUrl: 'https://doc.example/' }),
      pinned,
      true
    );
    expect(config.server.gracePeriodSeconds).toBe(60);
    expect(config.configCacheTtlSeconds).toBe(60);
    expect(config.docUrl).toBe('https://doc.example/');
  });
});
