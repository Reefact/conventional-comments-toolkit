// La rotation du balayage planifié : ce qu'elle garantit, et par quel mécanisme.
//
// Une matrice admet 256 jobs par exécution de workflow. Au-dessus, le job ne démarre pas,
// et le balayage — seule borne sur l'âge d'un statut après la dé-résolution d'un fil — ne
// tourne plus du tout (§A.8). Ces tests portent sur la propriété qui compte : AUCUNE PR
// ne sort du cycle, ce qu'un simple plafond ne donnerait pas.

import { describe, expect, it } from 'vitest';
import { dispatchSlice, MATRIX_LIMIT } from '../src/dispatch.js';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('tranches de la répartition (§A.8)', () => {
  it('rend la liste entière tant qu’elle tient dans une matrice', () => {
    const prs = range(MATRIX_LIMIT);
    expect(dispatchSlice(prs, 0)).toEqual(prs);
    // Et quel que soit l'indice : sans troncature, il n'y a rien à faire tourner.
    expect(dispatchSlice(prs, 7)).toEqual(prs);
  });

  it('ne dépasse jamais la limite d’une matrice, quelle que soit la taille', () => {
    for (const n of [257, 512, 513, 1000, 5000]) {
      for (const run of [0, 1, 2, 17, 999]) {
        expect(dispatchSlice(range(n), run).length).toBeLessThanOrEqual(MATRIX_LIMIT);
      }
    }
  });

  it('COUVRE TOUTE LA LISTE sur un cycle complet — la propriété qui sépare la rotation d’un plafond', () => {
    // Un plafond simple rendrait indéfiniment les 256 premières, et la queue ne serait
    // jamais balayée : un trou silencieux, là où l'absence de rotation était au moins un
    // échec bruyant. C'est cette assertion qui distingue les deux.
    const prs = range(1000);
    const slices = Math.ceil(prs.length / MATRIX_LIMIT);
    const seen = new Set<number>();
    for (let run = 0; run < slices; run++) {
      for (const pr of dispatchSlice(prs, run)) seen.add(pr);
    }
    expect(seen.size).toBe(prs.length);
  });

  it('avance d’une tranche par exécution, et reboucle', () => {
    const prs = range(600); // trois tranches
    const first = dispatchSlice(prs, 0);
    const second = dispatchSlice(prs, 1);
    const third = dispatchSlice(prs, 2);
    expect(first[0]).toBe(1);
    expect(second[0]).toBe(MATRIX_LIMIT + 1);
    expect(third[0]).toBe(2 * MATRIX_LIMIT + 1);
    // La dernière tranche est plus courte : 600 − 512.
    expect(third.length).toBe(600 - 2 * MATRIX_LIMIT);
    // Le tour suivant revient au début.
    expect(dispatchSlice(prs, 3)).toEqual(first);
  });

  it('ne rend jamais une liste vide sur un indice négatif', () => {
    // `-1 % 3` vaut `-1` en JavaScript, et `slice(-256, 0)` rendrait du vide : une
    // exécution qui n'évalue rien, sans rien signaler.
    const prs = range(600);
    expect(dispatchSlice(prs, -1).length).toBeGreaterThan(0);
    expect(dispatchSlice(prs, -1)).toEqual(dispatchSlice(prs, 2));
  });

  it('refuse une limite non positive plutôt que de boucler sans fin', () => {
    expect(() => dispatchSlice(range(10), 0, 0)).toThrow(/positive/);
  });
});
