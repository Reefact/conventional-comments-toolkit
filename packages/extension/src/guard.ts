// Décision de blocage de l'envoi (§5.4) — pure et testable. Le mode `enforce` ne suffit
// pas : quatre conditions doivent être réunies, et si l'une manque l'extension se
// comporte comme en mode `warn` — elle affiche ses diagnostics et laisse publier.

import type { Diagnostic, EffectiveConfig, PrRef, PublishedSummary } from '@cct/core';

export interface GuardInput {
  config: EffectiveConfig;
  /** Empreinte de la configuration résolue par l'extension. */
  fingerprint: string;
  /** Résultat publié lu sur la page, ou null si aucun (§9.2.3). */
  published: PublishedSummary | null;
  /** État dégradé au sens du §5.4 : une lecture de configuration a rendu `unreachable`. */
  degraded: boolean;
  pr: PrRef;
  diagnostics: Diagnostic[];
}

export interface GuardDecision {
  /** L'envoi est intercepté (bouton aria-disabled, soumission clavier couverte). */
  block: boolean;
  /** L'extension est entièrement inactive (mode `off`, §7). */
  inactive: boolean;
  /** Écart d'empreinte signalé (§8.1.3 règle 2) : la pastille ne peut pas affirmer
   * « conforme » et le blocage est désarmé. */
  fingerprintMismatch: boolean;
  /** La PR est dans le périmètre d'activation (§6.2.3). */
  inScope: boolean;
  reason:
    | 'blocked'
    | 'mode-off'
    | 'not-enforce'
    | 'out-of-scope'
    | 'fingerprint-mismatch'
    | 'degraded'
    | 'compliant';
}

/** Périmètre d'activation vu du composant A (§6.2.3, §6.4) : la date vient de la
 * configuration effective, sinon du résumé publié (posée par l'administration). Tant
 * qu'aucune des deux n'est connue, la PR est traitée hors périmètre. */
export function resolveInScope(
  config: EffectiveConfig,
  published: PublishedSummary | null,
  pr: PrRef
): boolean {
  const activatedAt = config.activation.activatedAt ?? published?.activatedAt ?? null;
  if (activatedAt === null) return false;
  if (!pr.createdAt) return false; // date non lisible dans la page : ne jamais bloquer sur l'inconnu
  return Date.parse(pr.createdAt) > Date.parse(activatedAt);
}

export function decideGuard(input: GuardInput): GuardDecision {
  const { config, published, degraded, diagnostics } = input;

  // Mode off : l'extension reste inactive — le périmètre d'activation soustrait à la
  // contrainte, il n'ajoute jamais d'assistance là où le mode l'a éteinte (§6.2.3, §7).
  if (config.mode === 'off') {
    return { block: false, inactive: true, fingerprintMismatch: false, inScope: false, reason: 'mode-off' };
  }

  const inScope = resolveInScope(config, published, input.pr);

  // Règle 2 du §8.1.3 : la comparaison porte sur la configuration, et sur elle seule —
  // jamais sur coreVersion (CA-32). Une configuration dégradée ne produit pas un
  // désaccord : sans lecture complète, on ne compare pas les empreintes du tout.
  const fingerprintMismatch =
    !degraded && published !== null && published.configFingerprint !== input.fingerprint;

  const hasError = diagnostics.some((d) => d.severity === 'error');

  // Les quatre conditions du §5.4 :
  const conditions =
    config.mode === 'enforce' && // 1. mode effectif enforce
    inScope && // 2. PR dans le périmètre d'activation
    !fingerprintMismatch && // 3. empreintes concordantes, ou aucun résultat publié
    !degraded; // 4. configuration lue sans repli dégradé

  if (conditions && hasError) {
    return { block: true, inactive: false, fingerprintMismatch, inScope, reason: 'blocked' };
  }
  return {
    block: false,
    inactive: false,
    fingerprintMismatch,
    inScope,
    reason: !hasError
      ? 'compliant'
      : config.mode !== 'enforce'
        ? 'not-enforce'
        : !inScope
          ? 'out-of-scope'
          : fingerprintMismatch
            ? 'fingerprint-mismatch'
            : 'degraded',
  };
}

/** État de la pastille (§5.3) : deux situations priment sur ✅ — l'état dégradé, et
 * l'écart d'empreinte — signalées distinctement. */
export type FeedbackState =
  | 'compliant'
  | 'compliant-with-warnings'
  | 'non-compliant'
  | 'degraded'
  | 'fingerprint-mismatch';

export function feedbackState(diagnostics: Diagnostic[], decision: GuardDecision, degraded: boolean): FeedbackState {
  if (degraded) return 'degraded'; // on ne connaît pas les règles
  if (decision.fingerprintMismatch) return 'fingerprint-mismatch'; // pas les mêmes que le serveur
  if (diagnostics.some((d) => d.severity === 'error')) return 'non-compliant';
  if (diagnostics.length > 0) return 'compliant-with-warnings';
  return 'compliant';
}
