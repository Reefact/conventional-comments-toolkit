// Analyse du préfixe : décorations (§3.3), résolution de label et d'alias (§3.2, §8.2).

import type { DecorationConfig, EffectiveConfig, LabelConfig } from './types.js';

export const IDENTIFIER_RE = /^[A-Za-z][A-Za-z0-9-]*$/;

export interface ParsedDecorations {
  /** Éléments bruts, tels que séparés par les virgules (jamais trimés). */
  rawElements: string[];
  /** Éléments canoniques (trimés, minuscules), pour les éléments syntaxiquement valides. */
  canonical: string[];
  /** Défauts de syntaxe (E-DECORATION-SYNTAX), un par élément fautif. */
  syntaxIssues: { kind: 'empty-parens' | 'empty-element' | 'invalid-chars' | 'internal-space'; element: string }[];
  /** Écarts de style (W-DECORATION-STYLE). */
  styleIssues: { kind: 'case' | 'border-spaces' | 'duplicate'; elements: string[] }[];
}

/** Analyse le contenu brut entre parenthèses. `raw` est le groupe capturé par la regex de
 * référence — présent, éventuellement vide (`issue (): x`). */
export function parseDecorations(raw: string): ParsedDecorations {
  const result: ParsedDecorations = { rawElements: [], canonical: [], syntaxIssues: [], styleIssues: [] };
  if (raw.trim() === '') {
    // Parenthèses vides — coquille, pas une absence de décoration (§3.4.2).
    result.syntaxIssues.push({ kind: 'empty-parens', element: raw });
    return result;
  }
  const rawElements = raw.split(',');
  result.rawElements = rawElements;

  const caseOffenders: string[] = [];
  let borderSpaces = false;
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  for (let i = 0; i < rawElements.length; i++) {
    const rawEl = rawElements[i]!;
    const trimmed = rawEl.trim();
    if (trimmed === '') {
      result.syntaxIssues.push({ kind: 'empty-element', element: rawEl });
      continue;
    }
    if (!IDENTIFIER_RE.test(trimmed)) {
      // Une espace interne est une coquille probable (§3.3) : message distinct.
      if (/^[A-Za-z0-9-]+(?: +[A-Za-z0-9-]+)+$/.test(trimmed)) {
        result.syntaxIssues.push({ kind: 'internal-space', element: trimmed });
      } else {
        result.syntaxIssues.push({ kind: 'invalid-chars', element: trimmed });
      }
      continue;
    }
    // Élément valide : forme canonique en minuscules (§3.1).
    const canonical = trimmed.toLowerCase();
    result.canonical.push(canonical);
    if (trimmed !== canonical) caseOffenders.push(trimmed);

    // Espaces de bordure : tête du premier élément, queue de tout élément,
    // et plus d'une espace après une virgule — l'amont sans espace comme la forme
    // avec une seule espace après la virgule sont toutes deux acceptées (§3.1).
    const leading = rawEl.length - rawEl.trimStart().length;
    const trailing = rawEl.length - rawEl.trimEnd().length;
    if ((i === 0 && leading > 0) || trailing > 0 || (i > 0 && leading > 1)) borderSpaces = true;

    const count = seen.get(canonical) ?? 0;
    seen.set(canonical, count + 1);
    if (count === 1) duplicates.push(canonical); // signalé une fois par valeur dupliquée
  }

  if (caseOffenders.length > 0) result.styleIssues.push({ kind: 'case', elements: caseOffenders });
  if (borderSpaces) result.styleIssues.push({ kind: 'border-spaces', elements: [] });
  if (duplicates.length > 0) result.styleIssues.push({ kind: 'duplicate', elements: duplicates });
  return result;
}

export interface ResolvedLabel {
  label: LabelConfig;
  /** Forme canonique saisie : l'id du label, ou l'alias reconnu (§8.2 — la casse est
   * comparée à la forme canonique de l'alias reconnu). */
  matchedForm: string;
  /** Vrai si la saisie est passée par un alias. */
  viaAlias: boolean;
}

/** Compare la saisie à la liste configurée (labels actifs et alias), sans tenir compte de
 * la casse (§3.4.2). Renvoie null si rien ne correspond. */
export function resolveLabel(input: string, config: EffectiveConfig): ResolvedLabel | null {
  const lower = input.toLowerCase();
  for (const label of config.labels) {
    if (!label.enabled) continue;
    if (label.id.toLowerCase() === lower) return { label, matchedForm: label.id, viaAlias: false };
    for (const alias of label.aliases) {
      if (alias.toLowerCase() === lower) return { label, matchedForm: alias, viaAlias: true };
    }
  }
  return null;
}

/** Les labels actifs, dans l'ordre de la configuration. */
export function enabledLabels(config: EffectiveConfig): LabelConfig[] {
  return config.labels.filter((l) => l.enabled);
}

/** Résolution d'une décoration canonique vers sa configuration (comparaison insensible à la
 * casse et aux espaces de bordure — déjà normalisées par parseDecorations). */
export function resolveDecoration(canonical: string, config: EffectiveConfig): DecorationConfig | null {
  for (const d of config.decorations.known) {
    if (d.id.toLowerCase() === canonical) return d;
  }
  return null;
}

/** Distance de Levenshtein bornée, pour proposer le label le plus proche (§3.5.1, étage 2). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n]!;
}

/** Label actif le plus proche de la saisie (distance ≤ 2), ou null. */
export function closestLabel(input: string, config: EffectiveConfig): string | null {
  const lower = input.toLowerCase();
  let best: string | null = null;
  let bestDist = 3;
  for (const label of enabledLabels(config)) {
    const d = levenshtein(lower, label.id.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = label.id;
    }
    for (const alias of label.aliases) {
      const da = levenshtein(lower, alias.toLowerCase());
      if (da < bestDist) {
        bestDist = da;
        best = alias;
      }
    }
  }
  return best;
}
