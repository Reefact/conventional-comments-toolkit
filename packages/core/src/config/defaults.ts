// Valeurs par défaut du produit (§8.2). Ce ne sont PAS celles du bloc d'exemple de la
// spécification, qui n'illustre que la forme des clés : ici les treize labels du §3.2,
// les décorations du §3.3 et les sévérités du tableau §3.5.2.
//
// `icon`/`color` par label (issue #18) : sans eux, `defaultConfig()` ne fournissait jamais
// aucune des deux clés — le rendu que `badges.ts`/`toolbar.ts` savent produire à partir
// d'elles (bordure du badge, bouton actif de la barre d'outils, §5.1/§5.5) restait donc
// invisible sur tout dépôt sans configuration `.conventional-comments.json` propre, y
// compris le mockup de référence qu'elles sont censées reprendre. Les deux clés sont déjà
// exclues de `fingerprint()` (§9.2.2) et de la liste plancher-able (§8.1.3) : purement
// cosmétiques, elles ne peuvent donc jamais faire diverger un verdict ni être verrouillées
// par un plancher — les fournir ici est sans risque pour ces deux garanties.
//
// La couleur ne teinte jamais un FOND au repos (`styles.css` : `.cct-badge` et
// `.cct-label-button` à l'état non pressé n'appliquent `--cct-label-color` qu'à
// `border-color` — vérifié dans le fichier, pas supposé), donc aucune des deux teintes n'a
// besoin de satisfaire le ratio de contraste de TEXTE (§10, WCAG 2.1 SC 1.4.3, 4,5:1) : le
// texte reste toujours la couleur par défaut de la page. Le critère qui s'applique est celui
// d'une bordure de composant d'interface : WCAG 2.1 SC 1.4.11 (Non-text Contrast), 3:1
// minimum — contre le fond RÉEL du composant qui la porte, pas contre une estimation à l'œil.
//
// Chaque teinte ci-dessous est vérifiée par un test dédié (packages/core/test/config.test.ts)
// contre les 9 fonds Primer clair/sombre/dark-dimmed × canvas/muted/button-rest, mesurés en
// direct sur github.com (light.css/dark.css/dark_dimmed.css servis sous les mêmes attributs
// data-color-mode/data-dark-theme que la page elle-même) le 2026-09-03 — PAS recopiés d'une
// mémoire de session précédente : une première palette choisie ici s'est révélée invisible en
// thème sombre (jusqu'à 1,23:1 pour `decision`), l'écart entre « luminosité qui semble
// correcte à l'œil » et un ratio mesuré est resté invisible tant que personne n'avait fait le
// calcul. L'état PRESSÉ de `.cct-label-button` (fond `--bgColor-accent-emphasis`, un bleu
// d'emphase) n'est délibérément pas couvert par ce seuil : aucune palette de treize teintes
// distinctes ne peut satisfaire 3:1 contre ce fond précis sans s'effondrer vers une poignée de
// couleurs quasi identiques — l'état pressé se distingue déjà par son fond et son texte
// inversés (§5.1), la bordure y est un simple rappel, pas le seul signal.

import type { EffectiveConfig, LabelConfig } from '../types.js';

const label = (
  id: string,
  icon: string,
  color: string,
  blockingByDefault: boolean,
  alwaysNonBlocking: boolean,
  enabled = true
): LabelConfig => ({ id, enabled, blockingByDefault, alwaysNonBlocking, icon, color, aliases: [] });

export function defaultConfig(): EffectiveConfig {
  return {
    version: 1,
    mode: 'assist',
    labels: [
      label('praise', '\u{1F389}', '#36933B', false, false),
      label('nitpick', '\u{1F50D}', '#76818E', false, true),
      label('suggestion', '\u{1F4A1}', '#B07600', false, false),
      // Icône identique à celle de l'exemple normatif (.conventional-comments.example.json,
      // qui n'illustre que la FORME des clés, cf. en-tête de fichier) ; la couleur n'a en
      // revanche pas pu rester celle de l'exemple (#B3261E, ~2,00:1 au pire, cf. plus haut) —
      // l'exemple a été aligné sur celle-ci plutôt que l'inverse.
      label('issue', '\u{1F528}', '#E04E45', true, false),
      label('todo', '\u{1F4CC}', '#D95800', true, false),
      label('question', '\u{2753}', '#197EF5', false, false),
      label('thought', '\u{1F4AD}', '#9368E3', false, true),
      label('chore', '\u{1F9F9}', '#A97735', true, false),
      label('note', '\u{1F4DD}', '#1F8E96', false, true),
      label('decision', '\u{1F3C1}', '#936DD4', false, true),
      // Labels optionnels, livrés désactivés (§3.2, §8.1.4) — icône et couleur assignées
      // quand même : (re)activer un label ne doit pas exiger de configurer aussi son
      // apparence pour sortir du rendu monochrome que #18 décrit.
      label('typo', '\u{1F524}', '#CC549C', false, false, false),
      label('polish', '\u{2728}', '#0C8E9A', false, false, false),
      label('quibble', '\u{1FAB6}', '#61896C', false, false, false),
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
