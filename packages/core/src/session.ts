// Marqueur de session (§3.6) : une métadonnée seule sur sa ligne, jamais du contenu de revue.
// Reconnue ici, une seule fois, pour toute la boîte à outils : `analyze()` la retire du corps
// avant tout le reste (§3.4.1, §3.5, §4.2), et l'extension l'affiche (§5.5). Une seule
// reconnaissance, sans quoi l'extension pourrait afficher comme métadonnée une ligne que la
// validation compterait comme discussion, ou l'inverse.
//
// N'importe quelle ligne, et plus seulement la dernière (#169) : un outil qui signe ce qu'il
// publie ajoute son pied APRÈS le marqueur, et ne peut ni le déplacer ni l'omettre. La règle de
// la dernière ligne rendait ces marqueurs illisibles pour l'extension, sans faute de l'auteur.

import { splitBody } from './preprocess.js';

/** Une ligne reconnue. `raw` est la ligne telle qu'écrite, blancs de bordure retirés (§3.4.1,
 * étape 4) — c'est elle que l'extension retrouve dans le corps rendu. `value` est la valeur
 * entre `[session:` et `]`, blancs de bordure retirés, casse INTACTE : la mise en minuscules
 * n'appartient qu'à l'affichage (§5.5). */
export interface SessionLine {
  raw: string;
  value: string;
}

/** Les marqueurs d'un corps. `lines` en compte au moins un, dans l'ordre d'écriture. `value` est
 * la valeur à afficher : celle du marqueur quand il est seul, `null` quand le corps en porte
 * plusieurs — aucune session n'est alors désignée, et `W-SESSION-MULTIPLE` le dit (§3.6).
 * `contentBody` est le corps privé de TOUTES ces lignes, chacune retirée avec sa fin de ligne :
 * rien d'autre n'y change, au caractère près. */
export interface SessionMarker {
  lines: SessionLine[];
  value: string | null;
  contentBody: string;
}

/** Le seul diagnostic du marqueur (§3.6). Plafonné à `warn` : une erreur de métadonnée ne bloque
 * jamais l'envoi, et `severities` peut l'éteindre, jamais le porter à `error` (§8.2) — sans ce
 * plafond, la promesse du §3.6 dépendrait d'une clé de configuration. */
export const SESSION_DIAGNOSTIC = 'W-SESSION-MULTIPLE';

// Même jeu clos que l'étape 4 du §3.4.1 : \p{White_Space} ∪ {U+FEFF}.
const EDGE = /^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu;
const strip = (s: string): string => s.replace(EDGE, '');

// `session` en minuscules, collé au crochet et au deux-points : la forme est fixe, seule la
// valeur est libre. Une valeur peut contenir `]` — le crochet fermant est le DERNIER caractère
// de la ligne, jamais le premier `]` rencontré.
const MARKER_RE = /^\[session:(.*)\]$/u;

/** La valeur portée par une ligne, si elle n'est QUE le marqueur ; sinon `null`. */
function markerValue(line: string): SessionLine | null {
  const raw = strip(line);
  const m = MARKER_RE.exec(raw);
  if (!m) return null;
  const value = strip(m[1]!);
  return value === '' ? null : { raw, value };
}

/** Les marqueurs de session du corps, ou `null` s'il n'en porte aucun (§3.6). Une ligne est un
 * marqueur si elle se réduit à lui, où qu'elle soit, hors bloc de code délimité et hors
 * citation — les lignes que l'étape 2 du §3.4.1 écarte. Tout autre cas reste du texte
 * ordinaire, jamais un diagnostic : seul le marqueur EN DOUBLE en produit un, et ce n'est pas
 * ici qu'il naît (`analyze()`). */
export function extractSessionMarker(body: string): SessionMarker | null {
  const split = splitBody(body);
  const lines: SessionLine[] = [];
  const indexes = new Set<number>();
  for (let i = 0; i < split.lines.length; i++) {
    if (split.discardedIndexes.has(i)) continue;
    const found = markerValue(split.lines[i]!);
    if (found === null) continue;
    lines.push(found);
    indexes.add(i);
  }
  if (lines.length === 0) return null;
  return {
    lines,
    value: lines.length === 1 ? lines[0]!.value : null,
    contentBody: withoutLines(body, indexes),
  };
}

/** `body` privé des lignes `indexes` (au sens de `splitBody()`, découpage sur /\r?\n/), chacune
 * avec la fin de ligne qui la TERMINE — ou, pour une dernière ligne sans fin de ligne, celle qui
 * la précède : sans quoi `a\n[session:x]` laisserait `a\n`, une ligne blanche qui n'était pas
 * écrite. Les fins de ligne restent celles de l'auteur, `\r\n` compris. */
function withoutLines(body: string, indexes: Set<number>): string {
  const parts = body.split(/(\r?\n)/); // [ligne, fin, ligne, fin, …, ligne]
  const kept: string[] = [];
  for (let i = 0; i * 2 < parts.length; i++) {
    const line = parts[i * 2]!;
    const end = parts[i * 2 + 1];
    if (!indexes.has(i)) {
      kept.push(line, end ?? '');
      continue;
    }
    if (end === undefined && kept.length > 0) kept.pop(); // dernière ligne : sa fin est celle d'avant
  }
  return kept.join('');
}
