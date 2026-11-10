// Décision de blocage de l'envoi (§5.4) — pure et testable. Le mode `enforce` ne suffit
// pas : deux conditions doivent être réunies, et si l'une manque l'extension se comporte
// comme en mode `assist` — elle affiche ses diagnostics et laisse publier.
//
// Le blocage ne dépend ni de l'âge de la PR ni d'aucun état publié sur elle (§5.4, décision
// du propriétaire, 2026-11-10). Une rédaction antérieure ajoutait deux conditions, le
// périmètre d'activation et la concordance des empreintes de configuration avec un
// vérificateur ; ce vérificateur est retiré (§2), et elles avec lui. La première rendait
// d'ailleurs `enforce` inopérant par défaut : sans `activation.activatedAt`, aucune PR n'était
// dans le périmètre, et rien n'était jamais bloqué.

import type { Diagnostic, EffectiveConfig } from '@cct/core';

export interface GuardInput {
  config: EffectiveConfig;
  /** État dégradé au sens du §5.4 : une lecture de configuration a rendu `unreachable`. */
  degraded: boolean;
  diagnostics: Diagnostic[];
}

export interface GuardDecision {
  /** L'envoi est intercepté (bouton aria-disabled, soumission clavier couverte). */
  block: boolean;
  /** L'extension est entièrement inactive (mode `off`, §7). */
  inactive: boolean;
  reason: 'blocked' | 'mode-off' | 'not-enforce' | 'degraded' | 'compliant';
}

export function decideGuard(input: GuardInput): GuardDecision {
  const { config, degraded, diagnostics } = input;

  // Mode off : l'extension reste inactive (§7).
  if (config.mode === 'off') {
    return { block: false, inactive: true, reason: 'mode-off' };
  }

  const hasError = diagnostics.some((d) => d.severity === 'error');

  // Les deux conditions du §5.4 :
  const conditions =
    config.mode === 'enforce' && // 1. mode effectif enforce
    !degraded; // 2. configuration lue sans repli dégradé

  if (conditions && hasError) {
    return { block: true, inactive: false, reason: 'blocked' };
  }
  return {
    block: false,
    inactive: false,
    reason: !hasError ? 'compliant' : config.mode !== 'enforce' ? 'not-enforce' : 'degraded',
  };
}

/** État de la pastille (§5.3) : une situation prime sur ✅ — l'état dégradé, où l'extension
 * n'a pas pu lire les règles et ne peut donc rien affirmer. */
export type FeedbackState = 'compliant' | 'compliant-with-warnings' | 'non-compliant' | 'degraded';

export function feedbackState(diagnostics: Diagnostic[], degraded: boolean): FeedbackState {
  if (degraded) return 'degraded'; // on ne connaît pas les règles
  if (diagnostics.some((d) => d.severity === 'error')) return 'non-compliant';
  if (diagnostics.length > 0) return 'compliant-with-warnings';
  return 'compliant';
}
