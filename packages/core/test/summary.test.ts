import { describe, expect, it } from 'vitest';
import { encodeSummary, decodeSummary } from '../src/summary.js';
import { evaluate } from '../src/evaluate.js';
import { config, evalInput } from './helpers.js';

const sample =
  'cc/1 state=failure draft=0 exempt=0 mode=enforce activated=2026-09-01T00:00:00Z core=1.4.0 cfg=9f3a1c7e t=3 c=7 w=12';

describe('§6.3.1 — ligne cc/1', () => {
  it('décode l’exemple normatif de la spécification', () => {
    const s = decodeSummary(sample);
    expect(s).toEqual({
      state: 'failure',
      isDraft: false,
      exempted: false,
      mode: 'enforce',
      coreVersion: '1.4.0',
      configFingerprint: '9f3a1c7e',
      activatedAt: '2026-09-01T00:00:00Z',
      unresolvedBlockingCount: 3,
      nonCompliantCommentCount: 7,
      warningCount: 12,
    });
  });

  it('aller-retour : encode puis décode restitue le même résumé', () => {
    const result = evaluate(evalInput({ config: config((c) => (c.mode = 'warn')) }));
    const line = encodeSummary(result);
    expect(line.startsWith('cc/1 state=')).toBe(true);
    expect(line.length).toBeLessThanOrEqual(140);
    const s = decodeSummary(line)!;
    expect(s.state).toBe(result.state);
    expect(s.mode).toBe('warn');
    expect(s.configFingerprint).toBe(result.configFingerprint);
    expect(s.activatedAt).toBe(result.activatedAt);
  });

  it('ordre normatif à l’écriture : state, draft, exempt, mode, activated, core, cfg, t, c, w', () => {
    const result = evaluate(evalInput({ config: config() }));
    const keys = encodeSummary(result)
      .split(' ')
      .slice(1)
      .map((kv) => kv.split('=')[0]);
    expect(keys).toEqual(['state', 'draft', 'exempt', 'mode', 'activated', 'core', 'cfg', 't', 'c', 'w']);
  });

  it('activated=- lorsque la date est nulle', () => {
    const result = evaluate(evalInput({ config: config(), ctx: { activatedAt: null, isDraft: false, isOverrideMember: () => false, knownBlockingThreadIds: [], firstVerdicts: {} } }));
    const line = encodeSummary(result);
    expect(line).toContain('activated=-');
    expect(decodeSummary(line)!.activatedAt).toBeNull();
  });

  it('espaces multiples tolérées ; ordre non contraignant à la lecture', () => {
    expect(decodeSummary(sample.replace(/ /g, '  '))).not.toBeNull();
    const reordered =
      'cc/1 w=12 c=7 t=3 cfg=9f3a1c7e core=1.4.0 activated=- mode=warn exempt=1 draft=1 state=success';
    const s = decodeSummary(reordered)!;
    expect(s.exempted).toBe(true);
    expect(s.isDraft).toBe(true);
  });

  it('préfixe de version inconnu → null, comme si rien n’était publié', () => {
    expect(decodeSummary(sample.replace('cc/1', 'cc/2'))).toBeNull();
    expect(decodeSummary('autre chose')).toBeNull();
  });

  it('champ manquant, en double, ou hors domaine → null', () => {
    expect(decodeSummary(sample.replace(' t=3', ''))).toBeNull(); // manquant
    expect(decodeSummary(sample + ' t=4')).toBeNull(); // en double
    expect(decodeSummary(sample.replace('t=3', 't=abc'))).toBeNull(); // domaine
    expect(decodeSummary(sample.replace('draft=0', 'draft=2'))).toBeNull(); // draft=2
    expect(decodeSummary(sample.replace('state=failure', 'state=bad'))).toBeNull();
    expect(decodeSummary(sample.replace('draft=0', 'draft=true'))).toBeNull(); // 0 ou 1, jamais autrement
  });

  it('clé inconnue tolérée — non listée parmi les causes de rejet (§6.3.1)', () => {
    expect(decodeSummary(sample + ' future=x')).not.toBeNull();
  });
});
