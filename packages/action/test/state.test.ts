// L'état porté par le check run (§6.4.1, besoin 4) : ce qui survit, ce qui se perd quand
// il n'y a plus la place, et pourquoi la perte va toujours vers le PLUS STRICT.

import { describe, expect, it } from 'vitest';
import { defaultConfig, evaluate, type ComplianceResult, type PrRef } from '@cct/core';
import {
  decodeState,
  digestResult,
  encodeState,
  fromFirstVerdicts,
  toFirstVerdicts,
  STATE_BUDGET,
  type CarriedState,
} from '../src/state.js';

const PR: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

function sample(overrides: Partial<CarriedState> = {}): CarriedState {
  return {
    run: '2026-11-01T00:00:00.000Z|1|1',
    digest: 'abcdef0123456789',
    pinned: defaultConfig(),
    first: { T1: [1, 0], T2: [1, 1] },
    known: ['T1', 'T2'],
    ...overrides,
  };
}

describe('aller-retour de l’état', () => {
  it('un état encodé se relit à l’identique', () => {
    const state = sample();
    const back = decodeState(encodeState(state));
    expect(back).not.toBeNull();
    expect(back!.run).toBe(state.run);
    expect(back!.known).toEqual(state.known);
    expect(back!.first).toEqual(state.first);
    expect(back!.pinned!.mode).toBe(state.pinned!.mode);
  });

  it('le bloc est un commentaire HTML : il ne s’affiche pas dans le corps du check', () => {
    const text = encodeState(sample());
    expect(text.startsWith('<!--')).toBe(true);
    expect(text.trimEnd().endsWith('-->')).toBe(true);
  });

  it('il se relit même précédé de la sortie humaine', () => {
    const text = `## Fils bloquants non résolus\n- [issue: x](https://…)\n\n${encodeState(sample())}`;
    expect(decodeState(text)?.known).toEqual(['T1', 'T2']);
  });
});

describe('une mémoire à moitié comprise n’est pas une mémoire', () => {
  it.each([
    ['aucun marqueur', 'juste du texte'],
    ['version inconnue', '<!-- cct-state:99 {"run":"a","digest":"b","known":[]} -->'],
    ['JSON illisible', '<!-- cct-state:1 {pas du json} -->'],
    ['champ obligatoire absent', '<!-- cct-state:1 {"run":"a"} -->'],
    ['known mal typé', '<!-- cct-state:1 {"run":"a","digest":"b","known":[1,2]} -->'],
    ['first mal typé', '<!-- cct-state:1 {"run":"a","digest":"b","known":[],"first":{"T":[2,0]}} -->'],
  ])('%s → null, donc évaluation sans mémoire (stricte)', (_label, text) => {
    expect(decodeState(text)).toBeNull();
  });
});

describe('dégradation sous contrainte de taille — toujours vers le plus strict', () => {
  it('les fils bloquants observés survivent à tout : c’est la garde, pas l’indulgence', () => {
    // Des identifiants nombreux, de la taille de vrais identifiants de nœud GraphQL.
    const known = Array.from({ length: 900 }, (_, i) => `PRRT_kwDOAbCdEf4A${String(i).padStart(6, '0')}`);
    const first = Object.fromEntries(known.map((id) => [id, [1, 1] as [1, 1]]));
    const text = encodeState(sample({ known, first }));
    expect(text.length).toBeLessThanOrEqual(STATE_BUDGET);
    const back = decodeState(text)!;
    expect(back.known).toEqual(known); // la monotonie du §6.1 est intacte
    // `first` a été sacrifié EN PREMIER : sans lui, l'exception de correction du §6.1 ne
    // s'applique plus, donc une édition affaiblissante reste signalée. On perd une
    // indulgence, jamais une garde.
    expect(Object.keys(back.first)).toHaveLength(0);
  });

  it('quand même cela ne suffit pas, la configuration épinglée tombe à son tour', () => {
    const known = Array.from({ length: 1200 }, (_, i) => `PRRT_${'x'.repeat(60)}${i}`);
    const text = encodeState(sample({ known, first: {} }));
    const back = decodeState(text)!;
    // Sans épinglage, la PR est jugée sur la configuration COURANTE : un durcissement
    // s'applique au lieu d'être différé (§8.1.3). Là encore, le sens strict.
    expect(back.pinned).toBeUndefined();
    expect(back.known).toEqual(known);
  });
});

describe('verdicts de première observation', () => {
  it('aller-retour entre la forme compacte et celle qu’attend EvaluationContext', () => {
    const verdicts = { T1: { blocking: true, hadConflict: false }, T2: { blocking: false, hadConflict: true } };
    expect(toFirstVerdicts(fromFirstVerdicts(verdicts))).toEqual(verdicts);
  });
});

describe('empreinte du résultat (§6.4) — ce qui décide de republier', () => {
  function resultWith(mutate: (r: ComplianceResult) => void = () => {}): ComplianceResult {
    const config = defaultConfig();
    config.mode = 'enforce';
    const r = evaluate({
      pr: PR,
      platform: { id: 'github', suggestionInfoString: 'suggestion' },
      threads: [],
      loose: [],
      config,
      configNotices: [],
      ctx: {
        activatedAt: '2026-09-01T00:00:00Z',
        isDraft: false,
        isOverrideMember: () => false,
        knownBlockingThreadIds: [],
        firstVerdicts: {},
      },
    });
    r.headSha = 'sha-1';
    mutate(r);
    return r;
  }

  it('deux résultats identiques ont la même empreinte', () => {
    expect(digestResult(resultWith())).toBe(digestResult(resultWith()));
  });

  it('le SHA de tête entre dans l’empreinte — un push doit republier (§6.4)', () => {
    const a = digestResult(resultWith());
    const b = digestResult(resultWith((r) => (r.headSha = 'sha-2')));
    expect(a).not.toBe(b);
  });

  it('un horodatage de notice n’y entre PAS — sinon la règle serait inopérante', () => {
    const a = digestResult(
      resultWith((r) => r.notices.push({ kind: 'resolution-unattributed', message: 'x', at: '2026-11-01T00:00:00Z' }))
    );
    const b = digestResult(
      resultWith((r) => r.notices.push({ kind: 'resolution-unattributed', message: 'x', at: '2026-11-02T00:00:00Z' }))
    );
    expect(a).toBe(b);
  });

  it('un `kind` de notice nouveau, lui, change l’empreinte', () => {
    const a = digestResult(resultWith());
    const b = digestResult(resultWith((r) => r.notices.push({ kind: 'config-warning', message: 'x' })));
    expect(a).not.toBe(b);
  });
});
