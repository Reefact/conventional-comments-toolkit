import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/resolve.js';
import { defaultConfig } from '../src/config/defaults.js';
import { hasNestedQuantifier } from '../src/config/schema.js';
import { fingerprint } from '../src/config/fingerprint.js';
import type { ConfigRead, Floor } from '../src/types.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });
const foundText = (t: string): ConfigRead => ({ status: 'found', text: t });

describe('§8.2 — valeurs par défaut du produit', () => {
  it('treize labels, trois optionnels désactivés, décorations du §3.3', () => {
    const c = defaultConfig();
    expect(c.labels).toHaveLength(13);
    expect(c.labels.filter((l) => l.enabled)).toHaveLength(10);
    expect(c.labels.filter((l) => l.blockingByDefault).map((l) => l.id).sort()).toEqual([
      'chore',
      'issue',
      'todo',
    ]);
    expect(c.labels.filter((l) => l.alwaysNonBlocking).map((l) => l.id).sort()).toEqual([
      'decision',
      'nitpick',
      'note',
      'thought',
    ]);
    expect(c.mode).toBe('assist');
    expect(c.formatSeverity).toBe('warn');
    expect(c.severities).toEqual({});
    expect(c.decorations.allowFree).toBe(true);
    expect(c.scope).toEqual({ validateReplies: false, validateReviewSummary: true });
    expect(c.resolverOverrideGroup).toEqual([]);
  });

  it('abréviations : uniques au moment du Tab, ?que/?qui séparés (§5.2)', () => {
    const abbr = defaultConfig().shortcuts.abbreviations;
    const keys = Object.keys(abbr);
    expect(new Set(keys).size).toBe(keys.length);
    expect(abbr['?que']).toBe('question: ');
    expect(abbr['?qui']).toBe('quibble: ');
  });
});

describe('§8.1.2 / §8.1.4 — précédence et fusion', () => {
  it('fichier de dépôt > organisation > défauts, fusion par id sans suppression', () => {
    const { config } = resolveConfig(
      null,
      found({ labels: [{ id: 'issue', color: '#111111' }], rules: { minSubjectLength: 3 } }),
      found({ labels: [{ id: 'issue', color: '#222222' }, { id: 'perf-note', blockingByDefault: false }] }),
      null,
      false
    );
    expect(config.labels.find((l) => l.id === 'issue')!.color).toBe('#222222');
    expect(config.labels.find((l) => l.id === 'perf-note')).toBeDefined();
    expect(config.labels).toHaveLength(14); // jamais de suppression
    expect(config.rules.minSubjectLength).toBe(3);
  });

  it('retirer un label passe par enabled:false, jamais par suppression (§8.1.4)', () => {
    const { config } = resolveConfig(null, absent, found({ labels: [{ id: 'chore', enabled: false }] }), null, false);
    expect(config.labels.find((l) => l.id === 'chore')!.enabled).toBe(false);
    expect(config.labels).toHaveLength(13);
  });

  it('severities fusionne par code ; exemptUsers par union', () => {
    const { config } = resolveConfig(
      null,
      found({ severities: { 'W-CASE': 'error' }, exemptUsers: ['bot-a'] }),
      found({ severities: { 'W-NO-DISCUSSION': 'off' }, exemptUsers: ['bot-b'] }),
      null,
      false
    );
    expect(config.severities).toEqual({ 'W-CASE': 'error', 'W-NO-DISCUSSION': 'off' });
    expect(config.exemptUsers).toEqual(['bot-a', 'bot-b']);
  });

  it('resolverOverrideGroup : intersection d’habilitation — les groupes déclarés s’accumulent', () => {
    const { config } = resolveConfig(
      { minimumMode: 'off', resolverOverrideGroup: ['org/leads'] },
      absent,
      found({ resolverOverrideGroup: ['org/security'] }),
      null,
      false
    );
    expect(config.resolverOverrideGroup.sort()).toEqual(['org/leads', 'org/security']);
  });
});

describe('§8.1.1 — plancher', () => {
  const floor: Floor = { floorVersion: 1, minimumMode: 'enforce', formatSeverity: 'error' };

  it('CA-14/CA-24 : un mode de dépôt sous le plancher est ignoré, et le fait signalé', () => {
    const { config, notices } = resolveConfig(floor, absent, found({ mode: 'off' }), null, false);
    expect(config.mode).toBe('enforce');
    expect(notices.some((n) => n.kind === 'floor-override' && n.ref === 'mode')).toBe(true);
  });

  it('durcir au-delà du plancher est permis', () => {
    const { config } = resolveConfig({ minimumMode: 'warn' }, absent, found({ mode: 'enforce' }), null, false);
    expect(config.mode).toBe('enforce');
  });

  it('formatSeverity : minimum sur sa propre échelle', () => {
    const { config } = resolveConfig(floor, absent, found({ formatSeverity: 'warn' }), null, false);
    expect(config.formatSeverity).toBe('error');
  });

  it('severities du plancher non abaissables', () => {
    const { config } = resolveConfig(
      { minimumMode: 'off', severities: { 'W-CASE': 'error' } },
      absent,
      found({ severities: { 'W-CASE': 'warn' } }),
      null,
      false
    );
    expect(config.severities['W-CASE']).toBe('error');
  });

  it('labels.minimum : enabled/blockingByDefault ne passent pas à false en dessous du plancher (§8.1.1)', () => {
    const { config, notices } = resolveConfig(
      { minimumMode: 'off', labels: { minimum: ['issue', 'todo'] } },
      absent,
      found({ labels: [{ id: 'issue', enabled: false }, { id: 'todo', blockingByDefault: false }, { id: 'chore', enabled: false }] }),
      null,
      false
    );
    expect(config.labels.find((l) => l.id === 'issue')!.enabled).toBe(true);
    expect(config.labels.find((l) => l.id === 'todo')!.blockingByDefault).toBe(true);
    expect(config.labels.find((l) => l.id === 'chore')!.enabled).toBe(false); // hors minimum : libre
    expect(notices.filter((n) => n.kind === 'floor-override').length).toBeGreaterThanOrEqual(2);
  });

  it('activation.activatedAt : min(plancher, niveau inférieur) — jamais max (§8.1.1)', () => {
    const { config } = resolveConfig(
      { minimumMode: 'off', activation: { activatedAt: '2026-06-01T00:00:00Z' } },
      absent,
      found({ activation: { activatedAt: '2026-09-01T00:00:00Z' } }),
      null,
      false
    );
    expect(config.activation.activatedAt).toBe('2026-06-01T00:00:00Z');
  });

  it('repousser la bascule dans le futur est l’assouplissement à interdire', () => {
    const { config } = resolveConfig(
      { minimumMode: 'off', activation: { activatedAt: '2026-06-01T00:00:00Z' } },
      absent,
      found({ activation: { activatedAt: '2099-01-01T00:00:00Z' } }),
      null,
      false
    );
    expect(config.activation.activatedAt).toBe('2026-06-01T00:00:00Z');
  });

  it('exemptUsers : minimum irrétirable ; closed interdit tout ajout (§8.1.1)', () => {
    const open = resolveConfig(
      { minimumMode: 'off', exemptUsers: { minimum: ['svc-bot'], closed: false } },
      absent,
      found({ exemptUsers: ['moi-meme'] }),
      null,
      false
    );
    expect(open.config.exemptUsers.sort()).toEqual(['moi-meme', 'svc-bot']);
    const closed = resolveConfig(
      { minimumMode: 'off', exemptUsers: { minimum: ['svc-bot'], closed: true } },
      absent,
      found({ exemptUsers: ['moi-meme'] }),
      null,
      false
    );
    expect(closed.config.exemptUsers).toEqual(['svc-bot']); // un dépôt ne s'ajoute pas lui-même
  });

  it('configCacheTtlSeconds : valeur imposée, ni minimum ni maximum (§8.1.3 règle 4)', () => {
    const { config } = resolveConfig(
      { minimumMode: 'off', configCacheTtlSeconds: 600 },
      absent,
      found({ configCacheTtlSeconds: 60 }),
      null,
      false
    );
    expect(config.configCacheTtlSeconds).toBe(600);
  });

  it('plancher absent = {minimumMode: off}, aucune règle imposée', () => {
    const { config } = resolveConfig(null, absent, found({ mode: 'off' }), null, false);
    expect(config.mode).toBe('off');
  });

  it('floorVersion non supportée : plancher non appliqué, repli assist, signalé (§8.1.1)', () => {
    const { config, notices } = resolveConfig(
      { floorVersion: 99, minimumMode: 'enforce' },
      absent,
      found({ mode: 'enforce' }),
      null,
      false
    );
    expect(config.mode).toBe('assist');
    expect(notices.some((n) => n.kind === 'unsupported-version')).toBe(true);
  });
});

describe('§8.1.5 — configuration absente, illisible ou invalide', () => {
  it('JSON invalide : repli sur le dernier niveau valide + invalid-config avec la ligne fautive', () => {
    const { config, notices } = resolveConfig(
      null,
      found({ mode: 'warn' }),
      foundText('{\n  "mode": "warn",\n  oops\n}'),
      null,
      true
    );
    expect(config.mode).toBe('warn'); // organisation, puis défauts
    const notice = notices.find((n) => n.kind === 'invalid-config');
    expect(notice).toBeDefined();
    expect(notice!.message).toMatch(/line \d+/);
  });

  it('valeur hors domaine pour une clé connue ("mode": "banana") : document invalide', () => {
    const { config, notices } = resolveConfig(null, absent, found({ mode: 'banana' }), null, true);
    expect(config.mode).toBe('assist'); // défauts
    expect(notices.some((n) => n.kind === 'invalid-config')).toBe(true);
  });

  it('clé inconnue : simplement ignorée avec avertissement, aucun repli (§8.1.5)', () => {
    const { config, notices } = resolveConfig(
      null,
      absent,
      found({ mode: 'enforce', futureKey: true }),
      null,
      false
    );
    expect(config.mode).toBe('enforce'); // la contrainte ne disparaît pas
    expect(notices.some((n) => n.kind === 'config-warning' && n.ref === 'futureKey')).toBe(true);
    expect(notices.some((n) => n.kind === 'invalid-config')).toBe(false);
  });

  it('fichier absent + jamais évalué : nominal, aucun notice', () => {
    const { notices } = resolveConfig(null, absent, absent, null, false);
    expect(notices).toEqual([]);
  });

  it('CA-29 : fichier absent + dépôt déjà évalué → config-vanished', () => {
    const { notices } = resolveConfig(null, absent, absent, null, true);
    expect(notices.some((n) => n.kind === 'config-vanished')).toBe(true);
  });

  it('version de schéma supérieure : repli assist, ou plancher si plus strict, signalé', () => {
    const noFloor = resolveConfig(null, absent, found({ version: 99, mode: 'enforce' }), null, false);
    expect(noFloor.config.mode).toBe('assist');
    expect(noFloor.notices.some((n) => n.kind === 'unsupported-version')).toBe(true);
    const withFloor = resolveConfig(
      { minimumMode: 'warn' },
      absent,
      found({ version: 99, mode: 'enforce' }),
      null,
      false
    );
    expect(withFloor.config.mode).toBe('warn'); // le plancher en vigueur, plus strict
  });

  it('coreMinVersion non satisfaite : même repli, mot pour mot', () => {
    const { config, notices } = resolveConfig(null, absent, found({ coreMinVersion: '99.0.0', mode: 'enforce' }), null, false);
    expect(config.mode).toBe('assist');
    expect(notices.some((n) => n.kind === 'unsupported-version')).toBe(true);
  });

  it('lecture impossible (unreachable) : niveau sauté — la dégradation est l’affaire de l’appelant', () => {
    const { config } = resolveConfig(
      null,
      { status: 'unreachable', reason: 'network' },
      found({ mode: 'warn' }),
      null,
      false
    );
    expect(config.mode).toBe('warn');
  });

  it('configUrl posée dans le fichier de dépôt : ignorée et signalée (§8.1.2)', () => {
    const { config, notices } = resolveConfig(
      { minimumMode: 'off', configUrl: 'https://interne.example/org.json' },
      absent,
      found({ configUrl: 'https://depot-pirate.example/ma-config.json' }),
      null,
      false
    );
    expect(config.configUrl).toBe('https://interne.example/org.json');
    expect(notices.some((n) => n.kind === 'config-warning' && n.ref === 'configUrl')).toBe(true);
  });
});

describe('§8.2 — bornes statiques des allowlistPatterns', () => {
  it('quantificateur imbriqué détecté statiquement', () => {
    expect(hasNestedQuantifier('^(a+)+$')).toBe(true);
    expect(hasNestedQuantifier('(\\d{2,4})*')).toBe(true);
    expect(hasNestedQuantifier('^LGTM$')).toBe(false);
    expect(hasNestedQuantifier('^(approved|lgtm)$')).toBe(false);
    expect(hasNestedQuantifier('a+b*c?')).toBe(false);
    expect(hasNestedQuantifier('(abc)+')).toBe(false); // groupe quantifié sans quantificateur interne
    expect(hasNestedQuantifier('[a+]+')).toBe(false); // classe de caractères, pas un groupe
  });

  it('motif trop long ou invalide : ignoré et signalé, les autres conservés', () => {
    const { config, notices } = resolveConfig(
      null,
      absent,
      found({ allowlistPatterns: ['^LGTM$', 'a'.repeat(300), '^(a+)+$', '[invalid'] }),
      null,
      false
    );
    expect(config.allowlistPatterns).toEqual(['^LGTM$']);
    expect(notices.filter((n) => n.kind === 'config-warning')).toHaveLength(3);
  });
});

describe('§9.2.2 — empreinte de configuration', () => {
  it('déterministe et bornée (8 hexadécimaux)', () => {
    const a = fingerprint(defaultConfig());
    const b = fingerprint(defaultConfig());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('les clés qui gouvernent le verdict font diverger l’empreinte', () => {
    const base = fingerprint(defaultConfig());
    const c = defaultConfig();
    c.mode = 'enforce';
    expect(fingerprint(c)).not.toBe(base);
  });

  it('les clés exclues du domaine ne la font jamais diverger (§9.2.2)', () => {
    const base = fingerprint(defaultConfig());
    const c = defaultConfig();
    c.language = 'fr';
    c.badgeStyle = 'flat';
    c.docUrl = 'https://autre.example/';
    c.overrideLabel = 'autre-etiquette';
    c.resolverOverrideGroup = ['org/leads'];
    c.configCacheTtlSeconds = 60;
    c.coreMinVersion = '1.2.0';
    c.server.gracePeriodSeconds = 60;
    c.telemetry.enabled = true;
    c.labels[0]!.color = '#ff0000';
    c.labels[0]!.icon = '🔥';
    c.shortcuts.abbreviations['?x'] = 'issue: ';
    expect(fingerprint(c)).toBe(base);
  });

  it('l’ordre des listes non significatives n’influe pas', () => {
    const a = defaultConfig();
    a.exemptUsers = ['b', 'a'];
    const b = defaultConfig();
    b.exemptUsers = ['a', 'b'];
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('CA-40 : la casse d’une entrée toolCommands ne fait pas diverger l’empreinte', () => {
    const a = defaultConfig();
    a.toolCommands = ['@Codex'];
    const b = defaultConfig();
    b.toolCommands = ['@codex'];
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('exemptUsers : un doublon de casse ne fabrique pas de désaccord non plus (§4.2)', () => {
    // `exemptUsers` est l'AUTRE membre du domaine dont la comparaison est insensible à la
    // casse : il court exactement le même risque, et le corrige de la même façon.
    const server = defaultConfig();
    server.exemptUsers = ['Dependabot[bot]', 'dependabot[bot]'];
    const extension = defaultConfig();
    extension.exemptUsers = ['dependabot[bot]'];
    expect(fingerprint(server)).toBe(fingerprint(extension));
  });

  it('CA-40 : un doublon de casse ne fabrique pas de désaccord (§8.1.3, règle 2)', () => {
    // Ce que l’union du §8.1.4 produit après une correction de casse sur une PR épinglée :
    // le serveur porte les deux orthographes, l’extension une seule. Les deux exemptent
    // exactement les mêmes commentaires — l’empreinte doit le refléter, sans quoi la
    // règle 2 désarmerait le blocage d’envoi en permanence.
    const server = defaultConfig();
    server.toolCommands = ['@Codex', '@codex'];
    const extension = defaultConfig();
    extension.toolCommands = ['@codex'];
    expect(fingerprint(server)).toBe(fingerprint(extension));
  });
});
