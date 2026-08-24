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

/**
 * Complète un document `EffectiveConfig` **relu du stockage** (§6.4) par les valeurs par
 * défaut du produit. Deux documents sont persistés — la configuration épinglée d'une PR et
 * la dernière configuration effective connue d'un dépôt —, tous deux écrits par la version
 * de `core/` qui tournait alors et relus par `JSON.parse` sans normalisation, sur les deux
 * backends. Une clé ajoutée au §8.2 depuis l'écriture y est donc ABSENTE, et le premier
 * consommateur qui la lit lève : `fingerprint()` sur un `.map()`, le mélange du §8.1.3 sur
 * une union de listes.
 *
 * À appeler à la **frontière de désérialisation**, jamais au cas par cas chez les
 * consommateurs : c'est ce qui rend le correctif vrai pour toute clé future, et pour tout
 * consommateur — présent ou à venir — d'un document persisté.
 *
 * Compléter est le comportement juste, et pas seulement le comportement sûr : une clé qui
 * n'existait pas au moment de l'écriture n'a jamais pu être configurée sur ce dépôt ni sur
 * cette PR, et sa valeur par défaut est exactement ce sous quoi ils ont été jugés jusque-là.
 */
export function completeStoredConfig(stored: EffectiveConfig): EffectiveConfig {
  return { ...defaultConfig(), ...stored };
}
