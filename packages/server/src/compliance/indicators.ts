// Indicateurs de suivi (§12), calculés à partir des échantillons persistés par
// l'orchestrateur. Le taux de conformité se compte PAR COMMENTAIRE (§6.3.1, §12) ; le
// taux d'avertissement se suit séparément ; les comptes de service sont exclus du taux de
// conformité. Les motifs de `decision` ne sont jamais extraits — ils restent dans la PR
// (§10, §12).

import type { IndicatorSample } from './storage.js';

export interface Indicators {
  /** Taux de conformité au sens du §3.5.2 : aucun diagnostic error, par commentaire
   * humain (comptes de service exclus). Cible > 95 % à 3 mois. */
  complianceRate: number | null;
  /** Taux d'avertissement, suivi séparément (§12) — un commentaire qui ne porte que des
   * avertissements est conforme et ne doit pas disparaître de la mesure. */
  warningRate: number | null;
  /** Répartition par label — surveiller un ratio `praise` durablement nul (§12). */
  labelDistribution: Record<string, number>;
  /** Part des commentaires émis par des comptes de service, exclue du taux ci-dessus. */
  serviceAccountShare: number | null;
  /** Nombre de fils bloquants clos par `decision`, dernière valeur observée par PR. */
  decisionsInBlockingThreads: number;
  /** Total de commentaires humains considérés. */
  totalHumanComments: number;
}

/** Agrège les derniers échantillons par PR (le dernier reflète l'état courant de chaque
 * PR ; sommer tous les tours compterait plusieurs fois le même commentaire). */
export function computeIndicators(samples: IndicatorSample[]): Indicators {
  const latestByPr = new Map<string, IndicatorSample>();
  for (const s of samples) {
    const existing = latestByPr.get(s.prKey);
    if (!existing || s.at > existing.at) latestByPr.set(s.prKey, s);
  }
  const latest = [...latestByPr.values()];

  let compliant = 0;
  let human = 0;
  let warnings = 0;
  let serviceAccount = 0;
  let decisions = 0;
  const labelDistribution: Record<string, number> = {};

  for (const s of latest) {
    compliant += s.compliantComments;
    human += s.compliantComments + s.nonCompliantComments;
    warnings += s.warnings;
    serviceAccount += s.serviceAccountComments;
    decisions += s.decisionsInBlockingThreads;
    for (const [label, count] of Object.entries(s.labelDistribution)) {
      labelDistribution[label] = (labelDistribution[label] ?? 0) + count;
    }
  }

  const totalComments = human + serviceAccount;
  return {
    complianceRate: human > 0 ? compliant / human : null,
    warningRate: human > 0 ? warnings / human : null,
    labelDistribution,
    serviceAccountShare: totalComments > 0 ? serviceAccount / totalComments : null,
    decisionsInBlockingThreads: decisions,
    totalHumanComments: human,
  };
}
