// Validation d'un commentaire (§3.5) : temps 1 en étages, séquentiel et exclusif ;
// temps 2 cumulatif. Le prétraitement du §3.4.1 est à l'intérieur : aucun appelant ne
// peut l'oublier ou le faire à sa façon (§9.2.2).

import {
  splitBody,
  hasDiscussion,
  hasOwnContent,
  containsSuggestionBlock,
  type BodyLines,
} from './preprocess.js';
import { matchPrefix, type PrefixMatch } from './regex.js';
import {
  parseDecorations,
  resolveLabel,
  resolveDecoration,
  enabledLabels,
  closestLabel,
  type ParsedDecorations,
  type ResolvedLabel,
} from './parser.js';
import { t } from './i18n/index.js';
import type { Diagnostic, EffectiveConfig, ValidationInput } from './types.js';

// Ordre de restitution des diagnostics : celui du tableau du §3.5.2, de haut en bas.
export const DIAGNOSTIC_ORDER: readonly string[] = [
  'E-NO-LABEL',
  'E-MALFORMED-PREFIX',
  'E-UNKNOWN-LABEL',
  'W-CASE',
  'E-DECORATION-SYNTAX',
  'E-UNKNOWN-DECORATION',
  'E-CONFLICT',
  'W-DECORATION-STYLE',
  'E-EMPTY-SUBJECT',
  'E-DECISION-SUBJECT',
  'W-SUBJECT-TOO-SHORT',
  'W-SUBJECT-TOO-LONG',
  'W-NO-DISCUSSION',
  'W-MISSING-DECORATION',
  'W-NOT-BLOCKABLE',
];

export const DEFAULT_SEVERITIES: Record<string, 'warn' | 'error'> = {
  'E-NO-LABEL': 'error',
  'E-MALFORMED-PREFIX': 'error',
  'E-UNKNOWN-LABEL': 'error',
  'W-CASE': 'warn',
  'E-DECORATION-SYNTAX': 'error',
  'E-UNKNOWN-DECORATION': 'error',
  'E-CONFLICT': 'error',
  'W-DECORATION-STYLE': 'warn',
  'E-EMPTY-SUBJECT': 'error',
  'E-DECISION-SUBJECT': 'error',
  'W-SUBJECT-TOO-SHORT': 'warn',
  'W-SUBJECT-TOO-LONG': 'warn',
  'W-NO-DISCUSSION': 'warn',
  'W-MISSING-DECORATION': 'warn',
  'W-NOT-BLOCKABLE': 'warn',
};

export type MalformedMotif =
  | 'unclosed-paren'
  | 'unopened-paren'
  | 'missing-colon'
  | 'space-before-colon'
  | 'missing-space-after-colon'
  | 'unexpected-character';

export interface CommentAnalysis {
  /** 'excluded' : zone éteinte par configuration (étage −2) ; 'exempt' : §4.2 (étage −1) ;
   * 'analyzed' : le préfixe a été soumis aux étages 1a et suivants. */
  outcome: 'excluded' | 'exempt' | 'analyzed';
  diagnostics: Diagnostic[];
  /** Label résolu (explicite ou implicite), ou null si le préfixe n'a pas été reconnu. */
  resolved: ResolvedLabel | null;
  /** Vrai lorsque le label est le `suggestion` implicite d'un bloc de suggestion (§4.2). */
  implicitSuggestion: boolean;
  /** Caractère bloquant au sens du §3.3, départage E-CONFLICT compris. */
  blocking: boolean;
  /** Vrai si le commentaire porte un E-CONFLICT (règles 1 ou 2 du §3.3). */
  hadConflict: boolean;
  /** Réécriture proposée vers la forme canonique d'un alias — commodité d'édition,
   * jamais une correction de Diagnostic.fix (§8.2). */
  aliasRewrite: { from: string; to: string; replacement: string } | null;
  /** Ligne de préfixe normalisée (§3.4.1), pour l'affichage et les corrections. */
  prefixLine: string | null;
}

interface PrefixOutcome {
  resolved: ResolvedLabel | null;
  match: PrefixMatch | null;
  implicitSuggestion: boolean;
  diagnostics: Diagnostic[];
  /** Vrai si le temps 2 doit être évalué. */
  proceed: boolean;
}

/** Point d'entrée du contrat (§9.2.2) : corps brut → diagnostics, dans l'ordre du §3.5.2,
 * après application de `severities`. */
export function validate(input: ValidationInput, config: EffectiveConfig): Diagnostic[] {
  return analyze(input, config).diagnostics;
}

/** Caractère bloquant au sens du §3.3 (départage E-CONFLICT compris). Un commentaire
 * exempté (§4.2), en zone éteinte, ou dont le préfixe n'est pas reconnu, n'est pas bloquant. */
export function isBlocking(input: ValidationInput, config: EffectiveConfig): boolean {
  return analyze(input, config).blocking;
}

/** Analyse complète — la brique commune de validate(), isBlocking() et du composant A. */
export function analyze(input: ValidationInput, config: EffectiveConfig): CommentAnalysis {
  const lang = config.language;
  const split = splitBody(input.body);
  const suggestion = containsSuggestionBlock(input.body, input.platform.suggestionInfoString);

  const base: CommentAnalysis = {
    outcome: 'analyzed',
    diagnostics: [],
    resolved: null,
    implicitSuggestion: false,
    blocking: false,
    hadConflict: false,
    aliasRewrite: null,
    prefixLine: split.prefixLine,
  };

  // ————— Étage −2 : zone éteinte par configuration (§3.5.1) —————
  const zoneExcluded =
    (input.zone === 'reply' && !config.scope.validateReplies) ||
    (input.zone === 'review-body' && !config.scope.validateReviewSummary);
  if (zoneExcluded) {
    // Analyser n'est pas exiger : on lit le préfixe pour savoir s'il faut juger (§4.1).
    // Seule une réponse de fil dont le label résolu est `decision` reprend à l'étage −1 ;
    // une réponse au préfixe mal formé ne porte aucun label, donc pas `decision`.
    const isDecisionReply =
      input.zone === 'reply' &&
      split.prefixLine !== null &&
      (() => {
        const m = matchPrefix(split.prefixLine);
        return m !== null && resolveLabel(m.label, config)?.label.id === 'decision';
      })();
    if (!isDecisionReply) {
      return { ...base, outcome: 'excluded' };
    }
    // reprise à l'étage −1, et pas plus loin (§3.5.1).
  }

  // ————— Étage −1 : exemptions du §4.2 —————
  if (isExempt(input, config, split, suggestion)) {
    return { ...base, outcome: 'exempt' };
  }

  // ————— Temps 1, étages 0 à 3 —————
  const prefix = recognizePrefix(input, config, split, suggestion, lang);
  const diagnostics = [...prefix.diagnostics];

  let blocking = false;
  let hadConflict = false;
  let aliasRewrite: CommentAnalysis['aliasRewrite'] = null;

  if (prefix.proceed && prefix.resolved) {
    // ————— Temps 2 : contrôles de contenu, tous évalués, cumulatifs —————
    const t2 = contentControls(input, config, split, prefix, lang);
    diagnostics.push(...t2.diagnostics);
    blocking = t2.blocking;
    hadConflict = t2.hadConflict;

    if (prefix.resolved.viaAlias && prefix.match && split.prefixLine) {
      const canonical = prefix.resolved.label.id;
      aliasRewrite = {
        from: prefix.resolved.matchedForm,
        to: canonical,
        replacement: rebuildLine(prefix.match, { label: canonical }),
      };
    }
  }

  return {
    outcome: 'analyzed',
    diagnostics: finalizeDiagnostics(diagnostics, config),
    resolved: prefix.resolved,
    implicitSuggestion: prefix.implicitSuggestion,
    blocking,
    hadConflict,
    aliasRewrite,
    prefixLine: split.prefixLine,
  };
}

/** §8.1.3 règle 3 — le discriminant du troisième déclencheur de contournement du cache.
 * Vrai lorsque le premier jeton du corps a la **forme** d'une commande adressée à un outil,
 * qu'une entrée de `toolCommands` l'ait reconnu ou non.
 *
 * Il existe parce que le symptôme d'une entrée `toolCommands` manquante n'est pas un code
 * propre, mais `E-NO-LABEL` — le diagnostic le plus courant de tous. Rafraîchir la
 * configuration sur chaque `E-NO-LABEL` contournerait le cache sur la quasi-totalité des
 * commentaires non conformes ; ne le faire que sur un corps qui *ressemble* à une commande
 * borne le coût à ce qu'il doit être. La règle du jeton est la même qu'en `isExempt()`,
 * et elle vit ici pour que les deux ne puissent pas diverger. */
export function looksLikeToolCommand(body: string): boolean {
  const first = /^(\S+)/.exec(body.trimStart())?.[1] ?? null;
  return first !== null && (first.startsWith('/') || first.startsWith('@'));
}

// ————————————————————————————————————————————————————————————————————————————

function isExempt(
  input: ValidationInput,
  config: EffectiveConfig,
  split: BodyLines,
  suggestion: boolean
): boolean {
  // Message généré par la plateforme — structurel, indépendant d'exemptUsers (§4.2, CA-20).
  if (input.isSystemGenerated) return true;
  // Corps vide ou uniquement des blancs (CA-19).
  if (input.body.trim() === '') return true;
  // Auteur exempté — comparaison sur UserInfo.login, insensible à la casse (§4.2).
  if (input.author) {
    const login = input.author.login.toLowerCase();
    if (config.exemptUsers.some((u) => u.toLowerCase() === login)) return true;
  }
  // Commande adressée à un outil (§4.2, §8.2) — premier jeton du corps, suivi d'une espace
  // ou de la fin de ligne. `toolCommands` : `/*` (slash générique) ou `@handle` (mention
  // exacte, insensible à la casse — @Codex et @codex désignent le même compte GitHub).
  const trimmed = input.body.trimStart();
  const firstToken = /^(\S+)/.exec(trimmed)?.[1] ?? null;
  if (firstToken) {
    const lowerToken = firstToken.toLowerCase();
    for (const entry of config.toolCommands) {
      if (entry === '/*') {
        if (/^\/[A-Za-z][A-Za-z0-9_-]*$/.test(firstToken)) return true;
      } else if (entry.toLowerCase() === lowerToken) {
        return true;
      }
    }
  }
  // allowlistPatterns — appliquées au corps entier une fois trim() appliqué (§4.2).
  const wholeTrimmed = input.body.trim();
  for (const pattern of config.allowlistPatterns) {
    try {
      if (new RegExp(pattern).test(wholeTrimmed)) return true;
    } catch {
      // Motif invalide : écarté par la couche configuration (config-warning) ; ignoré ici.
    }
  }
  // Aucun contenu propre — sauf bloc de suggestion natif, qui compte comme contenu (§4.2).
  if (!hasOwnContent(split) && !suggestion) return true;
  return false;
}

function recognizePrefix(
  input: ValidationInput,
  config: EffectiveConfig,
  split: BodyLines,
  suggestion: boolean,
  lang: string | null
): PrefixOutcome {
  // ————— Étage 0 : bloc de suggestion natif dans le corps brut (§3.5.1) —————
  if (suggestion) {
    const line = split.prefixLine;
    const firstWord = line ? /^[A-Za-z]+/.exec(line)?.[0] ?? null : null;
    const attempted = firstWord !== null && resolveLabel(firstWord, config) !== null;
    if (!attempted) {
      // Cas 1 : phrase libre, ou rien → label `suggestion` implicite.
      const suggestionLabel = config.labels.find((l) => l.id === 'suggestion' && l.enabled);
      if (suggestionLabel) {
        return {
          resolved: { label: suggestionLabel, matchedForm: 'suggestion', viaAlias: false },
          match: null,
          implicitSuggestion: true,
          diagnostics: [],
          proceed: true,
        };
      }
      // `suggestion` désactivé par configuration : le bloc reste du contenu, la ligne
      // libre relève du cas général.
    } else {
      const m = matchPrefix(line!);
      if (m !== null) {
        // Cas 2 : préfixe explicite bien formé — il l'emporte, passer à l'étage 2.
        return stage2AndBeyond(m, config, lang);
      }
      // Cas 3 : tentative ratée → étage 1b, qui produira E-MALFORMED-PREFIX (CA-38).
      return {
        resolved: null,
        match: null,
        implicitSuggestion: false,
        diagnostics: [malformedPrefixDiagnostic(line!, lang)],
        proceed: false,
      };
    }
  }

  const line = split.prefixLine;
  if (line === null) {
    // Ne peut se produire qu'avec un bloc de suggestion sans label `suggestion` activé :
    // sans contenu propre le commentaire aurait été exempté à l'étage −1.
    return { resolved: null, match: null, implicitSuggestion: false, diagnostics: [], proceed: false };
  }

  // ————— Étage 1a : la ligne a-t-elle la forme `label: sujet` ? —————
  const m = matchPrefix(line);
  if (m === null) {
    // ————— Étage 1b : s'agissait-il d'une tentative ? —————
    const firstWord = /^[A-Za-z]+/.exec(line)?.[0] ?? null;
    const attempted = firstWord !== null && resolveLabel(firstWord, config) !== null;
    const diag = attempted
      ? malformedPrefixDiagnostic(line, lang)
      : {
          code: 'E-NO-LABEL',
          severity: 'error' as const,
          message: t(lang, 'diag.E-NO-LABEL'),
        };
    return { resolved: null, match: null, implicitSuggestion: false, diagnostics: [diag], proceed: false };
  }

  return stage2AndBeyond(m, config, lang);
}

function stage2AndBeyond(m: PrefixMatch, config: EffectiveConfig, lang: string | null): PrefixOutcome {
  // ————— Étage 2 : label dans la liste configurée ou ses alias ? —————
  const resolved = resolveLabel(m.label, config);
  if (resolved === null) {
    const labels = enabledLabels(config)
      .map((l) => l.id)
      .join(', ');
    const candidate = closestLabel(m.label, config);
    const diag: Diagnostic = {
      code: 'E-UNKNOWN-LABEL',
      severity: 'error',
      message: t(lang, 'diag.E-UNKNOWN-LABEL', {
        label: m.label,
        labels,
        suggestion: candidate ? t(lang, 'diag.E-UNKNOWN-LABEL.suggestion', { candidate }) : '',
      }),
      ...(candidate ? { fix: { replacement: rebuildLine(m, { label: candidate }) } } : {}),
    };
    return { resolved: null, match: m, implicitSuggestion: false, diagnostics: [diag], proceed: false };
  }

  // ————— Étage 3 : bonne casse ? W-CASE n'interrompt pas la suite —————
  const diagnostics: Diagnostic[] = [];
  if (m.label !== resolved.matchedForm) {
    diagnostics.push({
      code: 'W-CASE',
      severity: 'warn',
      message: t(lang, 'diag.W-CASE', { label: m.label, canonical: resolved.matchedForm }),
      fix: { replacement: rebuildLine(m, { label: resolved.matchedForm }) },
    });
  }
  return { resolved, match: m, implicitSuggestion: false, diagnostics, proceed: true };
}

interface ContentResult {
  diagnostics: Diagnostic[];
  blocking: boolean;
  hadConflict: boolean;
}

function contentControls(
  input: ValidationInput,
  config: EffectiveConfig,
  split: BodyLines,
  prefix: PrefixOutcome,
  lang: string | null
): ContentResult {
  const diagnostics: Diagnostic[] = [];
  const resolved = prefix.resolved!;
  const m = prefix.match;
  const implicit = prefix.implicitSuggestion;

  // ————— Décorations (§3.3) —————
  let parsed: ParsedDecorations | null = null;
  if (m && m.decorations !== null) {
    parsed = parseDecorations(m.decorations);

    if (parsed.syntaxIssues.length > 0) {
      const details = parsed.syntaxIssues
        .map((i) => t(lang, `diag.E-DECORATION-SYNTAX.${i.kind}`, { element: i.element }))
        .join(', ');
      diagnostics.push({
        code: 'E-DECORATION-SYNTAX',
        severity: 'error',
        message: t(lang, 'diag.E-DECORATION-SYNTAX', { details }),
      });
    }

    const unknown = parsed.canonical.filter((c) => resolveDecoration(c, config) === null);
    if (unknown.length > 0 && !config.decorations.allowFree) {
      diagnostics.push({
        code: 'E-UNKNOWN-DECORATION',
        severity: 'error',
        message: t(lang, 'diag.E-UNKNOWN-DECORATION', {
          elements: unknown.map((u) => `(${u})`).join(', '),
          known: config.decorations.known.map((d) => `(${d.id})`).join(', '),
        }),
      });
    }
  }

  const canonical = parsed ? parsed.canonical : [];
  const carriers = canonical
    .map((c) => resolveDecoration(c, config))
    .filter((d): d is NonNullable<typeof d> => d !== null && d.forces !== null);
  const forcesBlocking = carriers.some((d) => d.forces === 'blocking');
  const forcesNonBlocking = carriers.some((d) => d.forces === 'non-blocking');

  // Précédence du §3.3, règles 1 et 2 : E-CONFLICT.
  const conflictLabel = resolved.label.alwaysNonBlocking && forcesBlocking;
  const conflictDecorations = forcesBlocking && forcesNonBlocking;
  const hadConflict = conflictLabel || conflictDecorations;
  if (hadConflict) {
    diagnostics.push({
      code: 'E-CONFLICT',
      severity: 'error',
      message: conflictLabel
        ? t(lang, 'diag.E-CONFLICT.label', { label: resolved.label.id })
        : t(lang, 'diag.E-CONFLICT.decorations', {
            elements: carriers.map((c) => `(${c.id})`).join(' + '),
          }),
    });
  }

  if (parsed && (parsed.styleIssues.length > 0 || (m && m.missingSpaceBeforeParen))) {
    const details: string[] = [];
    for (const issue of parsed.styleIssues) {
      details.push(
        t(lang, `diag.W-DECORATION-STYLE.${issue.kind}`, {
          elements: issue.elements.map((e) => `(${e})`).join(', '),
        })
      );
    }
    if (m && m.missingSpaceBeforeParen) {
      details.push(t(lang, 'diag.W-DECORATION-STYLE.missing-space-before-paren'));
    }
    const fix = rebuildLine(m!, { label: m!.label, canonicalDecorations: true });
    diagnostics.push({
      code: 'W-DECORATION-STYLE',
      severity: 'warn',
      message: t(lang, 'diag.W-DECORATION-STYLE', { details: details.join(', '), fix }),
      fix: { replacement: fix },
    });
  }

  // Caractère bloquant au sens du §3.3 — précédence, départage E-CONFLICT compris.
  let blocking: boolean;
  if (hadConflict) {
    blocking = resolved.label.blockingByDefault; // départage (§3.3)
  } else if (forcesBlocking) {
    blocking = true; // règle 3
  } else if (forcesNonBlocking) {
    blocking = false; // règle 4
  } else {
    blocking = resolved.label.blockingByDefault; // règle 5
  }

  // ————— Sujet — sauf label implicite (§3.5.1, étage 0) —————
  const isDecisionReply = input.zone === 'reply' && resolved.label.id === 'decision';
  if (!implicit) {
    const subject = m?.subject ?? null;
    if (subject === null) {
      diagnostics.push({
        code: 'E-EMPTY-SUBJECT',
        severity: 'error',
        message: t(lang, 'diag.E-EMPTY-SUBJECT'),
      });
    } else {
      const len = [...subject].length;
      if (isDecisionReply) {
        // Le seuil de minDecisionSubjectLength est le seul qui s'applique (§3.5.1).
        if (len < config.rules.minDecisionSubjectLength) {
          diagnostics.push({
            code: 'E-DECISION-SUBJECT',
            severity: 'error',
            message: t(lang, 'diag.E-DECISION-SUBJECT', {
              min: config.rules.minDecisionSubjectLength,
              len,
            }),
          });
        }
      } else {
        if (len < config.rules.minSubjectLength) {
          diagnostics.push({
            code: 'W-SUBJECT-TOO-SHORT',
            severity: 'warn',
            message: t(lang, 'diag.W-SUBJECT-TOO-SHORT', { min: config.rules.minSubjectLength }),
          });
        }
        if (len > config.rules.maxSubjectLength) {
          diagnostics.push({
            code: 'W-SUBJECT-TOO-LONG',
            severity: 'warn',
            message: t(lang, 'diag.W-SUBJECT-TOO-LONG', { max: config.rules.maxSubjectLength }),
          });
        }
      }
    }
  }

  // ————— Discussion — sauf label implicite —————
  if (!implicit && blocking && !hasDiscussion(split)) {
    diagnostics.push({
      code: 'W-NO-DISCUSSION',
      severity: 'warn',
      message: t(lang, 'diag.W-NO-DISCUSSION'),
    });
  }

  // ————— Contexte —————
  if (
    !implicit &&
    (resolved.label.id === 'suggestion' || resolved.label.id === 'question') &&
    carriers.length === 0
  ) {
    diagnostics.push({
      code: 'W-MISSING-DECORATION',
      severity: 'warn',
      message: t(lang, 'diag.W-MISSING-DECORATION', { label: resolved.label.id }),
    });
  }

  if (blocking && !input.canCarryBlockingState) {
    diagnostics.push({
      code: 'W-NOT-BLOCKABLE',
      severity: 'warn',
      message: t(lang, 'diag.W-NOT-BLOCKABLE'),
    });
  }

  return { diagnostics, blocking, hadConflict };
}

// ————— Motifs de E-MALFORMED-PREFIX (§3.5.1), évalués dans l'ordre —————

export function malformedMotif(line: string): MalformedMotif {
  const hasOpen = line.includes('(');
  const hasClose = line.includes(')');
  if (hasOpen && !hasClose) return 'unclosed-paren'; // motif 1
  if (hasClose && !hasOpen) return 'unopened-paren'; // motif 2
  const colon = line.indexOf(':');
  if (colon === -1) return 'missing-colon'; // motif 3
  if (colon > 0 && /[ \t]/.test(line[colon - 1]!)) return 'space-before-colon'; // motif 4
  const after = line[colon + 1];
  if (after !== undefined && !/[ \t]/.test(after)) return 'missing-space-after-colon'; // motif 5
  return 'unexpected-character'; // motif 6
}

function malformedPrefixDiagnostic(line: string, lang: string | null): Diagnostic {
  const motif = malformedMotif(line);
  const fix = malformedFix(line, motif);
  return {
    code: 'E-MALFORMED-PREFIX',
    severity: 'error',
    message: t(lang, `diag.E-MALFORMED-PREFIX.${motif}`, { fix: fix ?? '' }),
    ...(fix ? { fix: { replacement: fix } } : {}),
  };
}

function malformedFix(line: string, motif: MalformedMotif): string | null {
  switch (motif) {
    case 'unclosed-paren': {
      const colon = line.indexOf(':');
      if (colon === -1) return null;
      return line.slice(0, colon).trimEnd() + '): ' + line.slice(colon + 1).trimStart();
    }
    case 'unopened-paren': {
      const m = /^([A-Za-z]+)[ \t]+(.*)$/.exec(line);
      if (!m) return null;
      return `${m[1]} (${m[2]!.replace(/\)[ \t]*:/, '):')}`.replace(/ \(/, ' (');
    }
    case 'missing-colon': {
      const close = line.indexOf(')');
      if (close !== -1) {
        return line.slice(0, close + 1) + ':' + ensureLeadingSpace(line.slice(close + 1));
      }
      const m = /^([A-Za-z]+)[ \t]+(.*)$/.exec(line);
      if (!m) return null;
      return `${m[1]}: ${m[2]}`;
    }
    case 'space-before-colon': {
      const colon = line.indexOf(':');
      return line.slice(0, colon).trimEnd() + line.slice(colon);
    }
    case 'missing-space-after-colon': {
      const colon = line.indexOf(':');
      return line.slice(0, colon + 1) + ' ' + line.slice(colon + 1);
    }
    case 'unexpected-character':
      return null;
  }
}

function ensureLeadingSpace(s: string): string {
  return s.startsWith(' ') || s === '' ? s : ' ' + s;
}

// ————— Réécriture de la ligne de préfixe (§9.2.1, Diagnostic.fix) —————

function rebuildLine(
  m: PrefixMatch,
  opts: { label: string; canonicalDecorations?: boolean }
): string {
  const emoji = m.emoji ? `${m.emoji} ` : '';
  let decorations = '';
  if (m.decorations !== null) {
    if (opts.canonicalDecorations) {
      const parsed = parseDecorations(m.decorations);
      const items: string[] = [];
      const seen = new Set<string>();
      for (const rawEl of parsed.rawElements) {
        const trimmed = rawEl.trim();
        if (trimmed === '') continue;
        const canonical = /^[A-Za-z][A-Za-z0-9-]*$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
        if (seen.has(canonical)) continue; // doublon exact retiré (§3.3)
        seen.add(canonical);
        items.push(canonical);
      }
      decorations = items.length > 0 ? ` (${items.join(', ')})` : '';
    } else {
      decorations = ` (${m.decorations})`;
    }
  }
  const subject = m.subject !== null ? ` ${m.subject}` : '';
  return `${emoji}${opts.label}${decorations}:${subject}`;
}

// ————— Application de `severities`, exclusion des `off`, ordre du §3.5.2 —————

function finalizeDiagnostics(diagnostics: Diagnostic[], config: EffectiveConfig): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const d of diagnostics) {
    let severity: 'off' | 'warn' | 'error' =
      config.severities[d.code] ?? DEFAULT_SEVERITIES[d.code] ?? (d.code.startsWith('E-') ? 'error' : 'warn');
    // Limite basse : un code E- ne descend jamais sous warn (§8.2) — défense en profondeur,
    // la résolution de configuration l'applique déjà.
    if (severity === 'off' && d.code.startsWith('E-')) severity = 'warn';
    if (severity === 'off') continue; // retiré de la liste restituée (§3.5.1)
    out.push({ ...d, severity });
  }
  out.sort((a, b) => DIAGNOSTIC_ORDER.indexOf(a.code) - DIAGNOSTIC_ORDER.indexOf(b.code));
  return out;
}

/** Un commentaire est conforme s'il ne produit aucun diagnostic de sévérité `error`
 * après application de `severities` (§3.5.2). */
export function isCompliant(diagnostics: Diagnostic[]): boolean {
  return diagnostics.every((d) => d.severity !== 'error');
}
