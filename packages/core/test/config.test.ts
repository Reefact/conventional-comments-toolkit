import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/resolve.js';
import { defaultConfig } from '../src/config/defaults.js';
import { hasNestedQuantifier } from '../src/config/schema.js';
import { fingerprint, fingerprintDomain } from '../src/config/fingerprint.js';
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

  it('CA-40 : une liste toolCommands vide ne fait PAS diverger l’empreinte (§8.1.3 r.5)', () => {
    // Compatibilité de l'ajout de la clé. L'entrée de fingerprint() est sérialisée en JSON :
    // un membre présent avec `[]` ne produit pas le même texte qu'un membre absent. Sans
    // l'omission, la mise à jour de `core/` changerait à elle seule l'empreinte de TOUT
    // dépôt — y compris ceux qui ne configurent rien —, et la règle 2 désarmerait le
    // blocage d'envoi partout pendant la fenêtre de décalage que la règle 5 dit normale.
    const c = defaultConfig();
    expect(c.toolCommands).toEqual([]);
    // Le membre est ABSENT de la projection — c'est le mécanisme, et c'est ce qui rend le
    // texte JSON identique à celui que produisait la version antérieure de `core/`.
    expect('toolCommands' in fingerprintDomain(c)).toBe(false);
    // Contre-épreuve : dès qu'une entrée existe, le membre apparaît et l'empreinte diverge
    // — c'est tout l'intérêt de faire entrer la clé dans le domaine.
    const avec = defaultConfig();
    avec.toolCommands = ['@codex'];
    expect('toolCommands' in fingerprintDomain(avec)).toBe(true);
    expect(fingerprint(avec)).not.toBe(fingerprint(c));
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

describe('§8.1.1 — le document de plancher est vérifié comme celui d’un dépôt', () => {
  // Le plancher est écrit par une administration, mais il arrive par le même chemin
  // qu’un fichier de dépôt : du JSON désérialisé. Ses entrées court-circuitaient les
  // filtres que `parseConfigDocument()` applique aux MÊMES clés, et sa forme n’était
  // vérifiée nulle part.

  it('un motif de plancher hors des bornes du §8.2 est écarté et signalé', () => {
    // Le cas qui compte : `^(a+)+$` est exactement ce que les bornes ReDoS interdisent
    // à un dépôt. Sans cette passe, un plancher l’imposait aux deux composants — le
    // navigateur du relecteur ET le service mutualisé.
    const floor: Floor = { allowlistPatterns: { minimum: ['^(a+)+$', '^ok$'] } };
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.allowlistPatterns).toEqual(['^ok$']);
    expect(notices.some((n) => n.kind === 'config-warning' && n.message.startsWith('floor: '))).toBe(true);
  });

  it('une entrée toolCommands hors grammaire est écartée et signalée', () => {
    const floor: Floor = { toolCommands: { minimum: ['LGTM', '@bot'] } };
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.toolCommands).toEqual(['@bot']);
    expect(notices.some((n) => n.kind === 'config-warning' && n.message.includes('floor: toolCommands'))).toBe(true);
  });

  it('l’avertissement dit que l’entrée vient du PLANCHER, pas d’un dépôt', () => {
    // Sans le préfixe, une administration qui débogue sa politique lit un message
    // identique à celui d’un fichier de dépôt et cherche au mauvais endroit.
    const floor: Floor = { toolCommands: { minimum: ['LGTM'] } };
    const repo = found({ toolCommands: ['NOPE'] });
    const { notices } = resolveConfig(floor, absent, repo, null, false);
    const warnings = notices.filter((n) => n.kind === 'config-warning' && n.ref === 'LGTM');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message.startsWith('floor: ')).toBe(true);
    expect(notices.some((n) => n.ref === 'NOPE' && !n.message.startsWith('floor: '))).toBe(true);
  });

  it('`{ closed: true }` sans `minimum` ne fait plus lever la résolution', () => {
    // `out[key] = [...rule.minimum]` sur un `minimum` absent : le type dit qu’il est
    // obligatoire, mais la valeur vient d’un JSON.parse, jamais d’un compilateur.
    const floor = { allowlistPatterns: { closed: true } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, found({ allowlistPatterns: ['^x$'] }), null, false);
    expect(config.allowlistPatterns).toEqual([]); // closed + minimum vide ferme la clé
    expect(notices.some((n) => n.ref === 'allowlistPatterns.minimum')).toBe(true);
  });

  it('un resolverOverrideGroup qui n’est pas un tableau ne fait plus lever', () => {
    const floor = { resolverOverrideGroup: 'org/team' } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.resolverOverrideGroup).toEqual([]);
    expect(notices.some((n) => n.ref === 'resolverOverrideGroup')).toBe(true);
  });

  it('un labels.minimum qui n’est pas un tableau ne fait plus lever', () => {
    const floor = { labels: { minimum: 'issue' } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, found({ labels: [{ id: 'issue', enabled: false }] }), null, false);
    expect(config.labels.find((l) => l.id === 'issue')!.enabled).toBe(false); // plancher vide : rien à protéger
    expect(notices.some((n) => n.ref === 'labels.minimum')).toBe(true);
  });

  it('un `closed` non booléen garde la liste FERMÉE, et le signale', () => {
    // `"closed": "true"` est la coquille JSON la plus banale. `=== true` la résolvait en
    // `false` et ROUVRAIT la liste : le dépôt regagnait des exemptions que l'administration
    // croyait avoir fermées. Régression dans le sens permissif — le seul interdit ici.
    const floor = { exemptUsers: { minimum: ['ci[bot]'], closed: 'true' } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, found({ exemptUsers: ['moi'] }), null, false);
    expect(config.exemptUsers).toEqual(['ci[bot]']); // fermée : l'ajout du dépôt est écarté
    expect(notices.some((n) => n.ref === 'exemptUsers.closed')).toBe(true);
  });

  it('`closed` absent laisse la liste ouverte, sans avertissement', () => {
    // Contre-épreuve du précédent : l'absence est le défaut du schéma, pas une faute.
    const floor: Floor = { exemptUsers: { minimum: ['ci[bot]'] } };
    const { config, notices } = resolveConfig(floor, absent, found({ exemptUsers: ['moi'] }), null, false);
    expect(config.exemptUsers).toEqual(expect.arrayContaining(['ci[bot]', 'moi']));
    expect(notices.some((n) => n.ref === 'exemptUsers.closed')).toBe(false);
  });

  it('une entrée non textuelle DANS le tableau est écartée et signalée', () => {
    // Le contrat annoncé est « écartée ET signalée ». Ne signaler que le tableau absent
    // laissait une politique à moitié appliquée en silence.
    const floor = { resolverOverrideGroup: ['org/securite', 42] } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.resolverOverrideGroup).toEqual(['org/securite']);
    expect(notices.some((n) => n.ref === 'resolverOverrideGroup' && n.message.includes('non-string'))).toBe(true);
  });

  it('P1 — une date d’activation invalide est écartée, pas installée', () => {
    // Le pire défaut de cette famille : `Date.parse("pas-une-date")` rend NaN, la
    // comparaison de périmètre du §6.2.3 devient fausse pour TOUTE PR, et `evaluate()`
    // publie `success` partout. Une coquille de plancher annulait l'enforcement d'une
    // organisation entière, sans que rien ne le signale.
    const floor = { activation: { activatedAt: 'pas-une-date' } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.activation.activatedAt).toBeNull(); // écartée : le défaut du produit
    expect(notices.some((n) => n.ref === 'activation.activatedAt')).toBe(true);

    // Et surtout : la date du dépôt survit au lieu d'être écrasée par la coquille. Sans
    // l'écart, `min(plancher, dépôt)` installait `NaN` et le périmètre du §6.2.3
    // devenait faux pour toute PR.
    const avecDepot = resolveConfig(floor, absent, found({ activation: { activatedAt: '2026-01-01T00:00:00Z' } }), null, false);
    expect(avecDepot.config.activation.activatedAt).toBe('2026-01-01T00:00:00Z');
    expect(Number.isNaN(Date.parse(avecDepot.config.activation.activatedAt!))).toBe(false);
  });

  it('une date d’activation valide passe intacte', () => {
    const floor: Floor = { activation: { activatedAt: '2026-09-01T00:00:00Z' } };
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.activation.activatedAt).toBe('2026-09-01T00:00:00Z');
    expect(notices.some((n) => n.ref === 'activation.activatedAt')).toBe(false);
  });

  it('une clé de plancher inconnue est écartée et signalée', () => {
    // `minimumMood` laisse l'administration croire son plancher posé alors que tout le
    // reste du code ignore la clé.
    const floor = { minimumMood: 'enforce' } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.mode).toBe('assist'); // le défaut produit : aucun plancher appliqué
    expect(notices.some((n) => n.ref === 'minimumMood' && n.message.includes('unknown floor key'))).toBe(true);
  });

  it('un configCacheTtlSeconds négatif est écarté, pas installé', () => {
    // Installé, il rendait tout cache inutilisable : `écoulé < -1000` est toujours faux,
    // donc relecture des deux niveaux à chaque évaluation et à chaque navigation.
    const floor = { configCacheTtlSeconds: -1 } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.configCacheTtlSeconds).toBeGreaterThanOrEqual(0);
    expect(notices.some((n) => n.ref === 'configCacheTtlSeconds')).toBe(true);
  });

  it('un minimumMode hors énumération est écarté et signalé', () => {
    const floor = { minimumMode: 'ENFORCE' } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.mode).toBe('assist');
    expect(notices.some((n) => n.ref === 'minimumMode')).toBe(true);
  });

  it('une sévérité de plancher hors énumération est écartée, les autres restent', () => {
    const floor = { severities: { 'E-NO-LABEL': 'error', 'E-UNKNOWN-LABEL': 'critique' } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, found({ severities: { 'E-NO-LABEL': 'warn' } }), null, false);
    expect(config.severities['E-NO-LABEL']).toBe('error'); // le plancher tient
    expect(notices.some((n) => n.ref === 'severities.E-UNKNOWN-LABEL')).toBe(true);
  });

  it('une version de plancher entre guillemets ne déclenche pas le repli par coercition', () => {
    // `"99" > 1` est vrai en JavaScript : la comparaison passait avant la vérification de
    // type, et une version mal écrite faisait retomber le plancher en `assist`.
    const floor = { floorVersion: '99', minimumMode: 'enforce' } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent, null, false);
    expect(config.mode).toBe('enforce'); // le plancher est appliqué, pas escamoté
    expect(notices.some((n) => n.ref === 'floorVersion')).toBe(true);
    expect(notices.some((n) => n.kind === 'unsupported-version')).toBe(false);
  });

  it('contre-épreuve : un plancher bien formé s’applique intégralement', () => {
    const floor: Floor = {
      minimumMode: 'enforce',
      exemptUsers: { minimum: ['ci[bot]'] },
      allowlistPatterns: { minimum: ['^ok$'] },
      toolCommands: { minimum: ['/*'] },
      labels: { minimum: ['issue'] },
      resolverOverrideGroup: ['org/champions'],
    };
    const { config, notices } = resolveConfig(floor, absent, found({ labels: [{ id: 'issue', enabled: false }] }), null, false);
    expect(config.mode).toBe('enforce');
    expect(config.exemptUsers).toContain('ci[bot]');
    expect(config.allowlistPatterns).toEqual(['^ok$']);
    expect(config.toolCommands).toEqual(['/*']);
    expect(config.labels.find((l) => l.id === 'issue')!.enabled).toBe(true);
    expect(config.resolverOverrideGroup).toEqual(['org/champions']);
    expect(notices.some((n) => n.kind === 'config-warning')).toBe(false);
  });
});
