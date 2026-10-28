// @vitest-environment happy-dom
// La comparaison du garde `check:captured-selectors`, hors navigateur : ce qu'elle tient pour un
// écart. Le côté Chromium ne se teste qu'avec Chromium — le garde rejoue la contre-épreuve à
// chaque exécution, et refuse de conclure s'il ne la voit pas.
import { describe, expect, it } from 'vitest';
import { COUNTER_PROOF, matchPaths, parityMismatches } from '../scripts/lib/selector-parity.mjs';

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('parité des sélecteurs — comparaison', () => {
  it('tient pour un écart deux ensembles de MÊME taille qui ne désignent pas les mêmes éléments', () => {
    const candidates = { submit: ['.x'] };
    const found = parityMismatches(candidates, { submit: [['1/1']] }, { submit: [['1/0']] });
    expect(found).toEqual([{ key: 'submit', candidate: '.x', left: ['1/1'], right: ['1/0'], firstDiff: '1/1' }]);
  });

  it("ne voit rien quand les deux relevés désignent les mêmes éléments, dans le même ordre", () => {
    const candidates = { a: ['.x', '.y'] };
    expect(parityMismatches(candidates, { a: [['1/0'], []] }, { a: [['1/0'], []] })).toEqual([]);
  });

  it('tient pour un écart un sélecteur que refuse un seul des deux moteurs', () => {
    const candidates = { a: [':bogus'] };
    expect(parityMismatches(candidates, { a: [[]] }, { a: ['erreur : invalide'] })).toHaveLength(1);
  });

  it("désigne un élément par son chemin depuis `<html>`, indice d'enfant par indice d'enfant", () => {
    const paths = matchPaths(doc('<body><p></p><p><b></b></p></body>'), { b: ['b'] });
    expect(paths).toEqual({ b: [['1/1/0']] });
  });

  it("la contre-épreuve prend « Cancel » dans happy-dom — Chromium, lui, prend « Send » (mesuré)", () => {
    const paths = matchPaths(doc(COUNTER_PROOF.html), COUNTER_PROOF.candidates);
    const cancel = doc(COUNTER_PROOF.html).getElementById('cancel')!;
    expect(cancel.parentElement!.children[0]).toBe(cancel);
    expect(paths).toEqual({ proof: [['1/0']] });
  });
});
