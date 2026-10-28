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
const FAMILY = { labels: RESPONSE_LABELS.map((l) => ({ id: l.id, enabled: true })) };

const input = (body: string, zone: Zone = 'thread-root'): ValidationInput => ({
  body,
  platform: githubProfile,
  isSystemGenerated: false,
  zone,
  canCarryBlockingState: zone === 'thread-root',
});
const codes = (body: string, config: EffectiveConfig, zone?: Zone) =>
  validate(input(body, zone), config).map((d) => d.code);

describe('CA-41 — vocabulaire de réponse éteint : comportement strictement identique', () => {
  it("l'empreinte par défaut est la valeur LITTÉRALE d'avant la famille (§9.2.2)", () => {
    // Le seul garde qui attrape un futur label livré désactivé sans règle d'omission : sans
    // elle, cette valeur devient `5aa9ab2e`, et la règle 2 du §8.1.3 désarme le blocage
    // d'envoi sur tout le parc pendant le décalage de versions.
    expect(fingerprint(defaultConfig())).toBe('becd76df');
    expect(fingerprint(resolveConfig(null, absent, absent, null, false).config)).toBe('becd76df');
  });

  it('les labels actifs sont les dix d’avant, et la famille est livrée désactivée', () => {
    expect(enabledLabels(defaultConfig()).map((l) => l.id)).toEqual([
      'praise', 'nitpick', 'suggestion', 'issue', 'todo', 'question', 'thought', 'chore', 'note', 'decision',
    ]);
    for (const r of RESPONSE_LABELS) expect(defaultConfig().labels.find((l) => l.id === r.id)!.enabled).toBe(false);
  });

  it('éteint, un label de réponse est un mot inconnu comme un autre', () => {
    expect(codes('done: rebasé sur main', defaultConfig())).toEqual(['E-UNKNOWN-LABEL']);
    expect(resolveLabel('fixed', defaultConfig())).toBeNull(); // un alias d'un label éteint non plus
  });

  it("contre-épreuve : une équipe qui possédait son propre `done` et l'a éteint garde une empreinte DISTINCTE", () => {
    // La condition d'intégrité de la règle d'omission : sous une condition naïve (« de la
    // famille et désactivé »), cette déclaration serait effacée et s'effondrerait sur `becd76df`.
    const squatter = repo({ labels: [{ id: 'done', enabled: false, blockingByDefault: true }] }).config;
    expect(fingerprint(squatter)).toBe('cc22fc9c');
    expect(fingerprint(squatter)).not.toBe('becd76df');
    // Une entrée qui dit seulement « éteint » est sémantiquement celle d'un dépôt vierge.
    expect(fingerprint(repo({ labels: [{ id: 'done', enabled: false }] }).config)).toBe('becd76df');
  });

  it("la liste d'omission EST la famille que le §3.2 déclare — identifiants et alias", () => {
    // Le second garde du §9.2.2 : la règle met une liste close d'identifiants dans la
    // projection, exactement la forme qui vieillit. Le tableau du §3.2 fait foi.
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

describe('CA-42 — vocabulaire allumé : des labels ordinaires, les mêmes mécanismes', () => {
  const on = () => repo(FAMILY).config;

  it('mêmes diagnostics que tout autre label, aucun code nouveau', () => {
    expect(codes('Done: rebasé sur main', on())).toEqual(['W-CASE']);
    expect(codes('ack:', on())).toEqual(['E-EMPTY-SUBJECT']);
    expect(codes('done (blocking): rebasé sur main', on())).toEqual(['E-CONFLICT']); // §3.3, règle 1
    expect(codes('done (perf*): rebasé sur main', on())).toEqual(['E-DECORATION-SYNTAX']);
    expect(codes('disagree: la correspondance est volontairement indépendante', on())).toEqual([]);
  });

  it("l'alias est reconnu sans diagnostic — `fixed` vaut `done`", () => {
    expect(codes('fixed: corrige ce point', on())).toEqual([]);
    expect(resolveLabel('fixed', on())!.label.id).toBe('done');
    expect(resolveLabel('acknowledged', on())!.label.id).toBe('ack');
  });

  it("aucun d'eux n'est bloquant, et le mode effectif ne bouge pas", () => {
    for (const id of ['ack', 'done', 'disagree']) {
      expect(isBlocking(input(`${id}: un sujet assez long`), on()), id).toBe(false);
    }
    expect(on().mode).toBe(defaultConfig().mode);
  });
});

describe('CA-43 — orthogonalité avec `scope.validateReplies`', () => {
  it('avec les défauts, une réponse de fil n’exige aucun label, vocabulaire éteint ou allumé', () => {
    const off = defaultConfig();
    const on = repo(FAMILY).config;
    for (const config of [off, on]) {
      expect(codes('done: rebasé sur main', config, 'reply')).toEqual([]);
      expect(codes('dnoe: rebasé sur main', config, 'reply')).toEqual([]);
      expect(codes('ack: ok', config, 'reply')).toEqual([]); // sujet court : la zone est éteinte
      expect(codes('Corrigé, merci', config, 'reply')).toEqual([]); // CA-07
    }
  });

  it("le barreau de reprise de l'étage −2 reste `decision`, et lui seul", () => {
    const on = repo(FAMILY).config;
    expect(codes('decision: trop court', on, 'reply')).toEqual(['E-DECISION-SUBJECT']);
    expect(codes('disagree: trop court', on, 'reply')).toEqual([]);
  });

  it("activer le vocabulaire ne touche jamais `scope`", () => {
    expect(repo(FAMILY).config.scope).toEqual(defaultConfig().scope);
  });
});

describe('CA-44 — le plancher ne rend jamais bloquant un label toujours non bloquant', () => {
  it('imposer la famille force `enabled` et laisse le caractère non bloquant', () => {
    const { config } = resolveConfig(
      { floorVersion: 1, labels: { minimum: ['ack', 'done', 'disagree'] } },
      absent,
      absent,
      null,
      false
    );
    for (const id of ['ack', 'done', 'disagree']) {
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
  it('activer un seul label, en désactiver un que l’organisation activait, surcharger sans tout redire', () => {
    const one = repo({ labels: [{ id: 'done', enabled: true }] }).config;
    expect(enabledLabels(one).filter((l) => RESPONSE_LABELS.some((r) => r.id === l.id)).map((l) => l.id)).toEqual(['done']);

    const orgAll = found(FAMILY);
    const minusAck = repo({ labels: [{ id: 'ack', enabled: false }] }, null, orgAll).config;
    expect(minusAck.labels.find((l) => l.id === 'ack')!.enabled).toBe(false);
    expect(minusAck.labels.find((l) => l.id === 'done')!.enabled).toBe(true);

    const recoloured = repo({ labels: [{ id: 'done', enabled: true, color: '#123456' }] }).config;
    const done = recoloured.labels.find((l) => l.id === 'done')!;
    expect([done.color, done.alwaysNonBlocking, done.aliases]).toEqual(['#123456', true, ['fixed']]);
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
    // Le `done` livré éteint porte l'alias `fixed` : un label `fixed` d'équipe ne déclenche rien.
    const team = repo({ labels: [{ id: 'fixed' }] });
    expect(team.notices.filter((n) => n.kind === 'config-warning')).toEqual([]);
  });

  it("migration d'un `done` préexistant : il faut `enabled` ET `alwaysNonBlocking` (§8.2)", () => {
    const before = { id: 'done', blockingByDefault: true };
    expect(codes('done: corrige ce point', repo({ labels: [before] }).config)).toEqual(['E-UNKNOWN-LABEL']);
    expect(codes('done: corrige ce point', repo({ labels: [{ ...before, alwaysNonBlocking: false }] }).config)).toEqual([
      'E-UNKNOWN-LABEL',
    ]);
    expect(
      codes('done: corrige ce point', repo({ labels: [{ ...before, enabled: true, alwaysNonBlocking: false }] }).config)
    ).toEqual(['W-NO-DISCUSSION']);
  });
});

describe('CA-46 — activation en direct, et sans effet possible sur le critère 2', () => {
  it('éteint après usage : `E-UNKNOWN-LABEL` en zone validée, rien dans une réponse non validée', () => {
    const off = defaultConfig();
    expect(codes('done: rebasé sur main', off, 'thread-root')).toEqual(['E-UNKNOWN-LABEL']);
    expect(codes('done: rebasé sur main', off, 'reply')).toEqual([]);
  });

  it('aucun label de réponse ne peut rendre une racine bloquante', () => {
    // Le §8.1.3 avertit qu'activer un label peut rendre bloquantes, sur toutes les PR ouvertes,
    // des racines non résolues : pas celui-là, quelle que soit la façon de l'écrire.
    const on = repo(FAMILY).config;
    for (const r of RESPONSE_LABELS) {
      expect([r.blockingByDefault, r.alwaysNonBlocking], r.id).toEqual([false, true]);
      for (const body of [`${r.id}: un sujet assez long`, `${r.id} (non-blocking): un sujet assez long`]) {
        expect(isBlocking(input(body), on), body).toBe(false);
      }
    }
  });
});
