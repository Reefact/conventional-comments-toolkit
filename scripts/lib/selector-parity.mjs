// Ce que deux moteurs trouvent pour un même candidat, et comment on compare.
//
// La première version de ce garde comparait des NOMBRES d'éléments. Deux moteurs peuvent en
// trouver autant sans trouver les mêmes : sur deux boutons, un candidat évalué différemment
// prend *Send* dans Chromium et *Cancel* dans happy-dom — `1 === 1`, et le garde passait alors
// que l'interception n'était pas validée (revue Reefact, PR #85). On compare donc l'IDENTITÉ de
// chaque élément trouvé : son chemin dans l'arbre, indice par indice depuis `<html>`.

/** Les chemins des éléments que trouve chaque candidat, dans l'ordre du document — ou le texte
 * de l'erreur si le moteur refuse le sélecteur. AUTONOME, sans fermeture : la même fonction est
 * exécutée dans happy-dom et sérialisée dans Chromium par `page.evaluate`, pour que les deux
 * côtés calculent un chemin de la même façon. */
export function matchPaths(doc, candidatesByChain) {
  const pathOf = (el) => {
    const parts = [];
    for (let node = el; node.parentElement; node = node.parentElement) {
      parts.push(Array.prototype.indexOf.call(node.parentElement.children, node));
    }
    return parts.reverse().join('/');
  };
  const out = {};
  for (const [key, candidates] of Object.entries(candidatesByChain)) {
    out[key] = candidates.map((c) => {
      try {
        return Array.from(doc.querySelectorAll(c), pathOf);
      } catch (err) {
        return `erreur : ${err.message}`;
      }
    });
  }
  return out;
}

/** Les écarts entre deux relevés de `matchPaths`, candidat par candidat. Un écart dit combien
 * chaque moteur a trouvé et le premier chemin qui diffère — de quoi retrouver l'élément. */
export function parityMismatches(candidatesByChain, left, right) {
  const mismatches = [];
  for (const [key, candidates] of Object.entries(candidatesByChain)) {
    candidates.forEach((candidate, i) => {
      const a = left[key]?.[i];
      const b = right[key]?.[i];
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      const firstDiff =
        Array.isArray(a) && Array.isArray(b)
          ? (a.find((p, j) => p !== b[j]) ?? b.find((p, j) => p !== a[j]) ?? null)
          : null;
      mismatches.push({ key, candidate, left: a, right: b, firstDiff });
    });
  }
  return mismatches;
}

/** La contre-épreuve, rejouée à CHAQUE exécution avant de juger les captures : un candidat
 * que les deux moteurs évaluent différemment, et qui trouve le même NOMBRE d'éléments de
 * chaque côté. happy-dom ne connaît pas `:enabled` (mesuré) : Chromium y prend *Send*,
 * happy-dom prend *Cancel*. Si le garde ne voit pas cet écart, il est inerte, et il le dit. */
export const COUNTER_PROOF = {
  html: '<body><button id="cancel">Cancel</button><button id="send">Send</button></body>',
  candidates: { proof: ['button:enabled:last-child, button:not(:enabled):first-child'] },
};
