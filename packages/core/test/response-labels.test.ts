// Labels de réponse (§3.2) : `ack`, `done`, `disagree`, livrés désactivés et activés par
// `labels[].enabled`, sans clé propre (§8.2). Un fichier par famille plutôt qu'un critère dispersé
// dans quatre suites : c'est ensemble que ces critères disent « éteint, rien ne change ; allumé,
// ce sont des labels ordinaires ».

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/resolve.js';
import { defaultConfig, RESPONSE_LABELS } from '../src/config/defaults.js';
import { fingerprint } from '../src/config/fingerprint.js';
import { enabledLabels, resolveLabel } from '../src/parser.js';
import { isBlocking, validate } from '../src/validator.js';
import type { ConfigRead, EffectiveConfig, Floor, ValidationInput, Zone } from '../src/types.js';
import { githubProfile } from './helpers.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });
const repo = (o: object, floor: Floor | null = null, org: ConfigRead = absent) =>
  resolveConfig(floor, org, found(o), null, false);
// Un dépôt qui s'en tient à Conventional Comments : les labels de réponse, livrés activés, désactivés.
const OFF = { labels: RESPONSE_LABELS.map((l) => ({ id: l.id, enabled: false })) };

const input = (body: string, zone: Zone = 'thread-root'): ValidationInput => ({
  body,
  platform: githubProfile,
  isSystemGenerated: false,
  zone,
  canCarryBlockingState: zone === 'thread-root',
});
const codes = (body: string, config: EffectiveConfig, zone?: Zone) =>
  validate(input(body, zone), config).map((d) => d.code);

describe('CA-41 — vocabulaire de réponse désactivé par un dépôt : comportement d’avant la famille', () => {
  it("l'empreinte par défaut est la valeur LITTÉRALE, et elle a quitté celle d'avant la famille (§9.2.2)", () => {
    // Le garde du §9.2.2 : un changement de défaut qui n'aurait pas été décidé déplace cette
    // valeur. Le déplacement depuis `becd76df` EST décidé — avec les défauts, `done:` est un
    // label ici et un mot inconnu pour un `core/` antérieur.
    expect(fingerprint(defaultConfig())).toBe('96b86cbd');
    expect(fingerprint(resolveConfig(null, absent, absent, null, false).config)).toBe('96b86cbd');
  });

  it('désactivée par un dépôt, la famille mesure `b9a2998f` — ses entrées restent projetées', () => {
    expect(fingerprint(repo(OFF).config)).toBe('b9a2998f');
  });

  it('actifs par défaut : les dix d’avant, puis les quatre labels de réponse, de type `reply`', () => {
    const ten = ['praise', 'nitpick', 'suggestion', 'issue', 'todo', 'question', 'thought', 'chore', 'note', 'decision'];
    expect(enabledLabels(defaultConfig()).map((l) => l.id)).toEqual([...ten, 'ack', 'done', 'disagree', 'reviewed']);
    expect(enabledLabels(repo(OFF).config).map((l) => l.id)).toEqual(ten);
    for (const l of defaultConfig().labels) {
      expect(l.kind, l.id).toBe(RESPONSE_LABELS.some((r) => r.id === l.id) ? 'reply' : 'remark');
    }
  });

  it('désactivé, un label de réponse est un mot inconnu comme un autre', () => {
    expect(codes('done: rebasé sur main', repo(OFF).config)).toEqual(['E-UNKNOWN-LABEL']);
    expect(codes('reviewed: rien à ajouter', repo(OFF).config)).toEqual(['E-UNKNOWN-LABEL']);
    expect(resolveLabel('fixed', repo(OFF).config)).toBeNull(); // un alias d'un label désactivé non plus
  });

  it('contre-épreuve : aucune entrée de `labels` n’est omise de la projection', () => {
    // La règle d'omission retirée (§9.2.2) aurait effacé ici une différence qui change les
    // verdicts : `done:` reconnu d'un côté, inconnu de l'autre.
    expect(fingerprint(repo({ labels: [{ id: 'done', enabled: false }] }).config)).not.toBe('96b86cbd');
    expect(fingerprint(repo({ labels: [{ id: 'done', enabled: false }] }).config)).not.toBe('becd76df');
  });

  it('la famille livrée EST celle que le §3.2 déclare — identifiants et alias', () => {
    // Une liste close d'identifiants, la forme qui vieillit : le tableau du §3.2 fait foi.
    const spec = readFileSync(new URL('../../../specifications-fr.md', import.meta.url), 'utf8');
    const block = spec.slice(spec.indexOf('**Labels de réponse — extension du produit'));
    const table = block.slice(0, block.indexOf('\n\n', block.indexOf('| Label |')));
    const rows = [...table.matchAll(/^\| `([a-z]+)` \|[^\n]*\| ([^|\n]*) \|$/gm)].map((m) => ({
      id: m[1],
      aliases: [...m[2]!.matchAll(/`([a-z]+)`/g)].map((a) => a[1]),
    }));
    expect(rows.length).toBeGreaterThan(0);
    expect(RESPONSE_LABELS.map((l) => ({ id: l.id, aliases: [...l.aliases] }))).toEqual(rows);
  });
});

describe('CA-42 — vocabulaire actif : des labels ordinaires, les mêmes mécanismes', () => {
  const on = () => defaultConfig();

  it('mêmes diagnostics que tout autre label, aucun code nouveau', () => {
    expect(codes('Done: rebasé sur main', on())).toEqual(['W-CASE']);
    expect(codes('ack:', on())).toEqual(['E-EMPTY-SUBJECT']);
    expect(codes('done (blocking): rebasé sur main', on())).toEqual(['E-CONFLICT']); // §3.3, règle 1
    expect(codes('done (perf*): rebasé sur main', on())).toEqual(['E-DECORATION-SYNTAX']);
    expect(codes('disagree: la correspondance est volontairement indépendante', on())).toEqual([]);
    expect(codes('reviewed: rien à ajouter', on())).toEqual([]);
  });

  it('le type `reply` ne change aucun verdict, ni l’empreinte', () => {
    const asReply = repo({ labels: [{ id: 'note', kind: 'reply' }] }).config;
    for (const body of ['note: ce module part en refonte', 'Note: x', 'note (blocking): ce module part en refonte']) {
      expect(codes(body, asReply), body).toEqual(codes(body, on()));
    }
    expect(fingerprint(asReply)).toBe(fingerprint(on()));
  });

  it("l'alias est reconnu sans diagnostic — `fixed` vaut `done`", () => {
    expect(codes('fixed: corrige ce point', on())).toEqual([]);
    expect(resolveLabel('fixed', on())!.label.id).toBe('done');
    expect(resolveLabel('acknowledged', on())!.label.id).toBe('ack');
  });

  it("aucun d'eux n'est bloquant, et le mode effectif ne bouge pas", () => {
    for (const id of ['ack', 'done', 'disagree', 'reviewed']) {
      expect(isBlocking(input(`${id}: un sujet assez long`), on()), id).toBe(false);
    }
    expect(on().mode).toBe(defaultConfig().mode);
  });
});

describe('CA-43 — orthogonalité avec `scope.validateReplies`', () => {
  it('avec les défauts, une réponse de fil n’exige aucun label, vocabulaire actif ou désactivé', () => {
    const off = repo(OFF).config;
    const on = defaultConfig();
    for (const config of [off, on]) {
      expect(codes('done: rebasé sur main', config, 'reply')).toEqual([]);
      expect(codes('dnoe: rebasé sur main', config, 'reply')).toEqual([]);
      expect(codes('ack: ok', config, 'reply')).toEqual([]); // sujet court : la zone est éteinte
      expect(codes('Corrigé, merci', config, 'reply')).toEqual([]); // CA-07
    }
  });

  it("le barreau de reprise de l'étage −2 reste `decision`, et lui seul", () => {
    const on = defaultConfig();
    expect(codes('decision: trop court', on, 'reply')).toEqual(['E-DECISION-SUBJECT']);
    expect(codes('disagree: trop court', on, 'reply')).toEqual([]);
  });

  it("désactiver le vocabulaire ne touche jamais `scope`", () => {
    expect(repo(OFF).config.scope).toEqual(defaultConfig().scope);
  });
});

describe('CA-44 — le plancher ne rend jamais bloquant un label toujours non bloquant', () => {
  it('imposer la famille force `enabled` et laisse le caractère non bloquant', () => {
    const { config } = resolveConfig(
      { floorVersion: 1, labels: { minimum: ['ack', 'done', 'disagree', 'reviewed'] } },
      absent,
      absent,
      null,
      false
    );
    for (const id of ['ack', 'done', 'disagree', 'reviewed']) {
      const l = config.labels.find((x) => x.id === id)!;
      expect([l.enabled, l.blockingByDefault, l.alwaysNonBlocking], id).toEqual([true, false, true]);
    }
    expect(isBlocking(input('done: rebasé sur main'), config)).toBe(false);
  });

  it('contre-épreuve : un dépôt ne désarme pas un `issue` planché en le déclarant toujours non bloquant', () => {
    // Écrite sur l'`alwaysNonBlocking` EFFECTIF, l'exception s'y serait déclenchée sur le
    // drapeau que le dépôt venait de poser, et `issue:` aurait cessé de bloquer (§8.1.1).
    const { config, notices } = repo(
      { labels: [{ id: 'issue', blockingByDefault: false, alwaysNonBlocking: true }] },
      { floorVersion: 1, minimumMode: 'enforce', labels: { minimum: ['issue'] } }
    );
    const issue = config.labels.find((l) => l.id === 'issue')!;
    expect([issue.blockingByDefault, issue.alwaysNonBlocking]).toEqual([true, false]);
    expect(isBlocking(input('issue: le nom est ambigu'), config)).toBe(true);
    expect(notices.map((n) => n.ref)).toContain('labels.issue.alwaysNonBlocking');
  });

  it('un label maison planché, que le produit ne livre pas, reste rendu bloquant', () => {
    // Lu à la lettre, « la valeur livrée » n'existe pas pour lui : il compte comme livré
    // `alwaysNonBlocking: false`, et le plancher le traite comme il l'a toujours fait (§8.1.1).
    const { config } = repo(
      { labels: [{ id: 'security', blockingByDefault: false, alwaysNonBlocking: true }] },
      { floorVersion: 1, labels: { minimum: ['security'] } }
    );
    const l = config.labels.find((x) => x.id === 'security')!;
    expect([l.blockingByDefault, l.alwaysNonBlocking]).toEqual([true, false]);
  });

  it('contre-épreuve sur le défaut antérieur : `decision` planché ne devient pas bloquant', () => {
    const { config } = resolveConfig({ floorVersion: 1, labels: { minimum: ['decision'] } }, absent, absent, null, false);
    const d = config.labels.find((l) => l.id === 'decision')!;
    expect([d.blockingByDefault, d.alwaysNonBlocking]).toEqual([false, true]);
  });
});

describe('CA-45 — le dépôt garde la maîtrise de son vocabulaire', () => {
  it('désactiver un seul label, en réactiver un que l’organisation désactivait, surcharger sans tout redire', () => {
    const minusDone = repo({ labels: [{ id: 'done', enabled: false }] }).config;
    expect(enabledLabels(minusDone).filter((l) => l.kind === 'reply').map((l) => l.id)).toEqual(['ack', 'disagree', 'reviewed']);

    const orgOff = found(OFF);
    const plusAck = repo({ labels: [{ id: 'ack', enabled: true }] }, null, orgOff).config;
    expect(plusAck.labels.find((l) => l.id === 'ack')!.enabled).toBe(true);
    expect(plusAck.labels.find((l) => l.id === 'done')!.enabled).toBe(false);

    const recoloured = repo({ labels: [{ id: 'done', color: '#123456' }] }).config;
    const done = recoloured.labels.find((l) => l.id === 'done')!;
    expect([done.color, done.enabled, done.alwaysNonBlocking, done.kind, done.aliases]).toEqual(['#123456', true, true, 'reply', ['fixed']]);

    const retyped = repo({ labels: [{ id: 'done', kind: 'remark' }] }).config.labels.find((l) => l.id === 'done')!;
    expect([retyped.kind, retyped.enabled, retyped.alwaysNonBlocking, retyped.aliases]).toEqual(['remark', true, true, ['fixed']]);
  });

  it("un identifiant l'emporte sur un alias, et c'est l'alias qui est retiré — jamais le label", () => {
    const { config, notices } = repo({ labels: [{ id: 'memo', aliases: ['note', 'memorandum'] }] });
    expect(resolveLabel('note', config)!.label.id).toBe('note');
    expect(config.labels.find((l) => l.id === 'memo')!.aliases).toEqual(['memorandum']);
    expect(notices.some((n) => n.kind === 'config-warning' && n.ref === 'labels.memo.aliases')).toBe(true);
  });

  it("l'ordre de `labels[]` ne décide d'aucun verdict", () => {
    const a = { id: 'alpha', aliases: ['shared'] };
    const b = { id: 'beta', aliases: ['shared'] };
    for (const labels of [[a, b], [b, a]]) {
      const { config } = repo({ labels });
      expect(resolveLabel('shared', config), JSON.stringify(labels.map((l) => l.id))).toBeNull();
      expect(fingerprint(config)).toBe(fingerprint(repo({ labels: [a, b] }).config));
    }
  });

  it('sous un plancher qui impose `issue`, un alias `issue` posé par le dépôt ne le masque pas', () => {
    // Le contournement signalé en revue (Codex, PR #88) : avec une règle « la définition livrée
    // cède », le `issue` planché disparaissait de la liste, et le plancher ne le recréait pas.
    const { config } = repo(
      { labels: [{ id: 'maison', blockingByDefault: false, alwaysNonBlocking: true, aliases: ['issue'] }] },
      { floorVersion: 1, minimumMode: 'enforce', labels: { minimum: ['issue'] } }
    );
    expect(resolveLabel('issue', config)!.label.id).toBe('issue');
    expect(isBlocking(input('issue: le nom est ambigu'), config)).toBe(true);
  });

  it('un label désactivé ne retire rien à un label actif', () => {
    const { config, notices } = repo({ labels: [{ id: 'memo', enabled: false, aliases: ['note'] }] });
    expect(config.labels.find((l) => l.id === 'memo')!.aliases).toEqual(['note']);
    expect(notices.filter((n) => n.ref?.startsWith('labels.memo'))).toEqual([]);
    // Un `done` désactivé porte l'alias `fixed` : un label `fixed` d'équipe ne déclenche rien.
    const team = repo({ labels: [{ id: 'done', enabled: false }, { id: 'fixed' }] });
    expect(team.notices.filter((n) => n.kind === 'config-warning')).toEqual([]);
    // Actif — c'est le défaut —, il le perd au profit de l'identifiant, et c'est signalé.
    const active = repo({ labels: [{ id: 'fixed' }] });
    expect(active.config.labels.find((l) => l.id === 'done')!.aliases).toEqual([]);
    expect(active.notices.some((n) => n.kind === 'config-warning' && n.ref === 'labels.done.aliases')).toBe(true);
  });

  it("migration d'un `done` préexistant : il suffit de `alwaysNonBlocking` (§8.2)", () => {
    // Le `done` livré est actif : l'entrée de l'équipe fusionne avec lui et hérite de
    // `alwaysNonBlocking: true`. Son `done:` reste bloquant — la paire composée par la fusion —,
    // mais son `done (blocking):` jusque-là valide produit `E-CONFLICT`.
    const before = { id: 'done', blockingByDefault: true };
    expect(codes('done (blocking): corrige ce point', repo({ labels: [before] }).config)).toEqual([
      'E-CONFLICT',
      'W-NO-DISCUSSION',
    ]);
    expect(isBlocking(input('done: corrige ce point'), repo({ labels: [before] }).config)).toBe(true);
    const repaired = repo({ labels: [{ ...before, alwaysNonBlocking: false }] }).config;
    expect(codes('done (blocking): corrige ce point', repaired)).toEqual(['W-NO-DISCUSSION']);
    expect(repaired.labels.find((l) => l.id === 'done')!.kind).toBe('reply');
  });
});

describe('CA-46 — activation en direct, et sans effet possible sur le critère 2', () => {
  it('désactivé après usage : `E-UNKNOWN-LABEL` en zone validée, rien dans une réponse non validée', () => {
    const off = repo(OFF).config;
    expect(codes('done: rebasé sur main', off, 'thread-root')).toEqual(['E-UNKNOWN-LABEL']);
    expect(codes('done: rebasé sur main', off, 'reply')).toEqual([]);
  });

  it('aucun label de réponse ne peut rendre une racine bloquante', () => {
    // Le §8.1.3 avertit qu'activer un label peut rendre bloquantes, sur toutes les PR ouvertes,
    // des racines non résolues : pas celui-là, quelle que soit la façon de l'écrire.
    const on = defaultConfig();
    for (const r of RESPONSE_LABELS) {
      expect([r.blockingByDefault, r.alwaysNonBlocking], r.id).toEqual([false, true]);
      for (const body of [`${r.id}: un sujet assez long`, `${r.id} (non-blocking): un sujet assez long`]) {
        expect(isBlocking(input(body), on), body).toBe(false);
      }
    }
  });
});

describe('CA-49 — le type d’un label se lit et se valide comme ses autres propriétés', () => {
  it('déclaré `reply`, retenu ; déclaré sans type, `remark` ; un label livré redéclaré garde le sien', () => {
    const { config } = repo({ labels: [{ id: 'merci', kind: 'reply' }, { id: 'maison' }, { id: 'ack', color: '#123456' }] });
    expect(config.labels.find((l) => l.id === 'merci')!.kind).toBe('reply');
    expect(config.labels.find((l) => l.id === 'maison')!.kind).toBe('remark');
    expect(config.labels.find((l) => l.id === 'ack')!.kind).toBe('reply');
  });

  it('une autre valeur rend la configuration invalide, comme toute propriété mal typée de `labels[]`', () => {
    const bad = repo({ labels: [{ id: 'merci', kind: 'answer' }] });
    const mistyped = repo({ labels: [{ id: 'merci', enabled: 'yes' }] });
    expect(bad.notices.some((n) => n.kind === 'invalid-config')).toBe(true);
    expect(bad.config.labels.find((l) => l.id === 'merci')).toBeUndefined();
    expect(mistyped.notices.some((n) => n.kind === 'invalid-config')).toBe(true);
    expect(bad.config.mode).toBe(mistyped.config.mode);
  });
});
