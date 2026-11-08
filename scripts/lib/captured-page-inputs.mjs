// Ce que la réduction d'une plateforme doit connaître, lu UNE fois pour les deux voies : l'outil
// en ligne de commande (`reduce-captured-pages.mjs`) et le script de navigateur
// (`build-page-reducer.mjs`). Deux lectures séparées finiraient par diverger, et l'une des voies
// prouverait alors une réduction que l'autre ne fait pas.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { attributeReads, rulesFor } from './captured-page-reducer.mjs';

/** Une erreur qui porte le code de sortie à rendre. */
export class InputsError extends Error {
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

/** `{ rules, candidates, reads }` pour la plateforme `id`. `candidates` est nul seulement sur
 * demande explicite (`noSelectors`), et seulement pour une plateforme sans `selectors.ts` : la
 * comparaison avant/après est la PREUVE de la réduction (revue Reefact, PR #133). */
export async function loadReductionInputs(root, id, { noSelectors = false } = {}) {
  const adapter = join(root, 'packages', 'adapters', id);
  const hasSelectors = existsSync(join(adapter, 'src', 'selectors.ts'));
  let candidates = null;
  if (noSelectors) {
    if (hasSelectors) {
      throw new InputsError(`✗ --no-selectors refusé : « ${id} » a un selectors.ts, la comparaison est due.`, 2);
    }
  } else {
    try {
      const { selectors } = await import(pathToFileURL(join(adapter, 'dist', 'selectors.js')).href);
      candidates = Object.fromEntries(Object.entries(selectors).map(([k, c]) => [k, c.candidates]));
    } catch (err) {
      throw new InputsError(
        `✗ sélecteurs compilés de « ${id} » introuvables ou illisibles (${err.message.split('\n')[0]}).\n` +
          (hasSelectors
            ? '  Lancer `npm run build` et recommencer : sans eux, la réduction ne peut pas être vérifiée.'
            : `  « ${id} » n'a pas encore de selectors.ts : relancer avec --no-selectors pour réduire sans comparaison.`),
        1
      );
    }
  }
  let reads = [];
  try {
    const src = join(adapter, 'src');
    reads = [
      ...new Set(
        readdirSync(src)
          .filter((f) => f.endsWith('.ts'))
          .flatMap((f) => attributeReads(readFileSync(join(src, f), 'utf8')))
      ),
    ].sort();
  } catch {
    // pas d'adaptateur : rien n'est lu
  }
  return { rules: rulesFor(id), candidates, reads };
}
