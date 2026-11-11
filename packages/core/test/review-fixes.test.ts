// Tests de non-régression des écarts confirmés par la revue de conformité adversariale.
// Chaque test cite la règle de la spécification qu'il verrouille.

import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/resolve.js';
import { hasNestedQuantifier } from '../src/config/schema.js';
import { defaultConfig } from '../src/config/defaults.js';
import type { ConfigRead } from '../src/types.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });

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
