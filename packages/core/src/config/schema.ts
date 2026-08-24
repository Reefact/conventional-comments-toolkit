// Analyse et validation d'un document de configuration (§8.1.5, §8.2).
// Une clé inconnue est ignorée avec un avertissement ; une valeur hors du domaine d'une
// clé connue invalide le document entier — on ne peut rien en conclure (§8.1.5).

import type { Notice } from '../types.js';
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

const MODES = ['off', 'assist', 'warn', 'enforce'];
const SEVERITIES = ['off', 'warn', 'error'];
const FORCES = ['blocking', 'non-blocking', null];

const KNOWN_KEYS = new Set([
  '$schema',
  'version',
  'mode',
  'labels',
  'decorations',
  'severities',
  'scope',
  'rules',
  'formatSeverity',
  'exemptUsers',
  'allowlistPatterns',
  'toolCommands',
  'resolverOverrideGroup',
  'overrideLabel',
  'activation',
  'configUrl',
  'coreMinVersion',
  'configCacheTtlSeconds',
  'badgeStyle',
  'shortcuts',
  'docUrl',
  'server',
  'exemptionLog',
  'language',
  'telemetry',
]);

function warning(message: string, ref?: string): Notice {
  return { kind: 'config-warning', message, ...(ref ? { ref } : {}) };
}

function invalid(message: string, ref?: string): Notice {
  return { kind: 'invalid-config', message, ...(ref ? { ref } : {}) };
}

/** Ligne fautive d'une erreur JSON.parse V8 (« at position N ») — meilleur effort (§8.1.5). */
function faultyLine(text: string, error: unknown): string | undefined {
  const msg = error instanceof Error ? error.message : String(error);
  const m = /position (\d+)/.exec(msg);
  if (!m) return undefined;
  const pos = Number(m[1]);
  const line = text.slice(0, pos).split('\n').length;
  return `line ${line}`;
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
    notices.push(invalid(`unparseable JSON${line ? ` (${line})` : ''}`, line));
    return { values: null, notices, invalid: true, unsupported: false };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    notices.push(invalid('the configuration document must be a JSON object'));
    return { values: null, notices, invalid: true, unsupported: false };
  }
  const doc = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let isInvalid = false;
  let unsupported = false;
  const bad = (key: string, detail: string) => {
    notices.push(invalid(`key "${key}": ${detail}`, key));
    isInvalid = true;
  };

  for (const [key, value] of Object.entries(doc)) {
    if (!KNOWN_KEYS.has(key)) {
      notices.push(warning(`unknown configuration key "${key}" ignored`, key));
      continue;
    }
    switch (key) {
      case '$schema':
        break;
      case 'version':
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
          bad(key, 'must be a positive integer');
        } else if (value > SUPPORTED_CONFIG_VERSION) {
          unsupported = true;
          notices.push({
            kind: 'unsupported-version',
            message: `configuration schema version ${value} exceeds supported version ${SUPPORTED_CONFIG_VERSION}: falling back to assist mode (or the floor if stricter)`,
            ref: key,
          });
        } else {
          out[key] = value;
        }
        break;
      case 'mode':
        if (typeof value !== 'string' || !MODES.includes(value)) bad(key, `must be one of ${MODES.join(', ')}`);
        else out[key] = value;
        break;
      case 'formatSeverity':
        if (value !== 'warn' && value !== 'error') bad(key, 'must be "warn" or "error"');
        else out[key] = value;
        break;
      case 'labels': {
        if (!Array.isArray(value)) {
          bad(key, 'must be an array');
          break;
        }
        const labels: Record<string, unknown>[] = [];
        for (const entry of value) {
          if (entry === null || typeof entry !== 'object' || typeof (entry as Record<string, unknown>)['id'] !== 'string') {
            bad(key, 'each entry must be an object with a string "id"');
            continue;
          }
          const e = entry as Record<string, unknown>;
          const label: Record<string, unknown> = { id: e['id'] };
          let ok = true;
          for (const flag of ['enabled', 'blockingByDefault', 'alwaysNonBlocking'] as const) {
            if (flag in e) {
              if (typeof e[flag] !== 'boolean') {
                bad(key, `"${flag}" of label "${e['id']}" must be a boolean`);
                ok = false;
              } else label[flag] = e[flag];
            }
          }
          for (const s of ['icon', 'color'] as const) {
            if (s in e) {
              if (typeof e[s] !== 'string') {
                bad(key, `"${s}" of label "${e['id']}" must be a string`);
                ok = false;
              } else label[s] = e[s];
            }
          }
          if ('aliases' in e) {
            if (!Array.isArray(e['aliases']) || !(e['aliases'] as unknown[]).every((a) => typeof a === 'string')) {
              bad(key, `"aliases" of label "${e['id']}" must be an array of strings`);
              ok = false;
            } else label['aliases'] = e['aliases'];
          }
          for (const k of Object.keys(e)) {
            if (!['id', 'enabled', 'blockingByDefault', 'alwaysNonBlocking', 'icon', 'color', 'aliases'].includes(k)) {
              notices.push(warning(`unknown key "labels[].${k}" ignored`, `labels[].${k}`));
            }
          }
          if (ok) labels.push(label);
        }
        out[key] = labels;
        break;
      }
      case 'decorations': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'must be an object');
          break;
        }
        const d = value as Record<string, unknown>;
        const decorations: Record<string, unknown> = {};
        if ('allowFree' in d) {
          if (typeof d['allowFree'] !== 'boolean') bad(key, '"allowFree" must be a boolean');
          else decorations['allowFree'] = d['allowFree'];
        }
        if ('known' in d) {
          if (!Array.isArray(d['known'])) {
            bad(key, '"known" must be an array');
          } else {
            const known: Record<string, unknown>[] = [];
            for (const entry of d['known']) {
              const e = entry as Record<string, unknown> | null;
              if (e === null || typeof e !== 'object' || typeof e['id'] !== 'string') {
                bad(key, 'each known decoration must be an object with a string "id"');
                continue;
              }
              const forces = 'forces' in e ? e['forces'] : null;
              if (!FORCES.includes(forces as string | null)) {
                bad(key, `"forces" of decoration "${e['id']}" must be "blocking", "non-blocking" or null`);
                continue;
              }
              known.push({ id: e['id'], forces: forces ?? null });
            }
            decorations['known'] = known;
          }
        }
        for (const k of Object.keys(d)) {
          if (k !== 'allowFree' && k !== 'known') notices.push(warning(`unknown key "decorations.${k}" ignored`, `decorations.${k}`));
        }
        out[key] = decorations;
        break;
      }
      case 'severities': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'must be an object');
          break;
        }
        const sev: Record<string, string> = {};
        for (const [code, s] of Object.entries(value as Record<string, unknown>)) {
          if (typeof s !== 'string' || !SEVERITIES.includes(s)) {
            bad(key, `severity of "${code}" must be one of ${SEVERITIES.join(', ')}`);
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
          bad(key, 'must be an object');
          break;
        }
        const rules: Record<string, number> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (!['minSubjectLength', 'maxSubjectLength', 'minDecisionSubjectLength'].includes(k)) {
            notices.push(warning(`unknown key "rules.${k}" ignored`, `rules.${k}`));
            continue;
          }
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
            bad(key, `"${k}" must be a non-negative integer`);
            continue;
          }
          rules[k] = v;
        }
        out[key] = rules;
        break;
      }
      case 'exemptUsers': {
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) bad(key, 'must be an array of strings');
        else out[key] = value;
        break;
      }
      case 'allowlistPatterns': {
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
          bad(key, 'must be an array of strings');
          break;
        }
        out[key] = filterAllowlistPatterns(value as string[], notices);
        break;
      }
      case 'toolCommands': {
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
          bad(key, 'must be an array of strings');
          break;
        }
        out[key] = filterToolCommands(value as string[], notices);
        break;
      }
      case 'resolverOverrideGroup': {
        // « Groupe ou liste de groupes » (§8.2) — normalisé en liste.
        if (typeof value === 'string') out[key] = [value];
        else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) out[key] = value;
        else bad(key, 'must be a string or an array of strings');
        break;
      }
      case 'overrideLabel':
      case 'badgeStyle':
      case 'docUrl': {
        if (typeof value !== 'string' || value === '') bad(key, 'must be a non-empty string');
        else out[key] = value;
        break;
      }
      case 'activation': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'must be an object');
          break;
        }
        const a = value as Record<string, unknown>;
        const activation: Record<string, unknown> = {};
        if ('activatedAt' in a) {
          const v = a['activatedAt'];
          if (v === null) activation['activatedAt'] = null;
          else if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) activation['activatedAt'] = v;
          else bad(key, '"activatedAt" must be an ISO 8601 date or null');
        }
        for (const k of Object.keys(a)) {
          if (k !== 'activatedAt') notices.push(warning(`unknown key "activation.${k}" ignored`, `activation.${k}`));
        }
        out[key] = activation;
        break;
      }
      case 'configUrl': {
        if (value !== null && typeof value !== 'string') {
          bad(key, 'must be a string or null');
          break;
        }
        if (opts.level === 'repo' && value !== null) {
          // §8.1.2 — un configUrl posé dans le fichier de dépôt est ignoré et signalé.
          notices.push(
            warning(
              'configUrl set in the repository file is ignored: the organization configuration URL comes exclusively from the floor channel (§8.1.2)',
              'configUrl'
            )
          );
        } else {
          out[key] = value;
        }
        break;
      }
      case 'coreMinVersion': {
        if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
          bad(key, 'must be a semver string');
          break;
        }
        const major = Number(value.split('.')[0]);
        if (major > CORE_MAJOR) {
          unsupported = true;
          notices.push({
            kind: 'unsupported-version',
            message: `coreMinVersion ${value} requires core/ major ${major}, this component runs ${CORE_MAJOR}: falling back to assist mode (or the floor if stricter)`,
            ref: key,
          });
        } else {
          out[key] = value;
        }
        break;
      }
      case 'configCacheTtlSeconds': {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) bad(key, 'must be a non-negative integer');
        else out[key] = value;
        break;
      }
      case 'shortcuts': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'must be an object');
          break;
        }
        const s = value as Record<string, unknown>;
        const shortcuts: Record<string, unknown> = {};
        if ('abbreviations' in s) {
          const a = s['abbreviations'];
          if (a === null || typeof a !== 'object' || Array.isArray(a) || !Object.values(a).every((v) => typeof v === 'string')) {
            bad(key, '"abbreviations" must be an object mapping abbreviation to inserted text');
          } else shortcuts['abbreviations'] = a;
        }
        for (const k of Object.keys(s)) {
          if (k !== 'abbreviations') notices.push(warning(`unknown key "shortcuts.${k}" ignored`, `shortcuts.${k}`));
        }
        out[key] = shortcuts;
        break;
      }
      case 'server': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'must be an object');
          break;
        }
        const s = value as Record<string, unknown>;
        const server: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s)) {
          if (['coalesceWindowSeconds', 'gracePeriodSeconds', 'reconcileIntervalSeconds'].includes(k)) {
            if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) bad(key, `"${k}" must be a non-negative integer`);
            else server[k] = v;
          } else if (k === 'statusTargetUrl') {
            if (v !== null && typeof v !== 'string') bad(key, '"statusTargetUrl" must be a string or null');
            else server[k] = v;
          } else {
            notices.push(warning(`unknown key "server.${k}" ignored`, `server.${k}`));
          }
        }
        out[key] = server;
        break;
      }
      case 'exemptionLog': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'must be an object');
          break;
        }
        const e = value as Record<string, unknown>;
        const log: Record<string, unknown> = {};
        if ('endpoint' in e) {
          if (e['endpoint'] !== null && typeof e['endpoint'] !== 'string') bad(key, '"endpoint" must be a string or null');
          else log['endpoint'] = e['endpoint'];
        }
        for (const k of Object.keys(e)) {
          if (k !== 'endpoint') notices.push(warning(`unknown key "exemptionLog.${k}" ignored`, `exemptionLog.${k}`));
        }
        out[key] = log;
        break;
      }
      case 'language': {
        if (value !== null && typeof value !== 'string') bad(key, 'must be a string or null');
        else out[key] = value;
        break;
      }
      case 'telemetry': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          bad(key, 'must be an object');
          break;
        }
        const tel = value as Record<string, unknown>;
        const telemetry: Record<string, unknown> = {};
        if ('enabled' in tel) {
          if (typeof tel['enabled'] !== 'boolean') bad(key, '"enabled" must be a boolean');
          else telemetry['enabled'] = tel['enabled'];
        }
        if ('endpoint' in tel) {
          if (tel['endpoint'] !== null && typeof tel['endpoint'] !== 'string') bad(key, '"endpoint" must be a string or null');
          else telemetry['endpoint'] = tel['endpoint'];
        }
        for (const k of Object.keys(tel)) {
          if (k !== 'enabled' && k !== 'endpoint') notices.push(warning(`unknown key "telemetry.${k}" ignored`, `telemetry.${k}`));
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
  bad: (key: string, detail: string) => void,
  notices: Notice[]
): Record<string, boolean> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    bad(key, 'must be an object');
    return null;
  }
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!fields.includes(k)) {
      notices.push(warning(`unknown key "${key}.${k}" ignored`, `${key}.${k}`));
      continue;
    }
    if (typeof v !== 'boolean') {
      bad(key, `"${k}" must be a boolean`);
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
export function filterToolCommands(entries: string[], notices: Notice[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e === '/*' || TOOL_COMMAND_MENTION.test(e)) out.push(e);
    else notices.push(warning('toolCommands entry ignored: must be "/*" or an exact "@handle"', e));
  }
  return out;
}

// ————— Bornes statiques d'allowlistPatterns (§8.2) —————

export const ALLOWLIST_MAX_PATTERNS = 50;
export const ALLOWLIST_MAX_LENGTH = 256;

export function filterAllowlistPatterns(patterns: string[], notices: Notice[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    if (out.length >= ALLOWLIST_MAX_PATTERNS) {
      notices.push(warning(`allowlist pattern ignored: more than ${ALLOWLIST_MAX_PATTERNS} patterns`, p));
      continue;
    }
    if (p.length > ALLOWLIST_MAX_LENGTH) {
      notices.push(warning(`allowlist pattern ignored: longer than ${ALLOWLIST_MAX_LENGTH} characters`, p.slice(0, 40)));
      continue;
    }
    if (hasNestedQuantifier(p)) {
      notices.push(warning('allowlist pattern ignored: nested quantifiers are not allowed', p));
      continue;
    }
    try {
      new RegExp(p);
    } catch {
      notices.push(warning('allowlist pattern ignored: invalid regular expression', p));
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
