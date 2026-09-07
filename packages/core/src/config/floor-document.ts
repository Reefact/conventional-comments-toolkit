// Forme du document de plancher (§8.1.1). Elle vit dans core/ parce que les deux supports
// d'exécution du §6.4.1 lisent le MÊME document par des canaux différents — un fichier de
// configuration d'installation côté service hébergé, une URL contrôlée par l'organisation
// côté GitHub Action — et qu'un document accepté d'un côté et refusé de l'autre ferait
// diverger le plancher, c'est-à-dire la garantie d'entreprise elle-même.
//
// La sévérité est délibérée : accepter `null`, un tableau ou un `minimumMode` inconnu
// effacerait le plancher sans un mot.

import type { Floor, Mode } from '../types.js';

const MODES: readonly Mode[] = ['off', 'assist', 'warn', 'enforce'];

/** Rend le plancher, ou le motif de refus. Ne lève jamais : l'appelant décide si un
 * document mal formé empêche de démarrer (service) ou fait appliquer le dernier plancher
 * connu (exécution ponctuelle). */
export function parseFloorDocument(raw: unknown): { floor: Floor } | { error: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'the floor document must be a JSON object' };
  }
  const f = raw as Record<string, unknown>;
  if (f['minimumMode'] !== undefined && !MODES.includes(f['minimumMode'] as Mode)) {
    return {
      error: `unknown minimumMode "${String(f['minimumMode'])}" (expected ${MODES.join(', ')})`,
    };
  }
  if (f['floorVersion'] !== undefined && typeof f['floorVersion'] !== 'number') {
    return { error: 'floorVersion must be a number' };
  }
  if (f['configUrl'] !== undefined && f['configUrl'] !== null && typeof f['configUrl'] !== 'string') {
    return { error: 'configUrl must be a string or null' };
  }
  return { floor: raw as Floor };
}
