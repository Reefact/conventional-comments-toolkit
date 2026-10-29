// Valeurs par défaut du produit (§8.2). Ce ne sont PAS celles du bloc d'exemple de la
// spécification, qui n'illustre que la forme des clés : ici tous les labels du §3.2,
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
// d'emphase) n'est délibérément pas couvert par ce seuil : aucune palette d'autant de teintes
// distinctes ne peut satisfaire 3:1 contre ce fond précis sans s'effondrer vers une poignée de
// couleurs quasi identiques — l'état pressé se distingue déjà par son fond et son texte
// inversés (§5.1), la bordure y est un simple rappel, pas le seul signal.

import type { EffectiveConfig, LabelConfig, LabelKind } from '../types.js';

const label = (
  id: string,
  icon: string,
  color: string,
  blockingByDefault: boolean,
  alwaysNonBlocking: boolean,
  enabled = true,
  aliases: string[] = [],
  kind: LabelKind = 'remark'
): LabelConfig => ({ id, enabled, blockingByDefault, alwaysNonBlocking, kind, icon, color, aliases: [...aliases] });

/**
 * Les labels AJOUTÉS du §3.2, tels que le produit les LIVRE — ACTIVÉS, toujours non bloquants,
 * avec leurs alias : les quatre labels de réponse, de type `reply`, et `reviewed`, de type
 * `remark` — il ne répond à aucun point, il fait le point sur la revue. Le groupe ne recoupe pas
 * le type : il dit ce que le produit ajoute à Conventional Comments et qu'une équipe désactive
 * d'un même geste. Une seule définition, lue par `defaultConfig()` ci-dessous, par le test qui
 * affirme que l'ensemble est celui que le §3.2 déclare, et par la page d'options de
 * l'extension, qui en tire le bloc qui les DÉSACTIVE.
 *
 * Couleurs mesurées, comme toutes les autres, contre les neuf fonds Primer de github.com
 * (`config.test.ts`) : #6A7FDB 3,48:1, #6B8E23 3,44:1, #8A7B6E 3,21:1, #D04A7A 3,08:1, #9C8C1A 3,19:1 au
 * pire. La
 * contrainte de contraste enferme la luminance dans une bande étroite, si bien que la teinte
 * seule distingue un label d'un autre : `done` en olive (vers 80°, entre `suggestion` et
 * `praise`), `thanks` en or (vers 53°, entre `suggestion` et `done`), `ack` en indigo (vers 230°, entre `question` et `thought`), `disagree` en taupe —
 * désaturé, donc neutre comme le §5.5 l'exige, mais CHAUD là où le neutre existant, `nitpick`
 * (#76818E), est froid —, `reviewed` en framboise (vers 340°, entre `typo` et `issue`, à 15° du
 * premier). `disagree` et `nitpick` sont à luminance quasi égale
 * (écart 0,008) : seule la teinte les sépare, ce que le garde de contraste ne vérifie pas — il
 * n'écarte que les doublons exacts.
 */
export const ADDED_LABELS: readonly LabelConfig[] = [
  label('thanks', '\u{1F91D}', '#9C8C1A', false, true, true, ['thx'], 'reply'),
  label('done', '\u{2705}', '#6B8E23', false, true, true, ['fixed'], 'reply'),
  label('ack', '\u{1F44C}', '#6A7FDB', false, true, true, ['acknowledged'], 'reply'),
  label('disagree', '\u{270B}', '#8A7B6E', false, true, true, [], 'reply'),
  label('reviewed', '\u{1F389}', '#D04A7A', false, true, true, [], 'remark'),
];

/** Une copie de la définition livrée : la configuration rendue est mutée par la fusion, la
 * définition livrée ne doit jamais l'être. */
const added = (id: string): LabelConfig => structuredClone(ADDED_LABELS.find((l) => l.id === id)!);

export function defaultConfig(): EffectiveConfig {
  return {
    version: 1,
    mode: 'assist',
    labels: [
      label('praise', '\u{1F44F}', '#36933B', false, false),
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
      // `typo`, `polish`, `quibble` : de Conventional Comments, longtemps livrés désactivés,
      // actifs comme tous les autres (§3.2) — une équipe désactive ceux qu'elle ne veut pas.
      label('typo', '\u{1F524}', '#CC549C', false, false),
      label('polish', '\u{2728}', '#0C8E9A', false, false),
      label('quibble', '\u{1FAB6}', '#61896C', false, false),
      // Labels ajoutés (§3.2) — une extension propre à cette boîte à outils, absente de
      // Conventional Comments (§3.1), livrée activée ; un dépôt qui veut s'en tenir à la liste de
      // l'amont les désactive. L'ordre de cette liste EST l'ordre par défaut des boutons (§5.1) :
      // `reviewed` clôt la zone `remark`, puis la zone `reply` va du plus conciliant au plus
      // tranché — `thanks`, `done`, `ack`, `decision`, `disagree`. `decision`, propre au produit lui aussi,
      // n'est pas un label ajouté (§3.2) : il s'intercale, il ne rejoint pas le groupe.
      added('reviewed'),
      added('thanks'),
      added('done'),
      added('ack'),
      label('decision', '\u{2696}\u{FE0F}', '#936DD4', false, true, true, [], 'reply'),
      added('disagree'),
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
        // Labels de réponse (§3.2, §5.2) : `?de` reste `decision`, le seul label porteur d'un
        // effet opposable. Livrées pour trois labels désactivés, elles ne se déplient que
        // lorsque leur label est actif (§5.2, `CA-47`) — c'est `quickinput.ts` qui garde.
        '?a': 'ack: ',
        '?do': 'done: ',
        '?di': 'disagree: ',
        '?r': 'reviewed: ',
        '?thx': 'thanks: ', // comme l'alias `thx` ; `?th` est `thought` et ne se redéfinit pas (§5.2)
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
    // La page des labels du site de l'outil, et non conventionalcomments.org : celle-ci ne
    // documente aucun des labels ajoutés, actifs par défaut (§8.2, `docUrl`).
    docUrl: 'https://conventionalcomments.io/docs/labels/',
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
