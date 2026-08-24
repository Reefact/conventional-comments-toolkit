// Bornes d'entreprise (§8.1.1). « Plancher » signifie : le niveau inférieur ne peut pas
// assouplir — l'opération exacte est normative clé par clé, elle ne se déduit pas d'une
// règle générale (l'erreur type : max() sur activatedAt produit l'inverse du but).

import type { EffectiveConfig, Floor, Mode, Notice, Severity } from '../types.js';
import { SUPPORTED_FLOOR_VERSION } from '../version.js';
import { filterAllowlistPatterns, filterToolCommands, MODES, SEVERITIES } from './schema.js';

export const MODE_SCALE: Record<Mode, number> = { off: 0, assist: 1, warn: 2, enforce: 3 };
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

function floorWarning(message: string, ref: string): Notice {
  return { kind: 'config-warning', message, ref };
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
    notices.push(floorWarning('floor key ignored: expected an array of strings', ref));
    return [];
  }
  const kept = value.filter((e): e is string => typeof e === 'string');
  // Signaler AUSSI le tri à l'intérieur du tableau, et pas seulement le tableau absent :
  // `["org/securite", 42]` perd son 42 sans que personne ne l'apprenne, alors que le
  // contrat annoncé est « écartée ET signalée ». Une politique d'entreprise à moitié
  // appliquée en silence est précisément ce que cette passe existe pour empêcher.
  if (kept.length !== value.length) {
    notices.push(
      floorWarning(`floor: ${value.length - kept.length} non-string entr${value.length - kept.length > 1 ? 'ies' : 'y'} ignored`, ref)
    );
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
  notices.push(floorWarning('floor rule "closed" is not a boolean: the list is kept closed', ref));
  return true;
}

/** Les clés que le §8.1.1 définit. Une clé hors liste est ignorée par tout le reste du
 * code ; sans avertissement, `{"minimumMood": "enforce"}` laisserait l'administration
 * croire son plancher posé alors qu'il ne l'est pas. */
const FLOOR_KEYS = new Set([
  'floorVersion', 'configUrl', 'minimumMode', 'formatSeverity', 'severities', 'labels',
  'rules', 'activation', 'exemptUsers', 'allowlistPatterns', 'toolCommands',
  'resolverOverrideGroup', 'configCacheTtlSeconds',
]);

/** Entier positif ou nul — la même exigence que `parseConfigDocument()` pose au document
 * de dépôt sur `configCacheTtlSeconds` et sur les seuils de `rules`. */
function asNonNegativeInt(value: unknown, ref: string, notices: Notice[]): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  notices.push(floorWarning('floor key ignored: must be a non-negative integer', ref));
  return undefined;
}

function asOneOf(value: unknown, allowed: string[], ref: string, notices: Notice[]): string | undefined {
  if (typeof value === 'string' && allowed.includes(value)) return value;
  notices.push(floorWarning(`floor key ignored: must be one of ${allowed.join(', ')}`, ref));
  return undefined;
}

/** Un objet, ou rien. Évite d'aller lire une sous-clé sur un scalaire. */
function asObject(value: unknown, ref: string, notices: Notice[]): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  notices.push(floorWarning('floor key ignored: must be an object', ref));
  return undefined;
}

export function vetFloor(floor: Floor | null | undefined): VettedFloor {
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
        {
          kind: 'unsupported-version',
          message: `floor version ${version} exceeds supported version ${SUPPORTED_FLOOR_VERSION}: the floor is not applied and the component falls back to assist mode (§8.1.1)`,
          ref: 'floorVersion',
        },
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
    const raw = asStringArray(rule?.minimum, `${key}.minimum`, notices);
    const filtered: Notice[] = [];
    const kept =
      key === 'allowlistPatterns'
        ? filterAllowlistPatterns(raw, filtered)
        : key === 'toolCommands'
          ? filterToolCommands(raw, filtered)
          : raw; // `exemptUsers` n'a pas de filtre d'entrée : un login est libre (§8.2).
    // Le message dit d'OÙ vient l'entrée écartée : sans cela, une administration qui
    // débogue sa politique lirait un avertissement identique à celui d'un fichier de
    // dépôt et chercherait au mauvais endroit.
    for (const n of filtered) notices.push({ ...n, message: `floor: ${n.message}` });
    out[key] = { minimum: kept, closed: asClosed(rule?.closed, `${key}.closed`, notices) };
  }

  if (out.resolverOverrideGroup !== undefined) {
    out.resolverOverrideGroup = asStringArray(out.resolverOverrideGroup, 'resolverOverrideGroup', notices);
  }
  if (out.labels !== undefined) {
    out.labels = { minimum: asStringArray(out.labels?.minimum, 'labels.minimum', notices) };
  }

  // ————— Les clés scalaires, et les clés inconnues —————
  //
  // Une valeur fautive est ÉCARTÉE : le plancher ne contraint alors tout simplement pas
  // cette clé-là, et l'avertissement est la seule sauvegarde — il n'existe aucune valeur
  // sûre à inventer à la place. Poser `enforce` sur une coquille de `minimumMode`
  // bloquerait les merges de toute une organisation ; poser une date sur une coquille
  // d'`activatedAt` ferait entrer un historique arbitraire dans le périmètre. Écarter est
  // le seul geste qui ne décide rien à la place de qui a écrit la politique.
  //
  // C'est la nuance que la règle des listes ci-dessus n'a pas : y retirer une entrée
  // fautive durcit toujours. Ici, non — d'où l'avertissement, qui n'est pas décoratif.
  for (const key of Object.keys(out)) {
    if (!FLOOR_KEYS.has(key)) {
      notices.push(floorWarning(`unknown floor key "${key}" ignored`, key));
      delete (out as Record<string, unknown>)[key];
    }
  }
  const drop = (k: keyof Floor) => { delete out[k]; };

  if (out.configUrl !== undefined && out.configUrl !== null && typeof out.configUrl !== 'string') {
    notices.push(floorWarning('floor key ignored: must be a string or null', 'configUrl'));
    drop('configUrl');
  }
  if (out.minimumMode !== undefined) {
    const v = asOneOf(out.minimumMode, MODES, 'minimumMode', notices);
    if (v === undefined) drop('minimumMode');
    else out.minimumMode = v as Mode;
  }
  if (out.formatSeverity !== undefined) {
    const v = asOneOf(out.formatSeverity, ['warn', 'error'], 'formatSeverity', notices);
    if (v === undefined) drop('formatSeverity');
    else out.formatSeverity = v as 'warn' | 'error';
  }
  if (out.severities !== undefined) {
    const obj = asObject(out.severities, 'severities', notices);
    if (obj === undefined) drop('severities');
    else {
      const kept: Record<string, Severity> = {};
      for (const [code, sev] of Object.entries(obj)) {
        if (typeof sev === 'string' && SEVERITIES.includes(sev)) kept[code] = sev as Severity;
        else notices.push(floorWarning(`floor severity of "${code}" ignored: must be one of ${SEVERITIES.join(', ')}`, `severities.${code}`));
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
          notices.push(floorWarning(`unknown floor key "rules.${k}" ignored`, `rules.${k}`));
          continue;
        }
        const n = asNonNegativeInt(v, 'rules.minDecisionSubjectLength', notices);
        if (n !== undefined) rules.minDecisionSubjectLength = n;
      }
      out.rules = rules;
    }
  }
  if (out.activation !== undefined) {
    const obj = asObject(out.activation, 'activation', notices);
    if (obj === undefined) drop('activation');
    else {
      const activation: { activatedAt?: string } = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k !== 'activatedAt') {
          notices.push(floorWarning(`unknown floor key "activation.${k}" ignored`, `activation.${k}`));
          continue;
        }
        // La date NON VÉRIFIÉE était le pire défaut de cette famille : `Date.parse()`
        // rend NaN, la comparaison de périmètre du §6.2.3 est alors fausse pour TOUTE
        // PR, et `evaluate()` publie `success` partout — l'enforcement d'une organisation
        // entière annulé par une coquille, sans que rien ne le signale.
        if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) activation.activatedAt = v;
        else notices.push(floorWarning('floor key ignored: must be an ISO 8601 date', 'activation.activatedAt'));
      }
      out.activation = activation;
    }
  }
  if (out.configCacheTtlSeconds !== undefined
      && asNonNegativeInt(out.configCacheTtlSeconds, 'configCacheTtlSeconds', notices) === undefined) {
    drop('configCacheTtlSeconds');
  }

  return { floor: out, notices, unsupported: false };
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
 * `skipActivation` — l'exception du §8.1.1 : un durcissement du plancher sur
 * `activation.activatedAt` est épinglé, pas appliqué en direct — le mélange d'épinglage
 * (pinning.ts) porte alors la clé.
 */
export function applyFloor(
  config: EffectiveConfig,
  floor: Floor,
  written: Set<string>,
  opts: { skipActivation?: boolean } = {}
): FloorApplication {
  const out = structuredClone(config);
  const notices: Notice[] = [];
  const overridden = (key: string) => {
    if (written.has(key)) {
      notices.push({
        kind: 'floor-override',
        message: `repository/organization key "${key}" ignored: it would relax the enterprise floor (§8.1.1)`,
        ref: key,
      });
    }
  };

  // mode — minimum sur l'échelle des modes ; durcir est permis.
  if (floor.minimumMode !== undefined && MODE_SCALE[out.mode] < MODE_SCALE[floor.minimumMode]) {
    out.mode = floor.minimumMode;
    overridden('mode');
  }

  // formatSeverity — minimum sur sa propre échelle (error > warn).
  if (floor.formatSeverity === 'error' && out.formatSeverity === 'warn') {
    out.formatSeverity = 'error';
    overridden('formatSeverity');
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

  // labels — ids dont ni enabled ni blockingByDefault ne peuvent passer à false en
  // dessous du plancher (§8.1.1). La contrainte porte sur la VALEUR EFFECTIVE, comme
  // pour toutes les autres clés du plancher — c'est la clé par laquelle un dépôt éteint
  // la contrainte le plus complètement, et une lecture limitée aux seules écritures
  // laisserait passer une valeur héritée. Le plancher n'invente pas de label : il
  // protège ceux que la configuration connaît.
  if (floor.labels?.minimum) {
    for (const id of floor.labels.minimum) {
      const label = out.labels.find((l) => l.id === id);
      if (!label) continue;
      if (!label.enabled) {
        label.enabled = true;
        overridden(`labels.${id}.enabled`);
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

  // activation.activatedAt — min(plancher, niveau inférieur) : une date plus ancienne
  // élargit le périmètre, donc durcit. Seule exception à la règle des bornes en direct :
  // en présence d'une configuration épinglée, ce durcissement est épinglé (§8.1.1).
  if (!opts.skipActivation && floor.activation?.activatedAt !== undefined) {
    const f = floor.activation.activatedAt;
    const current = out.activation.activatedAt;
    if (current === null || Date.parse(f) < Date.parse(current)) {
      out.activation.activatedAt = f;
    }
  }

  // exemptUsers / allowlistPatterns / toolCommands — minimum + closed (§8.1.1).
  for (const key of FLOOR_LIST_KEYS) {
    const rule = floor[key];
    if (!rule) continue;
    if (rule.closed) {
      const dropped = out[key].filter((v) => !rule.minimum.includes(v));
      if (dropped.length > 0) overridden(key);
      out[key] = [...rule.minimum];
    } else {
      for (const v of rule.minimum) if (!out[key].includes(v)) out[key].push(v);
    }
  }

  // resolverOverrideGroup — le groupe du plancher ne peut pas être remplacé ; un niveau
  // inférieur restreint en ajoutant : l'habilitation effective est l'intersection —
  // être membre de chacun des groupes cités (§8.1.1).
  if (floor.resolverOverrideGroup) {
    for (const g of floor.resolverOverrideGroup) {
      if (!out.resolverOverrideGroup.includes(g)) out.resolverOverrideGroup.push(g);
    }
  }

  // configCacheTtlSeconds — valeur imposée, ni minimum ni maximum (§8.1.1, règle 4 du §8.1.3).
  if (floor.configCacheTtlSeconds !== undefined && out.configCacheTtlSeconds !== floor.configCacheTtlSeconds) {
    if (written.has('configCacheTtlSeconds')) overridden('configCacheTtlSeconds');
    out.configCacheTtlSeconds = floor.configCacheTtlSeconds;
  }

  // Limite basse de sévérité (§8.2) : un code E- ne descend jamais sous warn.
  for (const [code, sev] of Object.entries(out.severities)) {
    if (code.startsWith('E-') && sev === 'off') {
      out.severities[code] = 'warn';
      notices.push({
        kind: 'config-warning',
        message: `severity of "${code}" cannot go below "warn" (§8.2): value "off" raised to "warn"`,
        ref: `severities.${code}`,
      });
    }
  }

  return { config: out, notices };
}
