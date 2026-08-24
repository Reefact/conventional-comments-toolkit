// Corpus de parité (CA-06) — synthétique et versionné dans core/. Chaque cas est un
// triplet figé : un corps, un contexte, la configuration à lui appliquer. Le corps est
// écrit sous sa forme de saisie (LF) ; la forme stockée (CRLF) en est dérivée
// mécaniquement par `toStoredForm()`. Le corpus est injecté AU NIVEAU DES ADAPTATEURS
// (§11, CA-06) — en amont de core/ — jamais lu de l'environnement.

import type { Zone } from '../types.js';

export const CORPUS_VERSION = 1;

export interface CorpusCase {
  id: string;
  /** Corps tel que l'extension le lit dans le champ de saisie : LF, indentation conservée. */
  body: string;
  zone: Zone;
  canCarryBlockingState: boolean;
  /** Plateforme dont le profil s'applique (étage 0, commandes slash). */
  platform: 'github' | 'azdo';
  /** Document de configuration de dépôt à appliquer aux défauts produit (chemin nominal). */
  configDoc?: Record<string, unknown>;
  /** Login de l'auteur, pour les cas d'exemption d'auteur. */
  authorLogin?: string;
  /** Verdict attendu : liste ordonnée des couples (code, sévérité) — §3.5.1. */
  expected: [string, 'warn' | 'error'][];
}

/** Forme de transport côté serveur : le corps stocké, fins de ligne normalisées en CRLF
 * par la soumission du <textarea> (§3.4.1). */
export function toStoredForm(body: string): string {
  return body.replace(/\r?\n/g, '\r\n');
}

const LONG_SUBJECT = 'a'.repeat(121);

export const corpus: CorpusCase[] = [
  // ————— Formes nominales et transport —————
  { id: 'nominal', body: 'issue: le nom est ambigu\n\nUn détail utile.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'leading-indentation', body: '   issue: le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'trailing-blanks', body: 'issue: le nom est ambigu   \t\n\nDétail.\n\n', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'bom-at-head', body: '\uFEFFissue: le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'bom-before-colon', body: 'issue\uFEFF: le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'nbsp-before-colon', body: 'issue\u00A0: le nom est ambigu', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-MALFORMED-PREFIX', 'error']] },
  { id: 'nnbsp-after-colon', body: 'issue:\u202Fle nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'emoji-simple', body: '🔥 issue: le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'emoji-flag', body: '🇫🇷 issue: le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'emoji-skin-tone', body: '👍🏽 issue: le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'emoji-zwj', body: '👨\u200D👩\u200D👧 issue: le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'code-block-at-head', body: '```\nconst a = 1;\n{\n```\nissue: accolade citée au-dessus\n', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'quote-at-head', body: '> extrait cité\nissue: sous la citation\n', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },

  // ————— Préfixes mal formés (§3.5.1) — chaque motif —————
  { id: 'malformed-unclosed-paren', body: 'issue (blocking: x', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-MALFORMED-PREFIX', 'error']] },
  { id: 'malformed-unopened-paren', body: 'issue blocking): x', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-MALFORMED-PREFIX', 'error']] },
  { id: 'malformed-missing-colon', body: 'issue (blocking) x', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-MALFORMED-PREFIX', 'error']] },
  { id: 'malformed-space-before-colon', body: 'issue : le nom est ambigu', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-MALFORMED-PREFIX', 'error']] },
  { id: 'malformed-no-space-after-colon', body: 'issue:pas-d-espace', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-MALFORMED-PREFIX', 'error']] },
  { id: 'malformed-unexpected-char', body: 'issue2: x', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-MALFORMED-PREFIX', 'error']] },

  // ————— Étages 1b, 2, 3 —————
  { id: 'no-label-sentence', body: 'Attention : le build casse', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-NO-LABEL', 'error']] },
  { id: 'unknown-label', body: 'attention: le build casse', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-UNKNOWN-LABEL', 'error']] },
  { id: 'unknown-label-typo', body: 'isue: fuite mémoire\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-UNKNOWN-LABEL', 'error']] },
  { id: 'case-label', body: 'Issue: le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['W-CASE', 'warn']] },
  { id: 'alias-case', body: 'Bug: fuite mémoire\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', configDoc: { labels: [{ id: 'issue', aliases: ['bug'] }] }, expected: [['W-CASE', 'warn']] },

  // ————— Décorations (§3.3) —————
  { id: 'decoration-syntax-char', body: 'issue (perf*): le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-DECORATION-SYNTAX', 'error']] },
  { id: 'decoration-syntax-empty-parens', body: 'issue (): le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-DECORATION-SYNTAX', 'error']] },
  { id: 'decoration-syntax-internal-space', body: 'issue (non blocking): le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-DECORATION-SYNTAX', 'error']] },
  { id: 'decoration-unknown', body: 'issue (foo): le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', configDoc: { decorations: { allowFree: false } }, expected: [['E-UNKNOWN-DECORATION', 'error']] },
  { id: 'conflict-label', body: 'nitpick (blocking): virgule finale\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-CONFLICT', 'error']] },
  { id: 'conflict-decorations', body: 'issue (blocking, non-blocking): fuite mémoire\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-CONFLICT', 'error']] },
  { id: 'conflict-decorations-no-discussion', body: 'issue (blocking, non-blocking): fuite mémoire', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-CONFLICT', 'error'], ['W-NO-DISCUSSION', 'warn']] },
  { id: 'decoration-style', body: 'issue( Blocking ): le nom est ambigu\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['W-DECORATION-STYLE', 'warn']] },
  { id: 'decoration-both-comma-forms', body: 'issue (ux,non-blocking): le nom est ambigu\n\nissue (ux, non-blocking) accepté aussi.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },

  // ————— Sujet —————
  { id: 'empty-subject', body: 'issue:', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-EMPTY-SUBJECT', 'error'], ['W-NO-DISCUSSION', 'warn']] },
  { id: 'empty-subject-trailing-space', body: 'issue: ', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-EMPTY-SUBJECT', 'error'], ['W-NO-DISCUSSION', 'warn']] },
  { id: 'subject-too-short', body: 'note: abc', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['W-SUBJECT-TOO-SHORT', 'warn']] },
  { id: 'subject-too-long', body: `note: ${LONG_SUBJECT}`, zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['W-SUBJECT-TOO-LONG', 'warn']] },
  { id: 'decision-subject-short', body: 'decision: ok', zone: 'reply', canCarryBlockingState: false, platform: 'github', expected: [['E-DECISION-SUBJECT', 'error']] },
  { id: 'decision-subject-valid', body: 'decision: hors périmètre de cette PR, dette suivie en PROJ-142\n\nContexte.', zone: 'reply', canCarryBlockingState: false, platform: 'github', expected: [] },

  // ————— Discussion et contexte —————
  { id: 'no-discussion', body: 'issue: le nom est ambigu', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['W-NO-DISCUSSION', 'warn']] },
  { id: 'non-blocking-no-discussion', body: 'issue (non-blocking): le nom est ambigu', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'missing-decoration', body: 'suggestion: extraire une méthode\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['W-MISSING-DECORATION', 'warn']] },
  { id: 'not-blockable', body: 'issue: merci de rebaser\n\nDétail.', zone: 'conversation', canCarryBlockingState: false, platform: 'github', expected: [['W-NOT-BLOCKABLE', 'warn']] },

  // ————— Étages −2 et −1 (§4.1, §4.2) —————
  { id: 'reply-free-text', body: 'Corrigé, merci !', zone: 'reply', canCarryBlockingState: false, platform: 'github', expected: [] },
  { id: 'reply-malformed-decision', body: 'decision : trop court', zone: 'reply', canCarryBlockingState: false, platform: 'github', expected: [] },
  { id: 'review-body-validated', body: 'du texte libre de revue', zone: 'review-body', canCarryBlockingState: false, platform: 'github', expected: [['E-NO-LABEL', 'error']] },
  { id: 'empty-body', body: '', zone: 'review-body', canCarryBlockingState: false, platform: 'github', expected: [] },
  { id: 'blank-body', body: '   \n\t\n', zone: 'review-body', canCarryBlockingState: false, platform: 'github', expected: [] },
  { id: 'quote-only', body: '> tout mon commentaire est cité', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'code-block-only', body: '```\ntout mon commentaire\n```', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'slash-command', body: '/azp run', zone: 'conversation', canCarryBlockingState: false, platform: 'github', configDoc: { toolCommands: ['/*'] }, expected: [] },
  { id: 'slash-command-unconfigured', body: '/azp run', zone: 'conversation', canCarryBlockingState: false, platform: 'github', expected: [['E-NO-LABEL', 'error']] },
  { id: 'mention-command', body: '@codex review', zone: 'conversation', canCarryBlockingState: false, platform: 'github', configDoc: { toolCommands: ['@codex'] }, expected: [] },
  { id: 'mention-command-mixed-case', body: '@Codex review', zone: 'conversation', canCarryBlockingState: false, platform: 'github', configDoc: { toolCommands: ['@codex'] }, expected: [] },
  { id: 'mention-of-a-person', body: '@alice peux-tu regarder ça ?', zone: 'conversation', canCarryBlockingState: false, platform: 'github', configDoc: { toolCommands: ['@codex'] }, expected: [['E-NO-LABEL', 'error']] },
  { id: 'allowlist-lgtm', body: 'LGTM\n', zone: 'conversation', canCarryBlockingState: false, platform: 'github', configDoc: { allowlistPatterns: ['^LGTM$'] }, expected: [] },
  { id: 'exempt-author', body: 'Bump lodash from 4.17.20 to 4.17.21', zone: 'conversation', canCarryBlockingState: false, platform: 'github', configDoc: { exemptUsers: ['Dependabot[bot]'] }, authorLogin: 'dependabot[bot]', expected: [] },

  // ————— Bloc de suggestion (§4.2, étage 0) —————
  { id: 'suggestion-block-with-phrase', body: '```suggestion\nconst x = 1;\n```\nça devrait suffire', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'suggestion-block-alone', body: '```suggestion\nconst x = 1;\n```', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'suggestion-block-explicit-prefix', body: 'issue (blocking): fuite mémoire\n```suggestion\nconst x = 1;\n```', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [] },
  { id: 'suggestion-block-malformed-attempt', body: 'issue (blocking: x\n```suggestion\nconst x = 1;\n```', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', expected: [['E-MALFORMED-PREFIX', 'error']] },
  { id: 'suggestion-block-azdo-no-stage0', body: '```suggestion\nconst x = 1;\n```\nune phrase', zone: 'thread-root', canCarryBlockingState: true, platform: 'azdo', expected: [['E-NO-LABEL', 'error']] },

  // ————— Sévérités (§8.2) —————
  { id: 'severity-off', body: 'suggestion: extraire une méthode\n\nDétail.', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', configDoc: { severities: { 'W-MISSING-DECORATION': 'off' } }, expected: [] },
  { id: 'severity-raised', body: 'note: abc', zone: 'thread-root', canCarryBlockingState: true, platform: 'github', configDoc: { severities: { 'W-SUBJECT-TOO-SHORT': 'error' } }, expected: [['W-SUBJECT-TOO-SHORT', 'error']] },
];
