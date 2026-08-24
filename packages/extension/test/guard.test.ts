import { describe, expect, it } from 'vitest';
import { defaultConfig, validate, type PrRef, type PublishedSummary } from '@cct/core';
import { decideGuard, feedbackState, resolveInScope } from '../src/guard.js';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

function published(overrides: Partial<PublishedSummary> = {}): PublishedSummary {
  return {
    state: 'failure',
    isDraft: false,
    exempted: false,
    mode: 'enforce',
    coreVersion: '1.4.0',
    configFingerprint: 'aaaa1111',
    activatedAt: '2026-09-01T00:00:00Z',
    unresolvedBlockingCount: 1,
    nonCompliantCommentCount: 0,
    warningCount: 0,
    ...overrides,
  };
}

function enforceConfig() {
  const c = defaultConfig();
  c.mode = 'enforce';
  c.activation.activatedAt = '2026-09-01T00:00:00Z';
  return c;
}

const errorDiags = () => validate({ body: 'pas de label', platform: { id: 'github', suggestionInfoString: null, slashCommands: false, commandPrefixes: [] }, isSystemGenerated: false, zone: 'thread-root', canCarryBlockingState: true }, defaultConfig());

describe('§5.4 — les quatre conditions du blocage d’envoi', () => {
  const base = () => ({
    config: enforceConfig(),
    fingerprint: 'aaaa1111',
    published: published(),
    degraded: false,
    pr,
    diagnostics: errorDiags(),
  });

  it('CA-01 : les quatre conditions réunies + erreur → blocage', () => {
    expect(decideGuard(base()).block).toBe(true);
  });

  it('condition 1 : mode warn/assist → jamais de blocage, diagnostics affichés', () => {
    const input = base();
    input.config.mode = 'warn';
    const d = decideGuard(input);
    expect(d.block).toBe(false);
    expect(d.reason).toBe('not-enforce');
  });

  it('CA-15 : condition 2 — PR hors périmètre → assistance sans blocage, même en enforce', () => {
    const input = base();
    input.pr = { ...pr, createdAt: '2026-08-01T00:00:00Z' };
    const d = decideGuard(input);
    expect(d.block).toBe(false);
    expect(d.inScope).toBe(false);
  });

  it('CA-32 : condition 3 — écart d’empreinte de CONFIGURATION → signalé, blocage désarmé', () => {
    const input = base();
    input.fingerprint = 'bbbb2222';
    const d = decideGuard(input);
    expect(d.block).toBe(false);
    expect(d.fingerprintMismatch).toBe(true);
  });

  it('CA-32 contre-épreuve / CA-01 : un écart de coreVersion seul ne désarme RIEN', () => {
    const input = base();
    input.published = published({ coreVersion: '9.9.9' }); // même cfg, core différent
    const d = decideGuard(input);
    expect(d.block).toBe(true);
    expect(d.fingerprintMismatch).toBe(false);
  });

  it('aucun résultat publié : pas d’empreinte à comparer, le mode configuré s’applique', () => {
    const input = base();
    input.published = null;
    expect(decideGuard(input).block).toBe(true);
  });

  it('condition 4 : configuration dégradée → on ne bloque jamais sur une règle non lue', () => {
    const input = base();
    input.degraded = true;
    const d = decideGuard(input);
    expect(d.block).toBe(false);
    // Une configuration dégradée ne produit pas un désaccord (§8.1.3) : pas de
    // comparaison d'empreintes du tout.
    expect(d.fingerprintMismatch).toBe(false);
  });

  it('mode off : extension entièrement inactive, y compris hors périmètre (§6.2.3, §7)', () => {
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
        platform: { id: 'github', suggestionInfoString: null, slashCommands: false, commandPrefixes: [] },
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

describe('§6.2.3 — périmètre vu du composant A', () => {
  it('la date vient de la configuration, sinon du résumé publié (activatedAt posée par l’administration)', () => {
    const config = defaultConfig(); // activatedAt null
    expect(resolveInScope(config, published({ activatedAt: '2026-09-01T00:00:00Z' }), pr)).toBe(true);
    expect(resolveInScope(config, published({ activatedAt: '2026-12-01T00:00:00Z' }), pr)).toBe(false);
  });

  it('sans date connue nulle part : hors périmètre — jamais bloquer sur l’inconnu (§6.4)', () => {
    expect(resolveInScope(defaultConfig(), null, pr)).toBe(false);
  });
});

describe('§5.3 — état de la pastille', () => {
  it('dégradé et écart d’empreinte priment sur ✅, signalés distinctement', () => {
    const ok = { block: false, inactive: false, fingerprintMismatch: false, inScope: true, reason: 'compliant' as const };
    expect(feedbackState([], ok, true)).toBe('degraded');
    const mismatch = { ...ok, fingerprintMismatch: true };
    expect(feedbackState([], mismatch, false)).toBe('fingerprint-mismatch');
    expect(feedbackState([], ok, false)).toBe('compliant');
    expect(feedbackState([{ code: 'W-CASE', severity: 'warn', message: '' }], ok, false)).toBe('compliant-with-warnings');
    expect(feedbackState([{ code: 'E-NO-LABEL', severity: 'error', message: '' }], ok, false)).toBe('non-compliant');
  });
});
