// Bornes d'entreprise (§8.1.1). « Plancher » signifie : le niveau inférieur ne peut pas
// assouplir — l'opération exacte est normative clé par clé, elle ne se déduit pas d'une
// règle générale (l'erreur type : max() sur configCacheTtlSeconds, borné en MAXIMUM, produit
// l'inverse du but).

import type { EffectiveConfig, Floor, Mode, Notice, NoticeParams, Severity } from '../types.js';
import { makeNotice, withLevel } from './notices.js';
import { SUPPORTED_FLOOR_VERSION } from '../version.js';
import { defaultConfig } from './defaults.js';
import { DEPRECATED_MODE, deprecatedModeNotice, filterAllowlistPatterns, filterToolCommands, MODES, SEVERITIES } from './schema.js';

export const MODE_SCALE: Record<Mode, number> = { off: 0, assist: 1, enforce: 2 };
const SEVERITY_SCALE: Record<Severity, number> = { off: 0, warn: 1, error: 2 };

export function maxMode(a: Mode, b: Mode): Mode {
  return MODE_SCALE[a] >= MODE_SCALE[b] ? a : b;
}
export function minMode(a: Mode, b: Mode): Mode {
  return MODE_SCALE[a] <= MODE_SCALE[b] ? a : b;
}
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_SCALE[a] >= SEVERITY_SCALE[b] ? a : b;
}
export function minSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_SCALE[a] <= SEVERITY_SCALE[b] ? a : b;
}

/** Plancher par défaut — canal muet des deux côtés : `{"minimumMode": "off"}`,
 * aucune règle imposée (§8.1.1). */
export function defaultFloor(): Floor {
  return { minimumMode: 'off' };
}

export interface VettedFloor {
  floor: Floor;
  notices: Notice[];
  /** Vrai si `floorVersion` dépasse la version supportée : le plancher reçu n'est pas
   * appliqué, et le repli du §8.1.5 s'impose (mode assist — le plancher précédemment
   * connu, s'il est plus strict, est substitué par l'appelant AVANT cet appel). */
  unsupported: boolean;
}

/** Les trois clés de liste du plancher (§8.1.1). UNE SEULE définition, consommée par
 * `vetFloor()` comme par `applyFloor()` : deux listes tenues séparément finiraient par
 * diverger, et le trou se rouvrirait en silence sur la clé oubliée par l'une des deux. */
export const FLOOR_LIST_KEYS = ['exemptUsers', 'allowlistPatterns', 'toolCommands'] as const;

function floorWarning(code: string, params: NoticeParams, ref: string): Notice {
  return makeNotice('config-warning', code, params, ref);
}

/** Ce que le plancher prétend être un tableau de chaînes, réduit à ce qu'il en est
 * vraiment. Le document arrive d'un `JSON.parse` — d'un fichier d'administration ou de
 * `chrome.storage.managed` —, jamais d'un compilateur : le type `Floor` ne garantit rien
 * de sa forme réelle.
 *
 * L'ABSENCE est signalée comme un mauvais type, et ce n'est pas du zèle : sur une règle
 * de liste, `{ "closed": true }` sans `minimum` FERME la clé sur la liste vide. Une
 * faute de frappe y produit donc le maximum d'effet, et la réparer en silence la
 * rendrait invisible à qui a écrit la politique. */
function asStringArray(value: unknown, ref: string, notices: Notice[]): string[] {
  if (!Array.isArray(value)) {
    notices.push(floorWarning('floor.string-array', { key: ref }, ref));
    return [];
  }
  const kept = value.filter((e): e is string => typeof e === 'string');
  // Signaler AUSSI le tri à l'intérieur du tableau, et pas seulement le tableau absent :
  // `["org/securite", 42]` perd son 42 sans que personne ne l'apprenne, alors que le
  // contrat annoncé est « écartée ET signalée ». Une politique d'entreprise à moitié
  // appliquée en silence est précisément ce que cette passe existe pour empêcher.
  if (kept.length !== value.length) {
    const count = value.length - kept.length;
    notices.push(floorWarning(count === 1 ? 'floor.non-string-entry' : 'floor.non-string-entries', { key: ref, count }, ref));
  }
  return kept;
}

/** `closed` d'une règle de liste (§8.1.1). Absent vaut `false` — c'est le défaut du
 * schéma. Présent mais pas booléen est une FAUTE, signalée, et résolue en `true`.
 *
 * Le sens de ce repli n'est pas indifférent, et `=== true` le prenait à l'envers :
 * `"closed": "true"` — la coquille JSON la plus banale — devenait `false` et ROUVRAIT la
 * liste, alors que `applyFloor()` la tenait fermée avant cette passe par un simple test
 * de véracité. C'était une régression, et dans le sens permissif : un dépôt regagnait des
 * exemptions que l'administration croyait avoir fermées. Tout le reste de cette
 * vérification ne se trompe que dans le sens durcissant ; `closed` doit s'y tenir. */
function asClosed(value: unknown, ref: string, notices: Notice[]): boolean {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  notices.push(floorWarning('floor.closed-not-boolean', { key: ref }, ref));
  return true;
}

/** Les clés que le §8.1.1 définit. Une clé hors liste est ignorée par tout le reste du
 * code ; sans avertissement, `{"minimumMood": "enforce"}` laisserait l'administration
 * croire son plancher posé alors qu'il ne l'est pas.
 *
 * `formatSeverity`, `activation` et `resolverOverrideGroup` en sont sortis avec le
 * vérificateur (§2) : un plancher qui les porte encore les voit ignorées et signalées
 * (`config-warning`), comme toute clé inconnue — la même règle que le §8.2 pose pour les clés
 * retirées d'un fichier de configuration, sans repli.
 *
 * Sous Chrome, cet avertissement n'a pas l'occasion de partir : MESURÉ (2026-11-11), Chrome
 * écarte une clé imbriquée que `managed-schema.json` ne déclare pas avant que l'extension lise
 * le plancher (`extension/test/managed-schema.test.ts`). La règle vaut pour ce qui arrive
 * jusqu'ici sans cette validation. */
const FLOOR_KEYS = new Set([
  'floorVersion', 'configUrl', 'minimumMode', 'severities', 'labels',
  'rules', 'exemptUsers', 'allowlistPatterns', 'toolCommands', 'configCacheTtlSeconds',
]);

/** Entier positif ou nul — la même exigence que `parseConfigDocument()` pose au document
 * de dépôt sur `configCacheTtlSeconds` et sur les seuils de `rules`. */
function asNonNegativeInt(value: unknown, ref: string, notices: Notice[]): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  notices.push(floorWarning('floor.non-negative-integer', { key: ref }, ref));
  return undefined;
}

function asOneOf(value: unknown, allowed: string[], ref: string, notices: Notice[]): string | undefined {
  if (typeof value === 'string' && allowed.includes(value)) return value;
  notices.push(floorWarning('floor.one-of', { key: ref, values: allowed.join(', ') }, ref));
  return undefined;
}

/** Un objet, ou rien. Évite d'aller lire une sous-clé sur un scalaire. */
function asObject(value: unknown, ref: string, notices: Notice[]): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  notices.push(floorWarning('floor.object', { key: ref }, ref));
  return undefined;
}

/** Chaque avis du plancher porte son niveau, `floor` (§5.3) — attribué à la sortie, comme
 * `parseConfigDocument()` le fait pour un document. */
export function vetFloor(floor: Floor | null | undefined): VettedFloor {
  const vetted = vetFloorDocument(floor);
  return { ...vetted, notices: vetted.notices.map((n) => withLevel(n, 'floor')) };
}

function vetFloorDocument(floor: Floor | null | undefined): VettedFloor {
  if (!floor) return { floor: defaultFloor(), notices: [], unsupported: false };

  // Le TYPE de `floorVersion` se vérifie avant sa VALEUR : `"99" > 1` est vrai en
  // JavaScript, si bien qu'une version écrite entre guillemets déclencherait le repli du
  // §8.1.5 par coercition plutôt que par décision. Une valeur non entière est écartée et
  // signalée, et le plancher est alors lu comme s'il ne portait pas de version — ce que
  // le §8.1.1 permet, la clé étant optionnelle.
  const versionNotices: Notice[] = [];
  const version =
    floor.floorVersion === undefined
      ? undefined
      : asNonNegativeInt(floor.floorVersion, 'floorVersion', versionNotices);
  if (version !== undefined && version > SUPPORTED_FLOOR_VERSION) {
    return {
      floor: defaultFloor(),
      notices: [
        makeNotice('unsupported-version', 'unsupported.floor-version', { version, supported: SUPPORTED_FLOOR_VERSION }, 'floorVersion'),
      ],
      unsupported: true,
    };
  }

  // ————— Le plancher n'est pas plus fiable que le document d'un dépôt —————
  //
  // Il est écrit par une administration, pas par le dépôt qu'il contraint, mais il arrive
  // par le même chemin : du JSON désérialisé. Faute de cette passe, ses entrées
  // court-circuitaient les filtres que `parseConfigDocument()` applique aux MÊMES clés —
  // un plancher pouvait donc poser un `^(a+)+$` que les bornes du §8.2 existent pour
  // interdire, et geler le navigateur du relecteur autant que le service mutualisé.
  //
  // Une entrée fautive est ÉCARTÉE ET SIGNALÉE, jamais cause d'un repli en `assist` : le
  // §8.2 énonce la règle sur la clé, pas sur le canal, et une faute de frappe dans une
  // politique d'entreprise ne doit pas désactiver la contrainte sur tout un parc. Écarter
  // ne va d'ailleurs jamais que dans le sens durcissant — une exemption ou un motif
  // d'allowlist en moins protège davantage.
  const notices: Notice[] = [...versionNotices];
  const out: Floor = { ...floor };
  if (version === undefined) delete out.floorVersion;
  else out.floorVersion = version;

  for (const key of FLOOR_LIST_KEYS) {
    const rule = out[key] as { minimum?: unknown; closed?: unknown } | undefined | null;
    if (rule === undefined) continue;
    // Les sous-clés inconnues d'une règle de liste, au même titre que celles de `rules` :
    // `{"minimum": [], "closd": true}` lisait `closed` absent et rendait la liste OUVERTE,
    // alors que l'administration la voulait fermée.
    if (rule !== null && typeof rule === 'object') {
      for (const k of Object.keys(rule)) {
        if (k !== 'minimum' && k !== 'closed') {
          notices.push(floorWarning('config.unknown-key', { key: `${key}.${k}` }, `${key}.${k}`));
        }
      }
    }
    const raw = asStringArray(rule?.minimum, `${key}.minimum`, notices);
    // L'avis dit d'OÙ vient l'entrée écartée — le niveau `floor`, que `vetFloor()` attribue à
    // tout ce qu'il signale : sans cela, une administration qui débogue sa politique lirait un
    // avertissement identique à celui d'un fichier de dépôt et chercherait au mauvais endroit.
    const kept =
      key === 'allowlistPatterns'
        ? filterAllowlistPatterns(raw, notices)
        : key === 'toolCommands'
          ? filterToolCommands(raw, notices)
          : raw; // `exemptUsers` n'a pas de filtre d'entrée : un login est libre (§8.2).
    out[key] = { minimum: kept, closed: asClosed(rule?.closed, `${key}.closed`, notices) };
  }

  if (out.labels !== undefined) {
    const obj = asObject(out.labels, 'labels', notices);
    if (obj === undefined) delete out.labels;
    else {
      // Les sous-clés inconnues de `labels`, comme celles de `rules` et des règles de liste. `{"minimum": ["issue"], "minmum": ["todo"]}` protégeait
      // `issue` seul, sans un mot sur `todo` : un niveau inférieur pouvait le désactiver
      // alors que l'administration croyait l'avoir planché.
      for (const k of Object.keys(obj)) {
        if (k !== 'minimum') notices.push(floorWarning('config.unknown-key', { key: `labels.${k}` }, `labels.${k}`));
      }
      out.labels = { minimum: asStringArray(obj['minimum'], 'labels.minimum', notices) };
    }
  }

  // ————— Les clés scalaires, et les clés inconnues —————
  //
  // Une valeur fautive est ÉCARTÉE : le plancher ne contraint alors tout simplement pas
  // cette clé-là, et l'avertissement est la seule sauvegarde — il n'existe aucune valeur
  // sûre à inventer à la place. Poser `enforce` sur une coquille de `minimumMode`
  // bloquerait les envois de toute une organisation. Écarter est
  // le seul geste qui ne décide rien à la place de qui a écrit la politique.
  //
  // C'est la nuance que la règle des listes ci-dessus n'a pas : y retirer une entrée
  // fautive durcit toujours. Ici, non — d'où l'avertissement, qui n'est pas décoratif.
  for (const key of Object.keys(out)) {
    if (!FLOOR_KEYS.has(key)) {
      notices.push(floorWarning('config.unknown-key', { key }, key));
      delete (out as Record<string, unknown>)[key];
    }
  }
  const drop = (k: keyof Floor) => { delete out[k]; };

  if (out.configUrl !== undefined && out.configUrl !== null && typeof out.configUrl !== 'string') {
    notices.push(floorWarning('floor.string-or-null', { key: 'configUrl' }, 'configUrl'));
    drop('configUrl');
  }
  if (out.minimumMode !== undefined) {
    // `warn` n'est plus un mode : lu comme `assist`, et signalé (§7). Le plancher est une
    // borne, et `warn` se rangeait déjà avec `assist` sur son échelle (§8.1.1).
    if ((out.minimumMode as string) === DEPRECATED_MODE) {
      out.minimumMode = 'assist';
      notices.push(deprecatedModeNotice('minimumMode'));
    } else {
      const v = asOneOf(out.minimumMode, MODES, 'minimumMode', notices);
      if (v === undefined) drop('minimumMode');
      else out.minimumMode = v as Mode;
    }
  }
  if (out.severities !== undefined) {
    const obj = asObject(out.severities, 'severities', notices);
    if (obj === undefined) drop('severities');
    else {
      const kept: Record<string, Severity> = {};
      for (const [code, sev] of Object.entries(obj)) {
        if (typeof sev === 'string' && SEVERITIES.includes(sev)) kept[code] = sev as Severity;
        else notices.push(floorWarning('floor.severity', { code, values: SEVERITIES.join(', ') }, `severities.${code}`));
      }
      out.severities = kept;
    }
  }
  if (out.rules !== undefined) {
    const obj = asObject(out.rules, 'rules', notices);
    if (obj === undefined) drop('rules');
    else {
      const rules: { minDecisionSubjectLength?: number } = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k !== 'minDecisionSubjectLength') {
          notices.push(floorWarning('config.unknown-key', { key: `rules.${k}` }, `rules.${k}`));
          continue;
        }
        const n = asNonNegativeInt(v, 'rules.minDecisionSubjectLength', notices);
        if (n !== undefined) rules.minDecisionSubjectLength = n;
      }
      out.rules = rules;
    }
  }
  if (out.configCacheTtlSeconds !== undefined
      && asNonNegativeInt(out.configCacheTtlSeconds, 'configCacheTtlSeconds', notices) === undefined) {
    drop('configCacheTtlSeconds');
  }

  return { floor: out, notices, unsupported: false };
}

/** L'URL de niveau 2 que ce plancher désigne — `null` s'il n'est pas applicable.
 *
 * UNE seule définition, parce que TROIS endroits en ont besoin, et deux d'entre eux en
 * ont besoin AVANT `resolveConfig()` : l'orchestrateur et le résolveur de l'extension
 * lancent la lecture du niveau 2 en amont de la résolution. Ils lisaient le plancher
 * BRUT, si bien qu'un plancher de version non supportée — que le §8.1.1 déclare non
 * appliqué — désignait quand même le document d'organisation et déclenchait la requête.
 * `resolveConfig()` posait pourtant déjà `configUrl: null` dans ce cas : la décision
 * était juste, elle arrivait trop tard.
 *
 * Prend le plancher DÉJÀ vérifié, pour ne pas le vérifier deux fois là où l'appelant
 * l'a en main. */
export function vettedConfigUrl(vetted: VettedFloor): string | null {
  return vetted.unsupported ? null : (vetted.floor.configUrl ?? null);
}

/** Le niveau inférieur qui a écrit une clé : le document d'organisation, ou le fichier du
 * dépôt (§8.1.2). */
export type ConfigLevel = 'org' | 'repo';

/** Les écritures des niveaux inférieurs, telles que `resolveConfig()` les relève.
 *
 * `keys` — pour chaque clé écrite, le niveau dont la valeur l'EMPORTE : le dépôt, s'il l'écrit
 * après l'organisation, la remplace (§8.1.4). `entries` — pour une clé de liste, que la fusion
 * UNIT au lieu de remplacer, les niveaux qui ont écrit chaque entrée : une entrée qu'une règle
 * `closed` écarte peut venir de l'un, de l'autre, ou des deux. */
export interface WrittenKeys {
  keys: Map<string, ConfigLevel>;
  entries: Map<string, Map<string, Set<ConfigLevel>>>;
}

export function emptyWrittenKeys(): WrittenKeys {
  return { keys: new Map(), entries: new Map() };
}

export interface FloorApplication {
  config: EffectiveConfig;
  notices: Notice[];
}

/**
 * Applique les bornes du plancher à une configuration résolue (§8.1.1, tableau normatif).
 *
 * PRÉCONDITION : `floor` sort de `vetFloor()`. C'est là, et là seulement, que la forme du
 * document est vérifiée et que ses entrées passent leurs filtres ; cette fonction lit
 * donc `rule.minimum` sans défense. Répéter la normalisation ici donnerait deux
 * définitions de la même règle, qui finiraient par diverger — le défaut même que la
 * constante `FLOOR_LIST_KEYS` existe pour empêcher.
 *
 * `written` — les clés effectivement écrites par un niveau inférieur (org/repo), pour
 * n'émettre `floor-override` que lorsqu'une valeur écrite est ignorée.
 */
export function applyFloor(config: EffectiveConfig, floor: Floor, written: WrittenKeys): FloorApplication {
  const out = structuredClone(config);
  const notices: Notice[] = [];
  // L'avis nomme le niveau qui a écrit la clé ignorée : un « fichier du dépôt » pour une clé
  // venue du document d'organisation enverrait chercher au mauvais endroit.
  const override = (key: string, level: ConfigLevel) =>
    notices.push(makeNotice('floor-override', 'floor-override', { key, level }, key));
  const overridden = (key: string) => {
    const level = written.keys.get(key);
    if (level !== undefined) override(key, level);
  };

  // mode — minimum sur l'échelle des modes ; durcir est permis.
  if (floor.minimumMode !== undefined && MODE_SCALE[out.mode] < MODE_SCALE[floor.minimumMode]) {
    out.mode = floor.minimumMode;
    overridden('mode');
  }

  // severities — ensemble de codes dont la sévérité ne peut pas être abaissée (§8.1.1).
  // Le plancher est un minimum, jamais une valeur imposée : il ne peut que RELEVER la
  // sévérité effective — explicite, ou celle du tableau §3.5.2 quand rien n'est écrit.
  if (floor.severities) {
    for (const [code, min] of Object.entries(floor.severities)) {
      const effective = out.severities[code] ?? (code.startsWith('E-') ? 'error' : 'warn');
      if (SEVERITY_SCALE[effective] < SEVERITY_SCALE[min]) {
        out.severities[code] = min;
        overridden(`severities.${code}`); // n'émet que si un niveau inférieur avait écrit
      }
    }
  }

  // labels — ids dont AUCUN des trois drapeaux ne peut être assoupli en dessous du plancher
  // (§8.1.1) : ni `enabled` ni `blockingByDefault` ne passent à false, et `alwaysNonBlocking`
  // ne passe pas à true. La contrainte porte sur la VALEUR EFFECTIVE, comme pour toutes les
  // autres clés du plancher — c'est la clé par laquelle un dépôt éteint la contrainte le plus
  // complètement, et une lecture limitée aux seules écritures laisserait passer une valeur
  // héritée. Le plancher n'invente pas de label : il protège ceux que la configuration connaît.
  //
  // Le plancher ne relève `blockingByDefault` que sur un label que le produit LIVRE
  // `alwaysNonBlocking: false`. Forcer les deux drapeaux ensemble donnait la paire
  // incohérente `alwaysNonBlocking: true` + `blockingByDefault: true` sur `decision` et sur
  // les labels de réponse : `done:` nu bloquait (§3.3, règle 5) pendant que `done (blocking):`
  // était refusé (règle 1). La valeur LIVRÉE, et jamais l'effective : sur l'effective, un
  // dépôt sous `{"minimum": ["issue"]}` écrivait `alwaysNonBlocking: true` sur `issue`,
  // l'exception se déclenchait sur le drapeau qu'il venait de poser, et `issue:` cessait de
  // bloquer — plancher `enforce` compris. C'est aussi pourquoi `alwaysNonBlocking` est
  // ramené à false sur un label livré ainsi : sans ce second verrou, la paire incohérente
  // revenait par l'autre côté. Un label que le produit ne livre pas compte comme livré
  // `alwaysNonBlocking: false` — l'organisation qui le plancher le veut bloquant.
  if (floor.labels?.minimum) {
    const shipped = defaultConfig().labels;
    for (const id of floor.labels.minimum) {
      const label = out.labels.find((l) => l.id === id);
      if (!label) continue;
      if (!label.enabled) {
        label.enabled = true;
        overridden(`labels.${id}.enabled`);
      }
      const shippedNonBlocking = shipped.find((l) => l.id === id)?.alwaysNonBlocking ?? false;
      if (shippedNonBlocking) continue;
      if (label.alwaysNonBlocking) {
        label.alwaysNonBlocking = false;
        overridden(`labels.${id}.alwaysNonBlocking`);
      }
      if (!label.blockingByDefault) {
        label.blockingByDefault = true;
        overridden(`labels.${id}.blockingByDefault`);
      }
    }
  }

  // rules.minDecisionSubjectLength — minimum numérique.
  const floorMin = floor.rules?.minDecisionSubjectLength;
  if (floorMin !== undefined && out.rules.minDecisionSubjectLength < floorMin) {
    out.rules.minDecisionSubjectLength = floorMin;
    overridden('rules.minDecisionSubjectLength');
  }

  // exemptUsers / allowlistPatterns / toolCommands — minimum + closed (§8.1.1).
  for (const key of FLOOR_LIST_KEYS) {
    const rule = floor[key];
    if (!rule) continue;
    if (rule.closed) {
      const dropped = out[key].filter((v) => !rule.minimum.includes(v));
      // Un avis par niveau dont une entrée est écartée — la fusion des listes les unit.
      const levels = new Set<ConfigLevel>();
      for (const v of dropped) for (const l of written.entries.get(key)?.get(v) ?? []) levels.add(l);
      for (const l of ['org', 'repo'] as const) if (levels.has(l)) override(key, l);
      out[key] = [...rule.minimum];
    } else {
      for (const v of rule.minimum) if (!out[key].includes(v)) out[key].push(v);
    }
  }

  // configCacheTtlSeconds — valeur imposée, ni minimum ni maximum (§8.1.1, règle 4 du §8.1.3).
  if (floor.configCacheTtlSeconds !== undefined && out.configCacheTtlSeconds !== floor.configCacheTtlSeconds) {
    overridden('configCacheTtlSeconds');
    out.configCacheTtlSeconds = floor.configCacheTtlSeconds;
  }

  // Limite basse de sévérité (§8.2) : un code E- ne descend jamais sous warn.
  for (const [code, sev] of Object.entries(out.severities)) {
    if (code.startsWith('E-') && sev === 'off') {
      out.severities[code] = 'warn';
      // `off` ne vient que d'un document : le plancher ne fait que relever.
      const level = written.keys.get(`severities.${code}`) ?? 'merged';
      notices.push(makeNotice('config-warning', 'config.severity-raised', { code, level }, `severities.${code}`));
    }
  }

  return { config: out, notices };
}
