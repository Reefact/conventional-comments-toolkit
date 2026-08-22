// Résolution de la configuration effective (§8.1.2, §8.1.3 r.1, §8.1.5).
// `resolveConfig()` porte la règle — précédence, fusion, bornes, mélange épinglé — mais
// aucune entrée-sortie : l'épinglage est lu et écrit par le composant B (§9.2.2).

import type { ConfigRead, EffectiveConfig, Floor, Notice } from '../types.js';
import { defaultConfig } from './defaults.js';
import { parseConfigDocument } from './schema.js';
import { mergeLevel } from './merge.js';
import { applyFloor, maxMode, vetFloor } from './floor.js';
import { mixPinnedWithLive } from './pinning.js';

export interface ResolvedConfig {
  config: EffectiveConfig;
  notices: Notice[];
}

export function resolveConfig(
  floor: Floor | null,
  org: ConfigRead,
  repo: ConfigRead,
  pinned: EffectiveConfig | null,
  previouslyEvaluated: boolean
): ResolvedConfig {
  const notices: Notice[] = [];
  const vetted = vetFloor(floor);
  notices.push(...vetted.notices);

  const written = new Set<string>();
  let config = defaultConfig();
  let unsupportedDocument = false;

  // Niveau 2 — configuration d'organisation (§8.1.2).
  if (org.status === 'found') {
    const parsed = parseConfigDocument(org.text, { level: 'org' });
    notices.push(...parsed.notices);
    if (parsed.unsupported) {
      unsupportedDocument = true; // repli §8.1.5 : le document n'est pas appliqué
    } else if (!parsed.invalid && parsed.values) {
      config = mergeLevel(config, parsed.values);
      recordWrites(parsed.values, written);
    }
    // invalide → repli sur le dernier niveau valide : les défauts (§8.1.5)
  }

  // Niveau 1 — fichier de dépôt (§8.1.2).
  if (repo.status === 'found') {
    const parsed = parseConfigDocument(repo.text, { level: 'repo' });
    notices.push(...parsed.notices);
    if (parsed.unsupported) {
      unsupportedDocument = true;
    } else if (!parsed.invalid && parsed.values) {
      config = mergeLevel(config, parsed.values);
      recordWrites(parsed.values, written);
    }
    // invalide → repli sur le dernier niveau valide : organisation, puis défauts (§8.1.5)
  } else if (repo.status === 'absent' && previouslyEvaluated) {
    // Incident, pas une désactivation (§8.1.5) : `git rm` ne doit ni éteindre ni bloquer.
    notices.push({
      kind: 'config-vanished',
      message:
        'the .conventional-comments.json file has disappeared from an already-evaluated repository: incident, not a deactivation (§8.1.5)',
    });
  }

  // Activation vivante : min(plancher, niveau inférieur) — une date plus ancienne durcit
  // (§8.1.1). Calculée à part parce que son durcissement par le plancher est épinglé.
  const floorAt = vetted.unsupported ? undefined : vetted.floor.activation?.activatedAt;
  const lowerAt = config.activation.activatedAt;
  let liveActivation: string | null;
  if (floorAt === undefined) liveActivation = lowerAt;
  else if (lowerAt === null) liveActivation = floorAt;
  else liveActivation = Date.parse(floorAt) < Date.parse(lowerAt) ? floorAt : lowerAt;

  // Mélange épinglé (§8.1.3, règle 1) — avant les bornes, qui s'appliquent en direct
  // dans les deux sens (sauf l'activation, traitée par le mélange lui-même).
  if (pinned !== null) {
    const live = structuredClone(config);
    live.activation = { activatedAt: liveActivation };
    config = mixPinnedWithLive(pinned, live);
  } else {
    config.activation = { activatedAt: liveActivation };
  }

  // Bornes d'entreprise (§8.1.1) — en direct, y compris sur une configuration épinglée.
  if (!vetted.unsupported) {
    const floored = applyFloor(config, vetted.floor, written, { skipActivation: true });
    config = floored.config;
    notices.push(...floored.notices);
  }

  // Replis de version (§8.1.5, dernière ligne ; §8.1.1 pour le plancher).
  if (vetted.unsupported) {
    // Plancher illisible : repli en mode assist — le plancher précédemment connu, s'il est
    // plus strict, est substitué par l'appelant avant l'appel (§8.1.1).
    config.mode = 'assist';
  } else if (unsupportedDocument) {
    // Document qu'on sait lire mais qu'on ne sait pas appliquer entièrement : mode assist,
    // ou le plancher en vigueur s'il est plus strict — identique pour A et B (§8.1.5).
    config.mode = maxMode('assist', vetted.floor.minimumMode ?? 'off');
  }

  // configUrl provient exclusivement du canal de plancher (§8.1.2).
  config.configUrl = vetted.unsupported ? null : vetted.floor.configUrl ?? null;

  return { config, notices };
}

function recordWrites(values: Record<string, unknown>, written: Set<string>): void {
  for (const [key, value] of Object.entries(values)) {
    written.add(key);
    if (key === 'severities') {
      for (const code of Object.keys(value as Record<string, unknown>)) written.add(`severities.${code}`);
    } else if (key === 'labels') {
      for (const entry of value as { id: string; enabled?: boolean; blockingByDefault?: boolean }[]) {
        if (entry.enabled === false) written.add(`labels.${entry.id}.enabled`);
        if (entry.blockingByDefault === false) written.add(`labels.${entry.id}.blockingByDefault`);
      }
    } else if (key === 'rules') {
      for (const k of Object.keys(value as Record<string, unknown>)) written.add(`rules.${k}`);
    }
  }
}
