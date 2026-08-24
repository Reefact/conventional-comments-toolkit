// Valeurs par défaut du produit (§8.2). Ce ne sont PAS celles du bloc d'exemple de la
// spécification, qui n'illustre que la forme des clés : ici les treize labels du §3.2,
// les décorations du §3.3 et les sévérités du tableau §3.5.2.

import type { EffectiveConfig, LabelConfig } from '../types.js';

const label = (
  id: string,
  blockingByDefault: boolean,
  alwaysNonBlocking: boolean,
  enabled = true
): LabelConfig => ({ id, enabled, blockingByDefault, alwaysNonBlocking, aliases: [] });

export function defaultConfig(): EffectiveConfig {
  return {
    version: 1,
    mode: 'assist',
    labels: [
      label('praise', false, false),
      label('nitpick', false, true),
      label('suggestion', false, false),
      label('issue', true, false),
      label('todo', true, false),
      label('question', false, false),
      label('thought', false, true),
      label('chore', true, false),
      label('note', false, true),
      label('decision', false, true),
      // Labels optionnels, livrés désactivés (§3.2, §8.1.4).
      label('typo', false, false, false),
      label('polish', false, false, false),
      label('quibble', false, false, false),
    ],
    decorations: {
      allowFree: true,
      known: [
        { id: 'blocking', forces: 'blocking' },
        { id: 'non-blocking', forces: 'non-blocking' },
        { id: 'if-minor', forces: 'non-blocking' },
      ],
    },
    severities: {},
    scope: { validateReplies: false, validateReviewSummary: true },
    rules: { minSubjectLength: 5, maxSubjectLength: 120, minDecisionSubjectLength: 20 },
    formatSeverity: 'warn',
    exemptUsers: [],
    allowlistPatterns: [],
    toolCommands: [], // vide par défaut — recommandation en annexe, jamais un défaut produit (§4.2)
    resolverOverrideGroup: [], // repli terminal — n'habilite personne (§8.2)
    overrideLabel: 'cc-override',
    activation: { activatedAt: null },
    configUrl: null,
    coreMinVersion: '1.0.0',
    configCacheTtlSeconds: 3600,
    badgeStyle: 'pill',
    shortcuts: {
      // §5.2 — autant de lettres qu'il en faut pour désigner un label sans ambiguïté :
      // deux pour nitpick/note, todo/thought, praise/polish ; trois pour question/quibble.
      abbreviations: {
        '?i': 'issue: ',
        '?ib': 'issue (blocking): ',
        '?su': 'suggestion: ',
        '?ni': 'nitpick: ',
        '?no': 'note: ',
        '?pr': 'praise: ',
        '?to': 'todo: ',
        '?th': 'thought: ',
        '?que': 'question: ',
        '?ch': 'chore: ',
        '?de': 'decision: ',
        '?ty': 'typo: ',
        '?po': 'polish: ',
        '?qui': 'quibble: ',
      },
    },
    docUrl: 'https://conventionalcomments.org/',
    server: {
      coalesceWindowSeconds: 10,
      gracePeriodSeconds: 900,
      reconcileIntervalSeconds: 900,
      statusTargetUrl: null,
    },
    exemptionLog: { endpoint: null },
    language: null,
    telemetry: { enabled: false, endpoint: null },
  };
}
