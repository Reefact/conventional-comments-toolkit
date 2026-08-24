// Épinglage (§8.1.3, règle 1) : une modification restrictive ne s'applique pas aux PR
// déjà ouvertes, une modification élargissante s'applique en direct. Le classement est
// normatif clé par clé ; la clause de fermeture traite toute clé non classée comme
// restrictive — l'erreur sûre est de retarder un assouplissement, jamais d'infliger un
// durcissement.

import type { DecorationConfig, EffectiveConfig, LabelConfig } from '../types.js';
import { minMode, minSeverity, maxSeverity } from './floor.js';

/** Mélange la configuration épinglée d'une PR et la configuration vivante (hors bornes —
 * les bornes d'entreprise s'appliquent après, en direct dans les deux sens, sauf
 * `activation.activatedAt`). Granularité : une clé à la fois, une entrée à la fois pour
 * les listes (§8.1.3). */
export function mixPinnedWithLive(pinned: EffectiveConfig, live: EffectiveConfig): EffectiveConfig {
  // Point de départ : le vivant — toutes les clés purement opérationnelles ou cosmétiques
  // s'appliquent en direct (server.*, exemptionLog.*, configUrl, configCacheTtlSeconds,
  // coreMinVersion, docUrl, shortcuts.*, telemetry.*, language, badgeStyle, labels[].color).
  const out = structuredClone(live);

  // mode, formatSeverity — durcissement restrictif : le moins strict des deux s'applique.
  out.mode = minMode(pinned.mode, live.mode);
  out.formatSeverity = minSeverity(pinned.formatSeverity, live.formatSeverity) as 'warn' | 'error';

  // severities — par code : sévérité plus haute restrictive → la plus basse des deux
  // effectives s'applique. Les codes absents valent la sévérité du tableau §3.5.2 ;
  // une entrée égale à ce défaut n'est PAS matérialisée : elle fabriquerait un écart
  // d'empreinte permanent avec l'extension après un assouplissement (§8.1.3, règle 2).
  const codes = new Set([...Object.keys(pinned.severities), ...Object.keys(live.severities)]);
  out.severities = {};
  for (const code of codes) {
    const p = pinned.severities[code] ?? defaultSeverityOf(code);
    const l = live.severities[code] ?? defaultSeverityOf(code);
    const mixed = minSeverity(p, l);
    if (mixed !== defaultSeverityOf(code)) out.severities[code] = mixed;
  }

  // labels — par entrée : retrait/désactivation restrictifs, ajout/activation élargissants.
  out.labels = mixLabels(pinned.labels, live.labels);

  // decorations — allowFree : true→false restrictif → OR ; known par entrée.
  out.decorations = {
    allowFree: pinned.decorations.allowFree || live.decorations.allowFree,
    known: mixDecorations(pinned.decorations.known, live.decorations.known),
  };

  // exemptUsers, allowlistPatterns, toolCommands — retrait restrictif, ajout élargissant → union.
  out.exemptUsers = union(pinned.exemptUsers, live.exemptUsers);
  out.allowlistPatterns = union(pinned.allowlistPatterns, live.allowlistPatterns);
  out.toolCommands = union(pinned.toolCommands, live.toolCommands);

  // rules — augmentation d'un minimum restrictive, diminution élargissante (et
  // symétriquement pour le maximum).
  out.rules = {
    minSubjectLength: Math.min(pinned.rules.minSubjectLength, live.rules.minSubjectLength),
    maxSubjectLength: Math.max(pinned.rules.maxSubjectLength, live.rules.maxSubjectLength),
    minDecisionSubjectLength: Math.min(
      pinned.rules.minDecisionSubjectLength,
      live.rules.minDecisionSubjectLength
    ),
  };

  // scope — passage à true restrictif → AND.
  out.scope = {
    validateReplies: pinned.scope.validateReplies && live.scope.validateReplies,
    validateReviewSummary: pinned.scope.validateReviewSummary && live.scope.validateReviewSummary,
  };

  // activation.activatedAt — date plus ancienne restrictive : la plus « lâche » des deux
  // s'applique (null, qui ne met rien dans le périmètre, est la valeur la plus lâche).
  out.activation = { activatedAt: looserActivation(pinned.activation.activatedAt, live.activation.activatedAt) };

  // resolverOverrideGroup — restriction de l'habilitation restrictive (épinglée),
  // élargissement en direct (§8.1.3). L'habilitation est « membre de chacun des groupes
  // cités », et la liste vide n'habilite personne (§8.2) : trois cas de bord encadrent
  // l'intersection nue, guidés par « l'erreur sûre est de retarder un assouplissement,
  // jamais d'infliger un durcissement ».
  {
    const p = pinned.resolverOverrideGroup;
    const l = live.resolverOverrideGroup;
    if (p.length === 0) {
      // De « personne » vers une liste : l'habilitation s'élargit → en direct.
      out.resolverOverrideGroup = [...l];
    } else if (l.length === 0) {
      // Vers « personne » : durcissement maximal → épinglé.
      out.resolverOverrideGroup = [...p];
    } else {
      const intersection = p.filter((g) => l.includes(g));
      // Un remplacement complet rendrait l'intersection vide, donc « personne » — un
      // durcissement infligé qu'aucune colonne du tableau ne demande : épingler.
      out.resolverOverrideGroup = intersection.length > 0 ? intersection : [...p];
    }
  }

  // Clause de fermeture : toute clé du §8.2 non classée est épinglée. Concerne
  // `overrideLabel` — le nom de l'étiquette reste celui du jugement d'origine.
  out.overrideLabel = pinned.overrideLabel;

  return out;
}

function defaultSeverityOf(code: string): 'off' | 'warn' | 'error' {
  return code.startsWith('E-') ? 'error' : 'warn';
}

function union(a: string[], b: string[]): string[] {
  const out = [...a];
  for (const v of b) if (!out.includes(v)) out.push(v);
  return out;
}

function looserActivation(p: string | null, l: string | null): string | null {
  if (p === null || l === null) return null;
  return Date.parse(p) >= Date.parse(l) ? p : l;
}

function mixLabels(pinned: LabelConfig[], live: LabelConfig[]): LabelConfig[] {
  const out: LabelConfig[] = [];
  const liveById = new Map(live.map((l) => [l.id, l]));
  const seen = new Set<string>();
  for (const p of pinned) {
    const l = liveById.get(p.id);
    seen.add(p.id);
    if (!l) {
      // Retrait d'une entrée : restrictif → l'entrée épinglée subsiste.
      out.push(structuredClone(p));
      continue;
    }
    out.push({
      id: p.id,
      enabled: p.enabled || l.enabled, // enabled: false restrictif
      blockingByDefault: p.blockingByDefault && l.blockingByDefault, // false→true restrictif
      alwaysNonBlocking: p.alwaysNonBlocking || l.alwaysNonBlocking, // true→false restrictif
      aliases: union(p.aliases, l.aliases), // retrait d'un alias restrictif
      // Clause de fermeture (§8.1.3) : `labels[].color` est énuméré en direct ;
      // `labels[].icon` ne l'est pas → épinglé, comme toute clé non classée.
      ...(p.icon !== undefined ? { icon: p.icon } : l.icon !== undefined ? { icon: l.icon } : {}),
      ...(l.color !== undefined ? { color: l.color } : p.color !== undefined ? { color: p.color } : {}),
    });
  }
  for (const l of live) {
    if (!seen.has(l.id)) out.push(structuredClone(l)); // ajout d'une entrée : élargissant
  }
  return out;
}

function mixDecorations(pinned: DecorationConfig[], live: DecorationConfig[]): DecorationConfig[] {
  const out: DecorationConfig[] = [];
  const liveById = new Map(live.map((d) => [d.id, d]));
  const seen = new Set<string>();
  for (const p of pinned) {
    const l = liveById.get(p.id);
    seen.add(p.id);
    if (!l) {
      out.push({ ...p }); // retrait restrictif → l'entrée épinglée subsiste
      continue;
    }
    out.push({ id: p.id, forces: mixForces(p.forces, l.forces) });
  }
  for (const l of live) {
    if (!seen.has(l.id)) out.push({ ...l }); // ajout élargissant
  }
  return out;
}

/** Transitions élargissantes de `forces` (§8.1.3) : "blocking" → null ou "non-blocking".
 * Tout le reste est restrictif (clause de fermeture) → la valeur épinglée subsiste. */
function mixForces(
  p: 'blocking' | 'non-blocking' | null,
  l: 'blocking' | 'non-blocking' | null
): 'blocking' | 'non-blocking' | null {
  if (p === l) return p;
  if (p === 'blocking' && (l === null || l === 'non-blocking')) return l;
  return p;
}
