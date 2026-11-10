// Analyse et validation d'un document de configuration (§8.1.5, §8.2).
// Une clé inconnue est ignorée avec un avertissement ; une valeur hors du domaine d'une
// clé connue invalide le document entier — on ne peut rien en conclure (§8.1.5).

import type { Notice, NoticeParams } from '../types.js';
import { makeNotice } from './notices.js';
import { SUPPORTED_CONFIG_VERSION, CORE_MAJOR } from '../version.js';

export interface ParsedDocument {
  /** Valeurs lues, sous forme partielle prête à fusionner. Null si document invalide. */
  values: Record<string, unknown> | null;
  notices: Notice[];
  /** Vrai si le document est syntaxiquement invalide ou porte une valeur hors domaine. */
  invalid: boolean;
  /** Vrai si version de schéma ou coreMinVersion dépassent ce que ce composant sait
   * appliquer (§8.1.5, dernière ligne) : repli mode assist / plancher si plus strict. */
  unsupported: boolean;
}

export const MODES = ['off', 'assist', 'enforce'];
/** `warn` n'est plus un mode : il est lu comme `assist`, et le fait signalé (§7). Le refuser
 * comme valeur hors domaine ferait retomber dans le repli du §8.1.5 toute configuration
 * existante qui l'emploie. */
export const DEPRECATED_MODE = 'warn';

/** L'avis qui accompagne la lecture de `"warn"` (§7) — le même pour un document de
 * configuration et pour le plancher, d'où son partage. */
export function deprecatedModeNotice(ref: string): Notice {
  return makeNotice('config-warning', 'config.deprecated-warn', { key: ref }, ref);
}
export const SEVERITIES = ['off', 'warn', 'error'];
const FORCES = ['blocking', 'non-blocking', null];

// Les clés retirées avec le vérificateur — `formatSeverity`, `overrideLabel`,
// `resolverOverrideGroup`, `activation`, `docUrl` — n'y figurent plus : une configuration qui
// les porte encore reste lisible, chacune y étant une clé inconnue, ignorée et signalée
// (`config-warning`), sans repli (§8.2, « Clés retirées » ; §8.1.5).
const KNOWN_KEYS = new Set([
  '$schema',
  'version',
  'mode',
  'labels',
  'decorations',
  'severities',
  'scope',
  'rules',
  'exemptUsers',
  'allowlistPatterns',
  'toolCommands',
  'configUrl',
  'coreMinVersion',
  'configCacheTtlSeconds',
  'badgeStyle',
  'sessionIcon',
  'shortcuts',
  'language',
  'telemetry',
]);

function warning(code: string, params: NoticeParams, ref?: string): Notice {
  return makeNotice('config-warning', code, params, ref);
}

/** Le signal d'une valeur que `bad()` refuse : la clé fautive, et le message qui dit
 * pourquoi — rendu par le catalogue, comme tout avis (§10). */
type Bad = (key: string, code: string, params?: NoticeParams) => void;

/** Ligne fautive d'une erreur JSON.parse V8 (« at position N ») — meilleur effort (§8.1.5). */
function faultyLine(text: string, error: unknown): number | undefined {
  const msg = error instanceof Error ? error.message : String(error);
  const m = /position (\d+)/.exec(msg);
  if (!m) return undefined;
  const pos = Number(m[1]);
  return text.slice(0, pos).split('\n').length;
}

export function parseConfigDocument(
  text: string,
  opts: { level: 'repo' | 'org' }
): ParsedDocument {
  const notices: Notice[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const line = faultyLine(text, e);
    notices.push(
      line === undefined
        ? makeNotice('invalid-config', 'invalid.json-no-line')
        : makeNotice('invalid-config', 'invalid.json', { line }, `line ${line}`)
    );
    return { values: null, notices, invalid: true, unsupported: false };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    notices.push(makeNotice('invalid-config', 'invalid.not-object'));
    return { values: null, notices, invalid: true, unsupported: false };
  }
  const doc = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let isInvalid = false;
  let unsupported = false;
  const bad: Bad = (key, code, params = {}) => {
    notices.push(makeNotice('invalid-config', code, { key, ...params }, key));
    isInvalid = true;
  };

  for (const [key, value] of Object.entries(doc)) {
    if (!KNOWN_KEYS.has(key)) {
      notices.push(warning('config.unknown-key', { key }, key));
      continue;
    }
    switch (key) {
      case '$schema':
        break;
      case 'version':
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
          bad(key, 'invalid.positive-integer');
        } else if (value > SUPPORTED_CONFIG_VERSION) {
          unsupported = true;
          notices.push(
            makeNotice('unsupported-version', 'unsupported.schema-version', { version: value, supported: SUPPORTED_CONFIG_VERSION }, key)
          );
        } else {
          out[key] = value;
        }
        break;
      case 'mode':
        if (value === DEPRECATED_MODE) {
          out[key] = 'assist';
          notices.push(deprecatedModeNotice(key));
        } else if (typeof value !== 'string' || !MODES.includes(value)) bad(key, 'invalid.one-of', { values: MODES.join(', ') });
        else out[key] = value;
        break;
      case 'labels': {
        if (!Array.isArray(value)) {
          bad(key, 'invalid.array');
          break;
        }
        const labels: Record<string, unknown>[] = [];
        for (const entry of value) {
          if (entry === null || typeof entry !== 'object' || typeof (entry as Record<string, unknown>)['id'] !== 'string') {
            bad(key, 'invalid.label-entry');
            continue;
          }
          const e = entry as Record<string, unknown>;
          const label: Record<string, unknown> = { id: e['id'] };
          let ok = true;
          for (const flag of ['enabled', 'blockingByDefault', 'alwaysNonBlocking'] as const) {
            if (flag in e) {
              if (typeof e[flag] !== 'boolean') {
                bad(key, 'invalid.label-boolean', { prop: flag, label: e['id'] as string });
                ok = false;
              } else label[flag] = e[flag];
            }
          }
          for (const s of ['icon', 'color', 'description', 'usage'] as const) {
            if (s in e) {
              if (typeof e[s] !== 'string') {
                bad(key, 'invalid.label-string', { prop: s, label: e['id'] as string });
                ok = false;
              } else label[s] = e[s];
            }
          }
          if ('kind' in e) {
            if (e['kind'] !== 'remark' && e['kind'] !== 'status' && e['kind'] !== 'reply') {
              bad(key, 'invalid.label-kind', { label: e['id'] as string });
              ok = false;
            } else label['kind'] = e['kind'];
          }
          if ('aliases' in e) {
            if (!Array.isArray(e['aliases']) || !(e['aliases'] as unknown[]).every((a) => typeof a === 'string')) {
              bad(key, 'invalid.label-aliases', { label: e['id'] as string });
              ok = false;
            } else label['aliases'] = e['aliases'];
          }
          for (const k of Object.keys(e)) {
            if (!['id', 'enabled', 'blockingByDefault', 'alwaysNonBlocking', 'kind', 'icon', 'color', 'description', 'usage', 'aliases'].includes(k)) {
              notices.push(warning('config.unknown-key', { key: `labels[].${k}` }, `labels[].${k}`));
            }
          }
          if (ok) labels.push(label);
        }
        out[key] = labels;
        break;
      }
      case 'decorations': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'invalid.object');
          break;
        }
        const d = value as Record<string, unknown>;
        const decorations: Record<string, unknown> = {};
        if ('allowFree' in d) {
          if (typeof d['allowFree'] !== 'boolean') bad(key, 'invalid.prop-boolean', { prop: 'allowFree' });
          else decorations['allowFree'] = d['allowFree'];
        }
        if ('known' in d) {
          if (!Array.isArray(d['known'])) {
            bad(key, 'invalid.prop-array', { prop: 'known' });
          } else {
            const known: Record<string, unknown>[] = [];
            for (const entry of d['known']) {
              const e = entry as Record<string, unknown> | null;
              if (e === null || typeof e !== 'object' || typeof e['id'] !== 'string') {
                bad(key, 'invalid.decoration-entry');
                continue;
              }
              const forces = 'forces' in e ? e['forces'] : null;
              if (!FORCES.includes(forces as string | null)) {
                bad(key, 'invalid.decoration-forces', { decoration: e['id'] as string });
                continue;
              }
              known.push({ id: e['id'], forces: forces ?? null });
            }
            decorations['known'] = known;
          }
        }
        for (const k of Object.keys(d)) {
          if (k !== 'allowFree' && k !== 'known') notices.push(warning('config.unknown-key', { key: `decorations.${k}` }, `decorations.${k}`));
        }
        out[key] = decorations;
        break;
      }
      case 'severities': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'invalid.object');
          break;
        }
        const sev: Record<string, string> = {};
        for (const [code, s] of Object.entries(value as Record<string, unknown>)) {
          if (typeof s !== 'string' || !SEVERITIES.includes(s)) {
            bad(key, 'invalid.severity', { code, values: SEVERITIES.join(', ') });
            continue;
          }
          sev[code] = s;
        }
        out[key] = sev;
        break;
      }
      case 'scope': {
        const r = readBooleanObject(key, value, ['validateReplies', 'validateReviewSummary'], bad, notices);
        if (r) out[key] = r;
        break;
      }
      case 'rules': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'invalid.object');
          break;
        }
        const rules: Record<string, number> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (!['minSubjectLength', 'maxSubjectLength', 'minDecisionSubjectLength'].includes(k)) {
            notices.push(warning('config.unknown-key', { key: `rules.${k}` }, `rules.${k}`));
            continue;
          }
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
            bad(key, 'invalid.prop-non-negative-integer', { prop: k });
            continue;
          }
          rules[k] = v;
        }
        out[key] = rules;
        break;
      }
      case 'exemptUsers': {
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) bad(key, 'invalid.string-array');
        else out[key] = value;
        break;
      }
      case 'allowlistPatterns': {
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
          bad(key, 'invalid.string-array');
          break;
        }
        out[key] = filterAllowlistPatterns(value as string[], notices);
        break;
      }
      case 'toolCommands': {
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
          bad(key, 'invalid.string-array');
          break;
        }
        out[key] = filterToolCommands(value as string[], notices);
        break;
      }
      case 'badgeStyle':
      case 'sessionIcon': {
        if (typeof value !== 'string' || value === '') bad(key, 'invalid.non-empty-string');
        else out[key] = value;
        break;
      }
      case 'configUrl': {
        if (value !== null && typeof value !== 'string') {
          bad(key, 'invalid.string-or-null');
          break;
        }
        if (opts.level === 'repo' && value !== null) {
          // §8.1.2 — un configUrl posé dans le fichier de dépôt est ignoré et signalé.
          notices.push(warning('config.repo-config-url', {}, 'configUrl'));
        } else {
          out[key] = value;
        }
        break;
      }
      case 'coreMinVersion': {
        if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
          bad(key, 'invalid.semver');
          break;
        }
        const major = Number(value.split('.')[0]);
        if (major > CORE_MAJOR) {
          unsupported = true;
          notices.push(
            makeNotice('unsupported-version', 'unsupported.core-version', { required: value, major, current: CORE_MAJOR }, key)
          );
        } else {
          out[key] = value;
        }
        break;
      }
      case 'configCacheTtlSeconds': {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) bad(key, 'invalid.non-negative-integer');
        else out[key] = value;
        break;
      }
      case 'shortcuts': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'invalid.object');
          break;
        }
        const s = value as Record<string, unknown>;
        const shortcuts: Record<string, unknown> = {};
        if ('abbreviations' in s) {
          const a = s['abbreviations'];
          if (a === null || typeof a !== 'object' || Array.isArray(a) || !Object.values(a).every((v) => typeof v === 'string')) {
            bad(key, 'invalid.abbreviations');
          } else shortcuts['abbreviations'] = a;
        }
        for (const k of Object.keys(s)) {
          if (k !== 'abbreviations') notices.push(warning('config.unknown-key', { key: `shortcuts.${k}` }, `shortcuts.${k}`));
        }
        out[key] = shortcuts;
        break;
      }
      case 'language': {
        if (value !== null && typeof value !== 'string') bad(key, 'invalid.string-or-null');
        else out[key] = value;
        break;
      }
      case 'telemetry': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'invalid.object');
          break;
        }
        const tel = value as Record<string, unknown>;
        const telemetry: Record<string, unknown> = {};
        if ('enabled' in tel) {
          if (typeof tel['enabled'] !== 'boolean') bad(key, 'invalid.prop-boolean', { prop: 'enabled' });
          else telemetry['enabled'] = tel['enabled'];
        }
        if ('endpoint' in tel) {
          if (tel['endpoint'] !== null && typeof tel['endpoint'] !== 'string') bad(key, 'invalid.prop-string-or-null', { prop: 'endpoint' });
          else telemetry['endpoint'] = tel['endpoint'];
        }
        for (const k of Object.keys(tel)) {
          if (k !== 'enabled' && k !== 'endpoint') notices.push(warning('config.unknown-key', { key: `telemetry.${k}` }, `telemetry.${k}`));
        }
        out[key] = telemetry;
        break;
      }
    }
  }

  if (isInvalid) return { values: null, notices, invalid: true, unsupported };
  return { values: out, notices, invalid: false, unsupported };
}

function readBooleanObject(
  key: string,
  value: unknown,
  fields: string[],
  bad: Bad,
  notices: Notice[]
): Record<string, boolean> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    bad(key, 'invalid.object');
    return null;
  }
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!fields.includes(k)) {
      notices.push(warning('config.unknown-key', { key: `${key}.${k}` }, `${key}.${k}`));
      continue;
    }
    if (typeof v !== 'boolean') {
      bad(key, 'invalid.prop-boolean', { prop: k });
      continue;
    }
    out[k] = v;
  }
  return out;
}

// ————— Grammaire de toolCommands (§4.2, §8.2) —————

const TOOL_COMMAND_MENTION = /^@[A-Za-z0-9_-]+$/;

/** Chaque entrée est comparée telle quelle, jamais interprétée comme un motif : `/*`
 * (sentinel générique) ou un handle exact `@notre-bot`. Aucune autre forme n'est admise —
 * l'entrée qui n'y correspond pas est ignorée et signalée (§4.2). */
export function filterToolCommands(entries: string[], notices: Notice[], source: NoticeSource = 'config'): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e === '/*' || TOOL_COMMAND_MENTION.test(e)) out.push(e);
    else notices.push(warning(`${source}.tool-command-invalid`, { entry: e }, e));
  }
  return out;
}

// ————— Bornes statiques d'allowlistPatterns (§8.2) —————

export const ALLOWLIST_MAX_PATTERNS = 50;
export const ALLOWLIST_MAX_LENGTH = 256;

/** D'où vient l'entrée écartée : un document de configuration, ou le plancher. Le message
 * le dit — sans cela, une administration qui débogue sa politique lirait un avertissement
 * identique à celui d'un fichier de dépôt et chercherait au mauvais endroit. Les deux familles
 * de clés (`config.*`, `floor.*`) sont écrites en toutes lettres dans les catalogues. */
export type NoticeSource = 'config' | 'floor';

export function filterAllowlistPatterns(patterns: string[], notices: Notice[], source: NoticeSource = 'config'): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    if (out.length >= ALLOWLIST_MAX_PATTERNS) {
      notices.push(warning(`${source}.allowlist-too-many`, { max: ALLOWLIST_MAX_PATTERNS }, p));
      continue;
    }
    if (p.length > ALLOWLIST_MAX_LENGTH) {
      notices.push(warning(`${source}.allowlist-too-long`, { max: ALLOWLIST_MAX_LENGTH }, p.slice(0, 40)));
      continue;
    }
    if (hasNestedQuantifier(p)) {
      notices.push(warning(`${source}.allowlist-nested`, {}, p));
      continue;
    }
    try {
      new RegExp(p);
    } catch {
      notices.push(warning(`${source}.allowlist-invalid`, {}, p));
      continue;
    }
    out.push(p);
  }
  return out;
}

/** Détection statique d'un quantificateur portant sur un groupe qui en contient déjà un —
 * la forme dont relève l'essentiel des ReDoS connus (§8.2). */
export function hasNestedQuantifier(pattern: string): boolean {
  // Pile de groupes : pour chacun, a-t-on vu un quantificateur à l'intérieur ?
  const stack: boolean[] = [];
  let containsQuantifier: boolean = false; // pour le niveau courant
  let i = 0;
  const isQuantifierAt = (idx: number): boolean => {
    const c = pattern[idx];
    if (c === '*' || c === '+' || c === '?') return true;
    if (c === '{') {
      const m = /^\{\d+(,\d*)?\}/.exec(pattern.slice(idx));
      return m !== null;
    }
    return false;
  };
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') {
      // Classe de caractères : ignorer jusqu'au ']' non échappé.
      i++;
      while (i < pattern.length && pattern[i] !== ']') {
        if (pattern[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === '(') {
      stack.push(containsQuantifier);
      containsQuantifier = false;
      i++;
      // Le `?` de syntaxe de groupe — `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!`, `(?<nom>` —
      // n'est pas un quantificateur : le sauter pour ne pas rejeter `(?:abc)+` à tort.
      if (pattern[i] === '?') {
        i++;
        if (pattern[i] === ':' || pattern[i] === '=' || pattern[i] === '!') {
          i++;
        } else if (pattern[i] === '<') {
          i++;
          if (pattern[i] === '=' || pattern[i] === '!') {
            i++;
          } else {
            while (i < pattern.length && pattern[i] !== '>') i++;
            i++;
          }
        }
      }
      continue;
    }
    if (c === ')') {
      const inner: boolean = containsQuantifier;
      containsQuantifier = stack.pop() ?? false;
      // Le groupe refermé est-il quantifié, alors qu'il contient un quantificateur ?
      if (inner && isQuantifierAt(i + 1)) return true;
      containsQuantifier = containsQuantifier || inner;
      i++;
      continue;
    }
    if (isQuantifierAt(i)) {
      containsQuantifier = true;
      if (c === '{') {
        const m = /^\{\d+(,\d*)?\}/.exec(pattern.slice(i));
        i += m ? m[0].length : 1;
        continue;
      }
    }
    i++;
  }
  return false;
}
