// Tests de non-régression des écarts confirmés par la revue de conformité adversariale.
// Chaque test cite la règle de la spécification qu'il verrouille.

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
      absent);
    // Rien d'écrit en dessous : la sévérité effective reste celle du tableau §3.5.2 (error).
    expect(c.severities['E-NO-LABEL'] ?? 'error').toBe('error');
  });

  it('il relève une valeur écrite sous le plancher, et le défaut du tableau quand il est en dessous', () => {
    const raised = resolveConfig(
      { minimumMode: 'off', severities: { 'W-CASE': 'error' } },
      absent,
      found({ severities: { 'W-CASE': 'warn' } }));
    expect(raised.config.severities['W-CASE']).toBe('error');
    const fromDefault = resolveConfig(
      { minimumMode: 'off', severities: { 'W-CASE': 'error' } },
      absent,
      absent);
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
      found({ severities: { 'E-EMPTY-SUBJECT': 'off' } }));
    expect(c.severities['E-EMPTY-SUBJECT']).toBe('warn');
    expect(notices.some((n) => n.kind === 'config-warning' && n.ref === 'severities.E-EMPTY-SUBJECT')).toBe(true);
  });
});

describe('écart 6 — §8.1.5 : clé inconnue imbriquée ignorée AVEC avertissement', () => {
  it('shortcuts, telemetry et entrées de labels', () => {
    const { notices } = resolveConfig(
      null,
      absent,
      found({
        shortcuts: { abbreviations: {}, futureKey: 1 },
        telemetry: { enabled: false, futureKey: 1 },
        labels: [{ id: 'issue', futureKey: true }],
      }));
    const refs = notices.filter((n) => n.kind === 'config-warning').map((n) => n.ref);
    expect(refs).toContain('shortcuts.futureKey');
    expect(refs).toContain('telemetry.futureKey');
    expect(refs).toContain('labels[].futureKey');
  });
});

describe('écart 7 — §8.1.3 : `resolverOverrideGroup` suit le document, dans les deux sens', () => {
  // Ces trois tests affirmaient l'inverse : une restriction était ÉPINGLÉE, et la PR
  // ouverte gardait son habilitation. L'épinglage a disparu avec la mémoire qu'il exigeait
  // (§6.4), et le §8.1.3 règle 1 s'applique ici comme partout.
  it('ajouter un groupe prend effet immédiatement', () => {
    const { config } = resolveConfig(null, absent, found({ resolverOverrideGroup: ['org/leads', 'org/security'] }));
    expect(config.resolverOverrideGroup).toEqual(['org/leads', 'org/security']);
  });

  it('en retirer un aussi', () => {
    const { config } = resolveConfig(null, absent, found({ resolverOverrideGroup: ['org/leads'] }));
    expect(config.resolverOverrideGroup).toEqual(['org/leads']);
  });

  it('retirer la déclaration ramène au repli terminal : la liste vide, qui n’habilite personne', () => {
    // §8.2 — « repli terminal », et non participant à l'intersection du §8.1.1. Le coût est
    // réel et assumé : sans groupe habilité, les deux soupapes du §6.3 sont inertes en même
    // temps — ni `decision`, ni exemption de PR.
    const { config } = resolveConfig(null, absent, found({}));
    expect(config.resolverOverrideGroup).toEqual([]);
  });

  it('le groupe du plancher ne peut pas être remplacé : il s’AJOUTE à la liste (§8.1.1)', () => {
    // Piège de lecture, et il a coûté une assertion fausse ici : le §8.1.1 dit que
    // « l'habilitation effective est l'INTERSECTION de toutes les listes en présence », mais
    // l'intersection porte sur l'APPARTENANCE, pas sur la liste. Il faut être membre de
    // CHACUN des groupes cités, donc allonger la liste RESTREINT. L'union des listes produit
    // l'intersection des habilitations — et c'est bien ce que `applyFloor` fait.
    const { config } = resolveConfig(
      { minimumMode: 'off', resolverOverrideGroup: ['org/leads', 'org/security'] },
      absent,
      found({ resolverOverrideGroup: ['org/security', 'org/newteam'] })
    );
    expect(config.resolverOverrideGroup.sort()).toEqual(['org/leads', 'org/newteam', 'org/security']);
  });
});

describe('écart 8 — §9.2.2 : l’empreinte ne diverge pas sur une valeur égale au défaut', () => {
  it('une surcharge explicitement égale au défaut ne change pas l’empreinte', () => {
    const a = defaultConfig();
    const b = defaultConfig();
    b.severities = { 'W-CASE': 'warn' }; // égal au tableau §3.5.2
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});

describe('écart 9 — §8.1.3 : `labels[].icon` et `labels[].color` suivent le document', () => {
  it('les deux sont en direct — il n’y a plus de clause de fermeture à épingler', () => {
    const { config } = resolveConfig(
      null,
      absent,
      found({ labels: [{ id: 'issue', icon: '\u{1F9E8}', color: '#222222' }] })
    );
    const issue = config.labels.find((l) => l.id === 'issue')!;
    expect(issue.icon).toBe('\u{1F9E8}');
    expect(issue.color).toBe('#222222');
  });
});

describe('écart 3 — §8.1.1 : labels.minimum contraint la valeur effective, pas la seule écriture', () => {
  it('un label du minimum hérité désactivé est remonté à true, quel que soit qui l’a posé', () => {
    const { config: c } = resolveConfig(
      { minimumMode: 'off', labels: { minimum: ['typo'] } }, // typo est livré désactivé (§3.2)
      absent,
      absent);
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
      }));
    for (const id of ['issue', 'todo', 'chore']) {
      const l = c.labels.find((x) => x.id === id)!;
      expect(l.enabled).toBe(true);
      expect(l.blockingByDefault).toBe(true);
    }
  });
});

describe('écart 10 — §6.2.4 : un verdict imposé « failure » est rabattu en neutre sur un brouillon', () => {
  it('configuration invalide sous enforce + PR en brouillon → neutral, jamais failure', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        configNotices: [{ kind: 'invalid-config', message: 'line 3' }],
        forceState: { state: 'failure', because: 'invalid-config' },
        ctx: ctx({ isDraft: true }),
      })
    );
    expect(r.state).toBe('neutral'); // « toujours informatif, jamais en échec » (§6.2.4)
    expect(r.notices.some((n) => n.kind === 'invalid-config')).toBe(true);
    // Hors brouillon, l'échec imposé s'applique tel quel.
    const nonDraft = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        configNotices: [{ kind: 'invalid-config', message: 'line 3' }],
        forceState: { state: 'failure', because: 'invalid-config' },
      })
    );
    expect(nonDraft.state).toBe('failure');
  });
});

describe('écart 11 — §6.3.1 : le domaine d’`activated` est l’ISO 8601, pas Date.parse', () => {
  it('rejette les formes non ISO que Date.parse accepterait', async () => {
    const { decodeSummary } = await import('../src/summary.js');
    const line = (activated: string) =>
      `cc/1 state=success draft=0 exempt=0 mode=warn activated=${activated} core=1.0.0 cfg=9f3a1c7e t=0 c=0 w=0`;
    expect(decodeSummary(line('12/25/2026'))).toBeNull();
    expect(decodeSummary(line('2026'))).toBeNull();
    expect(decodeSummary(line('2026-09-01'))).toBeNull(); // la forme écrite porte l'heure
    expect(decodeSummary(line('2026-09-01T00:00:00Z'))).not.toBeNull();
    expect(decodeSummary(line('2026-09-01T00:00:00.123Z'))).not.toBeNull();
    expect(decodeSummary(line('2026-09-01T00:00:00+02:00'))).not.toBeNull();
    expect(decodeSummary(line('-'))).not.toBeNull();
  });
});
