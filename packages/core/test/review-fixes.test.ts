// Tests de non-régression des écarts confirmés par la revue de conformité adversariale
// (voir PROGRESS.md). Chaque test cite la règle de la spécification qu'il verrouille.

import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { resolveConfig } from '../src/config/resolve.js';
import { hasNestedQuantifier } from '../src/config/schema.js';
import { fingerprint } from '../src/config/fingerprint.js';
import { defaultConfig } from '../src/config/defaults.js';
import type { ConfigRead } from '../src/types.js';
import { comment, config, ctx, evalInput, thread, user } from './helpers.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });

describe('écart 1 — §6.3.2 : une exemption admise fait passer le statut au vert, critère 1 compris', () => {
  it('enforce + formatSeverity error + commentaire non conforme d’un tiers + exemption → success', () => {
    const lead = user('lead');
    const r = evaluate(
      evalInput({
        config: config((c) => {
          c.mode = 'enforce';
          c.formatSeverity = 'error';
        }),
        threads: [thread(comment('pas de label ici'))], // non conforme, inéditable par l'auteur de la PR (§4.2)
        ctx: ctx({
          exemption: { by: lead, at: '2026-10-05T00:00:00Z', labelPresent: true },
          isOverrideMember: (u) => u.id === lead.id,
        }),
      })
    );
    expect(r.state).toBe('success'); // « le statut passe au vert » (§6.3.2)
    expect(r.counts.nonCompliantComments).toBe(1); // compteurs non nuls, affichés (§6.5)
    expect(r.exemption?.by.login).toBe('lead');
  });
});

describe('écart 2 — §8.1.1 : le plancher `severities` est un minimum, jamais une valeur imposée', () => {
  it('un plancher warn sur un code E- (défaut error) n’abaisse pas la sévérité effective', () => {
    const { config: c } = resolveConfig(
      { minimumMode: 'off', severities: { 'E-NO-LABEL': 'warn' } },
      absent,
      absent,
      null,
      false
    );
    // Rien d'écrit en dessous : la sévérité effective reste celle du tableau §3.5.2 (error).
    expect(c.severities['E-NO-LABEL'] ?? 'error').toBe('error');
  });

  it('il relève une valeur écrite sous le plancher, et le défaut du tableau quand il est en dessous', () => {
    const raised = resolveConfig(
      { minimumMode: 'off', severities: { 'W-CASE': 'error' } },
      absent,
      found({ severities: { 'W-CASE': 'warn' } }),
      null,
      false
    );
    expect(raised.config.severities['W-CASE']).toBe('error');
    const fromDefault = resolveConfig(
      { minimumMode: 'off', severities: { 'W-CASE': 'error' } },
      absent,
      absent,
      null,
      false
    );
    expect(fromDefault.config.severities['W-CASE']).toBe('error'); // défaut warn < plancher error
  });
});

describe('écart 4 — §8.2 : le `?` de syntaxe de groupe n’est pas un quantificateur', () => {
  it('accepte les groupes non capturants et lookarounds quantifiés sans quantificateur interne', () => {
    expect(hasNestedQuantifier('^(?:lgtm|approved)$')).toBe(false);
    expect(hasNestedQuantifier('(?:abc)+')).toBe(false);
    expect(hasNestedQuantifier('(?=x)(?:ab)*')).toBe(false);
    expect(hasNestedQuantifier('(?<name>abc)+')).toBe(false);
    expect(hasNestedQuantifier('(?<=a)(?<!b)c+')).toBe(false);
  });

  it('détecte toujours les vrais quantificateurs imbriqués, y compris dans ces groupes', () => {
    expect(hasNestedQuantifier('(?:a+)+')).toBe(true);
    expect(hasNestedQuantifier('^(a+)+$')).toBe(true);
    expect(hasNestedQuantifier('(?=(a*)+)')).toBe(true);
  });
});

describe('écart 5 — §8.2 : limite basse E- appliquée même quand le plancher est illisible', () => {
  it('floorVersion non supportée : E- sous warn est quand même relevé à la résolution', () => {
    const { config: c, notices } = resolveConfig(
      { floorVersion: 99, minimumMode: 'enforce' },
      absent,
      found({ severities: { 'E-EMPTY-SUBJECT': 'off' } }),
      null,
      false
    );
    expect(c.severities['E-EMPTY-SUBJECT']).toBe('warn');
    expect(notices.some((n) => n.kind === 'config-warning' && n.ref === 'severities.E-EMPTY-SUBJECT')).toBe(true);
  });
});

describe('écart 6 — §8.1.5 : clé inconnue imbriquée ignorée AVEC avertissement', () => {
  it('shortcuts, telemetry, exemptionLog et entrées de labels', () => {
    const { notices } = resolveConfig(
      null,
      absent,
      found({
        shortcuts: { abbreviations: {}, futureKey: 1 },
        telemetry: { enabled: false, futureKey: 1 },
        exemptionLog: { endpoint: null, futureKey: 1 },
        labels: [{ id: 'issue', futureKey: true }],
      }),
      null,
      false
    );
    const refs = notices.filter((n) => n.kind === 'config-warning').map((n) => n.ref);
    expect(refs).toContain('shortcuts.futureKey');
    expect(refs).toContain('telemetry.futureKey');
    expect(refs).toContain('exemptionLog.futureKey');
    expect(refs).toContain('labels[].futureKey');
  });
});

describe('écart 7 — §8.1.3 : resolverOverrideGroup, restriction épinglée sans durcissement infligé', () => {
  const pin = (repo: object) => resolveConfig(null, absent, found(repo), null, false).config;

  it('ajout d’un groupe (restriction) : épinglé — la PR ouverte garde son habilitation', () => {
    const pinned = pin({ resolverOverrideGroup: ['org/leads'] });
    const { config: c } = resolveConfig(
      null,
      absent,
      found({ resolverOverrideGroup: ['org/leads', 'org/security'] }),
      pinned,
      true
    );
    expect(c.resolverOverrideGroup).toEqual(['org/leads']);
  });

  it('retrait d’un groupe (élargissement) : en direct', () => {
    const pinned = pin({ resolverOverrideGroup: ['org/leads', 'org/security'] });
    const { config: c } = resolveConfig(null, absent, found({ resolverOverrideGroup: ['org/leads'] }), pinned, true);
    expect(c.resolverOverrideGroup).toEqual(['org/leads']);
  });

  it('remplacement complet : jamais « personne » — la valeur épinglée subsiste', () => {
    const pinned = pin({ resolverOverrideGroup: ['org/leads'] });
    const { config: c } = resolveConfig(null, absent, found({ resolverOverrideGroup: ['org/newteam'] }), pinned, true);
    expect(c.resolverOverrideGroup).toEqual(['org/leads']); // pas [] (qui n'habiliterait personne, §8.2)
  });

  it('depuis « personne » vers un groupe : élargissement de l’habilitation, en direct', () => {
    const pinned = pin({});
    expect(pinned.resolverOverrideGroup).toEqual([]);
    const { config: c } = resolveConfig(null, absent, found({ resolverOverrideGroup: ['org/leads'] }), pinned, true);
    expect(c.resolverOverrideGroup).toEqual(['org/leads']);
  });

  it('vers « personne » (déclaration retirée) : durcissement maximal, épinglé', () => {
    const pinned = pin({ resolverOverrideGroup: ['org/leads'] });
    const { config: c } = resolveConfig(null, absent, found({}), pinned, true);
    expect(c.resolverOverrideGroup).toEqual(['org/leads']);
  });
});

describe('écart 8 — §8.1.3 règle 2 : aucun désaccord d’empreinte fabriqué par le mélange', () => {
  it('après le retrait d’un durcissement de sévérité, l’empreinte mélangée rejoint la vivante', () => {
    const pinned = resolveConfig(null, absent, found({ severities: { 'W-CASE': 'error' } }), null, false).config;
    const live = resolveConfig(null, absent, found({}), null, false);
    const mixed = resolveConfig(null, absent, found({}), pinned, true);
    // min(error épinglé, warn vivant) = warn = défaut du tableau → pas matérialisé.
    expect(mixed.config.severities['W-CASE']).toBeUndefined();
    expect(fingerprint(mixed.config)).toBe(fingerprint(live.config));
  });

  it('une surcharge explicitement égale au défaut ne change pas l’empreinte', () => {
    const a = defaultConfig();
    const b = defaultConfig();
    b.severities = { 'W-CASE': 'warn' }; // égal au tableau §3.5.2
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});

describe('écart 9 — §8.1.3 clause de fermeture : labels[].icon épinglée, labels[].color en direct', () => {
  it('icon reste celle du jugement d’origine ; color suit le vivant', () => {
    const pinned = resolveConfig(
      null,
      absent,
      found({ labels: [{ id: 'issue', icon: '🔨', color: '#111111' }] }),
      null,
      false
    ).config;
    const { config: c } = resolveConfig(
      null,
      absent,
      found({ labels: [{ id: 'issue', icon: '🧨', color: '#222222' }] }),
      pinned,
      true
    );
    const issue = c.labels.find((l) => l.id === 'issue')!;
    expect(issue.icon).toBe('🔨'); // épinglée (clause de fermeture)
    expect(issue.color).toBe('#222222'); // énumérée en direct
  });
});

describe('écart 3 — §8.1.1 : labels.minimum contraint la valeur effective, pas la seule écriture', () => {
  it('un label du minimum hérité désactivé est remonté à true, quel que soit qui l’a posé', () => {
    const { config: c } = resolveConfig(
      { minimumMode: 'off', labels: { minimum: ['typo'] } }, // typo est livré désactivé (§3.2)
      absent,
      absent,
      null,
      false
    );
    const typo = c.labels.find((l) => l.id === 'typo')!;
    expect(typo.enabled).toBe(true);
    expect(typo.blockingByDefault).toBe(true);
  });

  it('l’attaque du §8.1.1 (désactiver issue/todo/chore) reste neutralisée', () => {
    const { config: c } = resolveConfig(
      { minimumMode: 'enforce', labels: { minimum: ['issue', 'todo', 'chore'] } },
      absent,
      found({
        labels: [
          { id: 'issue', enabled: false },
          { id: 'todo', enabled: false },
          { id: 'chore', blockingByDefault: false },
        ],
      }),
      null,
      false
    );
    for (const id of ['issue', 'todo', 'chore']) {
      const l = c.labels.find((x) => x.id === id)!;
      expect(l.enabled).toBe(true);
      expect(l.blockingByDefault).toBe(true);
    }
  });
});
