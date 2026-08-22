// Prétraitement normatif (§3.4.1). Appliqué à l'identique par les composants A et B :
// c'est lui qui rend un même commentaire identique sous ses deux formes de transport
// (LF côté saisie, CRLF côté corps stocké).

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const QUOTE_RE = /^\s*>/;

// Étape 4 : \p{White_Space} ∪ {U+FEFF} — jeux clos, énoncés en toutes lettres (§3.4.1).
// U+FEFF n'a PAS la propriété White_Space : il est traité à part, et supprimé, jamais remplacé.
const EDGE_STRIP_RE = /^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu;
// Étape 5 : \p{White_Space} privé de l'espace et de la tabulation → espace ordinaire.
const INNER_WS_RE = /(?![ \t])[\p{White_Space}]/gu;
// Étape 6 : U+FEFF restant, supprimé.
const BOM_RE = /\uFEFF/g;

export interface BodyLines {
  /** Toutes les lignes du corps, découpées sur /\r?\n/. */
  lines: string[];
  /** Indices (dans `lines`) des lignes écartées à l'étape 2 (blocs délimités, citations). */
  discardedIndexes: Set<number>;
  /** Indice de la ligne de préfixe dans `lines`, ou null s'il n'y en a pas. */
  prefixLineIndex: number | null;
  /** Ligne de préfixe brute (avant étapes 4–6), ou null. */
  rawPrefixLine: string | null;
  /** Ligne de préfixe normalisée (après étapes 4–6), ou null. */
  prefixLine: string | null;
}

/** Étapes 1 à 3 du §3.4.1, en conservant la structure nécessaire au reste du document
 * (discussion §3.1, contenu propre §4.2, réécriture de la ligne §5.3). */
export function splitBody(body: string): BodyLines {
  const lines = body.split(/\r?\n/); // étape 1 — jamais '\n' seul
  const discardedIndexes = new Set<number>();

  // Étape 2 — écarter les lignes de bloc de code délimité (``` ou ~~~) et de citation ('>').
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence !== null) {
      discardedIndexes.add(i);
      const m = FENCE_RE.exec(line);
      if (m && m[1]!.startsWith(fence[0]!) && m[1]!.length >= fence.length) fence = null;
      continue;
    }
    const m = FENCE_RE.exec(line);
    if (m) {
      fence = m[1]!;
      discardedIndexes.add(i);
      continue;
    }
    if (QUOTE_RE.test(line)) {
      discardedIndexes.add(i);
    }
  }

  // Étape 3 — première ligne restante dont le trim() est non vide.
  let prefixLineIndex: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (discardedIndexes.has(i)) continue;
    if (lines[i]!.trim() !== '') {
      prefixLineIndex = i;
      break;
    }
  }

  const rawPrefixLine = prefixLineIndex === null ? null : lines[prefixLineIndex]!;
  const prefixLine = rawPrefixLine === null ? null : normalizePrefixLine(rawPrefixLine);
  return { lines, discardedIndexes, prefixLineIndex, rawPrefixLine, prefixLine };
}

/** Étapes 4 à 6 du §3.4.1 sur la ligne retenue. */
export function normalizePrefixLine(line: string): string {
  let s = line.replace(EDGE_STRIP_RE, ''); // étape 4
  s = s.replace(INNER_WS_RE, ' '); // étape 5 — aucun diagnostic (§3.4.1)
  s = s.replace(BOM_RE, ''); // étape 6 — supprimé, jamais remplacé
  return s;
}

/** « Discussion » au sens du §3.1 : tout contenu du corps hors de la ligne de préfixe —
 * lignes écartées à l'étape 2 comprises (§3.1, précision volontaire). */
export function hasDiscussion(split: BodyLines): boolean {
  for (let i = 0; i < split.lines.length; i++) {
    if (i === split.prefixLineIndex) continue;
    if (split.lines[i]!.trim() !== '') return true;
  }
  return false;
}

/** « Aucun contenu propre » (§4.2) : après retrait des blocs délimités, des citations et
 * des blancs, il ne reste rien. Le bloc de suggestion natif fait exception : il compte
 * comme contenu propre — vérifié séparément par l'appelant sur le corps brut. */
export function hasOwnContent(split: BodyLines): boolean {
  for (let i = 0; i < split.lines.length; i++) {
    if (split.discardedIndexes.has(i)) continue;
    if (split.lines[i]!.trim() !== '') return true;
  }
  return false;
}

/** Détection d'un bloc de suggestion natif sur le corps brut (§3.5.1 étage 0).
 * Le marqueur est l'info string du bloc délimité, propre à la plateforme (§A.7, §B.6). */
export function containsSuggestionBlock(body: string, infoString: string | null): boolean {
  if (infoString === null) return false;
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*(?:`{3,}|~{3,})\s*(\S+)?\s*$/.exec(line);
    if (m && m[1] === infoString) return true;
  }
  return false;
}
