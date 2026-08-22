// Sémantique de fusion (§8.1.4), fixée par clé — un niveau inférieur surcharge sans
// jamais supprimer ce qu'un niveau supérieur a posé.

import type { DecorationConfig, EffectiveConfig, LabelConfig } from '../types.js';

/** Fusionne un document partiel validé (schema.ts) dans une configuration effective. */
export function mergeLevel(base: EffectiveConfig, values: Record<string, unknown>): EffectiveConfig {
  const out: EffectiveConfig = structuredClone(base);

  for (const [key, value] of Object.entries(values)) {
    switch (key) {
      case 'labels': {
        // Fusion par id : surcharge des propriétés, ajout possible, jamais de suppression.
        for (const entry of value as Partial<LabelConfig>[]) {
          const existing = out.labels.find((l) => l.id === entry.id);
          if (existing) {
            if (entry.enabled !== undefined) existing.enabled = entry.enabled;
            if (entry.blockingByDefault !== undefined) existing.blockingByDefault = entry.blockingByDefault;
            if (entry.alwaysNonBlocking !== undefined) existing.alwaysNonBlocking = entry.alwaysNonBlocking;
            if (entry.icon !== undefined) existing.icon = entry.icon;
            if (entry.color !== undefined) existing.color = entry.color;
            if (entry.aliases !== undefined) existing.aliases = [...entry.aliases];
          } else {
            out.labels.push({
              id: entry.id!,
              enabled: entry.enabled ?? true,
              blockingByDefault: entry.blockingByDefault ?? false,
              alwaysNonBlocking: entry.alwaysNonBlocking ?? false,
              ...(entry.icon !== undefined ? { icon: entry.icon } : {}),
              ...(entry.color !== undefined ? { color: entry.color } : {}),
              aliases: entry.aliases ? [...entry.aliases] : [],
            });
          }
        }
        break;
      }
      case 'decorations': {
        const d = value as { allowFree?: boolean; known?: DecorationConfig[] };
        if (d.allowFree !== undefined) out.decorations.allowFree = d.allowFree;
        if (d.known) {
          for (const entry of d.known) {
            const existing = out.decorations.known.find((k) => k.id === entry.id);
            if (existing) existing.forces = entry.forces;
            else out.decorations.known.push({ id: entry.id, forces: entry.forces });
          }
        }
        break;
      }
      case 'severities': {
        // Fusion par code — les codes absents gardent la sévérité du tableau §3.5.2.
        Object.assign(out.severities, value as Record<string, 'off' | 'warn' | 'error'>);
        break;
      }
      case 'shortcuts': {
        const s = value as { abbreviations?: Record<string, string> };
        if (s.abbreviations) Object.assign(out.shortcuts.abbreviations, s.abbreviations);
        break;
      }
      case 'exemptUsers':
      case 'allowlistPatterns': {
        // Concaténation (union), sans suppression possible depuis un niveau inférieur.
        const merged = [...out[key]];
        for (const v of value as string[]) if (!merged.includes(v)) merged.push(v);
        out[key] = merged;
        break;
      }
      case 'resolverOverrideGroup': {
        // Intersection d'habilitation : être membre de chacun des groupes cités (§8.1.4).
        // La liste effective accumule les groupes déclarés à chaque niveau.
        const merged = [...out.resolverOverrideGroup];
        for (const v of value as string[]) if (!merged.includes(v)) merged.push(v);
        out.resolverOverrideGroup = merged;
        break;
      }
      case 'scope':
      case 'rules':
      case 'server':
      case 'exemptionLog':
      case 'telemetry':
      case 'activation': {
        // Remplacement clé par clé à l'intérieur de l'objet.
        Object.assign(out[key] as Record<string, unknown>, value as Record<string, unknown>);
        break;
      }
      default: {
        // Clés scalaires : remplacement.
        (out as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }
  return out;
}
