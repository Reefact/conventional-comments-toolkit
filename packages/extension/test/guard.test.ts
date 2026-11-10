import { describe, expect, it } from 'vitest';
import { defaultConfig, validate } from '@cct/core';
import { decideGuard, feedbackState } from '../src/guard.js';

function enforceConfig() {
  const c = defaultConfig();
  c.mode = 'enforce';
  return c;
}

const errorDiags = () => validate({ body: 'pas de label', platform: { id: 'github', suggestionInfoString: null }, isSystemGenerated: false, zone: 'thread-root', canCarryBlockingState: true }, defaultConfig());

describe('§5.4 — les deux conditions du blocage d’envoi', () => {
  const base = () => ({
    config: enforceConfig(),
    degraded: false,
    diagnostics: errorDiags(),
  });

  it('CA-01 : mode enforce, configuration lue, commentaire en erreur → blocage, sans aucune date d’activation', () => {
    const input = base();
    // La configuration par défaut ne date rien : le blocage n'en dépend plus (§5.4 amendé).
    expect('activation' in input.config).toBe(false);
    const d = decideGuard(input);
    expect(d.block).toBe(true);
    expect(d.reason).toBe('blocked');
  });

  it('condition 1 : mode warn/assist → jamais de blocage, diagnostics affichés', () => {
    for (const mode of ['warn', 'assist'] as const) {
      const input = base();
      input.config.mode = mode;
      const d = decideGuard(input);
      expect(d.block).toBe(false);
      expect(d.reason).toBe('not-enforce');
    }
  });

  it('condition 2 : configuration dégradée → on ne bloque jamais sur une règle non lue', () => {
    const input = base();
    input.degraded = true;
    const d = decideGuard(input);
    expect(d.block).toBe(false);
    expect(d.reason).toBe('degraded');
  });

  it('mode off : extension entièrement inactive (§7)', () => {
    const input = base();
    input.config.mode = 'off';
    const d = decideGuard(input);
    expect(d.inactive).toBe(true);
    expect(d.block).toBe(false);
  });

  it('les avertissements ne bloquent jamais l’envoi (§3.5.2)', () => {
    const input = base();
    input.diagnostics = validate(
      {
        body: 'Issue: le nom est ambigu\n\nd',
        platform: { id: 'github', suggestionInfoString: null },
        isSystemGenerated: false,
        zone: 'thread-root',
        canCarryBlockingState: true,
      },
      defaultConfig()
    );
    expect(input.diagnostics.length).toBeGreaterThan(0);
    expect(decideGuard(input).block).toBe(false);
  });
});

describe('§5.3 — état de la pastille', () => {
  it('l’état dégradé prime sur ✅', () => {
    expect(feedbackState([], true)).toBe('degraded');
    expect(feedbackState([], false)).toBe('compliant');
    expect(feedbackState([{ code: 'W-CASE', severity: 'warn', message: '' }], false)).toBe('compliant-with-warnings');
    expect(feedbackState([{ code: 'E-NO-LABEL', severity: 'error', message: '' }], false)).toBe('non-compliant');
  });
});
