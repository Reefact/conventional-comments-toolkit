// Marqueur de session (§3.6) : une métadonnée en DERNIÈRE ligne du corps, jamais du contenu de
// revue. Reconnu ici, une seule fois, pour les deux composants : `analyze()` le retire du corps
// avant tout le reste (§3.4.1, §3.5, §4.2), et l'extension l'affiche (§5.5). Une seule
// reconnaissance, sans quoi l'extension pourrait afficher comme métadonnée une ligne que le
// vérificateur compterait comme discussion, ou l'inverse.

import { splitBody } from './preprocess.js';

/** Le marqueur reconnu. `raw` est la ligne telle qu'écrite, blancs de bordure retirés (§3.4.1,
 * étape 4) — c'est elle que l'extension retrouve dans le corps rendu. `value` est la valeur
 * entre `[session:` et `]`, blancs de bordure retirés, casse INTACTE : la mise en minuscules
 * n'appartient qu'à l'affichage (§5.5). `contentBody` est le corps privé du marqueur et de tout
 * ce qui le suit (des blancs, par construction), au caractère près pour tout ce qui le précède :
 * les indices de lignes de `splitBody()` restent valables d'une forme à l'autre. */
export interface SessionMarker {
  raw: string;
  value: string;
  contentBody: string;
}

// Même jeu clos que l'étape 4 du §3.4.1 : \p{White_Space} ∪ {U+FEFF}.
const EDGE = /^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu;
const strip = (s: string): string => s.replace(EDGE, '');

// `session` en minuscules, collé au crochet et au deux-points : la forme est fixe, seule la
// valeur est libre. Une valeur peut contenir `]` — le crochet fermant est le DERNIER caractère
// de la ligne, jamais le premier `]` rencontré.
const MARKER_RE = /^\[session:(.*)\]$/u;

/** Le marqueur de session du corps, ou `null` (§3.6). Reconnu seulement s'il occupe à lui seul
 * la dernière ligne non blanche, hors bloc de code délimité et hors citation — les lignes que
 * l'étape 2 du §3.4.1 écarte. Tout autre cas reste du texte ordinaire : jamais un diagnostic. */
export function extractSessionMarker(body: string): SessionMarker | null {
  const split = splitBody(body);
  let index = -1;
  for (let i = split.lines.length - 1; i >= 0; i--) {
    if (strip(split.lines[i]!) !== '') {
      index = i;
      break;
    }
  }
  if (index === -1 || split.discardedIndexes.has(index)) return null;
  const raw = strip(split.lines[index]!);
  const m = MARKER_RE.exec(raw);
  if (!m) return null;
  const value = strip(m[1]!);
  if (value === '') return null;
  return { raw, value, contentBody: body.slice(0, lineOffset(body, index)) };
}

/** Position, dans `body`, du premier caractère de la ligne `index` au sens de `splitBody()`
 * (découpage sur /\r?\n/). */
function lineOffset(body: string, index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i++) {
    const next = body.indexOf('\n', offset);
    offset = next + 1;
  }
  return offset;
}
