// Bornes d'entreprise (§8.1.1). « Plancher » signifie : le niveau inférieur ne peut pas
// assouplir — l'opération exacte est normative clé par clé, elle ne se déduit pas d'une
// règle générale (l'erreur type : max() sur activatedAt produit l'inverse du but).

import type { EffectiveConfig, Floor, Mode, Notice, Severity } from '../types.js';
import { SUPPORTED_FLOOR_VERSION } from '../version.js';

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

export function vetFloor(floor: Floor | null | undefined): VettedFloor {
  if (!floor) return { floor: defaultFloor(), notices: [], unsupported: false };
  if (floor.floorVersion !== undefined && floor.floorVersion > SUPPORTED_FLOOR_VERSION) {
    return {
      floor: defaultFloor(),
      notices: [
        {
          kind: 'unsupported-version',
          message: `floor version ${floor.floorVersion} exceeds supported version ${SUPPORTED_FLOOR_VERSION}: the floor is not applied and the component falls back to assist mode (§8.1.1)`,
          ref: 'floorVersion',
        },
      ],
      unsupported: true,
    };
  }
  return { floor, notices: [], unsupported: false };
}

export interface FloorApplication {
  config: EffectiveConfig;
  notices: Notice[];
}

/**
 * Applique les bornes du plancher à une configuration résolue (§8.1.1, tableau normatif).
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

  // severities — ensemble de codes dont la sévérité ne peut pas être abaissée.
  if (floor.severities) {
    for (const [code, min] of Object.entries(floor.severities)) {
      const current = out.severities[code];
      if (current !== undefined && SEVERITY_SCALE[current] < SEVERITY_SCALE[min]) {
        out.severities[code] = min;
        overridden(`severities.${code}`);
      } else if (current === undefined) {
        // La sévérité par défaut du tableau §3.5.2 peut être sous le plancher : imposer.
        out.severities[code] = min;
      }
    }
  }

  // labels — ids dont ni enabled ni blockingByDefault ne peuvent passer à false
  // en dessous du plancher. Le plancher n'invente pas de label : il protège ceux
  // que la configuration connaît.
  if (floor.labels?.minimum) {
    for (const id of floor.labels.minimum) {
      const label = out.labels.find((l) => l.id === id);
      if (!label) continue;
      if (written.has(`labels.${id}.enabled`) && !label.enabled) {
        label.enabled = true;
        overridden(`labels.${id}.enabled`);
      }
      if (written.has(`labels.${id}.blockingByDefault`) && !label.blockingByDefault) {
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

  // exemptUsers / allowlistPatterns — minimum + closed (§8.1.1).
  for (const key of ['exemptUsers', 'allowlistPatterns'] as const) {
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
