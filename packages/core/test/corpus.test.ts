import { describe, expect, it } from 'vitest';
import { corpus, toStoredForm } from '../src/corpus/index.js';
import { validate } from '../src/validator.js';
import { resolveConfig } from '../src/config/resolve.js';
import type { ConfigRead, ValidationInput } from '../src/types.js';
import { azdoProfile, githubProfile, user } from './helpers.js';

const absent: ConfigRead = { status: 'absent' };

function inputFor(body: string, c: (typeof corpus)[number]): ValidationInput {
  return {
    body,
    platform: c.platform === 'github' ? githubProfile : azdoProfile,
    isSystemGenerated: false,
    zone: c.zone,
    canCarryBlockingState: c.canCarryBlockingState,
    author: user(c.authorLogin ?? 'reviewer'),
  };
}

describe('CA-06 — corpus de parité (verdicts de référence et invariance de transport)', () => {
  it('couvre chaque code de diagnostic au moins une fois', () => {
    const covered = new Set(corpus.flatMap((c) => c.expected.map(([code]) => code)));
    for (const code of [
      'E-NO-LABEL',
      'E-MALFORMED-PREFIX',
      'E-UNKNOWN-LABEL',
      'W-CASE',
      'E-DECORATION-SYNTAX',
      'E-UNKNOWN-DECORATION',
      'E-CONFLICT',
      'W-DECORATION-STYLE',
      'E-EMPTY-SUBJECT',
      'E-DECISION-SUBJECT',
      'W-SUBJECT-TOO-SHORT',
      'W-SUBJECT-TOO-LONG',
      'W-NO-DISCUSSION',
      'W-MISSING-DECORATION',
      'W-NOT-BLOCKABLE',
    ]) {
      expect(covered, `code ${code} non couvert par le corpus`).toContain(code);
    }
  });

  for (const c of corpus) {
    it(`${c.id} : verdict attendu, identique en LF et en CRLF`, () => {
      const repo: ConfigRead = c.configDoc
        ? { status: 'found', text: JSON.stringify(c.configDoc) }
        : absent;
      const { config } = resolveConfig(null, absent, repo, null, false);

      // Forme de saisie (LF), telle que lue par le composant A.
      const lf = validate(inputFor(c.body, c), config).map((d) => [d.code, d.severity]);
      // Forme stockée (CRLF), telle que relue par le composant B.
      const crlf = validate(inputFor(toStoredForm(c.body), c), config).map((d) => [d.code, d.severity]);

      expect(lf, 'verdict LF').toEqual(c.expected);
      expect(crlf, 'verdict CRLF — parité de transport (CA-18)').toEqual(c.expected);
    });
  }
});
