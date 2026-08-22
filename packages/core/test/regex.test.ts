import { describe, expect, it } from 'vitest';
import {
  REFERENCE_REGEX,
  REFERENCE_REGEX_SOURCE,
  REFERENCE_REGEX_FLAGS,
  matchPrefix,
} from '../src/regex.js';

describe('§3.4.2 — expression régulière de référence', () => {
  it('drapeau u obligatoire — sans lui, \\p{...} dégénère en séquence littérale sans exception', () => {
    expect(REFERENCE_REGEX_FLAGS).toContain('u');
    expect(REFERENCE_REGEX.flags).toContain('u');
    // Le défaut serait silencieux : la regex compile malgré tout (§3.4.2) — vérifié.
    expect(() => new RegExp(REFERENCE_REGEX_SOURCE)).not.toThrow();
  });

  it('drapeau v interdit — il lève une SyntaxError sur [^)\\r\\n]', () => {
    expect(REFERENCE_REGEX.flags).not.toContain('v');
    expect(() => new RegExp(REFERENCE_REGEX_SOURCE, 'v')).toThrow(SyntaxError);
  });

  it('forme nominale', () => {
    const m = matchPrefix('issue: le nom est ambigu');
    expect(m).not.toBeNull();
    expect(m!.label).toBe('issue');
    expect(m!.decorations).toBeNull();
    expect(m!.subject).toBe('le nom est ambigu');
  });

  it('décorations capturées, y compris vides — la regex reconnaît, le validateur tranche', () => {
    expect(matchPrefix('issue (blocking): x')!.decorations).toBe('blocking');
    expect(matchPrefix('issue (ux,non-blocking): x')!.decorations).toBe('ux,non-blocking');
    expect(matchPrefix('issue (): x')!.decorations).toBe('');
  });

  it('sujet absent pour `issue:` — E-EMPTY-SUBJECT atteignable, pas E-NO-LABEL', () => {
    const m = matchPrefix('issue:');
    expect(m).not.toBeNull();
    expect(m!.subject).toBeNull();
  });

  it('casse capturée pour W-CASE plutôt qu’un E-NO-LABEL inexploitable', () => {
    expect(matchPrefix('Issue: x')!.label).toBe('Issue');
  });

  it('aucune espace avant le deux-points, au moins une après', () => {
    expect(matchPrefix('issue : x')).toBeNull(); // typographie française → pas un préfixe
    expect(matchPrefix('issue:x')).toBeNull();
    expect(matchPrefix('http://example.com')).toBeNull(); // écarte les URL
  });

  it('emoji tolérés en entrée : simples, drapeaux (paires RI), teint, séquences ZWJ', () => {
    expect(matchPrefix('🔥 issue: x')!.label).toBe('issue');
    expect(matchPrefix('🇫🇷 issue: x')!.label).toBe('issue');
    expect(matchPrefix('👍🏽 issue: x')!.label).toBe('issue');
    expect(matchPrefix('👨‍👩‍👧 issue: x')!.label).toBe('issue');
    expect(matchPrefix('❤️ issue: x')!.label).toBe('issue');
  });

  it('espace manquante avant la parenthèse détectée pour W-DECORATION-STYLE', () => {
    expect(matchPrefix('issue(blocking): x')!.missingSpaceBeforeParen).toBe(true);
    expect(matchPrefix('issue (blocking): x')!.missingSpaceBeforeParen).toBe(false);
  });

  it('faux positif connu, assumé : phrase dont le premier mot est un label suivi de `:`', () => {
    expect(matchPrefix('note: le build casse')!.label).toBe('note');
  });

  it('complexité : formes pathologiques traitées vite (§3.4.2, seuil §10)', () => {
    const pathological = 'issue (' + ' '.repeat(300_000);
    const start = performance.now();
    matchPrefix(pathological);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50); // marge large sur le ≤ 1,2 ms mesuré par la spec
  });
});
